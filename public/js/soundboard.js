// NITRO Interactive Audio & Web Audio Synthesized Soundboard

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
  coin: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
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
  victory: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.1;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
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
  },
  synthwave: () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.3);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }
};

export function initSoundboard() {
  const container = document.getElementById('soundboard-grid');
  if (!container) return;

  const SOUND_ITEMS = [
    { key: 'coin', label: '🪙 Retro Coin', icon: '🪙', color: '#fbbf24' },
    { key: 'laser', label: '⚡ Laser Blast', icon: '⚡', color: '#38bdf8' },
    { key: 'victory', label: '🏆 Victory Fanfare', icon: '🏆', color: '#10b981' },
    { key: 'gameover', label: '💀 Game Over', icon: '💀', color: '#ef4444' },
    { key: 'airhorn', label: '📢 Airhorn', icon: '📢', color: '#f59e0b' },
    { key: 'drumroll', label: '🥁 Drumroll', icon: '🥁', color: '#a855f7' },
    { key: 'beep', label: '🔔 Alert Tone', icon: '🔔', color: '#ec4899' },
    { key: 'synthwave', label: '🌆 Synthwave Pulse', icon: '🌆', color: '#6366f1' }
  ];

  container.innerHTML = '';
  SOUND_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'soundboard-card-btn';
    btn.style.borderColor = item.color;
    btn.innerHTML = `
      <div style="font-size: 2.2rem; margin-bottom: 6px;">${item.icon}</div>
      <div style="font-weight: 700; font-size: 0.95rem; color: #fff;">${item.label}</div>
      <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">Synthesized Audio</div>
    `;

    btn.addEventListener('click', () => {
      if (SOUND_EFFECTS[item.key]) {
        SOUND_EFFECTS[item.key]();
        btn.classList.add('sound-playing');
        setTimeout(() => btn.classList.remove('sound-playing'), 300);
      }
    });

    container.appendChild(btn);
  });
}
