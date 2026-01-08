// search.js - 搜索页面的交互逻辑

// 全局变量
let searchResults = [];
let filteredSearchResults = [];
let selectedFolderId = null;
let selectedFolderTitle = '';
let existingFolderId = null;

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupSearchOptions();
});

// 设置事件监听器
function setupEventListeners() {
    // 搜索按钮
    document.getElementById('do-search-btn').addEventListener('click', handleSearchClick);
    
    // 搜索输入框回车事件
    document.getElementById('search-input').addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            handleSearchClick();
        }
    });
    
    // 全选/反选按钮
    document.getElementById('select-all-search-options').addEventListener('click', toggleSelectAllSearchOptions);
    
    // 监听搜索选项的变化，更新全选按钮状态
    document.querySelectorAll('.search-option input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectAllButton);
    });
    
    // 聚合按钮
    document.getElementById('search-aggregate-btn').addEventListener('click', openAggregateDialog);
    
    // 设置对话框事件监听器
    setupDialogEventListeners();
}

// 设置对话框事件监听器
function setupDialogEventListeners() {
    // 聚合对话框事件
    document.getElementById('cancel-btn').addEventListener('click', closeAggregateDialog);
    document.getElementById('confirm-btn').addEventListener('click', confirmAggregate);
    
    // 新建聚合目录单选框事件
    document.getElementById('create-new-folder-option').addEventListener('change', toggleNewFolderInput);
    document.getElementById('use-existing-folder-option').addEventListener('change', toggleNewFolderInput);
}

// 设置搜索选项
function setupSearchOptions() {
    updateSelectAllButton();
}

// 处理搜索按钮点击
async function handleSearchClick() {
    const searchInput = document.getElementById('search-input');
    const keyword = searchInput.value.trim();
    
    console.log('搜索关键词:', keyword);
    
    if (keyword === '') {
        showMessage('请输入搜索关键词', 'error');
        return;
    }
    
    // 获取搜索选项
    const searchOptions = {
        title: document.getElementById('search-title').checked,
        domain: document.getElementById('search-domain').checked,
        urlQuery: document.getElementById('search-url-query').checked,
        folder: document.getElementById('search-folder').checked,
        caseSensitive: document.getElementById('search-case-sensitive').checked
    };
    
    console.log('搜索选项:', searchOptions);
    
    // 检查是否至少选择了一个选项
    if (!searchOptions.title && !searchOptions.domain && !searchOptions.urlQuery && !searchOptions.folder) {
        showMessage('请至少选择一个搜索范围', 'error');
        return;
    }
    
    console.log('开始调用 searchBookmarks...');
    await searchBookmarks(keyword, searchOptions);
}

// 搜索书签
async function searchBookmarks(keyword, searchOptions) {
    try {
        console.log('search.js: 开始搜索书签');
        console.log('search.js: 搜索关键词:', keyword);
        console.log('search.js: 搜索选项:', searchOptions);
        
        const response = await chrome.runtime.sendMessage({
            action: 'searchBookmarks',
            keyword: keyword,
            searchOptions: searchOptions
        });
        
        console.log('search.js: 收到搜索响应:', response);
        
        if (response.success) {
            searchResults = response.bookmarks;
            filteredSearchResults = [...searchResults];
            console.log('search.js: 找到书签数量:', searchResults.length);
            console.log('search.js: 书签列表:', searchResults);
            displaySearchResults(filteredSearchResults);
            updateResultCount(filteredSearchResults.length);
        } else {
            console.error('search.js: 搜索书签失败:', response.error);
            showMessage('搜索书签失败: ' + response.error, 'error');
        }
    } catch (error) {
        console.error('search.js: 搜索书签时出错:', error);
        showMessage('搜索书签失败: ' + error.message, 'error');
    }
}

// 显示搜索结果
function displaySearchResults(bookmarks) {
    const container = document.getElementById('search-results-container');
    const noResults = document.getElementById('no-search-results');
    const aggregateBtn = document.getElementById('search-aggregate-btn');
    
    // 清空容器
    container.innerHTML = '';
    
    if (bookmarks.length === 0) {
        noResults.style.display = 'block';
        aggregateBtn.disabled = true;
    } else {
        noResults.style.display = 'none';
        
        // 检查是否需要禁用一键聚合按钮
        const disableAggregate = bookmarks.length <= 1 || areAllBookmarksInSameFolder(bookmarks);
        aggregateBtn.disabled = disableAggregate;
        
        bookmarks.forEach(bookmark => {
            const bookmarkElement = createBookmarkElement(bookmark);
            container.appendChild(bookmarkElement);
        });
    }
}

// 创建书签元素
function createBookmarkElement(bookmark) {
    const div = document.createElement('div');
    div.className = `bookmark-item`;
    div.dataset.bookmarkId = bookmark.id;
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'bookmark-info';
    
    const titleElement = document.createElement('div');
    titleElement.className = 'bookmark-title';
    titleElement.textContent = bookmark.title || bookmark.url;
    
    const urlElement = document.createElement('div');
    urlElement.className = 'bookmark-url';
    urlElement.textContent = bookmark.url;
    
    const pathElement = document.createElement('div');
    pathElement.className = 'bookmark-path';
    
    // 如果是从目录搜索来的，显示目录信息
    if (bookmark.fromFolder) {
        pathElement.textContent = `来自目录: ${bookmark.fromFolder}`;
        pathElement.style.color = '#e67e22';
        pathElement.style.fontWeight = '500';
    } else {
        pathElement.textContent = bookmark.fullPath || '';
    }
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '移除';
    removeBtn.addEventListener('click', () => handleRemoveFromSearch(bookmark.id));
    
    infoDiv.appendChild(titleElement);
    infoDiv.appendChild(urlElement);
    infoDiv.appendChild(pathElement);
    div.appendChild(infoDiv);
    div.appendChild(removeBtn);
    
    return div;
}

// 从搜索结果移除书签
function handleRemoveFromSearch(bookmarkId) {
    // 从过滤后的结果中移除
    filteredSearchResults = filteredSearchResults.filter(bookmark => bookmark.id !== bookmarkId);
    
    // 更新UI
    const bookmarkElement = document.querySelector(`#search-results-container [data-bookmark-id="${bookmarkId}"]`);
    if (bookmarkElement) {
        bookmarkElement.remove();
    }
    
    // 更新显示
    displaySearchResults(filteredSearchResults);
    updateResultCount(filteredSearchResults.length);
}

// 更新结果数量
function updateResultCount(count) {
    const countElement = document.getElementById('result-count');
    countElement.textContent = `找到 ${count} 个书签`;
}

// 检查所有书签是否在同一个目录下
function areAllBookmarksInSameFolder(bookmarks) {
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

// 切换全选/反选
function toggleSelectAllSearchOptions() {
    const checkboxes = document.querySelectorAll('.search-option input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = !allChecked;
    });
    
    updateSelectAllButton();
}

// 更新全选按钮文本
function updateSelectAllButton() {
    const button = document.getElementById('select-all-search-options');
    const checkboxes = document.querySelectorAll('.search-option input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    const noneChecked = Array.from(checkboxes).every(cb => !cb.checked);
    
    if (allChecked) {
        button.textContent = '反选';
    } else if (noneChecked) {
        button.textContent = '全选';
    } else {
        button.textContent = '全选';
    }
}

// 处理聚合按钮点击
async function handleAggregateClick() {
    if (filteredSearchResults.length === 0) {
        showMessage('没有可聚合的书签', 'error');
        return;
    }
    
    openAggregateDialog();
}

// 切换新建目录输入框显示
function toggleNewFolderInput() {
    const createNewFolder = document.getElementById('create-new-folder-option').checked;
    const newFolderGroup = document.getElementById('new-folder-group');
    newFolderGroup.style.display = createNewFolder ? 'block' : 'none';
}

// 打开聚合对话框
function openAggregateDialog() {
    // 重置选择的文件夹
    selectedFolderId = null;
    selectedFolderTitle = '';
    
    // 设置默认的新目录名
    const newFolderNameInput = document.getElementById('new-folder-name');
    newFolderNameInput.value = `聚合书签 - ${new Date().toLocaleDateString()}`;
    
    // 切换新建目录输入框显示
    toggleNewFolderInput();
    
    // 收集搜索结果中的所有目录并去重
    const folderSet = new Set();
    const folders = [];
    
    filteredSearchResults.forEach(bookmark => {
        if (bookmark.fullPath) {
            const pathParts = bookmark.fullPath.split(' > ');
            if (pathParts.length > 1) {
                // 提取目录路径（移除最后一个元素，即书签标题）
                pathParts.pop();
                const folderPath = pathParts.join(' > ');
                
                // 去重
                if (!folderSet.has(folderPath)) {
                    folderSet.add(folderPath);
                    folders.push({
                        path: folderPath,
                        id: bookmark.parentId
                    });
                }
            }
        }
    });
    
    // 排序目录（按路径长度排序，短的在前）
    folders.sort((a, b) => a.path.length - b.path.length);
    
    // 填充下拉框
    const existingFolderSelect = document.getElementById('existing-folder');
    existingFolderSelect.innerHTML = '<option value="">选择一个目录...</option>';
    
    folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.path;
        existingFolderSelect.appendChild(option);
    });
    
    // 设置默认值：使用第一个书签所在目录
    const existingFolderInput = document.getElementById('existing-folder');
    if (folders.length > 0) {
        existingFolderId = folders[0].id;
        existingFolderInput.value = folders[0].id;
    } else {
        existingFolderId = '1'; // 默认书签栏ID
    }
    
    // 显示对话框
    document.getElementById('aggregate-dialog').style.display = 'flex';
}

// 关闭聚合对话框
function closeAggregateDialog() {
    document.getElementById('aggregate-dialog').style.display = 'none';
}

// 确认聚合操作
async function confirmAggregate() {
    try {
        const createNewFolder = document.getElementById('create-new-folder-option').checked;
        let folderIdToUse = null;
        
        // 如果选择使用现有目录，则从下拉框获取选择的目录ID
        if (!createNewFolder) {
            const existingFolderSelect = document.getElementById('existing-folder');
            folderIdToUse = existingFolderSelect.value || existingFolderId;
        }
        
        // 向background.js发送消息，执行聚合操作
        const response = await chrome.runtime.sendMessage({
            action: 'aggregateBookmarks',
            bookmarks: filteredSearchResults,
            domain: 'search',
            folderId: folderIdToUse,
            createNewFolder: createNewFolder,
            newFolderName: document.getElementById('new-folder-name').value
        });
        
        if (response.success) {
            closeAggregateDialog();
            showMessage(`书签已聚合到目录: ${response.folderTitle}`, 'success');
            // 清空搜索结果
            filteredSearchResults = [];
            searchResults = [];
            displaySearchResults([]);
            updateResultCount(0);
            document.getElementById('search-input').value = '';
        } else {
            console.error('聚合书签失败:', response.error);
            showMessage('聚合书签失败: ' + response.error, 'error');
        }
    } catch (error) {
        console.error('处理聚合操作时出错:', error);
        showMessage('聚合书签失败: ' + error.message, 'error');
    }
}

// 显示消息
function showMessage(message, type = 'info') {
    // 创建消息元素
    const messageElement = document.createElement('div');
    messageElement.className = `message message-${type}`;
    messageElement.textContent = message;
    messageElement.style.position = 'fixed';
    messageElement.style.top = '20px';
    messageElement.style.left = '50%';
    messageElement.style.transform = 'translateX(-50%)';
    messageElement.style.padding = '12px 24px';
    messageElement.style.borderRadius = '6px';
    messageElement.style.color = '#fff';
    messageElement.style.fontSize = '14px';
    messageElement.style.fontWeight = '500';
    messageElement.style.zIndex = '10000';
    messageElement.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    
    if (type === 'success') {
        messageElement.style.backgroundColor = '#27ae60';
    } else if (type === 'error') {
        messageElement.style.backgroundColor = '#e74c3c';
    } else {
        messageElement.style.backgroundColor = '#3498db';
    }
    
    // 添加到页面
    document.body.appendChild(messageElement);
    
    // 自动移除消息
    setTimeout(() => {
        messageElement.style.opacity = '0';
        messageElement.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            messageElement.remove();
        }, 300);
    }, 3000);
}