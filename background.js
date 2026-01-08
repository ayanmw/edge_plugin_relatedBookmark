// background.js - 插件后台脚本

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getRelatedBookmarks':
      getRelatedBookmarks(request.url).then(sendResponse);
      return true; // 保持消息通道开放
    case 'deleteBookmark':
      deleteBookmark(request.id).then(sendResponse);
      return true;
    case 'aggregateBookmarks':
      aggregateBookmarks(request.bookmarks, request.domain, request.folderId, request.createNewFolder, request.newFolderName).then(sendResponse);
      return true;
    case 'getAllBookmarkFolders':
      getAllBookmarkFolders().then(sendResponse);
      return true;
    case 'searchBookmarks':
      searchBookmarks(request.keyword, request.searchOptions).then(sendResponse);
      return true;
  }
});

// 获取所有书签
async function getAllBookmarks() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
      const bookmarks = [];
      traverseBookmarks(bookmarkTreeNodes, bookmarks, []);
      console.log('background.js: getAllBookmarks 完成，获取到书签数量:', bookmarks.length);
      if (bookmarks.length > 0) {
        console.log('background.js: 前5个书签:', bookmarks.slice(0, 5));
      }
      resolve(bookmarks);
    });
  });
}

// 遍历书签树，提取所有书签项和完整路径
function traverseBookmarks(bookmarkNodes, result, parentPath) {
  for (const node of bookmarkNodes) {
    const currentPath = [...parentPath];
    if (node.title) {
      currentPath.push(node.title);
    }
    
    if (node.url) {
      result.push({
        id: node.id,
        title: node.title,
        url: node.url,
        parentId: node.parentId,
        fullPath: currentPath.slice(1).join(' > ') // 移除根目录
      });
    } else if (node.children && node.children.length > 0) {
      traverseBookmarks(node.children, result, currentPath);
    }
  }
}

// 获取所有书签目录
async function getAllBookmarkFolders() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
      const folders = [];
      traverseBookmarkFolders(bookmarkTreeNodes, folders, 0);
      resolve({ success: true, folders: folders });
    });
  });
}

// 遍历书签树，提取所有目录
function traverseBookmarkFolders(bookmarkNodes, result, level) {
  for (const node of bookmarkNodes) {
    // 只处理目录节点（没有url属性的节点）
    if (!node.url) {
      // 对于根节点，可能没有title，我们需要处理这种情况
      // 通常根节点包括：书签栏、其他书签等
      let folderTitle = node.title || '根目录';
      
      // 跳过工作区节点（与Chrome不兼容）
      if (folderTitle.toLowerCase().includes('工作区') || folderTitle === 'Workspaces') {
        continue;
      }
      
      result.push({
        id: node.id,
        title: folderTitle,
        level: level,
        parentId: node.parentId
      });
      
      if (node.children && node.children.length > 0) {
        traverseBookmarkFolders(node.children, result, level + 1);
      }
    }
  }
}

// 检查所有书签是否在同一个目录下
function checkAllInSameFolder(bookmarks) {
  if (bookmarks.length <= 1) {
    return true;
  }
  
  // 获取第一个书签的父目录
  const firstParentId = bookmarks[0].parentId;
  
  // 检查其他书签是否有不同的父目录
  for (const bookmark of bookmarks.slice(1)) {
    if (bookmark.parentId !== firstParentId) {
      return false;
    }
  }
  
  return true;
}

// 提取主域名
function extractMainDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const parts = hostname.split('.');
    
    if (parts.length <= 2) {
      return hostname; // 如 example.com
    } else if (parts.length === 3 && parts[1].length <= 2) {
      return hostname; // 如 example.co.uk
    } else {
      return parts.slice(-2).join('.'); // 如 www.example.com -> example.com
    }
  } catch (error) {
    console.error('解析URL时出错:', error);
    return '';
  }
}

// 获取URL的IP地址（简单实现，实际可能需要更复杂的逻辑）
async function getIPAddress(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // 使用DNS解析获取IP地址
    // 注意：Chrome扩展中可能无法直接使用DNS API，这里返回hostname作为简化
    // 实际应用中可能需要使用外部API或更复杂的方法
    return hostname;
  } catch (error) {
    console.error('获取IP地址时出错:', error);
    return '';
  }
}

// 查找关联书签
async function getRelatedBookmarks(currentUrl) {
  try {
    const allBookmarks = await getAllBookmarks();
    const currentMainDomain = extractMainDomain(currentUrl);
    const currentIP = await getIPAddress(currentUrl);
    
    const relatedBookmarks = [];
    
    for (const bookmark of allBookmarks) {
      const bookmarkMainDomain = extractMainDomain(bookmark.url);
      const bookmarkIP = await getIPAddress(bookmark.url);
      
      // 判断是否为关联书签（相同主域名或相同IP）
      if (bookmarkMainDomain === currentMainDomain || bookmarkIP === currentIP) {
        relatedBookmarks.push(bookmark);
      }
    }
    
    return {
      success: true,
      currentUrl: currentUrl,
      currentDomain: currentMainDomain,
      bookmarks: relatedBookmarks
    };
  } catch (error) {
    console.error('获取关联书签时出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 删除书签
async function deleteBookmark(bookmarkId) {
  return new Promise((resolve) => {
    chrome.bookmarks.remove(bookmarkId, () => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ success: true });
      }
    });
  });
}

// 一键聚合书签（移动到同一目录）
async function aggregateBookmarks(bookmarks, domain, folderId = null, createNewFolder = true, newFolderName = null, parentFolderId = null) {
  try {
    let folder;
    let folderTitle;
    
    if (folderId) {
      // 使用指定的目录
      folder = { id: folderId };
      // 获取目录标题
      folderTitle = await new Promise((resolve) => {
        chrome.bookmarks.get(folderId, (nodes) => {
          if (nodes && nodes.length > 0) {
            resolve(nodes[0].title);
          } else {
            resolve('自定义目录');
          }
        });
      });
    } else if (createNewFolder) {
      // 创建新的聚合目录
      folderTitle = newFolderName || `关联书签 - ${domain}`;
      folder = await createBookmarkFolder(folderTitle, parentFolderId);
    } else {
      // 不使用指定目录，也不创建新目录，使用默认书签栏
      folder = { id: '1' };
      folderTitle = '收藏夹栏';
    }
    
    // 移动所有关联书签到该目录
    for (const bookmark of bookmarks) {
      await moveBookmark(bookmark.id, folder.id);
    }
    
    return {
      success: true,
      folderTitle: folderTitle,
      folderId: folder.id
    };
  } catch (error) {
    console.error('聚合书签时出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 搜索书签
async function searchBookmarks(keyword, searchOptions) {
  try {
    console.log('background.js: 开始搜索书签，关键词:', keyword, '搜索选项:', searchOptions);
    
    const allBookmarks = await getAllBookmarks();
    console.log('background.js: 所有书签数量:', allBookmarks.length);
    
    // 根据大小写敏感选项处理关键词
    const searchKeyword = searchOptions.caseSensitive ? keyword : keyword.toLowerCase();
    
    const matchedBookmarks = [];
    const matchedFolderIds = new Set();
    
    // 如果启用了目录搜索，先搜索匹配的目录
    if (searchOptions.folder) {
      console.log('background.js: 开始搜索目录...');
      const matchedFolders = await searchFolders(keyword, searchOptions.caseSensitive);
      console.log('background.js: 匹配的目录数量:', matchedFolders.length);
      
      // 收集所有匹配目录下的书签
      for (const folder of matchedFolders) {
        console.log(`background.js: 处理目录 "${folder.title}" (ID: ${folder.id})`);
        const folderBookmarks = await getBookmarksInFolder(folder.id);
        console.log(`background.js: 目录 "${folder.title}" 下的书签数量:`, folderBookmarks.length);
        
        // 将这些书签标记为来自目录搜索
        folderBookmarks.forEach(bookmark => {
          bookmark.fromFolder = folder.title;
          bookmark.folderId = folder.id;
          matchedFolderIds.add(bookmark.id);
        });
        
        matchedBookmarks.push(...folderBookmarks);
      }
    }
    
    console.log('background.js: 开始搜索书签...');
    // 搜索书签
    for (const bookmark of allBookmarks) {
      // 如果已经从目录搜索中包含了，跳过
      if (matchedFolderIds.has(bookmark.id)) {
        continue;
      }
      
      let matched = false;
      
      // 搜索标题
      if (searchOptions.title && bookmark.title) {
        const title = searchOptions.caseSensitive ? bookmark.title : bookmark.title.toLowerCase();
        if (title.includes(searchKeyword)) {
          console.log(`background.js: 书签 "${bookmark.title}" 匹配标题`);
          matched = true;
        }
      }
      
      // 搜索域名
      if (!matched && searchOptions.domain && bookmark.url) {
        try {
          const url = new URL(bookmark.url);
          const hostname = searchOptions.caseSensitive ? url.hostname : url.hostname.toLowerCase();
          if (hostname.includes(searchKeyword)) {
            console.log(`background.js: 书签 "${bookmark.title}" 匹配域名: ${hostname}`);
            matched = true;
          }
        } catch (e) {
          console.log(`background.js: 解析URL失败: ${bookmark.url}`, e);
        }
      }
      
      // 搜索URL查询参数
      if (!matched && searchOptions.urlQuery && bookmark.url) {
        try {
          const url = new URL(bookmark.url);
          const searchParams = searchOptions.caseSensitive ? url.search : url.search.toLowerCase();
          if (searchParams.includes(searchKeyword)) {
            console.log(`background.js: 书签 "${bookmark.title}" 匹配URL查询: ${searchParams}`);
            matched = true;
          }
        } catch (e) {
          console.log(`background.js: 解析URL失败: ${bookmark.url}`, e);
        }
      }
      
      if (matched) {
        matchedBookmarks.push(bookmark);
      }
    }
    
    console.log('background.js: 匹配的书签数量:', matchedBookmarks.length);
    
    return {
      success: true,
      bookmarks: matchedBookmarks
    };
  } catch (error) {
    console.error('background.js: 搜索书签时出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 搜索目录
async function searchFolders(keyword, caseSensitive = false) {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
      const folders = [];
      const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();
      
      console.log('background.js: 开始遍历书签树搜索目录...');
      traverseAndSearchFolders(bookmarkTreeNodes, folders, searchKeyword, caseSensitive);
      console.log('background.js: 目录搜索完成，找到:', folders.length, '个目录');
      
      resolve(folders);
    });
  });
}

// 遍历并搜索目录
function traverseAndSearchFolders(bookmarkNodes, result, searchKeyword, caseSensitive) {
  for (const node of bookmarkNodes) {
    // 跳过工作区节点
    if (node.title && (node.title.toLowerCase().includes('工作区') || node.title === 'Workspaces')) {
      console.log('background.js: 跳过工作区节点:', node.title);
      if (node.children && node.children.length > 0) {
        traverseAndSearchFolders(node.children, result, searchKeyword, caseSensitive);
      }
      continue;
    }
    
    // 如果是目录节点（没有url属性）且标题匹配
    if (!node.url && node.title) {
      const title = caseSensitive ? node.title : node.title.toLowerCase();
      if (title.includes(searchKeyword)) {
        console.log(`background.js: 找到匹配目录: "${node.title}" (ID: ${node.id})`);
        result.push({
          id: node.id,
          title: node.title
        });
      }
    }
    
    // 递归遍历子节点
    if (node.children && node.children.length > 0) {
      traverseAndSearchFolders(node.children, result, searchKeyword, caseSensitive);
    }
  }
}

// 获取目录下的所有书签
async function getBookmarksInFolder(folderId) {
  return new Promise((resolve) => {
    chrome.bookmarks.getSubTree(folderId, (bookmarkTree) => {
      const bookmarks = [];
      if (bookmarkTree && bookmarkTree.length > 0) {
        traverseBookmarks(bookmarkTree, bookmarks, []);
      }
      resolve(bookmarks);
    });
  });
}

// 创建书签文件夹
async function createBookmarkFolder(title, parentFolderId = '1') {
  return new Promise((resolve) => {
    chrome.bookmarks.create({
      parentId: parentFolderId, // 使用指定的父目录，默认为书签栏
      title: title
    }, (folder) => {
      if (chrome.runtime.lastError) {
        console.error('创建文件夹时出错:', chrome.runtime.lastError);
        resolve(null);
      } else {
        resolve(folder);
      }
    });
  });
}

// 移动书签
async function moveBookmark(bookmarkId, newParentId) {
  return new Promise((resolve) => {
    chrome.bookmarks.move(bookmarkId, {
      parentId: newParentId
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('移动书签时出错:', chrome.runtime.lastError);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}