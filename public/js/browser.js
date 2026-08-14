// Multi-Tab Sandboxed In-App Browser & Speed Dial Engine
import { getCurrentUser } from './auth.js';

let tabs = [
  {
    id: 'tab-1',
    title: 'New Tab',
    url: 'https://html.duckduckgo.com/html/?q=math+solver',
    history: ['https://html.duckduckgo.com/html/?q=math+solver'],
    historyIndex: 0
  }
];
let activeTabId = 'tab-1';

const SPEED_DIAL_ITEMS = [
  { name: 'DuckDuckGo', url: 'https://html.duckduckgo.com/html/', icon: '🦆', desc: 'Private Search' },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page', icon: '🌐', desc: 'Encyclopedia' },
  { name: 'Desmos Math', url: 'https://www.desmos.com/calculator', icon: '📐', desc: 'Graphing Tool' },
  { name: 'Khan Academy', url: 'https://www.khanacademy.org', icon: '📚', desc: 'Study Lessons' },
  { name: 'WolframAlpha', url: 'https://www.wolframalpha.com', icon: '🧮', desc: 'Computational Math' },
  { name: 'Google Classroom', url: 'https://classroom.google.com', icon: '🎓', desc: 'Student Portal' },
  { name: 'GitHub', url: 'https://github.com', icon: '💻', desc: 'Code Repository' },
  { name: 'Google Docs', url: 'https://docs.google.com', icon: '📝', desc: 'Document Editor' }
];

export function initBrowser() {
  setupTabsUI();
  setupBrowserControls();
  renderSpeedDial();
  renderActiveTab();
}

function setupTabsUI() {
  const newTabBtn = document.getElementById('browser-new-tab-btn');
  if (newTabBtn) {
    newTabBtn.addEventListener('click', () => {
      const newId = 'tab-' + Date.now();
      tabs.push({
        id: newId,
        title: 'New Tab',
        url: '',
        history: [],
        historyIndex: -1
      });
      activeTabId = newId;
      renderTabs();
      renderActiveTab();
    });
  }
  renderTabs();
}

function renderTabs() {
  const tabsContainer = document.getElementById('browser-tabs-strip');
  if (!tabsContainer) return;

  tabsContainer.innerHTML = tabs.map((t, idx) => `
    <div class="browser-tab ${t.id === activeTabId ? 'active' : ''}" data-tab-id="${t.id}">
      <span class="browser-tab-icon">🌐</span>
      <span class="browser-tab-title">${t.title || 'New Tab'}</span>
      ${tabs.length > 1 ? `<button class="browser-tab-close" data-close-id="${t.id}">✕</button>` : ''}
    </div>
  `).join('');

  tabsContainer.querySelectorAll('.browser-tab').forEach(tabEl => {
    tabEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('browser-tab-close')) return;
      activeTabId = tabEl.dataset.tabId;
      renderTabs();
      renderActiveTab();
    });
  });

  tabsContainer.querySelectorAll('.browser-tab-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const closeId = btn.dataset.closeId;
      if (tabs.length <= 1) return;
      tabs = tabs.filter(t => t.id !== closeId);
      if (activeTabId === closeId) {
        activeTabId = tabs[tabs.length - 1].id;
      }
      renderTabs();
      renderActiveTab();
    });
  });
}

function renderActiveTab() {
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const urlInput = document.getElementById('browser-url-input');
  const iframe = document.getElementById('browser-iframe');
  const speedDial = document.getElementById('browser-speed-dial');

  if (!activeTab) return;

  if (urlInput) urlInput.value = activeTab.url || '';

  if (!activeTab.url || activeTab.url.trim() === '') {
    if (speedDial) speedDial.style.display = 'grid';
    if (iframe) iframe.style.display = 'none';
  } else {
    if (speedDial) speedDial.style.display = 'none';
    if (iframe) {
      iframe.style.display = 'block';
      const token = localStorage.getItem('nitro_jwt_token');
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const engineSelect = document.getElementById('browser-proxy-engine-select');
      const engine = engineSelect ? engineSelect.value : (localStorage.getItem('nitro_proxy_engine') || 'chrome');
      const engineParam = `&engine=${encodeURIComponent(engine)}`;

      const targetSrc = `/api/proxy?url=${encodeURIComponent(activeTab.url)}${tokenParam}${engineParam}`;
      if (iframe.src !== `${window.location.origin}${targetSrc}`) {
        iframe.src = targetSrc;
      }
    }
  }
}

function navigateActiveTab(rawUrl) {
  if (!rawUrl || rawUrl.trim() === '') return;
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const engineSelect = document.getElementById('browser-search-engine-select');
  const engine = engineSelect ? engineSelect.value : 'duckduckgo';

  let target = rawUrl.trim();

  if (!target.startsWith('http://') && !target.startsWith('https://')) {
    if (target.includes('.') && !target.includes(' ')) {
      target = 'https://' + target;
    } else {
      if (engine === 'brave') {
        target = `https://search.brave.com/search?q=${encodeURIComponent(target)}`;
      } else if (engine === 'bing') {
        target = `https://www.bing.com/search?q=${encodeURIComponent(target)}`;
      } else if (engine === 'google') {
        target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
      } else {
        target = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(target)}`;
      }
    }
  }

  activeTab.url = target;
  try {
    const host = new URL(target).hostname;
    activeTab.title = host.replace('www.', '');
  } catch (e) {
    activeTab.title = target.slice(0, 15);
  }

  activeTab.history.push(target);
  activeTab.historyIndex = activeTab.history.length - 1;

  renderTabs();
  renderActiveTab();
}

function renderSpeedDial() {
  const container = document.getElementById('browser-speed-dial-grid');
  if (!container) return;

  container.innerHTML = SPEED_DIAL_ITEMS.map(item => `
    <div class="speed-dial-card" data-url="${item.url}">
      <div class="speed-dial-icon">${item.icon}</div>
      <strong class="speed-dial-name">${item.name}</strong>
      <span class="speed-dial-desc">${item.desc}</span>
    </div>
  `).join('');

  container.querySelectorAll('.speed-dial-card').forEach(card => {
    card.addEventListener('click', () => {
      navigateActiveTab(card.dataset.url);
    });
  });
}

function setupBrowserControls() {
  const urlInput = document.getElementById('browser-url-input');
  const goBtn = document.getElementById('browser-go-btn');
  const iframe = document.getElementById('browser-iframe');
  const backBtn = document.getElementById('browser-back');
  const forwardBtn = document.getElementById('browser-forward');
  const refreshBtn = document.getElementById('browser-refresh');
  const homeBtn = document.getElementById('browser-home');
  const openBlankBtn = document.getElementById('browser-open-blank-btn');
  const proxyEngineSelect = document.getElementById('browser-proxy-engine-select');

  if (proxyEngineSelect) {
    const savedEngine = localStorage.getItem('nitro_proxy_engine');
    if (savedEngine) proxyEngineSelect.value = savedEngine;

    proxyEngineSelect.addEventListener('change', (e) => {
      const selected = e.target.value;
      localStorage.setItem('nitro_proxy_engine', selected);
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab && activeTab.url) {
        const token = localStorage.getItem('nitro_jwt_token');
        const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
        iframe.src = `/api/proxy?url=${encodeURIComponent(activeTab.url)}${tokenParam}&engine=${encodeURIComponent(selected)}`;
      }
    });
  }

  if (goBtn && urlInput) {
    goBtn.addEventListener('click', () => navigateActiveTab(urlInput.value));
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigateActiveTab(urlInput.value);
    });
  }

  if (refreshBtn && iframe) {
    refreshBtn.addEventListener('click', () => {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab && activeTab.url) {
        const token = localStorage.getItem('nitro_jwt_token');
        const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
        const engine = proxyEngineSelect ? proxyEngineSelect.value : (localStorage.getItem('nitro_proxy_engine') || 'chrome');
        iframe.src = `/api/proxy?url=${encodeURIComponent(activeTab.url)}${tokenParam}&engine=${encodeURIComponent(engine)}`;
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

  if (openBlankBtn) {
    openBlankBtn.addEventListener('click', () => {
      const activeTab = tabs.find(t => t.id === activeTabId);
      let targetUrl = activeTab && activeTab.url ? activeTab.url : 'https://html.duckduckgo.com/html/?q=math+solver';

      const token = localStorage.getItem('nitro_jwt_token');
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const fullUrl = `${window.location.origin}/api/proxy?url=${encodeURIComponent(targetUrl)}${tokenParam}`;

      const win = window.open('about:blank', '_blank');
      if (!win) {
        alert('Pop-up blocked! Please allow pop-ups for about:blank cloak.');
        return;
      }

      const doc = win.document;
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Docs - Workspace</title>
          <link rel="icon" type="image/x-icon" href="https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            html, body { width: 100vw; height: 100vh; overflow: hidden; background: #0b0c10; }
            iframe { width: 100%; height: 100%; border: none; }
          </style>
        </head>
        <body>
          <iframe src="${fullUrl}" allow="autoplay; fullscreen; clipboard-write; encrypted-media"></iframe>
        </body>
        </html>
      `);
      doc.close();
    });
  }
}
