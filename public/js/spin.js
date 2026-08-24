import { authFetch, getCurrentUser } from './auth.js';
import { loadShopData } from './shop.js';

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

let isSpinning = false;
let wheelSegments = [];
let cooldownTimer = null;

export function initSpinWheel() {
  const spinBtn = document.getElementById('spin-wheel-btn');
  const wheelSvg = document.getElementById('wheel-svg');
  if (!spinBtn || !wheelSvg) return;

  loadSegmentsAndDraw();
  updateCooldownUI();

  spinBtn.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (!user) return alert('Please sign in to spin the rewards wheel.');
    if (isSpinning) return;

    try {
      isSpinning = true;
      spinBtn.disabled = true;
      spinBtn.textContent = '🌀 SPINNING...';

      const res = await authFetch('/api/shop/spin', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || data.error) {
        alert(data.error || 'Failed to process spin.');
        isSpinning = false;
        spinBtn.disabled = false;
        spinBtn.textContent = '🌀 SPIN NOW';
        updateCooldownUI();
        return;
      }

      // Server returns fresh segments — re-render wheel to stay in sync
      if (data.segments && data.segments.length) {
        wheelSegments = data.segments;
        drawWheel(wheelSegments);
      }

      const wonIndex = data.index;
      const n = wheelSegments.length || 1;
      const degPerSegment = 360 / n;
      const wedgeCenter = wonIndex * degPerSegment + degPerSegment / 2;
      const targetRotation = 1800 + (360 - wedgeCenter);

      const wheelSvgEl = document.getElementById('wheel-svg');
      wheelSvgEl.style.transition = 'none';
      wheelSvgEl.style.transform = 'rotate(0deg)';
      wheelSvgEl.offsetHeight;

      wheelSvgEl.style.transition = 'transform 4s cubic-bezier(0.1, 0.8, 0.1, 1)';
      wheelSvgEl.style.transform = `rotate(${targetRotation}deg)`;

      setTimeout(() => {
        isSpinning = false;
        spinBtn.textContent = '🌀 SPIN NOW';

        const coinStr = data.reward.coins > 0 ? ` +${data.reward.coins.toLocaleString()} 🪙` : '';
        const xpStr  = data.reward.xp > 0    ? ` +${data.reward.xp.toLocaleString()} XP`   : '';
        alert(`🎉 You won: ${data.reward.text}!\n${coinStr || xpStr}\n\nBalance: ${(data.newCoins||0).toLocaleString()} 🪙  |  ${(data.newXp||0).toLocaleString()} XP`);

        if (user) {
          if (data.reward.coins) user.coins = data.newCoins;
          if (data.reward.xp)    user.xp   = data.newXp;
          user.last_spin_at = new Date().toISOString();
        }

        loadShopData();
        updateCooldownUI();
      }, 4100);

    } catch (err) {
      console.error('Spin Wheel error:', err);
      alert('Network error spinning rewards wheel.');
      isSpinning = false;
      spinBtn.disabled = false;
      spinBtn.textContent = '🌀 SPIN NOW';
    }
  });
}

// ── Fetch segments and render ────────────────────────────────────────────────

async function loadSegmentsAndDraw() {
  try {
    const res = await fetch('/api/shop/spin-segments');
    const data = await res.json();
    if (data.segments && data.segments.length) wheelSegments = data.segments;
  } catch (e) { /* use fallback */ }

  if (!wheelSegments.length) {
    wheelSegments = [
      { label: '50 🪙',   coins: 50,   xp: 0, color: '#1d4ed8' },
      { label: '100 🪙',  coins: 100,  xp: 0, color: '#047857' },
      { label: '250 🪙',  coins: 250,  xp: 0, color: '#6d28d9' },
      { label: '500 🪙',  coins: 500,  xp: 0, color: '#be123c' },
      { label: '🎰 JACKPOT 5000 🪙', coins: 5000, xp: 0, color: '#fbbf24' }
    ];
  }

  drawWheel(wheelSegments);
}

export function drawWheel(segments) {
  const svg = document.getElementById('wheel-svg');
  if (!svg) return;

  const n = segments.length;
  const cx = 50, cy = 50, r = 48;
  const degPerSeg = 360 / n;

  function polar(angleDeg, radius) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  let paths = '', texts = '', lines = '', bulbs = '';

  segments.forEach((seg, i) => {
    const startAngle = i * degPerSeg;
    const endAngle   = startAngle + degPerSeg;
    const midAngle   = startAngle + degPerSeg / 2;

    const s = polar(startAngle, r);
    const e = polar(endAngle, r);
    const largeArc = degPerSeg > 180 ? 1 : 0;
    const color = seg.color || '#6d28d9';

    paths += `<path d="M${cx},${cy} L${s.x.toFixed(2)},${s.y.toFixed(2)} A${r},${r} 0 ${largeArc},1 ${e.x.toFixed(2)},${e.y.toFixed(2)} Z" fill="${color}"/>`;

    // Text
    const textRadius = r * 0.62;
    const tp = polar(midAngle, textRadius);
    const fontSize = n <= 8 ? 5.5 : n <= 12 ? 4.2 : 3.4;
    const label = seg.label || '';
    const words = label.split(' ');
    const half = Math.ceil(words.length / 2);
    const line1 = words.slice(0, half).join(' ');
    const line2 = words.slice(half).join(' ');
    const hasTwo = line2.length > 0 && n <= 16;
    const dyOffset = hasTwo ? -(fontSize * 0.55) : 0;

    texts += `<text transform="rotate(${midAngle.toFixed(1)}, ${tp.x.toFixed(2)}, ${tp.y.toFixed(2)})" x="${tp.x.toFixed(2)}" y="${(tp.y + dyOffset).toFixed(2)}" fill="#fff" font-size="${fontSize}" font-weight="900" text-anchor="middle" dominant-baseline="middle">${escSvg(line1)}</text>`;
    if (hasTwo) {
      texts += `<text transform="rotate(${midAngle.toFixed(1)}, ${tp.x.toFixed(2)}, ${tp.y.toFixed(2)})" x="${tp.x.toFixed(2)}" y="${(tp.y + dyOffset + fontSize * 1.2).toFixed(2)}" fill="#fff" font-size="${fontSize}" font-weight="900" text-anchor="middle" dominant-baseline="middle">${escSvg(line2)}</text>`;
    }

    lines += `<line x1="${cx}" y1="${cy}" x2="${s.x.toFixed(2)}" y2="${s.y.toFixed(2)}" stroke="#fbbf24" stroke-width="1"/>`;

    const bp = polar(midAngle, r - 3);
    bulbs += `<circle cx="${bp.x.toFixed(2)}" cy="${bp.y.toFixed(2)}" r="1.1" fill="rgba(255,255,255,0.45)"/>`;
  });

  svg.innerHTML = `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#111827" stroke="#fbbf24" stroke-width="2.5"/>
    ${paths}
    ${lines}
    ${texts}
    ${bulbs}
    <circle cx="${cx}" cy="${cy}" r="9" fill="#fbbf24" stroke="#fff" stroke-width="1.5"/>
    <text x="${cx}" y="${cy}" fill="#000" font-size="4.5" font-weight="900" text-anchor="middle" dominant-baseline="middle">SPIN</text>
  `;
}

function escSvg(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Cooldown countdown UI ────────────────────────────────────────────────────

function updateCooldownUI() {
  const user = getCurrentUser();
  const cooldownMsg = document.getElementById('daily-spin-cooldown-msg');
  const spinBtn = document.getElementById('spin-wheel-btn');
  if (!cooldownMsg || !spinBtn) return;

  if (cooldownTimer) clearInterval(cooldownTimer);

  const lastSpinAt = user?.last_spin_at;
  if (lastSpinAt) {
    const lastSpin = new Date(lastSpinAt).getTime();
    if ((Date.now() - lastSpin) < COOLDOWN_MS) {
      spinBtn.disabled = true;
      spinBtn.style.opacity = '0.5';
      spinBtn.style.cursor = 'not-allowed';

      function tick() {
        const left = COOLDOWN_MS - (Date.now() - lastSpin);
        if (left <= 0) {
          clearInterval(cooldownTimer);
          cooldownMsg.style.color = '#10b981';
          cooldownMsg.textContent = '✅ You can spin the wheel now!';
          spinBtn.disabled = false;
          spinBtn.style.opacity = '1';
          spinBtn.style.cursor = 'pointer';
          return;
        }
        const h  = Math.floor(left / 3600000);
        const m  = Math.floor((left % 3600000) / 60000);
        const s  = Math.floor((left % 60000) / 1000);
        const pad = v => String(v).padStart(2, '0');
        cooldownMsg.style.color = '#f59e0b';
        cooldownMsg.textContent = `⏳ Next spin in: ${h}:${pad(m)}:${pad(s)}`;
      }
      tick();
      cooldownTimer = setInterval(tick, 1000);
      return;
    }
  }

  cooldownMsg.style.color = '#10b981';
  cooldownMsg.textContent = '✅ You can spin the wheel now!';
  spinBtn.disabled = false;
  spinBtn.style.opacity = '1';
  spinBtn.style.cursor = 'pointer';
}
