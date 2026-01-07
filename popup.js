// popup.js - 弹出窗口的交互逻辑

// 全局变量
let currentUrl = '';
let currentDomain = '';
let relatedBookmarks = [];

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async () => {
    await initializePopup();
    setupEventListeners();
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
    aggregateBtn.addEventListener('click', handleAggregate);
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

// 处理一键全聚合
async function handleAggregate() {
    try {
        // 向background.js发送消息，执行聚合操作
        const response = await chrome.runtime.sendMessage({
            action: 'aggregateBookmarks',
            bookmarks: relatedBookmarks,
            domain: currentDomain
        });
        
        if (response.success) {
            // 更新UI
            const container = document.getElementById('bookmarks-container');
            const noBookmarks = document.getElementById('no-bookmarks');
            const aggregateBtn = document.getElementById('aggregate-btn');
            
            container.innerHTML = '';
            noBookmarks.style.display = 'block';
            aggregateBtn.disabled = true;
            
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