// Will load from comments.json file

// Application state
let currentSubreddit = 'popular';
let isLoading = false;
let comments = [];
let refreshInterval = 3; // Default 3 seconds
let autoRefreshTimer = null;

// New state variables
let lastCommentCount = 0;
let lastUpdateTime = 0;
let isAutoScrollEnabled = true;

// DOM elements
const postsContainer = document.getElementById('postsContainer');
const loadingIndicator = document.getElementById('loadingIndicator');
const refreshBtn = document.getElementById('refreshBtn');
const themeToggle = document.getElementById('themeToggle');
const refreshIntervalSelect = document.getElementById('refreshInterval');

// Theme management
function initializeTheme() {
    // Check for saved theme preference or default to 'light'
    const savedTheme = localStorage.getItem('theme') || 'light';
    console.log('Initializing theme:', savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

// Initialize refresh interval
function initializeRefreshInterval() {
    // Check for saved refresh interval preference or default to 3
    const savedInterval = localStorage.getItem('refreshInterval') || '3';
    refreshInterval = parseInt(savedInterval);
    if (refreshIntervalSelect) {
        refreshIntervalSelect.value = savedInterval;
    }
    console.log('Initialized refresh interval:', refreshInterval + 's');
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    console.log('Toggling theme from', currentTheme, 'to', newTheme);
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    // Add a subtle animation
    document.body.style.transition = 'all 0.3s ease';
    setTimeout(() => {
        document.body.style.transition = '';
    }, 300);
}

function updateThemeIcon(theme) {
    const themeIcon = document.querySelector('.theme-icon');
    console.log('Updating theme icon for theme:', theme, 'Element found:', !!themeIcon);
    if (themeIcon) {
        themeIcon.textContent = theme === 'dark' ? '☀' : '🌙';
    }
}

// Utility functions
function formatTimeAgo(timestamp) {
    // Convert Unix timestamp (seconds) to JavaScript Date (milliseconds)
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
        return 'just now';
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 2592000) { // 30 days
        const days = Math.floor(diffInSeconds / 86400);
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 31536000) { // 365 days
        const months = Math.floor(diffInSeconds / 2592000);
        return `${months} month${months !== 1 ? 's' : ''} ago`;
    } else {
        const years = Math.floor(diffInSeconds / 31536000);
        return `${years} year${years !== 1 ? 's' : ''} ago`;
    }
}

function formatNumber(num) {
    // Handle null, undefined, or non-numeric values
    if (num === null || num === undefined || isNaN(num)) {
        return '0';
    }
    
    // Convert to number if it's a string
    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    
    if (numValue >= 1000000) {
        return (numValue / 1000000).toFixed(1) + 'M';
    } else if (numValue >= 1000) {
        return (numValue / 1000).toFixed(1) + 'k';
    }
    return numValue.toString();
}

function createFlairHTML(comment) {
    let flairHTML = '';
    
    // Parse FlairURLs (split by \r\n and filter empty ones)
    if (comment.FlairURLs && comment.FlairURLs.trim()) {
        const flairURLs = comment.FlairURLs.split('\r\n').filter(url => url.trim());
        flairURLs.forEach(url => {
            if (url.trim()) {
                flairHTML += `<img src="${url.trim()}" alt="flair" class="flair-image">`;
            }
        });
    }
    
    // Add flair text if it exists
    if (comment.FlairText && comment.FlairText.trim()) {
        flairHTML += `<span class="flair-text">${comment.FlairText}</span>`;
    }
    
    return flairHTML ? `<span class="comment-flair">${flairHTML}</span>` : '';
}

// Comment creation functions
// Update the createCommentElement function to ensure proper data attributes
function createCommentElement(comment, depth = 0) {
    const commentDiv = document.createElement('div');
    commentDiv.className = `reddit-comment ${depth > 0 ? 'reply-comment' : 'top-level-comment'}`;
    commentDiv.setAttribute('data-comment-id', comment.id || '');
    commentDiv.setAttribute('data-depth', depth);
    commentDiv.setAttribute('data-parent-id', comment.parent_id || '');
    commentDiv.style.marginLeft = `${depth * 20}px`;
    
    const flairHtml = createFlairHTML(comment);
    
    // Add depth indicator for child comments
    const depthIndicator = depth > 0 ? `<span class="depth-indicator">↳</span>` : '';
    
    // Safely handle potentially missing properties
    const author = comment.author || 'Unknown';
    const created = comment.created ? formatTimeAgo(comment.created) : 'Unknown time';
    const body = comment.body || '[No content]';
    
    commentDiv.innerHTML = `
        <div class="comment-header">
            ${depthIndicator}
            <span class="comment-author">${author}</span>
            ${flairHtml}
            <span class="comment-time">${created}</span>
        </div>
        
        <div class="comment-body">${body}</div>
    `;
    
    return commentDiv;
}

// Flatten comments with replies into a display structure
function flattenComments(comments, depth = 0) {
    let flatComments = [];
    
    comments.forEach(comment => {
        flatComments.push({ ...comment, depth });
        // Check for child comments in repliesParsed (from PowerShell script)
        if (comment.repliesParsed && comment.repliesParsed.length > 0) {
            flatComments = flatComments.concat(flattenComments(comment.repliesParsed, depth + 1));
        }
        // Also check for replies in case the structure varies
        else if (comment.replies && comment.replies.length > 0) {
            flatComments = flatComments.concat(flattenComments(comment.replies, depth + 1));
        }
    });
    
    return flatComments;
}

// Data fetching functions
function getCommentsForSubreddit(subreddit) {
    // Filter mock comments based on subreddit
    if (subreddit === 'popular') {
        return mockRedditComments;
    }
    
    return mockRedditComments.filter(comment => 
        comment.body.toLowerCase().includes(subreddit.toLowerCase()) ||
        comment.author.toLowerCase().includes(subreddit.toLowerCase())
    );
}

function simulateNetworkDelay() {
    return new Promise(resolve => {
        setTimeout(resolve, 800 + Math.random() * 1200); // 0.8-2 second delay
    });
}

async function fetchComments(subreddit = 'popular') {
    console.log('fetchComments called for subreddit:', subreddit);
    
    if (isLoading) return;
    
    isLoading = true;
    showLoading();
    
    try {
        // Load comments from JSON file
        const response = await fetch('./comments.json?' + Date.now()); // Cache busting
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const fetchedData = await response.json();
        console.log('Fetched data structure:', Object.keys(fetchedData));
        
        // Handle new JSON structure with nested comments
        const fetchedComments = fetchedData.Comments || fetchedData.comments || [];
        console.log('Fetched comments:', fetchedComments.length);
        
        // Debug: Log the structure of the first comment
        if (fetchedComments.length > 0) {
            console.log('First comment structure:', fetchedComments[0]);
        }
        
        // Update page title and header with thread info
        if (fetchedData.title) {
            updatePageHeader(fetchedData.title, fetchedData.gamethread);
        }
        
        comments = fetchedComments;
        console.log('Comments set, calling renderComments');
        renderComments();
        
    } catch (error) {
        console.error('Error fetching comments:', error);
        showError('Failed to load comments. Please try again.');
    } finally {
        isLoading = false;
    }
}

// Function to update page header with thread info
function updatePageHeader(title, gamethreadUrl) {
    const logoElement = document.querySelector('.logo');
    if (logoElement && title) {
        // Clean up the title (remove brackets and extra formatting)
        const cleanTitle = title.replace(/^\[Game Thread\]\s*/i, '').trim();
        
        // Create gamethread link if URL is provided
        let gamethreadLink = '';
        if (gamethreadUrl) {
            // Convert OAuth URL to regular Reddit URL
            const redditUrl = gamethreadUrl.replace('oauth.reddit.com', 'www.reddit.com');
            gamethreadLink = `<a href="${redditUrl}" target="_blank" class="gamethread-link" title="Open original thread">🔗</a>`;
        }
        
        logoElement.innerHTML = `
            <span class="reddit-icon">🔴</span>
            <span class="thread-title">${cleanTitle}</span>
            ${gamethreadLink}
        `;
        
        // Update page title as well
        document.title = `${cleanTitle} - Live Comments`;
    }
}

// UI rendering functions
function showLoading() {
    postsContainer.innerHTML = `
        <div class="loading" id="loadingIndicator">
            <div class="loading-spinner"></div>
            <p>Loading Reddit comments...</p>
        </div>
    `;
}

function showError(message) {
    postsContainer.innerHTML = `
        <div class="error">
            <div class="error-icon">⚠️</div>
            <div class="error-message">${message}</div>
        </div>
    `;
}

function showEmpty() {
    postsContainer.innerHTML = `
        <div class="empty">
            <div class="empty-icon">📭</div>
            <p>No comments found for this subreddit.</p>
        </div>
    `;
}

function renderComments() {
    console.log('renderComments called with', comments.length, 'comments');
    
    if (comments.length === 0) {
        console.log('No comments, showing empty state');
        showEmpty();
        return;
    }
    
    // Only do full rebuild on initial load or manual refresh
    const isInitialLoad = postsContainer.innerHTML.includes('loading') || 
                         postsContainer.innerHTML.includes('error') || 
                         postsContainer.innerHTML.includes('empty');
    
    if (isInitialLoad) {
        postsContainer.innerHTML = '';
        
        const flatComments = flattenComments(comments);
        console.log('Full render - flattened to', flatComments.length, 'comments');
        
        flatComments.forEach((comment, index) => {
            const commentElement = createCommentElement(comment, comment.depth);
            commentElement.style.animationDelay = `${index * 0.1}s`;
            postsContainer.appendChild(commentElement);
        });
        
        lastCommentCount = flatComments.length;
        console.log('Comments rendered successfully');
    }
}

// Replace the checkForUpdates function
async function checkForUpdates() {
    if (isLoading) return;
    
    try {
        const response = await fetch('./comments.json?' + Date.now());
        if (!response.ok) return;
        
        const newData = await response.json();
        const newComments = newData.Comments || newData.comments || [];
        const newFlatComments = flattenComments(newComments);
        const currentFlatComments = flattenComments(comments);
        
        // Get current comment IDs for comparison
        const currentCommentIds = new Set(currentFlatComments.map(c => c.id));
        
        // Find truly new comments (ones that don't exist in current set)
        const actuallyNewComments = newFlatComments.filter(comment => 
            comment.id && !currentCommentIds.has(comment.id)
        );
        
        if (actuallyNewComments.length > 0) {
            console.log(`Found ${actuallyNewComments.length} new comments:`, actuallyNewComments.map(c => c.id));
            
            // Update comments data
            comments = newComments;
            
            // Show notification
            showNewCommentsNotification(actuallyNewComments.length);
            
            // Add new comments with proper nesting
            addNewCommentsWithNesting(actuallyNewComments);
            
            lastCommentCount = newFlatComments.length;
        } else {
            // Just update timestamps if no new comments
            updateTimeStamps();
        }
        
    } catch (error) {
        console.log('Auto-update check failed:', error);
    }
}

// Update the addNewCommentsWithNesting function with the instant-visible class
function addNewCommentsWithNesting(newComments) {
    // Separate top-level comments from replies
    const topLevelComments = newComments.filter(comment => comment.depth === 0);
    const replyComments = newComments.filter(comment => comment.depth > 0);
    
    // Sort top-level comments by creation time (newest first)
    const sortedTopLevel = topLevelComments.sort((a, b) => b.created - a.created);
    
    // Sort replies by depth first (shallower first), then by creation time
    const sortedReplies = replyComments.sort((a, b) => {
        // First by depth (shallower replies first)
        const depthDiff = a.depth - b.depth;
        if (depthDiff !== 0) return depthDiff;
        
        // Then by creation time (newest first)
        return b.created - a.created;
    });
    
    // Add top-level comments first
    sortedTopLevel.forEach((comment, index) => {
        const commentElement = createCommentElement(comment, comment.depth);
        
        // Make new comments instantly visible
        commentElement.classList.add('new-comment', 'instant-visible');
        
        if (postsContainer.firstChild) {
            postsContainer.insertBefore(commentElement, postsContainer.firstChild);
        } else {
            postsContainer.appendChild(commentElement);
        }
    });
    
    // Then add replies in proper hierarchy order
    sortedReplies.forEach((comment, index) => {
        const commentElement = createCommentElement(comment, comment.depth);
        
        // Make new comments instantly visible
        commentElement.classList.add('new-comment', 'instant-visible');
        
        const parentId = getParentIdFromComment(comment);
        const parentElement = findParentCommentElement(parentId);
        
        if (parentElement) {
            console.log(`Inserting reply comment ${comment.id} after parent ${parentId}`);
            insertReplyAfterParent(commentElement, parentElement, comment.depth);
        } else {
            console.log(`Parent ${parentId} not found for comment ${comment.id}, adding to top`);
            if (postsContainer.firstChild) {
                postsContainer.insertBefore(commentElement, postsContainer.firstChild);
            } else {
                postsContainer.appendChild(commentElement);
            }
        }
    });
    
    // Remove highlighting after 3 seconds
    setTimeout(() => {
        document.querySelectorAll('.new-comment').forEach(el => {
            el.classList.remove('new-comment');
        });
    }, 3000);
}

// Helper function to get parent ID from comment
function getParentIdFromComment(comment) {
    if (comment.parent_id) {
        // Remove 't1_' prefix if present
        return comment.parent_id.replace('t1_', '');
    }
    return null;
}

// Helper function to find parent comment element in DOM
function findParentCommentElement(parentId) {
    if (!parentId) return null;
    return document.querySelector(`[data-comment-id="${parentId}"]`);
}

// Helper function to insert reply in the correct position
function insertReplyAfterParent(replyElement, parentElement, replyDepth) {
    let insertPosition = parentElement.nextSibling;
    
    // Find the correct position by looking for existing replies
    while (insertPosition && insertPosition.classList && insertPosition.classList.contains('reddit-comment')) {
        const existingDepth = parseInt(insertPosition.getAttribute('data-depth') || '0');
        
        // If we find a comment at the same or lesser depth than the parent, insert before it
        if (existingDepth < replyDepth) {
            postsContainer.insertBefore(replyElement, insertPosition);
            return;
        }
        
        insertPosition = insertPosition.nextSibling;
    }
    
    // If we reach here, insert right after the parent (or at the end if no position found)
    if (parentElement.nextSibling) {
        postsContainer.insertBefore(replyElement, parentElement.nextSibling);
    } else {
        postsContainer.appendChild(replyElement);
    }
}

// Show notification when new comments arrive
function showNewCommentsNotification(count) {
    // Remove existing notification if present
    const existingNotification = document.querySelector('.new-comments-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification
    const notification = document.createElement('div');
    notification.className = 'new-comments-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">🆕</span>
            <span class="notification-text">${count} new comment${count !== 1 ? 's' : ''} loaded</span>
            <button class="scroll-to-top-btn" onclick="scrollToTopSmooth()">
                ⬆️ Go to Top
            </button>
            <button class="dismiss-btn" onclick="this.parentElement.parentElement.remove()">
                ✕
            </button>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Smooth scroll to top function
function scrollToTopSmooth() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
    
    // Remove notification after scrolling
    const notification = document.querySelector('.new-comments-notification');
    if (notification) {
        notification.remove();
    }
}

// Event handlers
function handleSubredditChange() {
    const selectedSubreddit = subredditSelect.value;
    if (selectedSubreddit !== currentSubreddit) {
        currentSubreddit = selectedSubreddit;
        fetchComments(currentSubreddit);
    }
}

function handleRefresh() {
    fetchComments(currentSubreddit);
}

// Auto-refresh functionality
function startAutoRefresh() {
    // Clear existing timer if any
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
    }
    
    // Start new timer with current interval
    autoRefreshTimer = setInterval(() => {
        if (!isLoading) {
            checkForUpdates();
        }
    }, refreshInterval * 1000); // Convert seconds to milliseconds
    
    console.log(`Auto-refresh started with ${refreshInterval}s interval`);
}

// Function to handle refresh interval change
function handleRefreshIntervalChange() {
    const newInterval = parseInt(refreshIntervalSelect.value);
    if (newInterval !== refreshInterval) {
        refreshInterval = newInterval;
        console.log(`Refresh interval changed to ${refreshInterval}s`);
        
        // Restart auto-refresh with new interval
        startAutoRefresh();
        
        // Save preference
        localStorage.setItem('refreshInterval', refreshInterval.toString());
    }
}

function updateTimeStamps() {
    const timeElements = document.querySelectorAll('.comment-time');
    timeElements.forEach((element, index) => {
        const flatComments = flattenComments(comments);
        if (flatComments[index]) {
            element.textContent = formatTimeAgo(flatComments[index].created);
        }
    });
}

// Keyboard shortcuts
function handleKeyPress(event) {
    if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
            case 'r':
                event.preventDefault();
                handleRefresh();
                break;
            case 'd':
                event.preventDefault();
                toggleTheme();
                break;
        }
    }
}

// Initialize the application
function init() {
    console.log('🚀 Reddit Comments Feed initialized');
    
    // Initialize theme and refresh interval
    initializeTheme();
    initializeRefreshInterval();
    
    // Set up event listeners
    console.log('Setting up event listeners...');
    console.log('refreshBtn element:', !!refreshBtn);
    console.log('themeToggle element:', !!themeToggle);
    console.log('refreshIntervalSelect element:', !!refreshIntervalSelect);
    
    refreshBtn.addEventListener('click', handleRefresh);
    themeToggle.addEventListener('click', toggleTheme);
    refreshIntervalSelect.addEventListener('change', handleRefreshIntervalChange);
    document.addEventListener('keydown', handleKeyPress);
    
    // Load initial comments
    fetchComments(currentSubreddit);
    
    // Start auto-refresh
    startAutoRefresh();
    
    // Add some interactive features
    addInteractiveFeatures();
}

function addInteractiveFeatures() {
    // Add hover effects and click handlers
    document.addEventListener('click', (event) => {
        if (event.target.closest('.stat-item')) {
            const statItem = event.target.closest('.stat-item');
            const icon = statItem.querySelector('.stat-icon');
            
            // Add a little animation when clicked
            icon.style.transform = 'scale(1.2)';
            setTimeout(() => {
                icon.style.transform = 'scale(1)';
            }, 150);
        }
    });
    
    // Add scroll-to-top functionality
    let lastScrollTop = 0;
    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Show/hide scroll indicator or add effects based on scroll
        if (scrollTop > lastScrollTop && scrollTop > 200) {
            // Scrolling down
            document.body.style.setProperty('--scroll-direction', 'down');
        } else {
            // Scrolling up
            document.body.style.setProperty('--scroll-direction', 'up');
        }
        
        lastScrollTop = scrollTop;
    });
}

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Make scrollToTopSmooth available globally for onclick handlers
window.scrollToTopSmooth = scrollToTopSmooth;
