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

export function initAuth(onUserChange) {
  setupConsoleTokenAuth(onUserChange);
  checkSession(onUserChange);
  setupAuthModal(onUserChange);
  setupMandatoryLoginGate(onUserChange);
  setupProfileModal(onUserChange);
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

export function showBannedScreen(reason = 'Violation of platform guidelines') {
  deleteCookie('nitro_jwt_token');
  localStorage.removeItem('nitro_jwt_token');
  localStorage.removeItem('nitro_remembered_username');
  currentUser = null;

  const overlay = document.getElementById('account-banned-overlay');
  const reasonEl = document.getElementById('account-banned-reason-text');
  if (overlay) {
    if (reasonEl) reasonEl.textContent = reason;
    overlay.style.display = 'flex';
  }
}

export async function checkSession(onUserChange) {
  try {
    const token = getCookie('nitro_jwt_token') || localStorage.getItem('nitro_jwt_token');
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    const res = await fetch('/api/auth/me', { headers });
    const data = await res.json();

    if (data.is_banned && res.status === 403) {
      showBannedScreen(data.reason || 'Your account has been suspended by an administrator.');
      return;
    }

    if (data.loggedIn && data.user) {
      currentUser = data.user;
      toggleMandatoryGate(false);
      if (token) setCookie('nitro_jwt_token', token, 365);
      if (data.must_reset_password) {
        setTimeout(handleMandatoryPasswordReset, 600);
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

  function populateProfileForm() {
    if (!currentUser) return;
    selectedAvatar = currentUser.avatar_url || '';
    if (displayNameInput) displayNameInput.value = currentUser.display_name || currentUser.username;
    if (bioInput) bioInput.value = currentUser.bio || '';
    if (customUrlInput) customUrlInput.value = (selectedAvatar.startsWith('http') && !selectedAvatar.startsWith('data:')) ? selectedAvatar : '';
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
      } else if (currentUser.role === 'student_plus') {
        previewRole.innerHTML = '🎓 PLUS';
      } else {
        previewRole.innerHTML = '👤 MEMBER';
      }
    }

    if (previewBio) previewBio.textContent = currentUser.bio || 'No status bio set yet.';
    renderAvatarElement(previewAvatar, selectedAvatar);

    const userLevel = ROLE_PERK_LEVELS[currentUser.role] || 1;
    if (proPerksSection) {
      // Level >= 3: PRO, VIP, Premium VIP, Elite, Mod, Admin, Owner
      proPerksSection.style.display = userLevel >= 3 ? 'block' : 'none';
      if (proChatGlowSelect) proChatGlowSelect.value = currentUser.pro_chat_glow || 'gold';
      if (proCustomFlairInput) {
        proCustomFlairInput.value = currentUser.pro_custom_flair || '';
        // Custom flair only unlocked for Elite Patron (5) and Owner/Admin (7-8)
        if (userLevel < 5) {
          proCustomFlairInput.placeholder = 'Locked: Elite Patron / Owner required';
          proCustomFlairInput.disabled = true;
        } else {
          proCustomFlairInput.placeholder = 'e.g. ⚡ VIP ELITE';
          proCustomFlairInput.disabled = false;
        }
      }
    }
  }

  const openHandler = () => {
    if (!currentUser) return alert('Please log in to edit your profile.');
    populateProfileForm();
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
      const pro_chat_glow = proChatGlowSelect ? proChatGlowSelect.value : 'gold';
      const pro_custom_flair = proCustomFlairInput ? proCustomFlairInput.value.trim() : '';
      const current_password = document.getElementById('profile-curr-pass')?.value || '';
      const new_password = document.getElementById('profile-new-pass')?.value || '';

      try {
        const res = await fetch('/api/auth/profile', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            avatar_url,
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

  let gateIsRegister = false;

  if (toggleLink) {
    toggleLink.addEventListener('click', (e) => {
      e.preventDefault();
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
      roleBadge.textContent = currentUser.role.toUpperCase();
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
      currentUser = null;
      localStorage.removeItem('nitro_jwt_token');
      updateNavAuthUI();
      hideModal();
      toggleMandatoryGate(true);
      if (onUserChange) onUserChange(currentUser);
    });
  }
}
