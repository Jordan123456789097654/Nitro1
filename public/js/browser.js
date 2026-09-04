// Nitro Shield Browser v3.0 - Sandboxed Multi-Tab Browser & Dual-Pane Split View Core
import { getCurrentUser } from './auth.js';

let tabs = [
  {
    id: 'tab-1',
    title: 'New Tab',
    url: '',
    history: [],
    historyIndex: -1,
    favicon: '🌐',
    zoomLevel: 100
  }
];

let activeTabId = 'tab-1';
let secondarySplitTabId = null;
let isSplitViewActive = false;
let bookmarks = [];

const DEFAULT_SPEED_DIALS = [
  { name: 'Desmos Math Calculator', url: 'https://www.desmos.com/calculator', icon: '📐', desc: 'Graphing Calculator' },
  { name: 'Khan Academy', url: 'https://www.khanacademy.org', icon: '📚', desc: 'Lessons & Exercises' },
  { name: 'Scratch Games', url: 'https://scratch.mit.edu', icon: '🐱', desc: 'Community Games' },
  { name: 'GitHub Code', url: 'https://github.com', icon: '💻', desc: 'Developer Repositories' }
];

export function initBrowser() {
  loadSavedBookmarks();
  setupTabsUI();
  setupToolbarControls();
  setupSplitViewUI();
  setupSpeedDialUI();
  setupIframeLoadListeners();
  setupProxyMessageListener();
  renderTabs();
  renderActiveTab();
}

// Proxied pages can't open real new browser tabs (they're sandboxed inside our
// iframe), so the injected shield script posts a message here instead when a
// link wants target="_blank" or the user ctrl/middle-clicks it. Without this,
// those clicks either silently did nothing or hijacked the current tab's
// navigation, which is one of the ways "clicking a link" could feel broken.
function setupProxyMessageListener() {
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object' || !data.__nitroShieldOpenTab || !data.url) return;
    createNewTab(data.url);
  });
}

function loadSavedBookmarks() {
  try {
    const saved = localStorage.getItem('nitro_browser_bookmarks');
    if (saved) {
      bookmarks = JSON.parse(saved);
    } else {
      bookmarks = [...DEFAULT_SPEED_DIALS];
    }
  } catch (e) {
    bookmarks = [...DEFAULT_SPEED_DIALS];
  }
}

function saveBookmarks() {
  try {
    localStorage.setItem('nitro_browser_bookmarks', JSON.stringify(bookmarks));
  } catch (e) {}
}

function setupTabsUI() {
  const newTabBtn = document.getElementById('browser-new-tab-btn');
  if (newTabBtn) {
    newTabBtn.addEventListener('click', () => createNewTab());
  }
}

function createNewTab(targetUrl = '') {
  const newId = 'tab-' + Date.now();
  const newTab = {
    id: newId,
    title: 'New Tab',
    url: targetUrl,
    history: targetUrl ? [targetUrl] : [],
    historyIndex: targetUrl ? 0 : -1,
    favicon: '🌐',
    zoomLevel: 100
  };
  if (targetUrl) {
    try {
      const host = new URL(targetUrl).hostname;
      newTab.title = host.replace('www.', '');
      newTab.favicon = getFaviconEmojiForUrl(targetUrl);
    } catch (e) {}
  }
  tabs.push(newTab);
  activeTabId = newId;
  renderTabs();
  renderActiveTab();
}

function renderTabs() {
  const container = document.getElementById('browser-tabs-strip');
  if (!container) return;

  container.innerHTML = tabs.map(t => {
    const isActive = t.id === activeTabId;
    const isSecondary = t.id === secondarySplitTabId && isSplitViewActive;

    return `
      <div class="browser-tab ${isActive ? 'active' : ''} ${isSecondary ? 'split-secondary' : ''}" data-tab-id="${t.id}">
        <span class="browser-tab-favicon">${t.favicon || '🌐'}</span>
        <span class="browser-tab-title" title="${escapeHtml(t.url || 'New Tab')}">${escapeHtml(t.title || 'New Tab')}</span>
        ${tabs.length > 1 ? `<button class="browser-tab-close-btn" data-close-id="${t.id}" title="Close Tab">✕</button>` : ''}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.browser-tab').forEach(tabEl => {
    tabEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('browser-tab-close-btn')) return;
      activeTabId = tabEl.dataset.tabId;
      renderTabs();
      renderActiveTab();
    });
  });

  container.querySelectorAll('.browser-tab-close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const closeId = btn.dataset.closeId;
      if (tabs.length <= 1) return;
      tabs = tabs.filter(t => t.id !== closeId);
      if (activeTabId === closeId) {
        activeTabId = tabs[tabs.length - 1].id;
      }
      if (secondarySplitTabId === closeId) {
        secondarySplitTabId = null;
        isSplitViewActive = false;
      }
      renderTabs();
      renderActiveTab();
    });
  });
}

function renderActiveTab() {
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const urlInput = document.getElementById('browser-url-input');
  const primaryIframe = document.getElementById('browser-iframe');
  const speedDial = document.getElementById('browser-speed-dial');
  const splitWrapper = document.getElementById('browser-viewport-split-wrapper');
  const secondaryIframe = document.getElementById('browser-iframe-secondary');

  if (!activeTab) return;

  if (urlInput) urlInput.value = activeTab.url || '';

  // Update Bookmark Star Pill
  updateBookmarkStarUI(activeTab.url);

  const singleViewport = document.getElementById('browser-viewport-single');

  if (!activeTab.url || activeTab.url.trim() === '') {
    if (speedDial) speedDial.style.display = 'block';
    if (singleViewport) singleViewport.style.display = 'none';
    if (primaryIframe) primaryIframe.style.display = 'none';
    if (splitWrapper) splitWrapper.style.display = 'none';
  } else {
    if (speedDial) speedDial.style.display = 'none';

    if (isSplitViewActive && secondarySplitTabId) {
      if (singleViewport) singleViewport.style.display = 'none';
      if (splitWrapper) splitWrapper.style.display = 'flex';
      if (primaryIframe) primaryIframe.style.display = 'none';

      const secTab = tabs.find(t => t.id === secondarySplitTabId);
      if (primaryIframe) updateIframeSrc(primaryIframe, activeTab.url);
      if (secondaryIframe && secTab) updateIframeSrc(secondaryIframe, secTab.url);
    } else {
      if (splitWrapper) splitWrapper.style.display = 'none';
      if (singleViewport) singleViewport.style.display = 'flex';
      if (primaryIframe) {
        primaryIframe.style.display = 'block';
        updateIframeSrc(primaryIframe, activeTab.url);
      }
    }
  }
}

function updateIframeSrc(iframeEl, targetUrl) {
  if (!iframeEl || !targetUrl) return;
  const token = localStorage.getItem('nitro_jwt_token');
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';

  const proxiedUrl = `/api/gateway?url=${encodeURIComponent(targetUrl)}${tokenParam}&engine=chrome`;
  if (iframeEl.src !== `${window.location.origin}${proxiedUrl}`) {
    iframeEl.src = proxiedUrl;
  }
}

function navigateTab(rawUrl) {
  if (!rawUrl || rawUrl.trim() === '') return;
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const searchEngineSelect = document.getElementById('browser-search-engine-select');
  const engine = searchEngineSelect ? searchEngineSelect.value : 'duckduckgo';

  let target = rawUrl.trim();

  if (!target.startsWith('http://') && !target.startsWith('https://')) {
    if (target.includes('.') && !target.includes(' ')) {
      target = 'https://' + target;
    } else {
      if (engine === 'brave') target = `https://search.brave.com/search?q=${encodeURIComponent(target)}`;
      else if (engine === 'bing') target = `https://www.bing.com/search?q=${encodeURIComponent(target)}`;
      else if (engine === 'google') target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
      else if (engine === 'wikipedia') target = `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(target)}`;
      else if (engine === 'wolfram') target = `https://www.wolframalpha.com/input?i=${encodeURIComponent(target)}`;
      else target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
    }
  }

  activeTab.url = target;
  try {
    const host = new URL(target).hostname;
    activeTab.title = host.replace('www.', '');
    activeTab.favicon = getFaviconEmojiForUrl(target);
  } catch (e) {
    activeTab.title = target.slice(0, 18);
  }

  activeTab.history.push(target);
  activeTab.historyIndex = activeTab.history.length - 1;

  renderTabs();
  renderActiveTab();
}

function getFaviconEmojiForUrl(urlStr) {
  const u = urlStr.toLowerCase();
  if (u.includes('duckduckgo')) return '🦆';
  if (u.includes('wikipedia')) return '🌐';
  if (u.includes('desmos')) return '📐';
  if (u.includes('khanacademy')) return '📚';
  if (u.includes('wolfram')) return '🧮';
  if (u.includes('classroom')) return '🎓';
  if (u.includes('github')) return '💻';
  if (u.includes('canva')) return '🎨';
  if (u.includes('youtube')) return '🔴';
  return '🌐';
}

function setupToolbarControls() {
  const urlInput = document.getElementById('browser-url-input');
  const goBtn = document.getElementById('browser-go-btn');
  const backBtn = document.getElementById('browser-back');
  const forwardBtn = document.getElementById('browser-forward');
  const refreshBtn = document.getElementById('browser-refresh');
  const homeBtn = document.getElementById('browser-home');
  const bookmarkStarBtn = document.getElementById('browser-bookmark-star-btn');
  const openBlankBtn = document.getElementById('browser-open-blank-btn');

  if (goBtn && urlInput) {
    goBtn.addEventListener('click', () => navigateTab(urlInput.value));
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigateTab(urlInput.value);
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab && activeTab.historyIndex > 0) {
        activeTab.historyIndex--;
        activeTab.url = activeTab.history[activeTab.historyIndex];
        renderTabs();
        renderActiveTab();
      }
    });
  }

  if (forwardBtn) {
    forwardBtn.addEventListener('click', () => {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab && activeTab.historyIndex < activeTab.history.length - 1) {
        activeTab.historyIndex++;
        activeTab.url = activeTab.history[activeTab.historyIndex];
        renderTabs();
        renderActiveTab();
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const primaryIframe = document.getElementById('browser-iframe');
      if (primaryIframe && primaryIframe.src) {
        primaryIframe.src = primaryIframe.src;
      }
    });
  }

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
        activeTab.url = '';
        activeTab.title = 'New Tab';
        renderTabs();
        renderActiveTab();
      }
    });
  }

  if (bookmarkStarBtn) {
    bookmarkStarBtn.addEventListener('click', () => {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (!activeTab || !activeTab.url) return;

      const idx = bookmarks.findIndex(b => b.url === activeTab.url);
      if (idx !== -1) {
        bookmarks.splice(idx, 1);
      } else {
        bookmarks.push({
          name: activeTab.title || 'Bookmark',
          url: activeTab.url,
          icon: activeTab.favicon || '⭐',
          desc: 'Saved Bookmark'
        });
      }
      saveBookmarks();
      updateBookmarkStarUI(activeTab.url);
      renderSpeedDial();
    });
  }

  if (openBlankBtn) {
    openBlankBtn.addEventListener('click', launchAboutBlankCloak);
  }
}

function updateBookmarkStarUI(currentUrl) {
  const starBtn = document.getElementById('browser-bookmark-star-btn');
  if (!starBtn) return;
  const isBookmarked = bookmarks.some(b => b.url === currentUrl);
  starBtn.textContent = isBookmarked ? '⭐' : '☆';
  starBtn.style.color = isBookmarked ? '#fbbf24' : '#94a3b8';
}

function setupSplitViewUI() {
  const splitBtn = document.getElementById('browser-split-view-btn');
  if (splitBtn) {
    splitBtn.addEventListener('click', () => {
      if (tabs.length < 2) {
        createNewTab('https://www.desmos.com/calculator');
      }

      isSplitViewActive = !isSplitViewActive;
      if (isSplitViewActive) {
        const remaining = tabs.filter(t => t.id !== activeTabId);
        secondarySplitTabId = remaining.length > 0 ? remaining[0].id : null;
        splitBtn.style.background = '#10b981';
        splitBtn.style.color = '#000';
      } else {
        secondarySplitTabId = null;
        splitBtn.style.background = 'rgba(255,255,255,0.08)';
        splitBtn.style.color = '#fff';
      }
      renderTabs();
      renderActiveTab();
    });
  }
}

function setupSpeedDialUI() {
  renderSpeedDial();
  const addBtn = document.getElementById('speed-dial-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const name = prompt('Enter Bookmark Name:');
      const url = prompt('Enter Bookmark Web Address (URL):');
      if (name && url) {
        bookmarks.push({ name, url, icon: '⭐', desc: 'Custom Tile' });
        saveBookmarks();
        renderSpeedDial();
      }
    });
  }
}

function renderSpeedDial() {
  const container = document.getElementById('browser-speed-dial-grid');
  if (!container) return;

  container.innerHTML = bookmarks.map(item => `
    <div class="speed-dial-card" data-url="${escapeHtml(item.url)}">
      <div class="speed-dial-icon">${item.icon || '🌐'}</div>
      <strong class="speed-dial-name">${escapeHtml(item.name)}</strong>
      <span class="speed-dial-desc">${escapeHtml(item.desc || '')}</span>
    </div>
  `).join('');

  container.querySelectorAll('.speed-dial-card').forEach(card => {
    card.addEventListener('click', () => {
      navigateTab(card.dataset.url);
    });
  });
}

function launchAboutBlankCloak() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  let targetUrl = activeTab && activeTab.url ? activeTab.url : 'https://html.duckduckgo.com/html/?q=math+solver';

  const token = localStorage.getItem('nitro_jwt_token');
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
  const fullUrl = `${window.location.origin}/api/gateway?url=${encodeURIComponent(targetUrl)}${tokenParam}&engine=chrome`;

  const win = window.open('about:blank', '_blank');
  if (!win) return alert('Pop-up blocked! Please allow pop-ups for about:blank cloak.');

  const doc = win.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Google Classroom</title>
      <link rel="icon" type="image/x-icon" href="https://ssl.gstatic.com/classroom/favicon.png">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100vw; height: 100vh; overflow: hidden; background: #07090e; }
        iframe { width: 100%; height: 100%; border: none; }
      </style>
    </head>
    <body>
      <iframe src="${fullUrl}" allow="autoplay; fullscreen; clipboard-write; encrypted-media"></iframe>
    </body>
    </html>
  `);
  doc.close();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setupIframeLoadListeners() {
  const primaryIframe = document.getElementById('browser-iframe');
  const secondaryIframe = document.getElementById('browser-iframe-secondary');

  function syncIframeUrl(iframeEl, isSecondary = false) {
    if (!iframeEl) return;
    try {
      const currentLoc = iframeEl.contentWindow.location.href;
      if (!currentLoc) return;
      
      const urlObj = new URL(currentLoc);
      const targetUrl = urlObj.searchParams.get('url');
      if (targetUrl) {
        const targetTabId = isSecondary ? secondarySplitTabId : activeTabId;
        const targetTab = tabs.find(t => t.id === targetTabId);
        if (targetTab && targetTab.url !== targetUrl) {
          targetTab.url = targetUrl;
          try {
            const host = new URL(targetUrl).hostname;
            targetTab.title = host.replace('www.', '');
            targetTab.favicon = getFaviconEmojiForUrl(targetUrl);
          } catch (e) {}

          const urlInput = document.getElementById('browser-url-input');
          if (!isSecondary && urlInput && activeTabId === targetTabId) {
            urlInput.value = targetUrl;
            updateBookmarkStarUI(targetUrl);
          }
          renderTabs();
        }
      }
    } catch (e) {
      // CORS block might happen if proxy redirects directly, keep calm
    }
  }

  if (primaryIframe) {
    primaryIframe.addEventListener('load', () => syncIframeUrl(primaryIframe, false));
  }
  if (secondaryIframe) {
    secondaryIframe.addEventListener('load', () => syncIframeUrl(secondaryIframe, true));
  }
}
