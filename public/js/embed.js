// 🌐 Google Sites & Iframe Embed Studio Module

export function initEmbedStudio() {
  const modal = document.getElementById('embed-modal');
  const openBtn = document.getElementById('open-embed-modal-btn');
  const closeBtn = document.getElementById('embed-modal-close');
  const settingsOpenBtn = document.getElementById('settings-open-embed-btn');
  const settingsQuickCopyBtn = document.getElementById('settings-quick-copy-embed-btn');
  
  const textarea = document.getElementById('embed-code-textarea');
  const copyBtn = document.getElementById('copy-embed-code-btn');
  const tabBtns = document.querySelectorAll('.embed-tab-btn');
  const guideBox = document.getElementById('embed-guide-box');
  const codeSection = document.getElementById('embed-code-section');
  const testPreviewBtn = document.getElementById('test-embed-preview-btn');
  const openNewTabBtn = document.getElementById('open-embed-newtab-btn');

  const helperDock = document.getElementById('embed-helper-dock');
  const dockFullscreenBtn = document.getElementById('embed-dock-fullscreen-btn');
  const dockPopoutBtn = document.getElementById('embed-dock-popout-btn');
  const dockCloakBtn = document.getElementById('embed-dock-cloak-btn');
  const dockProxyBtn = document.getElementById('embed-dock-proxy-btn');
  const dockCloseBtn = document.getElementById('embed-dock-close-btn');

  // Detect if site is running in an iframe (e.g. Google Sites) or in /embed mode
  const isIframe = window.self !== window.top;
  const isEmbedParam = new URLSearchParams(window.location.search).get('embed') === 'true' || window.location.pathname.startsWith('/embed');

  if (isIframe || isEmbedParam) {
    document.body.classList.add('is-embedded-frame');
    if (helperDock) {
      helperDock.style.display = 'flex';
    }
  }

  // Get current origin safely
  const getCleanOrigin = () => {
    try {
      return window.location.origin || `${window.location.protocol}//${window.location.host}`;
    } catch(e) {
      return 'https://your-nitro-domain.com';
    }
  };

  const generateEmbedCode = (type) => {
    const origin = getCleanOrigin();
    switch(type) {
      case 'widget':
        return `<iframe src="${origin}/" style="width:100%; height:900px; border:none; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.6);" allow="fullscreen; gamepad; autoplay; clipboard-read; clipboard-write; microphone; camera" allowfullscreen="true" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"></iframe>`;
      case 'proxy':
        return `<iframe src="${origin}/?view=browser" style="position:fixed; top:0; left:0; bottom:0; right:0; width:100%; height:100%; border:none; margin:0; padding:0; overflow:hidden; z-index:999999;" allow="fullscreen; gamepad; autoplay; clipboard-read; clipboard-write; microphone; camera; focus-without-user-activation *" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock allow-orientation-lock"></iframe>`;
      case 'fullscreen':
      default:
        return `<iframe src="${origin}/embed" style="position:fixed; top:0; left:0; bottom:0; right:0; width:100%; height:100%; border:none; margin:0; padding:0; overflow:hidden; z-index:999999;" allow="fullscreen; gamepad; autoplay; clipboard-read; clipboard-write; microphone; camera; focus-without-user-activation *" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock allow-orientation-lock"></iframe>`;
    }
  };

  let currentEmbedType = 'fullscreen';

  const updateEmbedCode = (type) => {
    currentEmbedType = type;
    tabBtns.forEach(btn => {
      if (btn.dataset.embedType === type) {
        btn.classList.add('active');
        btn.style.background = 'rgba(56,189,248,0.2)';
        btn.style.borderColor = '#38bdf8';
        btn.style.color = '#38bdf8';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'rgba(255,255,255,0.06)';
        btn.style.borderColor = 'rgba(255,255,255,0.12)';
        btn.style.color = '#cbd5e1';
      }
    });

    if (type === 'guide') {
      if (codeSection) codeSection.style.display = 'none';
      if (guideBox) guideBox.style.display = 'block';
    } else {
      if (codeSection) codeSection.style.display = 'block';
      if (guideBox) guideBox.style.display = 'none';
      if (textarea) {
        textarea.value = generateEmbedCode(type);
      }
    }
  };

  // Tab click handlers
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      updateEmbedCode(btn.dataset.embedType);
    });
  });

  const openModal = () => {
    if (modal) {
      modal.classList.add('active');
      updateEmbedCode(currentEmbedType || 'fullscreen');
    }
  };

  const closeModal = () => {
    if (modal) modal.classList.remove('active');
  };

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (settingsOpenBtn) settingsOpenBtn.addEventListener('click', openModal);

  // Quick Copy button in settings
  if (settingsQuickCopyBtn) {
    settingsQuickCopyBtn.addEventListener('click', () => {
      const code = generateEmbedCode('fullscreen');
      navigator.clipboard.writeText(code).then(() => {
        const origText = settingsQuickCopyBtn.textContent;
        settingsQuickCopyBtn.textContent = '✅ Copied Fullscreen Code!';
        setTimeout(() => { settingsQuickCopyBtn.textContent = origText; }, 2500);
      });
    });
  }

  // Copy embed code button in modal
  if (copyBtn && textarea) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(textarea.value).then(() => {
        copyBtn.textContent = '✅ Copied to Clipboard!';
        copyBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        copyBtn.style.color = '#fff';
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy Embed Code';
          copyBtn.style.background = 'linear-gradient(135deg, #38bdf8, #3b82f6)';
          copyBtn.style.color = '#000';
        }, 2200);
      });
    });
  }

  // Test live preview in new window
  if (testPreviewBtn) {
    testPreviewBtn.addEventListener('click', () => {
      const origin = getCleanOrigin();
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Sites Embed Test</title>
          <style>
            body { margin: 0; padding: 0; background: #000; overflow: hidden; height: 100vh; font-family: sans-serif; }
            .banner { background: #182035; color: #38bdf8; padding: 8px 16px; font-size: 0.82rem; font-weight: 700; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(56,189,248,0.3); }
            iframe { border: none; width: 100%; height: calc(100vh - 36px); }
          </style>
        </head>
        <body>
          <div class="banner">
            <span>🌐 Live Google Sites Embed Simulation (${origin})</span>
            <button onclick="window.close()" style="background:#ef4444; color:#fff; border:none; padding:3px 10px; border-radius:4px; font-weight:700; cursor:pointer;">Close Test</button>
          </div>
          <iframe src="${origin}/embed" allow="fullscreen; gamepad; autoplay; clipboard-read; clipboard-write; microphone; camera" allowfullscreen="true" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"></iframe>
        </body>
        </html>
      `;
      const win = window.open('', '_blank');
      if (win) {
        win.document.open();
        win.document.write(testHtml);
        win.document.close();
      }
    });
  }

  // Open standalone /embed URL
  if (openNewTabBtn) {
    openNewTabBtn.addEventListener('click', () => {
      window.open(`${getCleanOrigin()}/embed`, '_blank');
    });
  }

  // Floating Embed Helper Dock Actions
  if (dockFullscreenBtn) {
    dockFullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        dockFullscreenBtn.textContent = '⛶ Exit Full';
      } else {
        document.exitFullscreen().catch(() => {});
        dockFullscreenBtn.textContent = '⛶ Fullscreen';
      }
    });
  }

  if (dockPopoutBtn) {
    dockPopoutBtn.addEventListener('click', () => {
      window.open(getCleanOrigin(), '_blank');
    });
  }

  if (dockCloakBtn) {
    dockCloakBtn.addEventListener('click', () => {
      const origin = getCleanOrigin();
      const win = window.open('about:blank', '_blank');
      if (win) {
        const doc = win.document;
        doc.title = 'Google Docs';
        const link = doc.createElement('link');
        link.rel = 'icon';
        link.href = 'https://www.google.com/s2/favicons?domain=docs.google.com&sz=128';
        doc.head.appendChild(link);
        
        const iframe = doc.createElement('iframe');
        iframe.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; border:none; margin:0; padding:0; overflow:hidden; z-index:999999;';
        iframe.src = `${origin}/embed`;
        iframe.allow = 'fullscreen; gamepad; autoplay; clipboard-read; clipboard-write; microphone; camera';
        iframe.setAttribute('allowfullscreen', 'true');
        doc.body.style.margin = '0';
        doc.body.style.overflow = 'hidden';
        doc.body.appendChild(iframe);
      }
    });
  }

  if (dockProxyBtn) {
    dockProxyBtn.addEventListener('click', () => {
      if (window.switchView) {
        window.switchView('browser');
      } else {
        const navBtn = document.querySelector('[data-view="browser"]');
        if (navBtn) navBtn.click();
      }
    });
  }

  if (dockCloseBtn && helperDock) {
    dockCloseBtn.addEventListener('click', () => {
      helperDock.style.display = 'none';
    });
  }
}
