import { getSharedSocket } from './socket.js';
import { getCurrentUser } from './auth.js';

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Web Audio API Synthesizers for Instant Sound Effects
export const SOUND_EFFECTS = {
  vineboom: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.5);
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  },
  bruh: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.4);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  },
  victorychime: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.08;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  },
  airhorn: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [466.16, 466.16, 466.16, 622.25].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.09;
      const dur = idx === 3 ? 0.4 : 0.07;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.35, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur);
    });
  },
  coin: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.setValueAtTime(1318.51, now + 0.08);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  },
  laser: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  },
  gameover: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.6);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  },
  beep: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  },
  drumroll: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 12; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.04;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120 + Math.random() * 40, start);
      gain.gain.setValueAtTime(0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.03);
    }
  }
};

function playAudioUrl(url) {
  if (!url) return;
  try {
    const audio = new Audio(url);
    audio.play().catch(e => console.warn('Audio playback error:', e));
  } catch (e) {
    console.error('Audio url error:', e);
  }
}

window.reloadSoundboardProxy = function() {
  const iframe = document.getElementById('soundboard-proxy-iframe');
  if (iframe) iframe.src = '/api/proxy?url=' + encodeURIComponent('https://www.myinstants.com/en/categories/sound%20effects/us/');
};

window.fullscreenSoundboardProxy = function() {
  const iframe = document.getElementById('soundboard-proxy-iframe');
  if (iframe) {
    if (iframe.requestFullscreen) iframe.requestFullscreen();
    else if (iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
  }
};

export function initSoundboard() {
  const socket = getSharedSocket();
  const containerCustom = document.getElementById('soundboard-grid-custom');
  if (!containerGlobal) return;

  const socket = getSharedSocket();
  if (socket) {
    socket.on('sound_effect_broadcast', ({ soundKey, audioUrl }) => {
      if (soundKey && SOUND_EFFECTS[soundKey]) {
        SOUND_EFFECTS[soundKey]();
      } else if (audioUrl) {
        playAudioUrl(audioUrl);
      }
    });
  }

  setupUploadModal();
  loadSoundboards();
}

async function loadSoundboards() {
  const containerGlobal = document.getElementById('soundboard-grid');
  const containerCustom = document.getElementById('soundboard-grid-custom');

  const BUILTIN_ITEMS = [
    { key: 'vineboom', label: '💥 Vine Boom', icon: '💥', color: '#ef4444' },
    { key: 'bruh', label: '🗿 Bruh Sound', icon: '🗿', color: '#a855f7' },
    { key: 'victorychime', label: '🔔 Victory Chime', icon: '🔔', color: '#10b981' },
    { key: 'airhorn', label: '📢 Airhorn', icon: '📢', color: '#f59e0b' },
    { key: 'coin', label: '🪙 Retro Coin', icon: '🪙', color: '#fbbf24' },
    { key: 'laser', label: '⚡ Laser Blast', icon: '⚡', color: '#38bdf8' },
    { key: 'gameover', label: '💀 Game Over', icon: '💀', color: '#ef4444' },
    { key: 'drumroll', label: '🥁 Drumroll', icon: '🥁', color: '#a855f7' },
    { key: 'beep', label: '🔔 Alert Tone', icon: '🔔', color: '#ec4899' }
  ];

  if (containerGlobal) {
    containerGlobal.innerHTML = '';
    BUILTIN_ITEMS.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'soundboard-card-btn';
      btn.style.borderColor = item.color;
      btn.innerHTML = `
        <div style="font-size: 2.2rem; margin-bottom: 6px;">${item.icon}</div>
        <div style="font-weight: 700; font-size: 0.95rem; color: #fff;">${item.label}</div>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">Built-in Web Audio</div>
      `;

      btn.addEventListener('click', () => {
        if (SOUND_EFFECTS[item.key]) {
          SOUND_EFFECTS[item.key]();
          btn.classList.add('sound-playing');
          setTimeout(() => btn.classList.remove('sound-playing'), 300);

          const socket = getSharedSocket();
          if (socket) {
            const user = getCurrentUser();
            socket.emit('play_sound_effect', { soundKey: item.key, username: user ? user.username : 'Guest' });
          }
        }
      });

      containerGlobal.appendChild(btn);
    });
  }

  // Fetch Custom & Admin Uploaded Sounds from API
  try {
    const token = localStorage.getItem('nitro_jwt_token') || sessionStorage.getItem('nitro_jwt_token');
    const res = await fetch('/api/soundboard', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const data = await res.json();

    if (data.success && data.sounds) {
      const user = getCurrentUser();
      const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');

      const customSounds = data.sounds.filter(s => !s.is_global);
      const globalCustomSounds = data.sounds.filter(s => s.is_global);

      // Render admin global sounds into global grid
      globalCustomSounds.forEach(sound => {
        const btn = createCustomSoundCard(sound, isOwnerOrAdmin, user);
        if (containerGlobal) containerGlobal.appendChild(btn);
      });

      // Render user custom sounds into custom grid
      if (containerCustom) {
        containerCustom.innerHTML = '';
        if (customSounds.length === 0) {
          containerCustom.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; font-style: italic;">No custom uploaded sounds yet. Click "Upload Custom Sound" above to add your own!</div>';
        } else {
          customSounds.forEach(sound => {
            const btn = createCustomSoundCard(sound, isOwnerOrAdmin, user);
            containerCustom.appendChild(btn);
          });
        }
      }
    }
  } catch (e) {
    console.error('Failed to load soundboards:', e);
  }
}

function createCustomSoundCard(sound, isOwnerOrAdmin, currentUser) {
  const card = document.createElement('div');
  card.className = 'soundboard-card-btn';
  card.style.borderColor = sound.is_global ? '#fbbf24' : '#38bdf8';
  card.style.position = 'relative';

  const canDelete = isOwnerOrAdmin || (currentUser && currentUser.username.toLowerCase() === (sound.uploaded_by || '').toLowerCase());
  const deleteBtn = canDelete ? `<button class="sound-delete-btn" style="position: absolute; top: 6px; right: 6px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #ef4444; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 0.75rem; display: flex; align-items: center; justify-content: center;" title="Delete Sound">✕</button>` : '';

  card.innerHTML = `
    ${deleteBtn}
    <div style="font-size: 2.2rem; margin-bottom: 6px;">${sound.icon || '🎵'}</div>
    <div style="font-weight: 700; font-size: 0.95rem; color: #fff;">${escapeHtml(sound.title)}</div>
    <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">Uploaded by @${escapeHtml(sound.uploaded_by || 'User')}</div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.classList.contains('sound-delete-btn')) {
      e.stopPropagation();
      deleteSound(sound.id);
      return;
    }

    playAudioUrl(sound.audio_url);
    card.classList.add('sound-playing');
    setTimeout(() => card.classList.remove('sound-playing'), 300);

    const socket = getSharedSocket();
    if (socket) {
      socket.emit('play_sound_effect', { audioUrl: sound.audio_url, username: currentUser ? currentUser.username : 'Guest' });
    }
  });

  return card;
}

async function deleteSound(id) {
  if (!confirm('Are you sure you want to delete this soundboard sound?')) return;
  try {
    const token = localStorage.getItem('nitro_jwt_token') || sessionStorage.getItem('nitro_jwt_token');
    const res = await fetch(`/api/soundboard/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      loadSoundboards();
    } else {
      alert(data.error || 'Failed to delete sound.');
    }
  } catch (e) {
    alert('Error deleting sound: ' + e.message);
  }
}

window.openSoundUploadModal = function() {
  const modal = document.getElementById('soundboard-upload-modal');
  if (!modal) return;
  const user = getCurrentUser();
  const globalCheckDiv = document.getElementById('sound-admin-global-check');
  const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');
  if (globalCheckDiv) globalCheckDiv.style.display = isOwnerOrAdmin ? 'block' : 'none';
  modal.classList.add('active');
  modal.style.display = 'flex';
};

window.closeSoundUploadModal = function() {
  const modal = document.getElementById('soundboard-upload-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
};

function setupUploadModal() {
  const modal = document.getElementById('soundboard-upload-modal');
  const openBtn = document.getElementById('open-sound-upload-btn');
  const closeBtn = document.getElementById('soundboard-upload-modal-close');
  const form = document.getElementById('soundboard-upload-form');

  const fileInput = document.getElementById('sound-upload-file-input');
  const chooseFileBtn = document.getElementById('sound-choose-file-btn');
  const fileNameLabel = document.getElementById('sound-file-name-label');

  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.openSoundUploadModal();
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) window.closeSoundUploadModal();
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.closeSoundUploadModal();
    });
  }

  if (chooseFileBtn && fileInput) {
    chooseFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        fileNameLabel.textContent = fileInput.files[0].name;
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = localStorage.getItem('nitro_jwt_token') || sessionStorage.getItem('nitro_jwt_token');

      const submitBtn = document.getElementById('sound-upload-submit-btn');
      const originalBtnText = submitBtn ? submitBtn.textContent : 'Upload Soundboard Sound';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Processing Audio Upload...';
      }

      try {
        const title = document.getElementById('sound-upload-title').value.trim();
        const icon = document.getElementById('sound-upload-icon').value.trim() || '🎵';
        const urlInput = document.getElementById('sound-upload-url-input').value.trim();
        const isGlobal = document.getElementById('sound-upload-is-global')?.checked || false;

        let audioUrl = urlInput;

        if (fileInput && fileInput.files.length > 0) {
          const file = fileInput.files[0];
          if (file.size > 15 * 1024 * 1024) {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalBtnText; }
            return alert('Audio file must be smaller than 15MB.');
          }
          audioUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (evt) => resolve(evt.target.result);
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
          });
        }

        if (!audioUrl) {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalBtnText; }
          return alert('Please enter an Audio URL or choose a local audio file.');
        }

        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/soundboard/upload', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ title, icon, audioUrl, isGlobal })
        });
        const data = await res.json();
        if (data.success) {
          alert('🎉 Soundboard sound uploaded successfully!');
          modal.classList.remove('active');
          form.reset();
          if (fileNameLabel) fileNameLabel.textContent = 'No file selected';
          loadSoundboards();
          if (window.adminFetchSoundboard) window.adminFetchSoundboard();
        } else {
          alert(data.error || 'Upload failed.');
        }
      } catch (err) {
        alert('Upload error: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
      }
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.adminFetchSoundboard = async function() {
  const tbody = document.getElementById('admin-soundboard-tbody');
  if (!tbody) return;

  try {
    const token = localStorage.getItem('nitro_jwt_token') || sessionStorage.getItem('nitro_jwt_token');
    const res = await fetch('/api/soundboard', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const data = await res.json();

    if (data.success && data.sounds) {
      if (data.sounds.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:16px; text-align:center; color:var(--text-muted);">No custom or global soundboards uploaded yet.</td></tr>';
        return;
      }

      tbody.innerHTML = data.sounds.map(sound => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
          <td style="padding: 10px 12px; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.4rem;">${sound.icon || '🎵'}</span>
            <strong style="color: #fff;">${escapeHtml(sound.title)}</strong>
          </td>
          <td style="padding: 10px 12px;">
            <span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 99px; font-weight: 800; background: ${sound.is_global ? 'rgba(251, 191, 36, 0.2)' : 'rgba(56, 189, 248, 0.2)'}; color: ${sound.is_global ? '#fbbf24' : '#38bdf8'};">
              ${sound.is_global ? '🌐 GLOBAL' : '👤 USER CUSTOM'}
            </span>
          </td>
          <td style="padding: 10px 12px; color: var(--text-muted); font-size: 0.85rem;">@${escapeHtml(sound.uploaded_by || 'User')}</td>
          <td style="padding: 10px 12px;">
            <div style="display: flex; gap: 6px;">
              <button class="btn-small" onclick="window.adminPlaySound('${encodeURIComponent(sound.audio_url)}')" style="background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #10b981; font-weight: 700;">🔊 Test Play</button>
              <button class="btn-small danger" onclick="window.adminDeleteSound(${sound.id})">🗑️ Delete</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {
    console.error('adminFetchSoundboard error:', e);
  }
};

window.adminPlaySound = (audioUrl) => {
  playAudioUrl(decodeURIComponent(audioUrl));
};

window.adminDeleteSound = async (id) => {
  if (!confirm('Are you sure you want to delete this soundboard entry?')) return;
  await deleteSound(id);
  window.adminFetchSoundboard();
};
