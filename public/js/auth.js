// Auth Management, Session State & Profile Configuration Engine
let currentUser = null;
let isRegisterMode = false;

const AVATAR_PRESETS = [
  { id: 'pfp-gamer', icon: '🎮', name: 'Retro Gamer', bg: 'linear-gradient(135deg, #eb2f5f, #7c3aed)' },
  { id: 'pfp-bot', icon: '🤖', name: 'Cyber Bot', bg: 'linear-gradient(135deg, #38bdf8, #6366f1)' },
  { id: 'pfp-cat', icon: '🐱', name: 'Neon Cat', bg: 'linear-gradient(135deg, #f43f5e, #fbbf24)' },
  { id: 'pfp-astro', icon: '🚀', name: 'Astronaut', bg: 'linear-gradient(135deg, #8b5cf6, #ec4899)' },
  { id: 'pfp-ninja', icon: '🥷', name: 'Shadow Ninja', bg: 'linear-gradient(135deg, #1e293b, #475569)' },
  { id: 'pfp-wizard', icon: '🧙', name: 'Mystic Wizard', bg: 'linear-gradient(135deg, #a855f7, #3b82f6)' },
  { id: 'pfp-alien', icon: '👾', name: 'Pixel Alien', bg: 'linear-gradient(135deg, #10b981, #06b6d4)' },
  { id: 'pfp-dragon', icon: '🐉', name: 'Fire Dragon', bg: 'linear-gradient(135deg, #ef4444, #f59e0b)' },
  { id: 'pfp-music', icon: '🎧', name: 'Lo-Fi Chill', bg: 'linear-gradient(135deg, #ec4899, #f43f5e)' },
  { id: 'pfp-hacker', icon: '⚡', name: 'Hacker', bg: 'linear-gradient(135deg, #22c55e, #14b8a6)' }
];

let onUserChangeCallback = null;

export function initAuth(onUserChange) {
  onUserChangeCallback = onUserChange;
  window.handleMandatoryPasswordReset = handleMandatoryPasswordReset;
  window.handleMandatoryProfileFix = handleMandatoryProfileFix;
  window.checkSession = () => checkSession(onUserChange);
  setupConsoleTokenAuth(onUserChange);
  checkSession(onUserChange);
  setupAuthModal(onUserChange);
  setupMandatoryLoginGate(onUserChange);
  setupProfileModal(onUserChange);
  checkAndApplySignupsGate();
}

// Fetch signup status once and adjust the login gate UI
async function checkAndApplySignupsGate() {
  try {
    const res = await fetch('/api/admin/signups-status');
    if (!res.ok) return;
    const data = await res.json();
    applySignupsGateUI(data.signups_enabled);
  } catch (e) {}
}

export function applySignupsGateUI(signupsEnabled) {
  const registerRow = document.getElementById('gate-register-row');
  const closedNotice = document.getElementById('gate-signups-closed-notice');
  const toggleLink = document.getElementById('gate-toggle-link');
  const toggleText = document.getElementById('gate-toggle-text');
  const formTitle = document.getElementById('gate-form-title');
  const submitBtn = document.getElementById('gate-submit-btn');

  if (!signupsEnabled) {
    // Hide the register toggle, show the closed notice
    if (registerRow) registerRow.style.display = 'none';
    if (closedNotice) closedNotice.style.display = 'block';
    // If they somehow switched to register mode, reset back to login
    if (formTitle && formTitle.textContent.toLowerCase().includes('create')) {
      if (formTitle) formTitle.textContent = 'Sign in to your account';
      if (submitBtn) submitBtn.textContent = 'Sign In';
      if (toggleText) toggleText.textContent = 'Need an account?';
      if (toggleLink) toggleLink.textContent = 'Register';
    }
  } else {
    if (registerRow) registerRow.style.display = '';
    if (closedNotice) closedNotice.style.display = 'none';
  }
}

export function getCurrentUser() {
  return currentUser;
}

function setupConsoleTokenAuth(onUserChange) {
  window.loginWithToken = async function(token) {
    if (!token || typeof token !== 'string') {
      console.error('❌ [Auth] Invalid token provided. Usage: loginWithToken("<your_jwt_token>")');
      return false;
    }

    const cleanToken = token.trim();
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${cleanToken}` }
      });
      const data = await res.json();

      if (!res.ok || !data.loggedIn) {
        console.error('❌ [Auth] Token rejected by server:', data.error || 'Invalid signature');
        return false;
      }

      currentUser = data.user;
      localStorage.setItem('nitro_jwt_token', cleanToken);
      localStorage.setItem('nitro_remembered_username', currentUser.username);

      updateNavAuthUI();
      toggleMandatoryGate(false);
      if (onUserChange) onUserChange(currentUser);

      console.log(`%c✅ [Auth] Successfully authenticated as ${currentUser.username} (${currentUser.role.toUpperCase()})!`, 'color: #10b981; font-weight: bold; font-size: 14px;');
      return true;
    } catch (e) {
      console.error('❌ [Auth] Error verifying token:', e);
      return false;
    }
  };

  window.setToken = window.loginWithToken;
}

export function setCookie(name, value, days = 365) {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export async function authFetch(url, options = {}) {
  const token = getCookie('nitro_jwt_token') || localStorage.getItem('nitro_jwt_token');
  const headers = { ...(options.headers || {}) };
  if (token && token !== 'null' && token !== 'undefined') {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return fetch(url, { ...options, headers, credentials: 'same-origin' });
}

export function getCookie(name) {
  const nameEQ = encodeURIComponent(name) + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
  }
  return null;
}

export function deleteCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
}

let lastBannedUsername = '';

export function showBannedScreen(reason = 'Violation of platform guidelines', username = '') {
  if (username) {
    lastBannedUsername = username;
    localStorage.setItem('nitro_last_banned_user', username);
  } else if (!lastBannedUsername) {
    lastBannedUsername = localStorage.getItem('nitro_last_banned_user') || localStorage.getItem('nitro_remembered_username') || '';
  }

  currentUser = null;

  const overlay = document.getElementById('account-banned-overlay');
  const reasonEl = document.getElementById('account-banned-reason-text');
  if (overlay) {
    if (reasonEl) reasonEl.textContent = reason;
    overlay.style.display = 'flex';
  }

  const appealUserInput = document.getElementById('ban-screen-username-input') || document.getElementById('appeal-username-input');
  if (appealUserInput && lastBannedUsername) {
    appealUserInput.value = lastBannedUsername;
  }
}

window.openBanAppealFromScreen = function() {
  const bannedUser = lastBannedUsername || localStorage.getItem('nitro_last_banned_user') || localStorage.getItem('nitro_remembered_username') || '';
  
  // 1. Try embedded ban-screen appeal box
  const embeddedBox = document.getElementById('ban-screen-appeal-box');
  const actionsRow = document.getElementById('ban-screen-actions-row');
  const embeddedUserInput = document.getElementById('ban-screen-username-input');

  if (embeddedBox) {
    if (embeddedUserInput && bannedUser) embeddedUserInput.value = bannedUser;
    embeddedBox.style.display = 'block';
    if (actionsRow) actionsRow.style.display = 'none';
    return;
  }

  // 2. Fallback to modal
  const modal = document.getElementById('punishment-appeal-modal');
  const usernameInput = document.getElementById('appeal-username-input');
  if (usernameInput && bannedUser) {
    usernameInput.value = bannedUser;
  }
  if (window.openAppealModal) {
    window.openAppealModal(bannedUser);
  } else if (modal) {
    modal.style.display = 'flex';
  }
};

window.switchAccountFromBanScreen = function() {
  const overlay = document.getElementById('account-banned-overlay');
  if (overlay) overlay.style.display = 'none';
  deleteCookie('nitro_jwt_token');
  localStorage.removeItem('nitro_jwt_token');
  localStorage.removeItem('nitro_remembered_username');
  localStorage.removeItem('nitro_last_banned_user');
  lastBannedUsername = '';
  currentUser = null;
  toggleMandatoryGate(true);
  updateNavAuthUI();
};

export async function checkSession(onUserChange) {
  const token = getCookie('nitro_jwt_token') || localStorage.getItem('nitro_jwt_token');

  if (!token) {
    currentUser = null;
    toggleMandatoryGate(true);
    updateNavAuthUI();
    return;
  }

  try {
    const headers = { 'Authorization': `Bearer ${token}` };

    const res = await fetch('/api/auth/me', { headers });
    const data = await res.json();

    if (data.is_banned && res.status === 403) {
      showBannedScreen(data.reason || 'Your account has been suspended by an administrator.', data.username || localStorage.getItem('nitro_remembered_username') || '');
      return;
    }

    if (data.loggedIn && data.user) {
      currentUser = data.user;
      toggleMandatoryGate(false);
      setCookie('nitro_jwt_token', token, 365);
      localStorage.setItem('nitro_jwt_token', token);
      if (data.must_reset_password) {
        setTimeout(handleMandatoryPasswordReset, 600);
      } else if (data.user && data.user.require_profile_update) {
        setTimeout(() => handleMandatoryProfileFix(data.user.profile_lock_reason), 600);
      }
    } else {
      currentUser = null;
      toggleMandatoryGate(true);
    }
    updateNavAuthUI();
    if (onUserChange) onUserChange(currentUser);
  } catch (err) {
    currentUser = null;
    toggleMandatoryGate(true);
    updateNavAuthUI();
  }
}

export function handleMandatoryPasswordReset() {
  const modal = document.getElementById('force-password-reset-modal');
  const form = document.getElementById('force-password-reset-form');
  const newPassInput = document.getElementById('force-new-password');
  const confirmPassInput = document.getElementById('force-confirm-password');
  const errorEl = document.getElementById('force-reset-error');
  const submitBtn = document.getElementById('force-reset-submit-btn');

  if (!modal || !form) return;

  modal.classList.add('active');
  modal.style.display = 'flex';

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.style.display = 'none';

    const p1 = newPassInput.value.trim();
    const p2 = confirmPassInput.value.trim();

    if (p1.length < 4) {
      if (errorEl) {
        errorEl.textContent = 'Password must be at least 4 characters long.';
        errorEl.style.display = 'block';
      }
      return;
    }

    if (p1 !== p2) {
      if (errorEl) {
        errorEl.textContent = 'Passwords do not match. Please re-enter.';
        errorEl.style.display = 'block';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Updating Password...';
    }

    try {
      const token = localStorage.getItem('nitro_jwt_token');
      const res = await fetch('/api/auth/force-reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ new_password: p1 })
      });

      const data = await res.json();
      if (res.ok) {
        modal.classList.remove('active');
        modal.style.display = 'none';
        if (currentUser) currentUser.force_password_reset = false;
        alert('✅ Password successfully updated! Welcome to Study Helper.');
      } else {
        if (errorEl) {
          errorEl.textContent = data.error || 'Failed to update password.';
          errorEl.style.display = 'block';
        }
      }
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = 'Network error updating password. Please try again.';
        errorEl.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Password & Continue';
      }
    }
  };
}

export function handleMandatoryProfileFix(reason = '') {
  const modal = document.getElementById('force-profile-fix-modal');
  const form = document.getElementById('force-profile-fix-form');
  const reasonEl = document.getElementById('force-profile-fix-reason');
  const nameInput = document.getElementById('force-profile-display-name');
  const bioInput = document.getElementById('force-profile-bio');
  const avatarInput = document.getElementById('force-profile-avatar-url');
  const errorEl = document.getElementById('force-profile-fix-error');
  const submitBtn = document.getElementById('force-profile-fix-submit-btn');

  if (!modal || !form) return;

  if (reasonEl && reason) {
    reasonEl.textContent = reason;
  }
  if (currentUser) {
    if (nameInput) nameInput.value = currentUser.display_name || currentUser.username || '';
    if (bioInput) bioInput.value = currentUser.bio || '';
    if (avatarInput) avatarInput.value = currentUser.avatar_url || '';
  }

  modal.classList.add('active');
  modal.style.display = 'flex';

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (errorEl) errorEl.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Saving & Validating Profile...';
    }

    try {
      const token = getCookie('nitro_jwt_token') || localStorage.getItem('nitro_jwt_token');
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          display_name: nameInput ? nameInput.value.trim() : '',
          bio: bioInput ? bioInput.value.trim() : '',
          avatar_url: avatarInput ? avatarInput.value.trim() : ''
        })
      });

      const data = await res.json();
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'Failed to update profile.');
      }

      currentUser = data.user;
      currentUser.require_profile_update = false;
      modal.classList.remove('active');
      modal.style.display = 'none';
      alert('✅ Profile updated successfully! Account access restored.');
      location.reload();
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Error updating profile.';
        errorEl.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '💾 Save & Unlock Account';
      }
    }
  };
}

export function toggleMandatoryGate(show) {
  const gate = document.getElementById('mandatory-login-gate');
  if (gate) {
    gate.style.display = show ? 'flex' : 'none';
  }
}

export const ROLE_PERK_LEVELS = {
  guest: 0,
  member: 1,
  student_plus: 2,
  early_member: 3,
  pro: 3,
  vip: 3,
  premium_vip: 4,
  elite_patron: 5,
  moderator: 6,
  admin: 7,
  owner: 8
};

export function updateNavAuthUI() {
  const adminBtn = document.getElementById('admin-nav-btn');
  const addGameNavBtn = document.getElementById('add-game-nav-btn');
  const vipCheckbox = document.getElementById('vip-checkbox-group');
  const navProfileName = document.getElementById('nav-profile-name');
  const activeProfileTag = document.getElementById('profile-active-tag');
  const previewActiveName = document.getElementById('preview-active-name');
  const navAvatarIcon = document.getElementById('nav-avatar-icon');
  const stripAvatar = document.getElementById('profile-strip-avatar');
  const proMusicToggleBtn = document.getElementById('pro-music-toggle-btn');
  const customThemeBtn = document.getElementById('open-custom-theme-btn');

  const customGreeting = localStorage.getItem('nitro_custom_greeting');
  const userLevel = currentUser ? (ROLE_PERK_LEVELS[currentUser.role] || 1) : 0;

  if (currentUser) {
    const displayName = currentUser.display_name || currentUser.username;
    const greet = customGreeting || `Hello, ${displayName}`;
    const roleTagLabel = currentUser.role === 'owner' ? '👑 OWNER' : (currentUser.role === 'admin' ? '🛡️ ADMIN' : currentUser.role.toUpperCase());
    if (navProfileName) navProfileName.textContent = greet;
    if (activeProfileTag) activeProfileTag.textContent = `${displayName} (${roleTagLabel})`;
    if (previewActiveName) previewActiveName.textContent = greet;

    renderAvatarElement(navAvatarIcon, currentUser.avatar_url, '📚');
    renderAvatarElement(stripAvatar, currentUser.avatar_url, '👤');

    // Level >= 3: PRO, VIP, Premium VIP, Elite, Mod, Admin, Owner
    if (proMusicToggleBtn) {
      proMusicToggleBtn.style.display = userLevel >= 3 ? 'inline-flex' : 'none';
    }

    // Level >= 2: Student Plus & above
    if (customThemeBtn) {
      customThemeBtn.style.display = userLevel >= 2 ? 'block' : 'none';
    }

    // Level >= 7: Admin, Owner
    if (userLevel >= 7) {
      if (adminBtn) adminBtn.style.display = 'flex';
      if (addGameNavBtn) addGameNavBtn.style.display = 'flex';
      if (vipCheckbox) vipCheckbox.style.display = 'block';
    } else {
      if (adminBtn) adminBtn.style.display = 'none';
      if (addGameNavBtn) addGameNavBtn.style.display = 'none';
      if (vipCheckbox) vipCheckbox.style.display = 'none';
    }
  } else {
    const displayName = customGreeting || 'Hello, Guest';
    if (navProfileName) navProfileName.textContent = displayName;
    if (activeProfileTag) activeProfileTag.textContent = 'Guest Player';
    if (previewActiveName) previewActiveName.textContent = displayName;
    if (navAvatarIcon) navAvatarIcon.innerHTML = '📚';
    if (stripAvatar) stripAvatar.innerHTML = '👤';
    if (proMusicToggleBtn) proMusicToggleBtn.style.display = 'none';
    if (customThemeBtn) customThemeBtn.style.display = 'none';
    if (adminBtn) adminBtn.style.display = 'none';
    if (addGameNavBtn) addGameNavBtn.style.display = 'none';
    if (vipCheckbox) vipCheckbox.style.display = 'none';
  }
}

export function renderAvatarElement(container, avatarValue, fallback = '👤') {
  if (!container) return;
  if (!avatarValue) {
    container.innerHTML = fallback;
    container.style.background = 'transparent';
    return;
  }

  const preset = AVATAR_PRESETS.find(p => p.id === avatarValue);
  if (preset) {
    container.innerHTML = preset.icon;
    container.style.background = preset.bg;
    container.style.borderRadius = '50%';
    container.style.display = 'inline-flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    return;
  }

  if (avatarValue.startsWith('http') || avatarValue.startsWith('data:image')) {
    container.innerHTML = `<img src="${avatarValue}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    container.style.background = 'transparent';
    return;
  }

  container.innerHTML = avatarValue;
}

// Profile Configuration Modal & Form
function setupProfileModal(onUserChange) {
  const modal = document.getElementById('profile-edit-modal');
  const openBtn = document.getElementById('open-profile-edit-btn');
  const stripTrigger = document.getElementById('profile-card-trigger');
  const closeBtn = document.getElementById('profile-modal-close');
  const form = document.getElementById('profile-edit-form');
  const presetsContainer = document.getElementById('profile-presets-grid');
  const customUrlInput = document.getElementById('profile-custom-pfp-url');
  const displayNameInput = document.getElementById('profile-display-name');
  const bioInput = document.getElementById('profile-bio');
  const previewAvatar = document.getElementById('profile-preview-avatar');
  const previewName = document.getElementById('profile-preview-name');
  const previewRole = document.getElementById('profile-preview-role');
  const previewBio = document.getElementById('profile-preview-bio');

  const proPerksSection = document.getElementById('profile-pro-perks-section');
  const proChatGlowSelect = document.getElementById('profile-pro-chat-glow');
  const proCustomFlairInput = document.getElementById('profile-pro-custom-flair');

  let selectedAvatar = '';
  let selectedBanner = '';

  const bannerUrlInput = document.getElementById('profile-banner-url');
  const bannerFileInput = document.getElementById('profile-banner-file-input');
  const uploadBannerBtn = document.getElementById('profile-upload-banner-btn');
  const bannerFileNameLabel = document.getElementById('profile-banner-file-name-label');
  const previewBanner = document.getElementById('profile-preview-banner');

  function updateBannerPreview(el, val) {
    if (!el) return;
    if (!val) {
      el.style.background = 'linear-gradient(135deg, #1e293b, #0f172a)';
    } else if (val.startsWith('#') || val.startsWith('rgb') || val.startsWith('hsl') || val.startsWith('linear-gradient')) {
      el.style.background = val;
    } else {
      el.style.background = `url(${val})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    }
  }

  if (bannerUrlInput) {
    bannerUrlInput.addEventListener('input', () => {
      selectedBanner = bannerUrlInput.value.trim();
      updateBannerPreview(previewBanner, selectedBanner);
    });
  }

  if (uploadBannerBtn && bannerFileInput) {
    uploadBannerBtn.addEventListener('click', () => bannerFileInput.click());
    bannerFileInput.addEventListener('change', () => {
      if (bannerFileInput.files && bannerFileInput.files[0]) {
        const file = bannerFileInput.files[0];
        if (bannerFileNameLabel) bannerFileNameLabel.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (ev) => {
          selectedBanner = ev.target.result;
          if (bannerUrlInput) bannerUrlInput.value = '';
          updateBannerPreview(previewBanner, selectedBanner);
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (presetsContainer) {
    presetsContainer.innerHTML = AVATAR_PRESETS.map(p => `
      <button type="button" class="avatar-preset-btn" data-id="${p.id}" style="background: ${p.bg}; border: none; border-radius: 50%; width: 44px; height: 44px; font-size: 1.3rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s ease;">
        ${p.icon}
      </button>
    `).join('');

    presetsContainer.querySelectorAll('.avatar-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedAvatar = btn.dataset.id;
        if (customUrlInput) customUrlInput.value = '';
        renderAvatarElement(previewAvatar, selectedAvatar);
      });
    });
  }

  if (customUrlInput) {
    customUrlInput.addEventListener('input', () => {
      selectedAvatar = customUrlInput.value.trim();
      renderAvatarElement(previewAvatar, selectedAvatar);
    });
  }

  if (displayNameInput) {
    displayNameInput.addEventListener('input', () => {
      if (previewName) previewName.textContent = displayNameInput.value.trim() || currentUser?.username || 'Student';
    });
  }

  if (bioInput) {
    bioInput.addEventListener('input', () => {
      if (previewBio) previewBio.textContent = bioInput.value.trim() || 'No status bio set yet.';
    });
  }

  const fileInput = document.getElementById('profile-avatar-file-input');
  const uploadBtn = document.getElementById('profile-upload-file-btn');
  const fileNameLabel = document.getElementById('profile-file-name-label');

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        if (fileNameLabel) fileNameLabel.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (ev) => {
          selectedAvatar = ev.target.result;
          if (customUrlInput) customUrlInput.value = '';
          renderAvatarElement(previewAvatar, selectedAvatar);
        };
        reader.readAsDataURL(file);
      }
    });
  }

  function populateProfileForm(inventory = []) {
    if (!currentUser) return;
    selectedAvatar = currentUser.avatar_url || '';
    selectedBanner = currentUser.banner_url || '';
    if (displayNameInput) displayNameInput.value = currentUser.display_name || currentUser.username;
    if (bioInput) bioInput.value = currentUser.bio || '';
    if (customUrlInput) customUrlInput.value = (selectedAvatar.startsWith('http') && !selectedAvatar.startsWith('data:')) ? selectedAvatar : '';
    if (bannerUrlInput) bannerUrlInput.value = (selectedBanner.startsWith('http') || selectedBanner.startsWith('#') || selectedBanner.startsWith('linear-gradient')) ? selectedBanner : '';
    if (bannerFileNameLabel) bannerFileNameLabel.textContent = (selectedBanner.startsWith('data:')) ? 'Uploaded Custom Image' : 'No file chosen';
    updateBannerPreview(previewBanner, selectedBanner);
    if (previewName) previewName.textContent = currentUser.display_name || currentUser.username;
    
    if (previewRole) {
      previewRole.className = `chat-badge ${currentUser.role}`;
      if (currentUser.role === 'owner') {
        previewRole.innerHTML = '👑 OWNERSHIP';
      } else if (currentUser.role === 'admin') {
        previewRole.innerHTML = '🛡️ ADMIN';
      } else if (currentUser.role === 'moderator') {
        previewRole.innerHTML = '⚔️ MOD';
      } else if (currentUser.role === 'elite_patron') {
        previewRole.innerHTML = '💎 ELITE';
      } else if (currentUser.role === 'premium_vip') {
        previewRole.innerHTML = '🌟 VIP';
      } else if (currentUser.role === 'pro') {
        previewRole.innerHTML = '⚡ PRO';
      } else if (currentUser.role === 'early_member') {
        previewRole.innerHTML = '🌱 EARLY MEMBER';
      } else if (currentUser.role === 'student_plus') {
        previewRole.innerHTML = '🎓 PLUS';
      } else {
        previewRole.innerHTML = '👤 MEMBER';
      }
    }

    if (previewBio) previewBio.textContent = currentUser.bio || 'No status bio set yet.';
    renderAvatarElement(previewAvatar, selectedAvatar);

    const userLevel = ROLE_PERK_LEVELS[currentUser.role] || 1;
    const isPro = userLevel >= 3;
    const ownedGlows = inventory.filter(i => i.category === 'chat_glow').map(i => i.perk_value);
    const ownedFlairs = inventory.filter(i => i.category === 'custom_flair').map(i => i.perk_value);
    const hasOwnedPerks = ownedGlows.length > 0 || ownedFlairs.length > 0;

    if (proPerksSection) {
      proPerksSection.style.display = (isPro || hasOwnedPerks) ? 'block' : 'none';
      
      if (proChatGlowSelect) {
        proChatGlowSelect.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '⚪ No Glow Effect';
        proChatGlowSelect.appendChild(noneOpt);

        const GLOW_DEFINITIONS = [
          { value: 'gold', text: '⚡ Golden Aura' },
          { value: 'rainbow', text: '🌈 Rainbow Chroma' },
          { value: 'cyan', text: '💎 Cyberpunk Cyan' },
          { value: 'fire', text: '🔥 Inferno Flame' },
          { value: 'emerald', text: '🍃 Matrix Emerald' },
          { value: 'purple', text: '🔮 Mystic Purple' }
        ];

        GLOW_DEFINITIONS.forEach(glow => {
          if (isPro || ownedGlows.includes(glow.value)) {
            const opt = document.createElement('option');
            opt.value = glow.value;
            opt.textContent = glow.text;
            proChatGlowSelect.appendChild(opt);
          }
        });
        proChatGlowSelect.value = currentUser.pro_chat_glow || '';
      }

      if (proCustomFlairInput) {
        const flairParent = proCustomFlairInput.parentElement;
        let flairSelect = document.getElementById('profile-pro-custom-flair-select');
        
        if (userLevel >= 5) {
          proCustomFlairInput.style.display = 'block';
          proCustomFlairInput.placeholder = 'e.g. ⚡ VIP ELITE';
          proCustomFlairInput.disabled = false;
          proCustomFlairInput.value = currentUser.pro_custom_flair || '';
          
          if (ownedFlairs.length > 0) {
            if (!flairSelect) {
              flairSelect = document.createElement('select');
              flairSelect.id = 'profile-pro-custom-flair-select';
              flairSelect.className = 'custom-select-dropdown';
              flairSelect.style.width = '100%';
              flairSelect.style.padding = '8px 12px';
              flairSelect.style.background = '#0e121e';
              flairSelect.style.color = '#fff';
              flairSelect.style.border = '1px solid var(--card-border)';
              flairSelect.style.borderRadius = '8px';
              flairSelect.style.marginTop = '6px';
              flairParent.appendChild(flairSelect);
            }
            flairSelect.style.display = 'block';
            flairSelect.innerHTML = '';
            
            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.textContent = '⚪ Or select purchased flair...';
            flairSelect.appendChild(noneOpt);

            ownedFlairs.forEach(flair => {
              const opt = document.createElement('option');
              opt.value = flair;
              opt.textContent = flair;
              flairSelect.appendChild(opt);
            });

            flairSelect.addEventListener('change', () => {
              if (flairSelect.value) {
                proCustomFlairInput.value = flairSelect.value;
              }
            });
          } else {
            if (flairSelect) flairSelect.style.display = 'none';
          }
        } else {
          if (ownedFlairs.length > 0) {
            proCustomFlairInput.style.display = 'none';
            if (!flairSelect) {
              flairSelect = document.createElement('select');
              flairSelect.id = 'profile-pro-custom-flair-select';
              flairSelect.className = 'custom-select-dropdown';
              flairSelect.style.width = '100%';
              flairSelect.style.padding = '8px 12px';
              flairSelect.style.background = '#0e121e';
              flairSelect.style.color = '#fff';
              flairSelect.style.border = '1px solid var(--card-border)';
              flairSelect.style.borderRadius = '8px';
              flairSelect.style.marginTop = '6px';
              flairParent.appendChild(flairSelect);
            }
            flairSelect.style.display = 'block';
            flairSelect.innerHTML = '';
            
            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.textContent = '⚪ No Title Flair';
            flairSelect.appendChild(noneOpt);

            ownedFlairs.forEach(flair => {
              const opt = document.createElement('option');
              opt.value = flair;
              opt.textContent = flair;
              flairSelect.appendChild(opt);
            });
            flairSelect.value = currentUser.pro_custom_flair || '';
          } else {
            proCustomFlairInput.style.display = 'block';
            proCustomFlairInput.placeholder = 'Locked: Elite Patron / Owner required';
            proCustomFlairInput.disabled = true;
            proCustomFlairInput.value = '';
            if (flairSelect) flairSelect.style.display = 'none';
          }
        }
      }
    }
  }

  const openHandler = async () => {
    if (!currentUser) return alert('Please log in to edit your profile.');
    
    let inventory = [];
    try {
      const token = localStorage.getItem('nitro_jwt_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/shop/inventory', { headers });
      if (res.ok) {
        const data = await res.json();
        inventory = data.inventory || [];
      }
    } catch (e) {
      console.warn('Error fetching inventory for profile perks:', e);
    }

    populateProfileForm(inventory);
    if (modal) modal.classList.add('active');
  };

  if (openBtn) openBtn.addEventListener('click', openHandler);
  if (stripTrigger) stripTrigger.addEventListener('click', openHandler);

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = localStorage.getItem('nitro_jwt_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const display_name = displayNameInput ? displayNameInput.value.trim() : '';
      const bio = bioInput ? bioInput.value.trim() : '';
      const avatar_url = selectedAvatar;
      const banner_url = selectedBanner;
      const pro_chat_glow = proChatGlowSelect ? proChatGlowSelect.value : '';
      const pro_custom_flair = (proCustomFlairInput && proCustomFlairInput.style.display !== 'none')
        ? proCustomFlairInput.value.trim()
        : (document.getElementById('profile-pro-custom-flair-select')?.value || '');
      const current_password = document.getElementById('profile-curr-pass')?.value || '';
      const new_password = document.getElementById('profile-new-pass')?.value || '';

      try {
        const res = await fetch('/api/auth/profile', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            avatar_url,
            banner_url,
            display_name,
            bio,
            pro_chat_glow,
            pro_custom_flair,
            current_password,
            new_password
          })
        });
        const data = await res.json();

        if (res.ok && data.user) {
          currentUser = { ...currentUser, ...data.user };
          alert('✨ Profile and PRO perks successfully updated!');
          updateNavAuthUI();
          if (modal) modal.classList.remove('active');
          if (onUserChange) onUserChange(currentUser);
        } else {
          alert(data.error || 'Failed to update profile.');
        }
      } catch (err) {
        alert('Error updating profile.');
      }
    });
  }
}

function setupMandatoryLoginGate(onUserChange) {
  const form = document.getElementById('gate-auth-form');
  const toggleLink = document.getElementById('gate-toggle-link');
  const formTitle = document.getElementById('gate-form-title');
  const submitBtn = document.getElementById('gate-submit-btn');
  const toggleText = document.getElementById('gate-toggle-text');
  const errorMsg = document.getElementById('gate-error-msg');
  const rememberCheckbox = document.getElementById('gate-remember-me');
  const usernameInput = document.getElementById('gate-username');

  const savedUsername = localStorage.getItem('nitro_remembered_username');
  if (savedUsername && usernameInput) {
    usernameInput.value = savedUsername;
    if (rememberCheckbox) rememberCheckbox.checked = true;
  }

  const guestBtn = document.getElementById('gate-guest-continue-btn');
  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      sessionStorage.setItem('nitro_guest_dismissed', 'true');
      toggleMandatoryGate(false);
    });
  }

  let gateIsRegister = false;

  if (toggleLink) {
    toggleLink.addEventListener('click', async (e) => {
      e.preventDefault();
      // Check live if signups are still allowed before switching to register mode
      if (!gateIsRegister) {
        try {
          const res = await fetch('/api/admin/signups-status');
          const data = await res.json();
          if (!data.signups_enabled) {
            applySignupsGateUI(false);
            return;
          }
        } catch (e) {}
      }
      gateIsRegister = !gateIsRegister;
      if (gateIsRegister) {
        formTitle.textContent = 'Create Academic Account';
        submitBtn.textContent = 'Register & Enter Workspace';
        toggleText.textContent = 'Already registered?';
        toggleLink.textContent = 'Sign In';
      } else {
        formTitle.textContent = 'Sign In to Study Helper';
        submitBtn.textContent = 'Sign In & Enter';
        toggleText.textContent = "New student or educator?";
        toggleLink.textContent = 'Create Account';
      }
      if (errorMsg) errorMsg.style.display = 'none';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('gate-username').value.trim();
      const password = document.getElementById('gate-password').value;
      const isRemember = rememberCheckbox ? rememberCheckbox.checked : true;
      const endpoint = gateIsRegister ? '/api/auth/register' : '/api/auth/login';

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (!res.ok) {
          if (data.is_banned) {
            toggleMandatoryGate(false);
            showBannedScreen(data.reason || 'Your account has been suspended by an administrator.', data.username || username);
            return;
          }
          // Show the closed notice for 403 registration-disabled errors
          if (res.status === 403 && gateIsRegister) {
            applySignupsGateUI(false);
            // Reset back to login mode
            gateIsRegister = false;
            if (formTitle) formTitle.textContent = 'Sign in to your account';
            if (submitBtn) submitBtn.textContent = 'Sign In';
            if (toggleText) toggleText.textContent = 'Need an account?';
            if (toggleLink) toggleLink.textContent = 'Register';
            return;
          }
          errorMsg.textContent = data.error || 'Authentication error';
          errorMsg.style.display = 'block';
          return;
        }

        currentUser = data.user;

        if (isRemember) {
          localStorage.setItem('nitro_remembered_username', username);
          if (data.token) localStorage.setItem('nitro_jwt_token', data.token);
        } else {
          localStorage.removeItem('nitro_remembered_username');
          if (data.token) localStorage.setItem('nitro_jwt_token', data.token);
        }

        updateNavAuthUI();
        toggleMandatoryGate(false);
        if (data.must_reset_password) {
          setTimeout(handleMandatoryPasswordReset, 500);
        }
        // Check for raffle win notifications
        setTimeout(() => checkAndShowRaffleWinPopup(data.token), 800);
        if (onUserChange) onUserChange(currentUser);
      } catch (err) {
        errorMsg.textContent = 'Network or server connection error.';
        errorMsg.style.display = 'block';
      }
    });
  }
}

function setupAuthModal(onUserChange) {
  const modal = document.getElementById('auth-modal');
  const openBtn = document.getElementById('auth-modal-btn');
  const closeBtn = document.getElementById('auth-modal-close');
  const form = document.getElementById('auth-form');
  const toggleLink = document.getElementById('auth-toggle-link');
  const formTitle = document.getElementById('auth-form-title');
  const submitBtn = document.getElementById('auth-submit-btn');
  const toggleText = document.getElementById('auth-toggle-text');
  const errorMsg = document.getElementById('auth-error-msg');
  const loggedInView = document.getElementById('auth-logged-in-view');
  const formView = document.getElementById('auth-form-view');
  const logoutBtn = document.getElementById('auth-logout-btn');
  const rememberModalCheckbox = document.getElementById('modal-remember-me');
  const modalUsernameInput = document.getElementById('auth-username');
  const openProfileFromAuthBtn = document.getElementById('auth-edit-profile-btn');

  if (openProfileFromAuthBtn) {
    openProfileFromAuthBtn.addEventListener('click', () => {
      modal.classList.remove('active');
      document.getElementById('open-profile-edit-btn')?.click();
    });
  }

  const savedUsername = localStorage.getItem('nitro_remembered_username');
  if (savedUsername && modalUsernameInput) {
    modalUsernameInput.value = savedUsername;
    if (rememberModalCheckbox) rememberModalCheckbox.checked = true;
  }

  function showModal() {
    if (currentUser) {
      loggedInView.style.display = 'block';
      formView.style.display = 'none';
      document.getElementById('auth-current-username').textContent = currentUser.display_name || currentUser.username;
      const roleBadge = document.getElementById('auth-current-role');
      const roleLabels = {
        owner: '👑 OWNER', admin: '🛡️ ADMIN', moderator: '⚔️ MOD',
        elite_patron: '💎 ELITE', premium_vip: '🌟 VIP+', pro: '⚡ PRO',
        vip: '⭐ VIP', early_member: '🌱 EARLY MEMBER', student_plus: '🎓 PLUS'
      };
      roleBadge.textContent = roleLabels[currentUser.role] || currentUser.role.toUpperCase();
      roleBadge.className = `chat-badge ${currentUser.role}`;
      renderAvatarElement(document.getElementById('auth-modal-avatar-preview'), currentUser.avatar_url);
    } else {
      loggedInView.style.display = 'none';
      formView.style.display = 'block';
    }
    modal.classList.add('active');
  }

  function hideModal() {
    modal.classList.remove('active');
    if (errorMsg) errorMsg.style.display = 'none';
  }

  if (openBtn) openBtn.addEventListener('click', showModal);
  if (closeBtn) closeBtn.addEventListener('click', hideModal);

  if (toggleLink) {
    toggleLink.addEventListener('click', (e) => {
      e.preventDefault();
      isRegisterMode = !isRegisterMode;
      if (isRegisterMode) {
        formTitle.textContent = 'Create Academic Account';
        submitBtn.textContent = 'Register';
        toggleText.textContent = 'Already have an account?';
        toggleLink.textContent = 'Log In';
      } else {
        formTitle.textContent = 'Sign In to Workspace';
        submitBtn.textContent = 'Log In';
        toggleText.textContent = "Don't have an account?";
        toggleLink.textContent = 'Register';
      }
      if (errorMsg) errorMsg.style.display = 'none';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('auth-username').value.trim();
      const password = document.getElementById('auth-password').value;
      const isRemember = rememberModalCheckbox ? rememberModalCheckbox.checked : true;
      const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (!res.ok) {
          if (data.is_banned) {
            hideModal();
            showBannedScreen(data.reason || 'Your account has been suspended by an administrator.', data.username || username);
            return;
          }
          errorMsg.textContent = data.error || 'Authentication error';
          errorMsg.style.display = 'block';
          return;
        }

        currentUser = data.user;

        if (isRemember) {
          localStorage.setItem('nitro_remembered_username', username);
          if (data.token) localStorage.setItem('nitro_jwt_token', data.token);
        } else {
          localStorage.removeItem('nitro_remembered_username');
          if (data.token) localStorage.setItem('nitro_jwt_token', data.token);
        }

        updateNavAuthUI();
        toggleMandatoryGate(false);
        hideModal();
        if (data.must_reset_password) {
          setTimeout(handleMandatoryPasswordReset, 500);
        }
        // Check for raffle win notifications
        setTimeout(() => checkAndShowRaffleWinPopup(data.token), 800);
        if (onUserChange) onUserChange(currentUser);
      } catch (err) {
        errorMsg.textContent = 'Network or server error.';
        errorMsg.style.display = 'block';
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      triggerClientLogout();
    });
  }
}

export function triggerClientLogout() {
  currentUser = null;
  localStorage.removeItem('nitro_jwt_token');
  updateNavAuthUI();
  
  const authModal = document.getElementById('auth-modal');
  if (authModal) authModal.classList.remove('active');
  const errorMsg = document.getElementById('auth-error-msg');
  if (errorMsg) errorMsg.style.display = 'none';

  toggleMandatoryGate(true);
  if (onUserChangeCallback) onUserChangeCallback(currentUser);
}
window.triggerClientLogout = triggerClientLogout;

// ─── Raffle Win Popup ────────────────────────────────────────────────────────

async function checkAndShowRaffleWinPopup(token) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch('/api/auth/pending-notifications', { headers });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.raffle_wins || !data.raffle_wins.length) return;
    // Show a popup for each unseen win (usually just one, but handle multiple)
    data.raffle_wins.forEach((win, idx) => {
      setTimeout(() => showRaffleWinPopup(win), idx * 600);
    });
  } catch (e) { /* silent */ }
}

function showRaffleWinPopup(win) {
  // Remove any existing popup
  const existing = document.getElementById('raffle-win-popup');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'raffle-win-popup';
  overlay.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.75);z-index:99999;
    display:flex;align-items:center;justify-content:center;
    animation:fadeIn .3s ease;
  `;

  const date = win.created_at ? new Date(win.created_at).toLocaleDateString() : '';
  const card = document.createElement('div');
  card.style.cssText = `
    background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);
    border:2px solid #f59e0b;
    border-radius:20px;max-width:440px;width:90%;padding:40px 32px 32px;
    text-align:center;position:relative;
    box-shadow:0 0 60px rgba(245,158,11,0.4),0 20px 60px rgba(0,0,0,0.8);
    animation:popIn .4s cubic-bezier(.175,.885,.32,1.275);
  `;

  card.innerHTML = `
    <style>
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes popIn{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes confettiFall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(120px) rotate(720deg);opacity:0}}
      .raffle-confetti{position:absolute;width:8px;height:8px;border-radius:2px;animation:confettiFall 1.2s ease-in forwards;}
    </style>
    <div style="font-size:64px;margin-bottom:12px;animation:spin 1s ease-out;">🎉</div>
    <div style="font-size:13px;font-weight:700;letter-spacing:3px;color:#f59e0b;text-transform:uppercase;margin-bottom:8px;">🏆 You Won!</div>
    <h2 style="color:#fff;font-size:22px;font-weight:800;margin:0 0 12px;line-height:1.3;">${escapeHtml(win.raffle_title)}</h2>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;">Congratulations! Your ticket was drawn as the winner of this raffle. Contact an admin to claim your prize!</p>
    ${date ? `<div style="color:#64748b;font-size:12px;margin-bottom:20px;">Drawn on ${date}</div>` : ''}
    <button id="raffle-win-close" style="
      background:linear-gradient(135deg,#f59e0b,#d97706);
      color:#000;border:none;border-radius:10px;
      padding:12px 32px;font-size:15px;font-weight:700;
      cursor:pointer;width:100%;letter-spacing:.5px;
      transition:transform .15s,box-shadow .15s;
    " onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
      🎊 Awesome, Thanks!
    </button>
  `;

  // Add confetti
  const colors = ['#f59e0b','#ef4444','#8b5cf6','#10b981','#3b82f6','#ec4899'];
  for (let i = 0; i < 14; i++) {
    const dot = document.createElement('div');
    dot.className = 'raffle-confetti';
    dot.style.cssText = `
      background:${colors[i % colors.length]};
      left:${Math.random() * 100}%;
      top:${Math.random() * 40}%;
      animation-delay:${Math.random() * 0.5}s;
      animation-duration:${1 + Math.random()}s;
    `;
    card.appendChild(dot);
  }

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const closeBtn = card.querySelector('#raffle-win-close');
  closeBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export { checkAndShowRaffleWinPopup };
