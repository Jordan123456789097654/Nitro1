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

export function initSoundboard() {
  const container = document.getElementById('soundboard-grid');
  if (!container) return;

  const socket = getSharedSocket();
  if (socket) {
    socket.on('sound_effect_broadcast', ({ soundKey }) => {
      if (SOUND_EFFECTS[soundKey]) {
        SOUND_EFFECTS[soundKey]();
      }
    });
  }

  const SOUND_ITEMS = [
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

  container.innerHTML = '';
  SOUND_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'soundboard-card-btn';
    btn.style.borderColor = item.color;
    btn.innerHTML = `
      <div style="font-size: 2.2rem; margin-bottom: 6px;">${item.icon}</div>
      <div style="font-weight: 700; font-size: 0.95rem; color: #fff;">${item.label}</div>
      <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">Playable in Voice & Chat</div>
    `;

    btn.addEventListener('click', () => {
      if (SOUND_EFFECTS[item.key]) {
        SOUND_EFFECTS[item.key]();
        btn.classList.add('sound-playing');
        setTimeout(() => btn.classList.remove('sound-playing'), 300);

        if (socket) {
          const user = getCurrentUser();
          socket.emit('play_sound_effect', { soundKey: item.key, username: user ? user.username : 'Guest' });
        }
      }
    });

    container.appendChild(btn);
  });
}
