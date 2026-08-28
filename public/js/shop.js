// Client-side Shop & Quests Module
import { getCurrentUser } from './auth.js';

const COIN_SVG = `<svg class="coin-icon" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:3px;" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#fbbf24" stroke="#d97706" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="#f59e0b" stroke="#b45309" stroke-width="1"/><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="#78350f" font-size="9" font-weight="900" font-family="sans-serif">$</text></svg>`;

let activeCategory = 'all';
let loadedShopItems = [];
let currentStoreId = null; // set while viewing a sub-store, so buy/refresh knows where to return to

export function initShop() {
  // Bind category tabs
  const tabs = document.querySelectorAll('.shop-cat-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active');
        t.style.background = 'rgba(255,255,255,0.05)';
        t.style.borderColor = 'rgba(255,255,255,0.1)';
        t.style.color = '#cbd5e1';
      });
      tab.classList.add('active');
      tab.style.background = 'rgba(16, 185, 129, 0.15)';
      tab.style.borderColor = '#10b981';
      tab.style.color = '#10b981';

      activeCategory = tab.dataset.cat;
      loadShopData();
    });
  });

  // Watch for page view switches
  const navShopBtn = document.querySelector('.nav-btn[data-view="shop"]');
  if (navShopBtn) {
    navShopBtn.addEventListener('click', () => {
      window.closeStoreFront ? window.closeStoreFront() : loadShopData();
    });
  }

  const backBtn = document.getElementById('store-detail-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.closeStoreFront();
    });
  }

  // Promo code redemption
  const redeemBtn = document.getElementById('shop-redeem-code-btn');
  const codeInput = document.getElementById('shop-promo-code-input');
  if (redeemBtn && codeInput) {
    redeemBtn.addEventListener('click', async () => {
      const code = codeInput.value.trim();
      if (!code) return alert('Please enter a promo code.');

      const token = localStorage.getItem('nitro_jwt_token') || '';
      if (!token) return alert('Please sign in to redeem codes.');

      redeemBtn.disabled = true;
      redeemBtn.textContent = 'Claiming...';

      try {
        const res = await fetch('/api/shop/redeem', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ code })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          alert(`🎉 Code Redeemed Successfully!\n${data.message}`);
          codeInput.value = '';
          
          if (window.fetchUserProfile) {
            await window.fetchUserProfile();
          }
          loadShopData();
        } else {
          alert(data.error || 'Failed to redeem code.');
        }
      } catch (err) {
        console.error('Error redeeming code:', err);
        alert('Network error redeeming code.');
      } finally {
        redeemBtn.disabled = false;
        redeemBtn.textContent = '🔑 Claim Code';
      }
    });
  }
}

export async function loadShopData() {
  const coinsEl = document.getElementById('shop-user-coins');
  const xpEl = document.getElementById('shop-user-xp');
  const user = getCurrentUser();
  if (user) {
    if (coinsEl) coinsEl.textContent = user.coins || 0;
    if (xpEl) xpEl.textContent = user.xp || 0;
  }

  const token = localStorage.getItem('nitro_jwt_token') || '';
  if (!token || token === 'null' || token === 'undefined') {
    const shopGrid = document.getElementById('shop-items-grid');
    if (shopGrid) {
      shopGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <div style="font-size: 2.2rem; margin-bottom: 12px; filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.2));">🔒</div>
          <p style="font-weight: 800; color: #fff; margin-bottom: 6px; font-size: 1rem; letter-spacing: 0.5px;">AUTHENTICATION REQUIRED</p>
          <p style="font-size: 0.85rem; max-width: 290px; margin: 0 auto 16px; line-height: 1.5; color: var(--text-muted);">Log in or create a student account to browse store items, customize name glows, and complete quests.</p>
          <button class="btn-pill primary" onclick="document.getElementById('nav-brand-btn')?.click()" style="margin: 0 auto; font-size: 0.8rem; padding: 10px 20px; font-weight: 800;">Log In Now</button>
        </div>
      `;
    }
    const questsList = document.getElementById('quests-list-container');
    if (questsList) {
      questsList.innerHTML = `
        <div style="text-align: center; padding: 30px 20px; color: var(--text-muted); font-size: 0.82rem; line-height: 1.5;">
          🔑 Log in to track daily quests and claim rewards.
        </div>
      `;
    }
    return;
  }

  try {
    // 1. Fetch shop items & inventory
    const [shopRes, invRes, questsRes] = await Promise.all([
      fetch('/api/shop/items', { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch('/api/shop/inventory', { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch('/api/shop/quests', { headers: { 'Authorization': `Bearer ${token}` } })
    ]);

    if (shopRes.status === 401 || invRes.status === 401 || questsRes.status === 401) {
      console.warn('Unauthorized token found, logging out.');
      if (typeof window.triggerClientLogout === 'function') {
        window.triggerClientLogout();
      } else {
        localStorage.removeItem('nitro_jwt_token');
        loadShopData();
      }
      return;
    }

    const shopData = await shopRes.json();
    const invData = await invRes.json();
    const questsData = await questsRes.json();

    if (shopData.success && invData.success) {
      loadedShopItems = shopData.items || [];
      renderStoreItems(shopData.items, invData.inventory);
    }
    if (questsData.success) {
      renderQuests(questsData.quests);
    }
  } catch (err) {
    console.error('Error loading shop/quest data:', err);
  }
}

function renderStoreItems(items, inventory, containerId = 'shop-items-grid', theme = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const ownedItemIds = new Set((inventory || []).map(i => i.item_id));
  const accentColor = theme?.accent_color || '#10b981';
  const cardBgColor = theme?.card_bg_color || '';
  const textColor = theme?.text_color || '#fff';
  const buttonLabel = theme?.button_label || 'Buy for';

  // Filter by category (category tabs only apply to the main shop grid)
  let filtered = items;
  if (containerId === 'shop-items-grid' && activeCategory !== 'all') {
    filtered = items.filter(item => item.category === activeCategory);
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--text-muted); font-size: 0.85rem;">No items available in this category.</div>';
    return;
  }

  container.innerHTML = filtered.map(item => {
    const isOwned = ownedItemIds.has(item.id);
    const isSoldOut = item.stock_count !== undefined && item.stock_count !== null && item.stock_count >= 0 && item.stock_count === 0;
    // Repeatable items always show the Buy button even if already owned
    const showBuyBtn = item.is_repeatable || !isOwned;

    let actionBtn = '';
    if (item.is_store_front) {
      actionBtn = `<button onclick="window.openStoreFront(${item.opens_store_id})" style="width: 100%; padding: 8px; background: #38bdf8; border: none; color: #000; border-radius: 8px; font-weight: 800; font-size: 0.78rem; cursor: pointer; transition: opacity 0.2s;">🏪 Open Shop</button>`;
    } else if (isSoldOut) {
      actionBtn = `<button disabled style="width: 100%; padding: 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; border-radius: 8px; font-weight: 800; font-size: 0.78rem; cursor: not-allowed;">SOLD OUT</button>`;
    } else if (showBuyBtn) {
      actionBtn = `<button onclick="window.buyShopItem(${item.id})" style="width: 100%; padding: 8px; background: ${accentColor}; border: none; color: #000; border-radius: 8px; font-weight: 800; font-size: 0.78rem; cursor: pointer; transition: opacity 0.2s;">${escapeHtml(buttonLabel)} ${COIN_SVG} ${item.price}</button>`;
    } else {
      actionBtn = `<button disabled style="width: 100%; padding: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #64748b; border-radius: 8px; font-weight: 700; font-size: 0.78rem;">Purchased ✔</button>`;
    }

    const stockIndicator = (!item.is_store_front && item.stock_count !== undefined && item.stock_count !== null && item.stock_count > 0)
      ? `<span style="font-size: 0.7rem; color: #fbbf24; font-weight: 700; display: block; margin-top: 4px;">⏳ Only ${item.stock_count} left in stock!</span>`
      : '';

    const repeatBadge = (!item.is_store_front && item.is_repeatable)
      ? `<span style="font-size: 0.68rem; color: #f59e0b; font-weight: 700; display: block; margin-top: 3px;">♻️ Can buy multiple times</span>`
      : '';

    const badgeClass = ['chat_glow', 'custom_flair', 'irl_reward'].includes(item.category)
      ? `shop-badge-${item.category}`
      : 'shop-badge-default';

    const imgHtml = item.image_url
      ? `<img src="${escapeHtml(item.image_url)}" style="width: 100%; height: 90px; object-fit: cover; border-radius: 8px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.06);" alt="${escapeHtml(item.name)}">`
      : '';

    const cardStyle = cardBgColor ? ` style="background: ${cardBgColor};"` : '';

    return `
      <div class="shop-item-card"${cardStyle}>
        <div>
          ${imgHtml}
          <span class="shop-badge ${badgeClass}">${item.category.replace('_', ' ')}</span>
          <strong style="color: ${textColor}; font-size: 0.88rem; display: block; margin-top: 4px;">${escapeHtml(item.name)}</strong>
          <p style="margin: 4px 0 0; color: var(--text-muted); font-size: 0.78rem; line-height: 1.35;">${escapeHtml(item.description)}</p>
          ${stockIndicator}
          ${repeatBadge}
        </div>
        <div>
          ${actionBtn}
        </div>
      </div>
    `;
  }).join('');
}

// Open a dedicated sub-store page (drilled into from a "store front" card)
window.openStoreFront = async function(storeId) {
  if (!storeId) return;
  const token = localStorage.getItem('nitro_jwt_token') || '';
  if (!token) return alert('Please sign in to browse this shop.');

  const storeCard = document.getElementById('store-page-card');
  const storeGrid = document.getElementById('store-items-grid');
  if (!storeCard || !storeGrid) return;

  currentStoreId = storeId;
  window.switchView('store'); // full page navigation, not a nested box
  storeGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 10px; text-align: center;">Loading...</div>';

  try {
    const [storeRes, invRes] = await Promise.all([
      fetch(`/api/shop/stores/${storeId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch('/api/shop/inventory', { headers: { 'Authorization': `Bearer ${token}` } })
    ]);
    const storeData = await storeRes.json();
    const invData = await invRes.json();

    if (!storeRes.ok || !storeData.success) {
      storeGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: #ef4444; font-size: 0.85rem;">${escapeHtml(storeData.error || 'This shop is unavailable.')}</div>`;
      return;
    }

    const store = storeData.store;
    const nameEl = document.getElementById('store-detail-name');
    const descEl = document.getElementById('store-detail-desc');
    if (nameEl) {
      nameEl.textContent = store.name;
      nameEl.style.color = store.heading_color || '#10b981';
    }
    if (descEl) {
      descEl.textContent = store.description || '';
      descEl.style.color = store.text_color || 'var(--text-muted)';
    }

    // Apply full per-store page appearance
    storeCard.style.background = store.bg_color || 'var(--card-bg)';
    storeCard.style.borderColor = store.border_color || 'var(--card-border)';
    if (store.bg_image_url) {
      storeCard.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('${store.bg_image_url.replace(/'/g, "\\'")}')`;
      storeCard.style.backgroundSize = 'cover';
      storeCard.style.backgroundPosition = 'center';
    } else {
      storeCard.style.backgroundImage = '';
    }

    const bannerEl = document.getElementById('store-detail-banner');
    if (bannerEl) {
      if (store.banner_url) {
        bannerEl.src = store.banner_url;
        bannerEl.style.display = 'block';
      } else {
        bannerEl.style.display = 'none';
        bannerEl.src = '';
      }
    }

    loadedShopItems = storeData.items || [];
    renderStoreItems(storeData.items, invData.inventory, 'store-items-grid', {
      accent_color: store.accent_color,
      card_bg_color: store.card_bg_color,
      text_color: store.text_color,
      button_label: store.button_label
    });
  } catch (err) {
    console.error('Error loading store:', err);
    storeGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: #ef4444; font-size: 0.85rem;">Network error loading shop.</div>';
  }
};

window.closeStoreFront = function() {
  currentStoreId = null;
  const storeCard = document.getElementById('store-page-card');
  if (storeCard) {
    // Clear any store-custom appearance so it doesn't linger for the next store opened
    storeCard.style.background = '';
    storeCard.style.borderColor = '';
    storeCard.style.backgroundImage = '';
  }
  window.switchView('shop');
  loadShopData();
};

function renderQuests(quests) {
  const container = document.getElementById('quests-list-container');
  if (!container) return;

  if (quests.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem;">No active quests today. Check back later!</div>';
    return;
  }

  container.innerHTML = quests.map(q => {
    const pct = Math.min(100, Math.round((q.current_value / q.target_value) * 100));
    
    let actionArea = '';
    if (q.is_claimed) {
      actionArea = `<span style="font-size: 0.78rem; color: #64748b; font-weight: 700;">Claimed ✔</span>`;
    } else if (q.is_completed) {
      actionArea = `<button onclick="window.claimQuestReward(${q.id})" style="padding: 6px 14px; background: #38bdf8; border: none; color: #000; border-radius: 6px; font-weight: 800; font-size: 0.76rem; cursor: pointer;">Claim Reward</button>`;
    } else {
      actionArea = `<span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">In Progress (${pct}%)</span>`;
    }

    return `
      <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 14px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
        <div style="flex: 1;">
          <strong style="color: #fff; font-size: 0.88rem; display: block;">${escapeHtml(q.title)}</strong>
          <p style="margin: 2px 0 6px; color: var(--text-muted); font-size: 0.78rem;">${escapeHtml(q.description)}</p>
          
          <!-- Progress Bar -->
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="flex: 1; height: 6px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #38bdf8, #10b981); border-radius: 99px;"></div>
            </div>
            <span style="font-size: 0.72rem; color: #38bdf8; font-weight: 700; min-width: 32px; text-align: right;">${q.current_value}/${q.target_value}</span>
          </div>
          
          <!-- Rewards Indicator -->
          <div style="display: flex; gap: 8px; margin-top: 6px; font-size: 0.7rem; font-weight: 700;">
            <span style="color: #fbbf24; display: inline-flex; align-items: center; gap: 4px;">${COIN_SVG} +${q.reward_coins} Coins</span>
            <span style="color: #38bdf8;">🏆 +${q.reward_xp} XP</span>
          </div>
        </div>
        <div style="flex-shrink: 0;">
          ${actionArea}
        </div>
      </div>
    `;
  }).join('');
}

window.buyShopItem = async function(itemId) {
  const token = localStorage.getItem('nitro_jwt_token') || '';
  if (!token) return alert('Please sign in to buy items.');

  const item = loadedShopItems.find(i => i.id == itemId);
  if (item && item.category === 'irl_reward') {
    const receiveNote = item.delivery_note ? `\n\n⚠️ INSTRUCTIONS FOR CLAIMING:\n${item.delivery_note}` : '';
    if (!confirm(`Are you sure you want to purchase "${item.name}" for ${item.price} Coins?${receiveNote}`)) return;
  } else {
    if (!confirm('Are you sure you want to purchase this item?')) return;
  }

  try {
    const res = await fetch('/api/shop/buy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ itemId })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(data.message);
      
      // Update local profile data if we bought cosmetic flairs
      if (data.item.category === 'custom_flair') {
        alert(`✨ Go to Profile Settings to equip your new "${data.item.name}" prefix flair!`);
      } else if (data.item.category === 'chat_glow') {
        alert(`✨ Go to Profile Settings to equip your new "${data.item.name}"!`);
      }
      
      // Re-fetch current user to sync points
      if (window.fetchUserProfile) {
        await window.fetchUserProfile();
      }
      if (currentStoreId) {
        window.openStoreFront(currentStoreId);
      } else {
        loadShopData();
      }
    } else {
      alert(data.error || 'Failed to buy shop item.');
    }
  } catch (err) {
    console.error('Error purchasing item:', err);
    alert('Network error purchasing item.');
  }
};

window.claimQuestReward = async function(questId) {
  const token = localStorage.getItem('nitro_jwt_token') || '';
  if (!token) return;

  try {
    const res = await fetch(`/api/shop/quests/${questId}/claim`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(data.message);
      if (window.fetchUserProfile) {
        await window.fetchUserProfile();
      }
      loadShopData();
    } else {
      alert(data.error || 'Failed to claim quest reward.');
    }
  } catch (err) {
    console.error('Error claiming quest:', err);
    alert('Network error claiming reward.');
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
