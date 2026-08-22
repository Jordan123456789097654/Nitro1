import { authFetch, getCurrentUser } from './auth.js';
import { loadShopData } from './shop.js';

let isSpinning = false;

export function initSpinWheel() {
  const spinBtn = document.getElementById('spin-wheel-btn');
  const wheelSvg = document.getElementById('wheel-svg');
  const cooldownMsg = document.getElementById('daily-spin-cooldown-msg');

  if (!spinBtn || !wheelSvg) return;

  // Initial check to show/hide cooldown message
  updateCooldownUI();

  spinBtn.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (!user) return alert('Please sign in to spin the rewards wheel.');

    if (isSpinning) return;

    try {
      isSpinning = true;
      spinBtn.disabled = true;
      spinBtn.textContent = '🌀 SPINNING...';

      const res = await authFetch('/api/shop/spin', {
        method: 'POST'
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        alert(data.error || 'Failed to process spin.');
        isSpinning = false;
        spinBtn.disabled = false;
        spinBtn.textContent = '🌀 SPIN NOW';
        return;
      }

      // Successful spin! Get won index (0 to 5)
      const wonIndex = data.index;
      console.log(`🎯 Wheel landed on Wedge index ${wonIndex}: ${data.reward.text}`);

      // Calculate rotation: 5 full spins (1800 deg) + offset to align won wedge center (index * 60 + 30) at the top pointer (0 deg)
      const wedgeCenter = wonIndex * 60 + 30;
      const targetRotation = 1800 + (360 - wedgeCenter);

      // Reset transition and rotation before starting to allow consecutive spins
      wheelSvg.style.transition = 'none';
      wheelSvg.style.transform = 'rotate(0deg)';
      
      // Force repaint
      wheelSvg.offsetHeight;

      // Start spin
      wheelSvg.style.transition = 'transform 4s cubic-bezier(0.1, 0.8, 0.1, 1)';
      wheelSvg.style.transform = `rotate(${targetRotation}deg)`;

      // Wait for transition to complete (4 seconds)
      setTimeout(() => {
        isSpinning = false;
        spinBtn.textContent = '🌀 SPIN NOW';
        
        // Show reward notice
        alert(`🎉 Congratulations! You won: ${data.reward.text}!`);

        // Update local user object coins/XP in memory
        if (user) {
          if (data.reward.coins) user.coins = data.newCoins;
          if (data.reward.xp) user.xp = data.newXp;
        }

        // Trigger updates in shop UI header balances
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

function updateCooldownUI() {
  const user = getCurrentUser();
  const cooldownMsg = document.getElementById('daily-spin-cooldown-msg');
  const spinBtn = document.getElementById('spin-wheel-btn');

  if (!user || !cooldownMsg || !spinBtn) return;

  if (user.last_spin_at) {
    const lastSpin = new Date(user.last_spin_at).getTime();
    const diff = Date.now() - lastSpin;
    if (diff < 24 * 60 * 60 * 1000) {
      const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - diff) / (60 * 60 * 1000));
      cooldownMsg.style.display = 'block';
      cooldownMsg.style.color = '#ef4444';
      cooldownMsg.textContent = `⏳ Cooldown active. Next spin available in ${hoursLeft} hour(s).`;
      spinBtn.disabled = true;
      spinBtn.style.opacity = '0.5';
      spinBtn.style.cursor = 'not-allowed';
      return;
    }
  }

  // Ready to spin
  cooldownMsg.style.display = 'block';
  cooldownMsg.style.color = '#10b981';
  cooldownMsg.textContent = '✅ You can spin the wheel now!';
  spinBtn.disabled = false;
  spinBtn.style.opacity = '1';
  spinBtn.style.cursor = 'pointer';
}
