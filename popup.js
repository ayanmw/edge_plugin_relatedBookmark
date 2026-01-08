// popup.js - 弹出窗口的交互逻辑

// 全局变量
let currentUrl = '';
let currentDomain = '';
let relatedBookmarks = [];
let selectedFolderId = null;
let selectedFolderTitle = '';
let existingFolderId = null;
let searchResults = [];
let filteredSearchResults = [];

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async () => {
    await initializePopup();
    setupEventListeners();
    setupDialogEventListeners();
});

// 初始化弹出窗口
async function initializePopup() {
    try {
        // 获取当前标签页的URL
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentUrl = currentTab.url;
        
        // 显示当前URL
        const currentUrlElement = document.getElementById('current-url');
        currentUrlElement.textContent = currentUrl;
        
        // 获取并显示关联书签
        await loadRelatedBookmarks();
    } catch (error) {
        console.error('初始化弹出窗口时出错:', error);
        showMessage('获取当前页面信息失败', 'error');
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 一键全聚合按钮
    const aggregateBtn = document.getElementById('aggregate-btn');
    aggregateBtn.addEventListener('click', openAggregateDialog);
    
    // 搜索按钮
    const searchBtn = document.getElementById('search-btn');
    searchBtn.addEventListener('click', openSearchDialog);
}

// 设置对话框事件监听器
function setupDialogEventListeners() {
    // 聚合对话框事件
    document.getElementById('aggregate-btn').addEventListener('click', openAggregateDialog);
    document.getElementById('cancel-btn').addEventListener('click', closeAggregateDialog);
    document.getElementById('confirm-btn').addEventListener('click', confirmAggregate);
    document.getElementById('custom-btn').addEventListener('click', openFolderSelectDialog);
    
    // 新建聚合目录复选框事件
    document.getElementById('create-new-folder').addEventListener('change', toggleNewFolderInput);
    
    // 文件夹选择对话框事件
    document.getElementById('folder-cancel-btn').addEventListener('click', closeFolderSelectDialog);
    document.getElementById('folder-confirm-btn').addEventListener('click', confirmFolderSelect);
    
    // 搜索对话框事件
    document.getElementById('search-cancel-btn').addEventListener('click', closeSearchDialog);
    document.getElementById('search-aggregate-btn').addEventListener('click', confirmSearchAggregate);
    document.getElementById('do-search-btn').addEventListener('click', handleSearchClick);
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
}

// 切换新建目录输入框显示
function toggleNewFolderInput() {
    const createNewFolder = document.getElementById('create-new-folder');
    const newFolderGroup = document.getElementById('new-folder-group');
    newFolderGroup.style.display = createNewFolder.checked ? 'block' : 'none';
}

// 打开聚合对话框
function openAggregateDialog() {
    // 重置选择的文件夹
    selectedFolderId = null;
    selectedFolderTitle = '';
    
    // 设置默认的新目录名
    const newFolderNameInput = document.getElementById('new-folder-name');
    newFolderNameInput.value = `关联书签 - ${currentDomain}`;
    
    // 切换新建目录输入框显示
    toggleNewFolderInput();
    
    // 获取现有目录路径：优先使用当前页面书签所在目录，否则使用第一个书签所在目录
    const existingFolderInput = document.getElementById('existing-folder');
    let targetBookmark = null;
    
    // 查找当前页面的书签
    if (relatedBookmarks.length > 0) {
        targetBookmark = relatedBookmarks.find(bookmark => bookmark.url === currentUrl);
        
        // 如果没有当前页面的书签，使用第一个书签
        if (!targetBookmark) {
            targetBookmark = relatedBookmarks[0];
        }
        
        // 存储现有目录的ID
        existingFolderId = targetBookmark.parentId;
        
        let folderPath = targetBookmark.fullPath || '';
        
        // 提取目录部分，移除最后一个元素（书签标题）
        if (folderPath) {
            const pathParts = folderPath.split(' > ');
            if (pathParts.length > 1) {
                // 如果有多个部分，移除最后一个（书签标题）
                pathParts.pop();
                folderPath = pathParts.join(' > ');
            } else {
                // 如果只有一个部分，说明在根目录下，使用默认值
                folderPath = '收藏夹栏';
            }
        } else {
            // 如果没有路径，使用默认值
            folderPath = '收藏夹栏';
        }
        
        existingFolderInput.value = folderPath;
    } else {
        existingFolderInput.value = '收藏夹栏';
        existingFolderId = '1'; // 默认书签栏ID
    }
    
    // 显示对话框
    document.getElementById('aggregate-dialog').style.display = 'flex';
}

// 关闭聚合对话框
function closeAggregateDialog() {
    document.getElementById('aggregate-dialog').style.display = 'none';
}

// 打开文件夹选择对话框
async function openFolderSelectDialog() {
    try {
        // 获取所有书签目录
        const response = await chrome.runtime.sendMessage({
            action: 'getAllBookmarkFolders'
        });
        
        if (response.success) {
            // 显示文件夹树
            renderFolderTree(response.folders);
            // 显示对话框
            document.getElementById('folder-select-dialog').style.display = 'flex';
        } else {
            console.error('获取书签目录失败:', response.error);
            showMessage('获取书签目录失败', 'error');
        }
    } catch (error) {
        console.error('打开文件夹选择对话框时出错:', error);
        showMessage('打开文件夹选择对话框失败', 'error');
    }
}

// 关闭文件夹选择对话框
function closeFolderSelectDialog() {
    document.getElementById('folder-select-dialog').style.display = 'none';
}

// 加载关联书签
async function loadRelatedBookmarks() {
    try {
        // 向background.js发送消息，获取关联书签
        const response = await chrome.runtime.sendMessage({
            action: 'getRelatedBookmarks',
            url: currentUrl
        });
        
        if (response.success) {
            currentDomain = response.currentDomain;
            relatedBookmarks = response.bookmarks;
            displayBookmarks(relatedBookmarks);
        } else {
            console.error('获取关联书签失败:', response.error);
            showMessage('获取关联书签失败', 'error');
        }
    } catch (error) {
        console.error('加载关联书签时出错:', error);
        showMessage('加载关联书签失败', 'error');
    }
}

// 显示书签列表
function displayBookmarks(bookmarks) {
    const container = document.getElementById('bookmarks-container');
    const noBookmarks = document.getElementById('no-bookmarks');
    const aggregateBtn = document.getElementById('aggregate-btn');
    
    // 清空容器
    container.innerHTML = '';
    
    if (bookmarks.length === 0) {
        // 没有关联书签
        noBookmarks.style.display = 'block';
        aggregateBtn.disabled = true;
    } else {
        // 显示关联书签
        noBookmarks.style.display = 'none';
        
        // 检查是否需要禁用一键聚合按钮
        // 条件：书签数量 <= 1 或者所有书签都在同一目录下
        const disableAggregate = bookmarks.length <= 1 || areAllBookmarksInSameFolder(bookmarks);
        aggregateBtn.disabled = disableAggregate;
        
        bookmarks.forEach(bookmark => {
            const bookmarkElement = createBookmarkElement(bookmark);
            container.appendChild(bookmarkElement);
        });
    }
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

// 创建单个书签元素
function createBookmarkElement(bookmark) {
    const div = document.createElement('div');
    div.className = `bookmark-item ${bookmark.url === currentUrl ? 'current-page' : ''}`;
    div.dataset.bookmarkId = bookmark.id;
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'bookmark-info';
    
    const titleElement = document.createElement('div');
    titleElement.className = 'bookmark-title';
    titleElement.textContent = bookmark.title || bookmark.url;
    
    const urlElement = document.createElement('div');
    urlElement.className = 'bookmark-url';
    urlElement.textContent = bookmark.url;
    
    // 添加完整路径显示
    const pathElement = document.createElement('div');
    pathElement.className = 'bookmark-path';
    pathElement.textContent = bookmark.fullPath || '';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', () => handleDeleteBookmark(bookmark.id));
    
    infoDiv.appendChild(titleElement);
    infoDiv.appendChild(urlElement);
    infoDiv.appendChild(pathElement);
    div.appendChild(infoDiv);
    div.appendChild(deleteBtn);
    
    return div;
}

// 处理删除书签
async function handleDeleteBookmark(bookmarkId) {
    try {
        // 向background.js发送消息，删除书签
        const response = await chrome.runtime.sendMessage({
            action: 'deleteBookmark',
            id: bookmarkId
        });
        
        if (response.success) {
            // 更新UI
            const bookmarkElement = document.querySelector(`[data-bookmark-id="${bookmarkId}"]`);
            if (bookmarkElement) {
                bookmarkElement.remove();
            }
            
            // 更新书签列表
            relatedBookmarks = relatedBookmarks.filter(bookmark => bookmark.id !== bookmarkId);
            
            // 检查是否还剩下书签
            if (relatedBookmarks.length === 0) {
                const noBookmarks = document.getElementById('no-bookmarks');
                const aggregateBtn = document.getElementById('aggregate-btn');
                noBookmarks.style.display = 'block';
                aggregateBtn.disabled = true;
            }
            
            showMessage('书签已删除', 'success');
        } else {
            console.error('删除书签失败:', response.error);
            showMessage('删除书签失败', 'error');
        }
    } catch (error) {
        console.error('处理删除书签时出错:', error);
        showMessage('删除书签失败', 'error');
    }
}

// 渲染文件夹树
function renderFolderTree(folders) {
    const folderTree = document.getElementById('folder-tree');
    folderTree.innerHTML = '';
    
    folders.forEach(folder => {
        const folderElement = document.createElement('div');
        folderElement.className = `folder-item level-${folder.level}`;
        folderElement.dataset.folderId = folder.id;
        folderElement.dataset.folderTitle = folder.title;
        folderElement.innerHTML = `
            <span class="folder-icon">📁</span>
            <span class="folder-name">${folder.title}</span>
        `;
        
        folderElement.addEventListener('click', () => {
            // 移除其他选中状态
            document.querySelectorAll('.folder-item').forEach(item => {
                item.classList.remove('selected');
            });
            // 添加当前选中状态
            folderElement.classList.add('selected');
            // 启用确认按钮
            document.getElementById('folder-confirm-btn').disabled = false;
        });
        
        folderTree.appendChild(folderElement);
    });
}

// 确认文件夹选择
function confirmFolderSelect() {
    const selectedElement = document.querySelector('.folder-item.selected');
    if (selectedElement) {
        selectedFolderId = selectedElement.dataset.folderId;
        selectedFolderTitle = selectedElement.dataset.folderTitle;
        
        // 更新聚合对话框的现有目录
        const existingFolderInput = document.getElementById('existing-folder');
        existingFolderInput.value = selectedFolderTitle;
        
        closeFolderSelectDialog();
    }
}

// 确认聚合操作
async function confirmAggregate() {
    try {
        const createNewFolder = document.getElementById('create-new-folder').checked;
        let folderIdToUse = selectedFolderId;
        
        // 如果没有选择自定义目录，且不创建新目录，则使用现有目录
        if (!folderIdToUse && !createNewFolder) {
            folderIdToUse = existingFolderId;
        }
        
        // 向background.js发送消息，执行聚合操作
        const response = await chrome.runtime.sendMessage({
            action: 'aggregateBookmarks',
            bookmarks: relatedBookmarks,
            domain: currentDomain,
            folderId: folderIdToUse,
            createNewFolder: createNewFolder
        });
        
        if (response.success) {
            // 更新UI
            const container = document.getElementById('bookmarks-container');
            const noBookmarks = document.getElementById('no-bookmarks');
            const aggregateBtn = document.getElementById('aggregate-btn');
            
            container.innerHTML = '';
            noBookmarks.style.display = 'block';
            aggregateBtn.disabled = true;
            
            closeAggregateDialog();
            showMessage(`书签已聚合到目录: ${response.folderTitle}`, 'success');
        } else {
            console.error('聚合书签失败:', response.error);
            showMessage('聚合书签失败', 'error');
        }
    } catch (error) {
        console.error('处理聚合操作时出错:', error);
        showMessage('聚合书签失败', 'error');
    }
}

// 显示消息
function showMessage(message, type = 'info') {
    // 创建消息元素
    const messageElement = document.createElement('div');
    messageElement.className = `message message-${type}`;
    messageElement.textContent = message;
    
    // 添加到页面
    const container = document.querySelector('.container');
    container.appendChild(messageElement);
    
    // 自动移除消息
    setTimeout(() => {
        messageElement.remove();
    }, 3000);
}

// 打开搜索对话框
async function openSearchDialog() {
    // 清空搜索输入和结果
    document.getElementById('search-input').value = '';
    searchResults = [];
    filteredSearchResults = [];
    document.getElementById('search-results-container').innerHTML = '';
    document.getElementById('no-search-results').style.display = 'none';
    document.getElementById('search-aggregate-btn').disabled = true;
    
    // 重置全选按钮状态
    updateSelectAllButton();
    
    // 显示对话框
    document.getElementById('search-dialog').style.display = 'flex';
    
    // 聚焦搜索输入框
    document.getElementById('search-input').focus();
}

// 关闭搜索对话框
function closeSearchDialog() {
    document.getElementById('search-dialog').style.display = 'none';
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

// 处理搜索输入
async function handleSearchInput(event) {
    const keyword = event.target.value.trim();
    
    if (keyword === '') {
        searchResults = [];
        filteredSearchResults = [];
        document.getElementById('search-results-container').innerHTML = '';
        document.getElementById('no-search-results').style.display = 'none';
        document.getElementById('search-aggregate-btn').disabled = true;
        return;
    }
    
    await searchBookmarks(keyword);
}

// 搜索书签
async function searchBookmarks(keyword, searchOptions) {
    try {
        console.log('popup.js: 开始搜索书签');
        console.log('popup.js: 搜索关键词:', keyword);
        console.log('popup.js: 搜索选项:', searchOptions);
        
        const response = await chrome.runtime.sendMessage({
            action: 'searchBookmarks',
            keyword: keyword,
            searchOptions: searchOptions
        });
        
        console.log('popup.js: 收到搜索响应:', response);
        
        if (response.success) {
            searchResults = response.bookmarks;
            filteredSearchResults = [...searchResults];
            console.log('popup.js: 找到书签数量:', searchResults.length);
            console.log('popup.js: 书签列表:', searchResults);
            displaySearchResults(filteredSearchResults);
        } else {
            console.error('popup.js: 搜索书签失败:', response.error);
            showMessage('搜索书签失败: ' + response.error, 'error');
        }
    } catch (error) {
        console.error('popup.js: 搜索书签时出错:', error);
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
            const bookmarkElement = createSearchResultElement(bookmark);
            container.appendChild(bookmarkElement);
        });
    }
}

// 创建搜索结果元素
function createSearchResultElement(bookmark) {
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
}

// 确认搜索结果的聚合
async function confirmSearchAggregate() {
    try {
        const createNewFolder = true;
        const newFolderName = `聚合书签 - ${new Date().toLocaleDateString()}`;
        
        // 向background.js发送消息，执行聚合操作
        const response = await chrome.runtime.sendMessage({
            action: 'aggregateBookmarks',
            bookmarks: filteredSearchResults,
            domain: 'search',
            folderId: null,
            createNewFolder: createNewFolder,
            newFolderName: newFolderName
        });
        
        if (response.success) {
            closeSearchDialog();
            showMessage(`书签已聚合到目录: ${response.folderTitle}`, 'success');
        } else {
            console.error('聚合书签失败:', response.error);
            showMessage('聚合书签失败', 'error');
        }
    } catch (error) {
        console.error('处理聚合操作时出错:', error);
        showMessage('聚合书签失败', 'error');
    }
}

// 添加消息样式
const style = document.createElement('style');
style.textContent = `
    .message {
        position: fixed;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 16px;
        border-radius: 4px;
        color: #fff;
        font-size: 14px;
        z-index: 1000;
        animation: fadeInOut 3s ease;
    }
    
    .message-success {
        background-color: #27ae60;
    }
    
    .message-error {
        background-color: #e74c3c;
    }
    
    .message-info {
        background-color: #3498db;
    }
    
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
        10% { opacity: 1; transform: translateX(-50%) translateY(0); }
        90% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(20px); }
    }
`;
document.head.appendChild(style);