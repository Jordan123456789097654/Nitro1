import { initThemes } from './themes.js';
import { initAuth, getCurrentUser, updateNavAuthUI } from './auth.js';
import { initGames, loadProGames } from './games.js';
import { initChat, updateSocketActivity } from './chat.js';
import { initAdmin, loadAdminData, fetchUsers } from './admin.js';
import { initBrowser } from './browser.js';
import { initMusicPlayer, updateMusicPlayerVisibility } from './music.js';
import { initPolls } from './polls.js';
import { initStudyTimer, initPaintCanvas } from './widgets.js';
import { initAiHelper } from './ai.js';
import { initSoundboard } from './soundboard.js';
import { initVoiceRooms } from './voice.js';
import { initFriends, fetchFriends, sendFriendRequest } from './friends.js';
import { initEmbedStudio } from './embed.js';
import { initNotifications } from './notifications.js';
import { initShop } from './shop.js';

export const FAVICON_MAP = {
  default: '/favicon.svg',
  classroom: 'https://www.google.com/s2/favicons?domain=classroom.google.com&sz=128',
  drive: 'https://www.google.com/s2/favicons?domain=drive.google.com&sz=128',
  docs: 'https://www.google.com/s2/favicons?domain=docs.google.com&sz=128',
  github: 'https://www.google.com/s2/favicons?domain=github.com&sz=128',
  canvas: 'https://www.canvas.instructure.com/favicon.ico',
  desmos: 'https://www.desmos.com/favicon.ico',
  khan: 'https://www.khanacademy.org/favicon.ico',
  quizlet: 'https://quizlet.com/favicon.ico',
  wikipedia: 'https://en.wikipedia.org/static/favicon/wikipedia.ico'
};

document.addEventListener('DOMContentLoaded', () => {
  initParticleCanvas();
  initThemes();
  initNavigation();
  initNotifications();
  initShop();
  initGames();
  initChat();
  initAdmin();
  initBrowser();
  initMusicPlayer();
  initPolls();
  initStudyTimer();
  initAiHelper();
  initSoundboard();
  initVoiceRooms();
  initFriends();
  initEmbedStudio();
  initToolsDropdown();
  initNetworkDropdown();
  initCloakMode();
  initPersonalBranding();
  initPresetDisguiseSwitcher();
  initNotificationPreferenceToggles();
  initTosModal();
  initUpdateLogsPopup();
  initAboutBlankSiteLauncher();
  initAntiCloseProtection();
  initPanicKeySystem();
  initFakeErrorPanic();
  initVisitorCounter();
  initCookieConsent();
  initKonamiCode();
  setupBadgesModal();
  setupAppealModal();
  initSuggestAndBugModals();
  initWeatherClock();
  window.openPublicProfile = openPublicProfile;

  initAuth((user) => {
    checkStatusAndAnnouncements();
    checkUpdateLogs();
    loadProGames();
    updateMusicPlayerVisibility();
    if (user && ['admin', 'owner'].includes(user.role)) {
      loadAdminData();
    }
  });

  window.checkUpdateLogs = checkUpdateLogs;
  window.checkStatusAndAnnouncements = checkStatusAndAnnouncements;
  initDevToolsProtection();

  const adminLoginBtn = document.getElementById('maintenance-admin-login-btn');
  if (adminLoginBtn) {
    adminLoginBtn.addEventListener('click', () => {
      document.getElementById('auth-modal-btn')?.click();
    });
  }

  const proLoungeMusicBtn = document.getElementById('pro-lounge-open-music-btn');
  if (proLoungeMusicBtn) {
    proLoungeMusicBtn.addEventListener('click', () => {
      document.getElementById('pro-music-toggle-btn')?.click();
    });
  }

  setInterval(checkStatusAndAnnouncements, 15000);
});

// Visitor Counter
async function initVisitorCounter() {
  const countEl = document.getElementById('site-visitor-count');
  try {
    const hasVisited = sessionStorage.getItem('nitro_has_visited');
    let res;
    if (!hasVisited) {
      res = await fetch('/api/visit', { method: 'POST' });
      sessionStorage.setItem('nitro_has_visited', 'true');
    } else {
      res = await fetch('/api/status');
    }
    const data = await res.json();
    if (countEl && data.visits_count) {
      countEl.textContent = Number(data.visits_count).toLocaleString();
    }
  } catch (e) {
    if (countEl) countEl.textContent = '1,420';
  }
}

// Cookie Consent Banner
function initCookieConsent() {
  const banner = document.getElementById('cookie-consent-banner');
  const acceptBtn = document.getElementById('cookie-accept-btn');
  const declineBtn = document.getElementById('cookie-decline-btn');

  if (!banner) return;

  const consented = localStorage.getItem('nitro_cookie_consent');
  if (!consented) {
    banner.style.display = 'flex';
  }

  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      localStorage.setItem('nitro_cookie_consent', 'accepted');
      banner.style.display = 'none';
    });
  }

  if (declineBtn) {
    declineBtn.addEventListener('click', () => {
      localStorage.setItem('nitro_cookie_consent', 'declined');
      banner.style.display = 'none';
    });
  }
}

// Fake Error Screen Panic Trigger
function initFakeErrorPanic() {
  const fakeScreen = document.getElementById('fake-error-screen');
  const errorTitle = document.getElementById('fake-error-title');
  const errorDesc = document.getElementById('fake-error-desc');
  const triggerBtn = document.getElementById('panic-fake-error-btn');

  function triggerFakeError(type = 'classroom') {
    if (!fakeScreen) return;
    if (type === 'canvas') {
      if (errorTitle) errorTitle.textContent = 'Canvas LMS - 404 Page Not Found';
      if (errorDesc) errorDesc.innerHTML = 'The course material or assignment you are looking for has been removed or is temporarily unavailable.<br><br><code>HTTP Status 404 - Instructure Canvas Router</code>';
    } else {
      if (errorTitle) errorTitle.textContent = '500 Server Error - Google Classroom';
      if (errorDesc) errorDesc.innerHTML = 'Google Classroom encountered a temporary internal server error. Please wait a few moments and reload.<br><br><code>Error Code 500 (server_load_timeout_cluster)</code>';
    }
    fakeScreen.style.display = 'flex';
  }

  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => triggerFakeError('classroom'));
  }

  if (fakeScreen) {
    // Triple click to dismiss fake error screen stealthily
    let clicks = 0;
    fakeScreen.addEventListener('click', () => {
      clicks++;
      if (clicks >= 3) {
        fakeScreen.style.display = 'none';
        clicks = 0;
      }
      setTimeout(() => clicks = 0, 1000);
    });
  }

  window.triggerFakePanic = triggerFakeError;
}

// Preset Disguise Switcher
function initPresetDisguiseSwitcher() {
  const select = document.getElementById('preset-disguise-select');
  if (!select) return;

  const PRESETS = {
    desmos: { title: 'Desmos | Graphing Calculator', icon: FAVICON_MAP.desmos },
    khan: { title: 'Khan Academy | Free Online Courses, Lessons & Practice', icon: FAVICON_MAP.khan },
    quizlet: { title: 'Flashcards, learning tools and textbook solutions | Quizlet', icon: FAVICON_MAP.quizlet },
    wikipedia: { title: 'Wikipedia, the free encyclopedia', icon: FAVICON_MAP.wikipedia },
    classroom: { title: 'Google Classroom - Home', icon: FAVICON_MAP.classroom },
    docs: { title: 'Google Docs - Workspace', icon: FAVICON_MAP.docs }
  };

  select.addEventListener('change', () => {
    const p = PRESETS[select.value];
    if (p) {
      document.title = p.title;
      applyFavicon(p.icon);
      localStorage.setItem('nitro_custom_title', p.title);
      alert(`🎭 Disguise applied: ${p.title}`);
    }
  });

  const customForm = document.getElementById('custom-disguise-builder-form');
  if (customForm) {
    customForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('custom-disguise-title-input').value.trim();
      const icon = document.getElementById('custom-disguise-icon-input').value.trim() || FAVICON_MAP.classroom;

      if (!title) return;

      document.title = title;
      applyFavicon(icon);

      localStorage.setItem('nitro_custom_title', title);
      localStorage.setItem('nitro_custom_icon_url', icon);

      alert(`✨ Custom Disguise Applied & Saved: "${title}"`);
    });
  }
}

// Dropdown Tools Menu Handler
function initToolsDropdown() {
  const btn = document.getElementById('quick-tools-btn');
  const menu = document.getElementById('quick-tools-menu');

  if (btn && menu) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
    });

    document.addEventListener('click', (e) => {
      if (!btn.contains(e.target) && !menu.contains(e.target)) {
        menu.style.display = 'none';
      }
    });

    menu.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        menu.style.display = 'none';
      });
    });
  }
}

function initNetworkDropdown() {
  const btn = document.getElementById('nav-network-btn');
  const popup = document.getElementById('network-sites-popup');

  if (btn && popup) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      popup.style.display = popup.style.display === 'flex' ? 'none' : 'flex';
    });

    document.addEventListener('click', (e) => {
      if (!btn.contains(e.target) && !popup.contains(e.target)) {
        popup.style.display = 'none';
      }
    });
  }
}

// Notification Preference Toggles
function initNotificationPreferenceToggles() {
  const disableAnnCheckbox = document.getElementById('disable-announcements-checkbox');
  const disableUpdatesCheckbox = document.getElementById('disable-updates-checkbox');

  if (disableAnnCheckbox) {
    disableAnnCheckbox.checked = localStorage.getItem('nitro_disable_announcements') === 'true';
    disableAnnCheckbox.addEventListener('change', (e) => {
      localStorage.setItem('nitro_disable_announcements', e.target.checked ? 'true' : 'false');
      checkStatusAndAnnouncements();
    });
  }

  if (disableUpdatesCheckbox) {
    disableUpdatesCheckbox.checked = localStorage.getItem('nitro_disable_updates') === 'true';
    disableUpdatesCheckbox.addEventListener('change', (e) => {
      localStorage.setItem('nitro_disable_updates', e.target.checked ? 'true' : 'false');
    });
  }
}

// Update Logs / Patch Notes Popup Engine
export async function checkUpdateLogs(forceShow = false) {
  if (!forceShow && localStorage.getItem('nitro_disable_updates') === 'true') {
    return;
  }

  try {
    const res = await fetch('/api/updates/latest');
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;

    const data = await res.json();
    const popup = document.getElementById('update-log-popup');
    if (!popup || !data.update) return;

    const lastSeenId = parseInt(localStorage.getItem('nitro_last_seen_update_id') || '0', 10);
    const updateId = parseInt(data.update.id, 10);

    if (forceShow || updateId > lastSeenId) {
      document.getElementById('update-popup-version').textContent = data.update.version;
      document.getElementById('update-popup-title').textContent = data.update.title;
      document.getElementById('update-popup-content').textContent = data.update.content;
      popup.style.display = 'flex';

      const dismissBtn = document.getElementById('update-popup-dismiss-btn');
      const closeBtn = document.getElementById('update-popup-close-btn');
      const neverShowAgainCheck = document.getElementById('update-popup-never-show');

      const closeHandler = () => {
        popup.style.display = 'none';
        localStorage.setItem('nitro_last_seen_update_id', updateId.toString());
        if (neverShowAgainCheck && neverShowAgainCheck.checked) {
          localStorage.setItem('nitro_disable_updates', 'true');
          const settingsCheck = document.getElementById('disable-updates-checkbox');
          if (settingsCheck) settingsCheck.checked = true;
        }
      };

      if (dismissBtn) dismissBtn.onclick = closeHandler;
      if (closeBtn) closeBtn.onclick = closeHandler;
    }
  } catch (e) {}
}

function initUpdateLogsPopup() {
  const openBtn = document.getElementById('open-updates-modal-btn');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      checkUpdateLogs(true);
    });
  }
}

// Check Maintenance and Display Announcement Banner
export async function checkStatusAndAnnouncements() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;

    const data = await res.json();
    const overlay = document.getElementById('maintenance-overlay');
    const user = getCurrentUser();

    // Maintenance check (Owner Exclusive Exemption)
    if (data.maintenance_mode) {
      const isOwner = user && (user.role === 'owner' || user.username.toLowerCase() === 'jordandaniels');
      if (isOwner) {
        overlay.style.display = 'none';
      } else {
        overlay.style.display = 'flex';
      }
    } else {
      overlay.style.display = 'none';
    }

    // Announcement banner
    const annBanner = document.getElementById('announcement-banner');
    const annTitle = document.getElementById('ann-banner-title');
    const annMsg = document.getElementById('ann-banner-msg');
    const annClose = document.getElementById('ann-banner-close');

    const isDisabledByUser = localStorage.getItem('nitro_disable_announcements') === 'true';

    if (data.announcement && data.announcement.is_active && !isDisabledByUser) {
      const dismissed = sessionStorage.getItem('dismissed_ann_' + data.announcement.id);
      if (!dismissed) {
        annTitle.textContent = data.announcement.title;
        annMsg.textContent = data.announcement.message;
        annBanner.style.display = 'flex';

        annClose.onclick = () => {
          annBanner.style.display = 'none';
          sessionStorage.setItem('dismissed_ann_' + data.announcement.id, 'true');
        };
      } else {
        annBanner.style.display = 'none';
      }
    } else {
      annBanner.style.display = 'none';
    }
  } catch (e) {}
}

window.setDisguisePreset = function(presetKey) {
  const PRESETS = {
    classroom: { title: 'Classes', icon: FAVICON_MAP.classroom },
    canvas: { title: 'Dashboard', icon: FAVICON_MAP.canvas },
    docs: { title: 'Untitled document - Google Docs', icon: FAVICON_MAP.docs },
    desmos: { title: 'Desmos | Graphing Calculator', icon: FAVICON_MAP.desmos },
    khan: { title: 'Dashboard | Khan Academy', icon: FAVICON_MAP.khan },
    drive: { title: 'Google Drive - My Drive', icon: FAVICON_MAP.drive },
    reset: { title: 'Nitro OS | Gaming & Unblocked Apps', icon: FAVICON_MAP.default }
  };
  const config = PRESETS[presetKey] || PRESETS.reset;
  document.title = config.title;
  applyFavicon(config.icon);
  localStorage.setItem('nitro_custom_title', config.title);
};

// Panic Key & Emergency Quick Redirect Engine
function initPanicKeySystem() {
  const panicInput = document.getElementById('panic-key-input');
  const panicSelect = document.getElementById('panic-url-select');
  const customGroup = document.getElementById('panic-custom-url-group');
  const customInput = document.getElementById('panic-custom-url-input');
  const saveBtn = document.getElementById('save-panic-key-btn');
  const testBtn = document.getElementById('test-panic-key-btn');

  const savedKey = localStorage.getItem('nitro_panic_key') || ']';
  const savedUrl = localStorage.getItem('nitro_panic_url') || 'https://classroom.google.com';

  if (panicInput) panicInput.value = savedKey;

  if (panicSelect) {
    if (['https://classroom.google.com', 'https://drive.google.com', 'https://docs.google.com', 'https://canvas.instructure.com', 'https://wikipedia.org'].includes(savedUrl)) {
      panicSelect.value = savedUrl;
      if (customGroup) customGroup.style.display = 'none';
    } else {
      panicSelect.value = 'custom';
      if (customGroup) customGroup.style.display = 'block';
      if (customInput) customInput.value = savedUrl;
    }

    panicSelect.addEventListener('change', () => {
      if (panicSelect.value === 'custom') {
        if (customGroup) customGroup.style.display = 'block';
      } else {
        if (customGroup) customGroup.style.display = 'none';
      }
    });
  }

  if (panicInput) {
    panicInput.addEventListener('keydown', (e) => {
      e.preventDefault();
      panicInput.value = e.key;
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const key = panicInput.value.trim() || ']';
      let destUrl = panicSelect.value;
      if (destUrl === 'custom') {
        destUrl = customInput.value.trim() || 'https://classroom.google.com';
      }

      localStorage.setItem('nitro_panic_key', key);
      localStorage.setItem('nitro_panic_url', destUrl);
      alert(`🚨 Panic Key set to "${key}" -> Redirects to: ${destUrl}`);
    });
  }

  if (testBtn) {
    testBtn.addEventListener('click', () => {
      const destUrl = localStorage.getItem('nitro_panic_url') || 'https://classroom.google.com';
      window.location.replace(destUrl);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && document.activeElement.id !== 'panic-key-input') {
      return;
    }

    const currentPanicKey = localStorage.getItem('nitro_panic_key') || ']';
    if (e.key === currentPanicKey) {
      e.preventDefault();
      const destUrl = localStorage.getItem('nitro_panic_url') || 'https://classroom.google.com';
      window.location.replace(destUrl);
    }
  });
}

function initAboutBlankSiteLauncher() {
  const btn = document.getElementById('launch-site-blank-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const win = window.open('about:blank', '_blank');
    if (!win) {
      alert('Pop-up blocked! Please allow pop-ups to launch in about:blank.');
      return;
    }

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Drive - My Drive</title>
        <link rel="icon" type="image/png" href="https://www.google.com/s2/favicons?domain=drive.google.com&sz=128">
        <style>
          html, body { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: #000; }
          iframe { width: 100%; height: 100%; border: none; }
        </style>
      </head>
      <body>
        <iframe src="${window.location.origin}"></iframe>
      </body>
      </html>
    `);
    win.document.close();
  });
}

function initAntiCloseProtection() {
  const checkbox = document.getElementById('anti-close-checkbox');
  const isEnabled = localStorage.getItem('nitro_anti_close') === 'true';

  if (checkbox) {
    checkbox.checked = isEnabled;
    checkbox.addEventListener('change', (e) => {
      localStorage.setItem('nitro_anti_close', e.target.checked ? 'true' : 'false');
    });
  }

  window.addEventListener('beforeunload', (e) => {
    if (localStorage.getItem('nitro_anti_close') === 'true') {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to leave? Your session will close.';
      return e.returnValue;
    }
  });
}

function initTosModal() {
  const modal = document.getElementById('tos-modal');
  const openBtn = document.getElementById('open-tos-btn');
  const gateTosBtn = document.getElementById('gate-open-tos');
  const closeBtn = document.getElementById('tos-modal-close');
  const acceptBtn = document.getElementById('tos-accept-btn');

  if (openBtn) openBtn.addEventListener('click', () => modal.classList.add('active'));
  if (gateTosBtn) gateTosBtn.addEventListener('click', (e) => { e.preventDefault(); modal.classList.add('active'); });
  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
  if (acceptBtn) acceptBtn.addEventListener('click', () => modal.classList.remove('active'));
}

export function applyFavicon(url) {
  if (!url) return;

  const existingIcons = document.querySelectorAll("link[rel*='icon']");
  existingIcons.forEach(el => el.remove());

  const link = document.createElement('link');
  link.rel = 'icon';
  if (url.includes('.svg') || url.startsWith('data:image/svg')) {
    link.type = 'image/svg+xml';
  } else if (url.includes('.png') || url.startsWith('data:image/png')) {
    link.type = 'image/png';
  } else {
    link.type = 'image/x-icon';
  }
  link.href = url;
  document.head.appendChild(link);
}

function initPersonalBranding() {
  const titleInput = document.getElementById('custom-tab-title-input');
  const iconSelect = document.getElementById('custom-tab-icon-select');
  const greetingInput = document.getElementById('custom-greeting-input');
  const saveBtn = document.getElementById('save-personal-branding-btn');

  const savedTitle = localStorage.getItem('nitro_custom_title');
  const savedIcon = localStorage.getItem('nitro_custom_icon') || 'default';
  const savedGreeting = localStorage.getItem('nitro_custom_greeting');

  if (savedTitle) {
    document.title = savedTitle;
    if (titleInput) titleInput.value = savedTitle;
  }

  applyFavicon(FAVICON_MAP[savedIcon] || FAVICON_MAP.default);
  if (iconSelect) iconSelect.value = savedIcon;

  if (savedGreeting && greetingInput) {
    greetingInput.value = savedGreeting;
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const customTitle = titleInput.value.trim();
      const customIcon = iconSelect.value;
      const customGreeting = greetingInput.value.trim();

      if (customTitle) {
        document.title = customTitle;
        localStorage.setItem('nitro_custom_title', customTitle);
      } else {
        localStorage.removeItem('nitro_custom_title');
        document.title = 'Study Helper - Homework Suite & Workspace';
      }

      if (FAVICON_MAP[customIcon]) {
        applyFavicon(FAVICON_MAP[customIcon]);
        localStorage.setItem('nitro_custom_icon', customIcon);
      }

      if (customGreeting) {
        localStorage.setItem('nitro_custom_greeting', customGreeting);
      } else {
        localStorage.removeItem('nitro_custom_greeting');
      }

      updateNavAuthUI();
      alert('✨ Personal tab & site branding saved!');
    });
  }
}

function initCloakMode() {
  const checkbox = document.getElementById('cloak-mode-checkbox');
  if (!checkbox) return;

  const originalTitle = 'Study Helper - Homework Suite & Workspace';

  checkbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      document.title = 'Google Drive - My Drive';
      applyFavicon(FAVICON_MAP.drive);
    } else {
      const savedTitle = localStorage.getItem('nitro_custom_title');
      const savedIcon = localStorage.getItem('nitro_custom_icon') || 'default';
      document.title = savedTitle || originalTitle;
      applyFavicon(FAVICON_MAP[savedIcon] || FAVICON_MAP.default);
    }
  });
}

window.switchView = function(targetView) {
  if (targetView === 'games') {
    const user = getCurrentUser();
    if (!user || !['admin', 'owner'].includes(user.role)) {
      alert('🔒 Access Restricted: The Add Custom Item creator tool is reserved for Administrator accounts.');
      return window.switchView('library');
    }
  }

  const navBtns = document.querySelectorAll('.nav-btn[data-view]');
  const views = document.querySelectorAll('.page-view');

  navBtns.forEach(b => {
    if (b.dataset.view === targetView) b.classList.add('active');
    else b.classList.remove('active');
  });

  views.forEach(v => v.classList.remove('active'));
  const targetEl = document.getElementById(`view-${targetView}`);
  if (targetEl) {
    targetEl.classList.add('active');
  }

  updateSocketActivity(`Browsing ${targetView.toUpperCase()}`);

  if (targetView === 'chat' && typeof window.refreshChatViewOnNavigate === 'function') {
    window.refreshChatViewOnNavigate();
  }
  if (targetView === 'pro') loadProGames();
  if (targetView === 'apps') {
    import('./apps.js').then(m => m.loadApps?.());
  }
  if (targetView === 'admin') {
    loadAdminData();
    fetchUsers();
  }
  if (targetView === 'paint') {
    initPaintCanvas();
    triggerQuestProgress('load_paint');
  }
  if (targetView === 'soundboard') {
    triggerQuestProgress('load_soundboard');
  }
};

async function triggerQuestProgress(questType) {
  try {
    const token = localStorage.getItem('nitro_jwt_token') || '';
    if (!token) return;
    await fetch('/api/shop/quests/trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ questType })
    });
  } catch (e) {}
}

function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn[data-view]');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      window.switchView(btn.dataset.view);
    });
  });

  const openFriendsBtn = document.getElementById('open-friends-btn');
  if (openFriendsBtn) {
    openFriendsBtn.addEventListener('click', () => {
      window.switchView('chat');
      setTimeout(() => {
        const friendsTab = document.querySelector('.chat-mode-tab[data-mode="friends"]');
        if (friendsTab) friendsTab.click();
        if (typeof fetchFriends === 'function') fetchFriends();
      }, 100);
    });
  }
}

function initParticleCanvas() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = Array.from({ length: 45 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: Math.random() * 2.5 + 0.8,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    alpha: Math.random() * 0.5 + 0.2
  }));

  function animate() {
    ctx.clearRect(0, 0, width, height);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
      ctx.fill();
    });

    requestAnimationFrame(animate);
  }

  animate();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}



export function unlockAchievement(id, title, desc, icon = '🏆') {
  let unlocked = [];
  try { unlocked = JSON.parse(localStorage.getItem('nitro_unlocked_achievements') || '[]'); } catch (e) {}

  if (unlocked.includes(id)) return;

  unlocked.push(id);
  localStorage.setItem('nitro_unlocked_achievements', JSON.stringify(unlocked));

  showAchievementToast(title, desc, icon);
}

function showAchievementToast(title, desc, icon) {
  const toast = document.createElement('div');
  toast.className = 'achievement-toast-card';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: linear-gradient(135deg, #1e1b4b, #0f172a);
    border: 2px solid #fbbf24;
    box-shadow: 0 10px 30px rgba(251, 191, 36, 0.5);
    border-radius: 14px;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    z-index: 999999;
    color: #fff;
    max-width: 360px;
    transition: opacity 0.5s ease;
  `;
  toast.innerHTML = `
    <div style="font-size: 2.2rem;">${icon}</div>
    <div>
      <strong style="color: #fbbf24; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.5px;">SECRET ACHIEVEMENT UNLOCKED!</strong>
      <div style="font-weight: 800; font-size: 0.98rem; color: #fff; margin-top: 2px;">${escapeHtml(title)}</div>
      <p style="font-size: 0.8rem; color: #94a3b8; margin: 2px 0 0;">${escapeHtml(desc)}</p>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 4500);
}

function initKonamiCode() {
  const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let konamiIndex = 0;

  window.addEventListener('keydown', (e) => {
    const key = e.key ? (e.key.length === 1 ? e.key.toLowerCase() : e.key) : '';
    const expected = konamiSequence[konamiIndex].length === 1 ? konamiSequence[konamiIndex].toLowerCase() : konamiSequence[konamiIndex];

    if (key === expected) {
      konamiIndex++;
      if (konamiIndex === konamiSequence.length) {
        konamiIndex = 0;
        unlockAchievement('konami', 'Konami Code Master!', 'Entered the legendary retro cheat code (+500 XP)', '🎮');
      }
    } else {
      konamiIndex = 0;
    }
  });

  const hour = new Date().getHours();
  if (hour >= 22 || hour < 5) {
    setTimeout(() => {
      unlockAchievement('night_owl', 'Night Owl Gamer', 'Playing games after 10:00 PM late at night', '🦉');
    }, 3000);
  }
}

const MASTER_BADGES = [
  { id: 'owner_badge', title: '👑 Supreme Owner', desc: 'Platform creator & supreme administrator (+10,000 XP)', icon: '👑', isUnlocked: (u) => u && (u.role === 'owner' || u.role === 'admin') },
  { id: 'early_member', title: '🌱 Early Member', desc: 'Joined Nitro during the exclusive beta launch period — OG status forever', icon: '🌱', isUnlocked: (u) => u && (u.role === 'early_member' || u.role === 'owner' || u.role === 'admin') },
  { id: 'konami', title: '🎮 Konami Code Master', desc: 'Entered the legendary retro cheat code (↑ ↑ ↓ ↓ ← → ← → B A)', icon: '🎮', isUnlocked: (u) => (u && u.role === 'owner') || isAchievementUnlocked('konami') },
  { id: 'night_owl', title: '🦉 Night Owl Gamer', desc: 'Logged in and played games late at night past midnight', icon: '🦉', isUnlocked: () => true },
  { id: 'speed_demon', title: '⚡ Speed Demon', desc: 'Recorded over 10 active gaming sessions in the catalog', icon: '⚡', isUnlocked: () => true },
  { id: 'chatterbox', title: '💬 Chatterbox Legend', desc: 'Active participant in live community study chat', icon: '💬', isUnlocked: () => true },
  { id: 'high_score', title: '🏆 High Score King', desc: 'Submitted top scores on global arcade leaderboards', icon: '🏆', isUnlocked: (u) => u && (u.role === 'owner' || u.role === 'admin') },
  { id: 'playlist_arch', title: '📁 Playlist Architect', desc: 'Organized custom game folders & study break playlists', icon: '📁', isUnlocked: () => true },
  { id: 'stealth_master', title: '🎭 Stealth Master', desc: 'Applied custom academic tab cloaking disguises', icon: '🎭', isUnlocked: () => true },
  { id: 'voice_mav', title: '🎙️ Voice Maverick', desc: 'Joined live WebRTC audio channels for group comms', icon: '🎙️', isUnlocked: () => true },
  { id: 'soundboard_dj', title: '🔊 Soundboard DJ', desc: 'Triggered Vine Boom & Airhorn sound effects live in room', icon: '🔊', isUnlocked: () => true },
  { id: 'picasso_artist', title: '🎨 Picasso Painter', desc: 'Created and downloaded custom artwork in Paint Studio', icon: '🎨', isUnlocked: () => true },
  { id: 'pomodoro_master', title: '⏱️ Focus Master', desc: 'Completed a 25-minute Pomodoro study focus session', icon: '⏱️', isUnlocked: () => true },
  { id: 'snake_champ', title: '🐍 Snake Champion', desc: 'Scored over 50 points in Mini Arcade Snake', icon: '🐍', isUnlocked: () => true },
  { id: 'tictactoe_pro', title: '❌ Tic-Tac-Toe Pro', desc: 'Won 5 rounds in Mini Arcade Tic-Tac-Toe', icon: '❌', isUnlocked: () => true },
  { id: 'social_butterfly', title: '👥 Social Butterfly', desc: 'Connected with classmates & sent friend requests', icon: '👥', isUnlocked: () => true },
  { id: 'vip_lounge', title: '⭐ VIP Lounge Elite', desc: 'Unlocked PRO & VIP Lounge unblocked games catalog', icon: '⭐', isUnlocked: (u) => u && ['owner', 'admin', 'vip', 'pro', 'elite_patron', 'early_member'].includes(u.role) },
  { id: 'lofi_listener', title: '🎧 Lofi Listener', desc: 'Enchanted study breaks with ambient lofi music streams', icon: '🎧', isUnlocked: () => true },
  { id: 'nitro_og', title: '🚀 Nitro OG Founder', desc: 'Early access platform beta tester badge', icon: '🚀', isUnlocked: () => true },
  { id: 'gateway_nav', title: '🌐 Gateway Navigator', desc: 'Explored web games via sandboxed gateway relay engine', icon: '🌐', isUnlocked: () => true },
  { id: 'diamond_supporter', title: '💎 Diamond Supporter', desc: 'Recognized active platform community member', icon: '💎', isUnlocked: () => true }
];

export function openBadgesModal() {
  const modal = document.getElementById('badges-modal');
  const grid = document.getElementById('badges-showcase-grid');
  if (!modal || !grid) return;

  const user = window.currentUser || (window.getCurrentUser ? window.getCurrentUser() : null);

  grid.innerHTML = MASTER_BADGES.map(b => {
    const unlocked = b.isUnlocked(user);
    return `
      <div style="background: ${unlocked ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(139, 92, 246, 0.15))' : 'rgba(0,0,0,0.4)'}; border: 1px solid ${unlocked ? 'rgba(251, 191, 36, 0.6)' : 'rgba(255,255,255,0.08)'}; border-radius: 12px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; opacity: ${unlocked ? '1' : '0.65'}; transition: transform 0.2s ease;">
        <div style="font-size: 2.2rem; filter: ${unlocked ? 'none' : 'grayscale(100%)'};">${b.icon}</div>
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <strong style="color: ${unlocked ? '#fbbf24' : '#94a3b8'}; font-size: 0.92rem;">${escapeHtml(b.title)}</strong>
            <span style="font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; font-weight: 800; background: ${unlocked ? '#10b981' : 'rgba(255,255,255,0.1)'}; color: ${unlocked ? '#000' : '#94a3b8'};">${unlocked ? 'UNLOCKED' : 'LOCKED'}</span>
          </div>
          <p style="font-size: 0.78rem; color: var(--text-muted); margin: 4px 0 0;">${escapeHtml(b.desc)}</p>
        </div>
      </div>
    `;
  }).join('');

  modal.classList.add('active');
}

function isAchievementUnlocked(id) {
  try {
    const list = JSON.parse(localStorage.getItem('nitro_unlocked_achievements') || '[]');
    return list.includes(id);
  } catch (e) {
    return false;
  }
}

function setupBadgesModal() {
  const modal = document.getElementById('badges-modal');
  const closeBtn = document.getElementById('badges-modal-close');
  const openBtn = document.getElementById('open-badges-modal-btn');
  const stripBtn = document.getElementById('profile-strip-badges-btn');

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
  }
  if (openBtn) {
    openBtn.addEventListener('click', () => openBadgesModal());
  }
  if (stripBtn) {
    stripBtn.addEventListener('click', () => openBadgesModal());
  }
  window.openBadges = openBadgesModal;

  const pubModal = document.getElementById('public-profile-modal');
  const pubCloseBtn = document.getElementById('public-profile-modal-close');
  if (pubCloseBtn && pubModal) {
    pubCloseBtn.addEventListener('click', () => pubModal.classList.remove('active'));
  }
  window.openPublicProfile = openPublicProfile;
}

export async function openPublicProfile(username) {
  if (!username) return;
  const modal = document.getElementById('public-profile-modal');
  const avatarEl = document.getElementById('pub-profile-avatar');
  const nameEl = document.getElementById('pub-profile-name');
  const roleEl = document.getElementById('pub-profile-role-badge');
  const handleEl = document.getElementById('pub-profile-handle');
  const bioEl = document.getElementById('pub-profile-bio');
  const badgeCountEl = document.getElementById('pub-profile-badge-count');
  const badgesListEl = document.getElementById('pub-profile-badges-list');
  const dmBtn = document.getElementById('pub-profile-dm-btn');

  if (!modal || !nameEl) return;

  nameEl.textContent = username;
  handleEl.textContent = `@${username}`;
  bioEl.textContent = 'Loading profile...';

  const ROLE_BADGE_CONFIG = {
    owner:        { label: '👑 OWNER',        bg: 'linear-gradient(90deg, #fbbf24, #ef4444)', color: '#000', fw: '900' },
    admin:        { label: '🛡️ ADMIN',         bg: '#ef4444',                                   color: '#fff', fw: '800' },
    moderator:    { label: '🛡️ MOD',           bg: '#a855f7',                                   color: '#fff', fw: '800' },
    elite_patron: { label: '💎 ELITE',         bg: '#ec4899',                                   color: '#fff', fw: '800' },
    premium_vip:  { label: '⭐ PREMIUM VIP',   bg: '#f59e0b',                                   color: '#000', fw: '800' },
    pro:          { label: '⚡ PRO',            bg: '#38bdf8',                                   color: '#000', fw: '800' },
    vip:          { label: '⭐ VIP',            bg: '#fbbf24',                                   color: '#000', fw: '800' },
    early_member: { label: '🌱 EARLY MEMBER',  bg: 'linear-gradient(90deg, #34d399, #059669)', color: '#000', fw: '800' },
    student_plus: { label: '🎓 STUDENT+',      bg: '#10b981',                                   color: '#000', fw: '700' },
    member:       { label: 'MEMBER',            bg: 'rgba(255,255,255,0.1)',                     color: '#94a3b8', fw: '600' },
  };

  // Set default view while loading
  roleEl.textContent = 'MEMBER';
  roleEl.style.background = 'rgba(255,255,255,0.1)';
  roleEl.style.color = '#94a3b8';
  roleEl.style.fontWeight = '600';
  if (avatarEl) avatarEl.innerHTML = '👤';

  modal.classList.add('active');

  let targetUser = { username, role: 'member' };
  try {
    const token = localStorage.getItem('nitro_jwt_token') || '';
    const res = await fetch(`/api/auth/profile/${encodeURIComponent(username)}`, {
      headers: { Authorization: token ? `Bearer ${token}` : '' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.user) {
        targetUser = data.user;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch public profile data:', e);
  }

  const role = (targetUser.role || 'member').toLowerCase();
  const cfg = ROLE_BADGE_CONFIG[role] || ROLE_BADGE_CONFIG.member;

  nameEl.textContent = targetUser.display_name || username;
  handleEl.textContent = `@${username}`;
  bioEl.textContent = targetUser.bio || 'Nitro Platform Member';
  roleEl.textContent = cfg.label;
  roleEl.style.background = cfg.bg;
  roleEl.style.color = cfg.color;
  roleEl.style.fontWeight = cfg.fw;

  if (avatarEl) {
    const avatarIcons = { owner: '👑', admin: '🛡️', moderator: '🛡️', early_member: '🌱', elite_patron: '💎', pro: '⚡', vip: '⭐', premium_vip: '⭐', student_plus: '🎓' };
    avatarEl.innerHTML = targetUser.avatar_url
      ? `<img src="${targetUser.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.innerHTML='${avatarIcons[role] || '👤'}'">`
      : (avatarIcons[role] || '👤');
  }

  const unlockedBadges = MASTER_BADGES.filter(b => b.isUnlocked(targetUser));
  if (badgeCountEl) badgeCountEl.textContent = `${unlockedBadges.length} Unlocked Badges`;

  if (badgesListEl) {
    badgesListEl.innerHTML = MASTER_BADGES.map(b => {
      const unlocked = b.isUnlocked(targetUser);
      return `
        <div style="background:${unlocked ? 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(139,92,246,0.12))' : 'rgba(0,0,0,0.3)'}; border:1px solid ${unlocked ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.06)'}; border-radius:8px; padding:10px 12px; display:flex; align-items:center; gap:10px;">
          <span style="font-size:1.5rem; filter:${unlocked ? 'none' : 'grayscale(100%)'}">${b.icon}</span>
          <div style="flex:1;">
            <strong style="color:${unlocked ? '#fbbf24' : '#94a3b8'}; font-size:0.82rem; display:block;">${escapeHtml(b.title)}</strong>
            <span style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(b.desc)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  const addFriendBtn = document.getElementById('pub-profile-add-friend-btn');
  if (addFriendBtn) {
    addFriendBtn.onclick = async () => {
      try {
        await sendFriendRequest(username);
        alert(`✅ Friend request sent to @${username}!`);
      } catch (err) {
        alert(err.message || 'Failed to send friend request.');
      }
    };
  }

  if (dmBtn) {
    dmBtn.onclick = () => {
      modal.classList.remove('active');
      const chatTab = document.getElementById('nav-chat-tab');
      if (chatTab) chatTab.click();
      setTimeout(() => {
        const dmInput = document.getElementById('chat-dm-target-user');
        if (dmInput) {
          dmInput.value = username;
          const dmSubmit = document.getElementById('chat-start-dm-btn');
          if (dmSubmit) dmSubmit.click();
        }
      }, 200);
    };
  }

  modal.classList.add('active');
}

function setupAppealModal() {
  const modal = document.getElementById('punishment-appeal-modal');
  const form = document.getElementById('punishment-appeal-form');
  const usernameInput = document.getElementById('appeal-username-input');
  const categorySelect = document.getElementById('appeal-category-select');
  const descInput = document.getElementById('appeal-desc-input');
  const whyInput = document.getElementById('appeal-why-input');
  const preventionInput = document.getElementById('appeal-prevention-input');
  const pledgeCheck1 = document.getElementById('appeal-pledge-check1');
  const pledgeCheck2 = document.getElementById('appeal-pledge-check2');
  const feedback = document.getElementById('appeal-status-feedback');
  const submitBtn = document.getElementById('submit-appeal-btn');

  // Embedded Ban Screen Form Elements
  const banForm = document.getElementById('ban-screen-appeal-form');
  const banUserInput = document.getElementById('ban-screen-username-input');
  const banCategorySelect = document.getElementById('ban-screen-category-select');
  const banDescInput = document.getElementById('ban-screen-desc-input');
  const banWhyInput = document.getElementById('ban-screen-why-input');
  const banPreventionInput = document.getElementById('ban-screen-prevention-input');
  const banPledge1 = document.getElementById('ban-screen-pledge-check1');
  const banPledge2 = document.getElementById('ban-screen-pledge-check2');
  const banFeedback = document.getElementById('ban-screen-feedback');
  const banSubmitBtn = document.getElementById('ban-screen-submit-btn');

  window.openAppealModal = (suggestedUsername = '') => {
    const defaultUser = suggestedUsername || localStorage.getItem('nitro_last_banned_user') || localStorage.getItem('nitro_remembered_username') || '';
    
    // Check if ban overlay is showing
    const banOverlay = document.getElementById('account-banned-overlay');
    const banBox = document.getElementById('ban-screen-appeal-box');
    const actionsRow = document.getElementById('ban-screen-actions-row');
    if (banOverlay && banOverlay.style.display !== 'none' && banBox) {
      if (banUserInput) banUserInput.value = defaultUser;
      if (banDescInput) banDescInput.value = '';
      if (banWhyInput) banWhyInput.value = '';
      if (banPreventionInput) banPreventionInput.value = '';
      if (banFeedback) banFeedback.style.display = 'none';
      banBox.style.display = 'block';
      if (actionsRow) actionsRow.style.display = 'none';
      return;
    }

    if (!modal) return;
    if (usernameInput) usernameInput.value = defaultUser;
    if (descInput) descInput.value = '';
    if (whyInput) whyInput.value = '';
    if (preventionInput) preventionInput.value = '';
    if (feedback) {
      feedback.style.display = 'none';
      feedback.textContent = '';
    }
    modal.style.display = 'flex';
  };

  async function handleDetailedAppealSubmission(payload, sbtn, fback, successCallback) {
    if (!payload.username) return alert('Username is required.');
    if (!payload.incidentDescription || payload.incidentDescription.length < 10) {
      return alert('Please describe what happened in Question 1 (minimum 10 characters).');
    }
    if (!payload.whySecondChance || payload.whySecondChance.length < 10) {
      return alert('Please explain why you are requesting another chance in Question 2 (minimum 10 characters).');
    }
    if (!payload.preventionCommitment || payload.preventionCommitment.length < 10) {
      return alert('Please describe your future prevention plan in Question 3 (minimum 10 characters).');
    }

    if (sbtn) {
      sbtn.disabled = true;
      sbtn.textContent = '🤖 Groq AI Arbitrating Appeal...';
    }

    try {
      const res = await fetch('/api/auth/submit-appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        if (fback) {
          fback.style.display = 'block';
          fback.style.background = 'rgba(16, 185, 129, 0.15)';
          fback.style.border = '1px solid #10b981';
          fback.style.color = '#34d399';
          fback.innerHTML = `✅ <strong>Detailed Appeal Received!</strong><br>${data.message || 'Staff and Groq AI will review your questionnaire.'}`;
        }
        if (successCallback) successCallback();
      } else {
        if (fback) {
          fback.style.display = 'block';
          fback.style.background = 'rgba(239, 68, 68, 0.15)';
          fback.style.border = '1px solid #ef4444';
          fback.style.color = '#f87171';
          fback.innerHTML = `⚠️ <strong>Submission Note:</strong><br>${data.error || 'Failed to submit appeal.'}`;
        }
      }
    } catch (err) {
      alert('Network error submitting appeal.');
    } finally {
      if (sbtn) {
        sbtn.disabled = false;
        sbtn.textContent = '🚀 Submit Detailed Appeal';
      }
    }
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        username: usernameInput?.value.trim(),
        incidentCategory: categorySelect?.value,
        incidentDescription: descInput?.value.trim(),
        whySecondChance: whyInput?.value.trim(),
        preventionCommitment: preventionInput?.value.trim(),
        rulesAgreed: pledgeCheck1?.checked && pledgeCheck2?.checked
      };
      handleDetailedAppealSubmission(payload, submitBtn, feedback, () => {
        if (descInput) descInput.value = '';
        if (whyInput) whyInput.value = '';
        if (preventionInput) preventionInput.value = '';
        setTimeout(() => {
          if (modal) modal.style.display = 'none';
        }, 3500);
      });
    });
  }

  if (banForm) {
    banForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        username: banUserInput?.value.trim(),
        incidentCategory: banCategorySelect?.value,
        incidentDescription: banDescInput?.value.trim(),
        whySecondChance: banWhyInput?.value.trim(),
        preventionCommitment: banPreventionInput?.value.trim(),
        rulesAgreed: banPledge1?.checked && banPledge2?.checked
      };
      handleDetailedAppealSubmission(payload, banSubmitBtn, banFeedback, () => {
        if (banDescInput) banDescInput.value = '';
        if (banWhyInput) banWhyInput.value = '';
        if (banPreventionInput) banPreventionInput.value = '';
      });
    });
  }
}

function initSuggestAndBugModals() {
  const suggestForm = document.getElementById('suggest-form');
  const suggestModal = document.getElementById('suggest-modal');
  const suggestClose = document.getElementById('suggest-modal-close');
  const suggestOpenBtns = document.querySelectorAll('#open-suggest-modal-btn, [data-open-modal="suggest"]');

  suggestOpenBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (suggestModal) suggestModal.classList.add('active');
    });
  });
  if (suggestClose && suggestModal) {
    suggestClose.addEventListener('click', () => suggestModal.classList.remove('active'));
  }

  if (suggestForm) {
    suggestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('suggest-title').value.trim();
      const details = document.getElementById('suggest-details').value.trim();
      const user = getCurrentUser();
      const username = user ? user.username : 'Guest';

      if (!title || !details) return alert('Please enter both title and details.');

      try {
        const res = await fetch('/api/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, details, username })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('💡 Thank you! Your game suggestion has been submitted to the admins.');
          suggestForm.reset();
          if (suggestModal) suggestModal.classList.remove('active');
        } else {
          alert(data.error || 'Failed to submit suggestion.');
        }
      } catch (err) {
        alert('Network error submitting suggestion.');
      }
    });
  }

  const bugForm = document.getElementById('bug-form');
  const bugModal = document.getElementById('bug-modal');
  const bugClose = document.getElementById('bug-modal-close');
  const bugOpenBtns = document.querySelectorAll('#open-bug-modal-btn, [data-open-modal="bug"]');

  bugOpenBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (bugModal) bugModal.classList.add('active');
    });
  });
  if (bugClose && bugModal) {
    bugClose.addEventListener('click', () => bugModal.classList.remove('active'));
  }

  if (bugForm) {
    bugForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('bug-title').value.trim();
      const category = document.getElementById('bug-category').value;
      const description = document.getElementById('bug-desc').value.trim();
      const user = getCurrentUser();
      const username = user ? user.username : 'Guest';

      if (!title || !description) return alert('Please fill in title and description.');

      try {
        const res = await fetch('/api/bugs/bugs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, category, description, username })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('🐛 Thank you! Your bug report has been logged for administrators.');
          bugForm.reset();
          if (bugModal) bugModal.classList.remove('active');
        } else {
          alert(data.error || 'Failed to submit bug report.');
        }
      } catch (err) {
        alert('Network error submitting bug report.');
      }
    });
  }
}

function initDevToolsProtection() {
  function isOwner() {
    const user = getCurrentUser();
    if (user && (user.role === 'owner' || (user.username && user.username.toLowerCase() === 'jordandaniels'))) {
      return true;
    }
    try {
      const token = localStorage.getItem('nitro_jwt_token') || sessionStorage.getItem('nitro_jwt_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload && (payload.role === 'owner' || (payload.username && payload.username.toLowerCase() === 'jordandaniels'))) {
          return true;
        }
      }
    } catch(e) {}
    return false;
  }

  function purgeAndLockdown() {
    if (isOwner()) return; // Owner Bypass

    console.clear();
    // Wipe all script tags to prevent script theft
    document.querySelectorAll('script').forEach(s => s.remove());

    document.body.innerHTML = `
      <div style="background: #090a0f; color: #ef4444; height: 100vh; width: 100vw; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 20px; box-sizing: border-box;">
        <div style="font-size: 4rem; margin-bottom: 12px;">🛡️</div>
        <h2 style="font-size: 2.2rem; background: linear-gradient(90deg, #ef4444, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0 0 12px; font-weight: 900;">DevTools Inspection Denied</h2>
        <p style="color: #94a3b8; max-width: 520px; line-height: 1.6; font-size: 1rem; margin-bottom: 20px;">Platform scripts and custom assets are protected against unauthorized inspection. Developer tools access is restricted to the platform owner.</p>
        <button onclick="window.location.reload()" style="padding: 10px 24px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #ef4444; border-radius: 99px; font-weight: 800; cursor: pointer;">🔄 Reload Site</button>
      </div>
    `;

    setInterval(() => {
      try {
        (function() {}.constructor('debugger')());
      } catch (e) {}
    }, 50);
  }

  // Block DevTools shortcuts for non-owners
  document.addEventListener('keydown', (e) => {
    if (isOwner()) return;

    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
      (e.ctrlKey && ['U', 'u', 'S', 's'].includes(e.key))
    ) {
      e.preventDefault();
      e.stopPropagation();
      purgeAndLockdown();
    }
  }, true);

  // DevTools Timing Trap Loop for non-owners
  setInterval(() => {
    if (isOwner()) return;

    const startTime = performance.now();
    try {
      (function() {}.constructor('debugger')());
    } catch (e) {}
    const endTime = performance.now();
    if (endTime - startTime > 100) {
      purgeAndLockdown();
    }
  }, 1200);
}

async function initWeatherClock() {
  const clockEl = document.getElementById('header-clock');
  const weatherEl = document.getElementById('header-weather');

  if (clockEl) {
    const updateTime = () => {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  if (weatherEl) {
    try {
      // Fetch via wttr.in with %c for emoji and %t for temperature (e.g. ⛅️ +72°F)
      const res = await fetch('https://wttr.in/?format=%c+%t');
      if (res.ok) {
        const text = await res.text();
        weatherEl.textContent = text.trim() || '🌤️ 72°F';
      } else {
        weatherEl.textContent = '🌤️ 72°F';
      }
    } catch (e) {
      weatherEl.textContent = '🌤️ 72°F';
    }
  }
}

