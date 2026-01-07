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
      aggregateBookmarks(request.bookmarks, request.domain, request.folderId).then(sendResponse);
      return true;
    case 'getAllBookmarkFolders':
      getAllBookmarkFolders().then(sendResponse);
      return true;
  }
});

// 获取所有书签
async function getAllBookmarks() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
      const bookmarks = [];
      traverseBookmarks(bookmarkTreeNodes, bookmarks, []);
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
async function aggregateBookmarks(bookmarks, domain, folderId = null) {
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
    } else {
      // 创建新的聚合目录
      folderTitle = `关联书签 - ${domain}`;
      folder = await createBookmarkFolder(folderTitle);
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

// 创建书签文件夹
async function createBookmarkFolder(title) {
  return new Promise((resolve) => {
    chrome.bookmarks.create({
      parentId: '1', // 默认书签栏
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