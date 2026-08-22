import { authFetch, getCurrentUser } from './auth.js';
import { loadShopData } from './shop.js';

export function initRaffles() {
  // Initial load
  loadRafflesData();
}

export async function loadRafflesData() {
  const container = document.getElementById('raffles-list-container');
  if (!container) return;

  try {
    const res = await authFetch('/api/raffles');
    const data = await res.json();

    if (!res.ok || !data.success) {
      container.innerHTML = `<div style="color: #ef4444; font-size: 0.85rem; padding: 10px; text-align: center;">Failed to load raffles list.</div>`;
      return;
    }

    const raffles = data.raffles || [];
    if (raffles.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 16px; text-align: center; background: rgba(0,0,0,0.15); border-radius: 8px;">🎟️ No active raffle draws right now. Check back soon!</div>`;
      return;
    }

    let html = '';
    raffles.forEach(raffle => {
      const endsTime = new Date(raffle.ends_at).getTime();
      const isExpired = endsTime <= Date.now();
      const isClosed = raffle.is_drawn || isExpired;

      html += `
        <div style="background: rgba(0,0,0,0.2); border: 1px solid ${isClosed ? 'rgba(255,255,255,0.05)' : 'rgba(251,191,36,0.2)'}; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px; position: relative;">
          ${isClosed ? '<span style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.08); color: #fff; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: 700;">CLOSED</span>' : '<span style="position: absolute; top: 10px; right: 10px; background: rgba(251,191,36,0.15); color: #fbbf24; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: 700; border: 1px solid rgba(251,191,36,0.3)">ACTIVE</span>'}
          
          <strong style="color: ${isClosed ? '#cbd5e1' : '#fbbf24'}; font-size: 0.95rem; padding-right: 60px;">${escapeHtml(raffle.title)}</strong>
          <p style="color: var(--text-muted); font-size: 0.82rem; margin: 0; line-height: 1.3;">${escapeHtml(raffle.description || '')}</p>
          
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 0.78rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; margin-top: 4px;">
            <div>
              <span style="color: #cbd5e1;">Ticket Cost:</span>
              <strong style="color: #fbbf24; display: inline-flex; align-items: center; gap: 3px;">
                <svg class="coin-icon" style="width:11px; height:11px;" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#fbbf24" stroke="#d97706" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="#f59e0b" stroke="#b45309" stroke-width="1"/><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="#78350f" font-size="9" font-weight="900" font-family="sans-serif">$</text></svg>
                ${raffle.ticket_cost}
              </strong>
            </div>
            <div>
              <span style="color: #cbd5e1;">Your Tickets:</span>
              <strong style="color: #38bdf8;">${raffle.user_tickets_count || 0}</strong>
              ${raffle.max_tickets_per_user > 0 ? `<span style="color: var(--text-muted); font-size: 0.7rem;">/ ${raffle.max_tickets_per_user} max</span>` : ''}
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 0.78rem;">
            <div>
              <span style="color: #cbd5e1;">Total Sold:</span>
              <strong style="color: #10b981;">${raffle.total_tickets_sold || 0}</strong>
            </div>
            <div style="color: var(--text-muted); font-size: 0.75rem;">
              Ends: <strong>${formatTimeLeft(raffle.ends_at)}</strong>
            </div>
          </div>

          ${raffle.is_drawn && raffle.winner_username ? `
            <div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 6px; padding: 6px 10px; font-size: 0.8rem; display: flex; align-items: center; gap: 6px; margin-top: 4px;">
              <span>🎁 Winner:</span>
              <strong style="color: #10b981;">@${escapeHtml(raffle.winner_display_name || raffle.winner_username)}</strong>
            </div>
          ` : ''}

          ${!isClosed ? `
            <div style="display: flex; gap: 6px; margin-top: 6px;">
              <input type="number" id="ticket-buy-qty-${raffle.id}" value="1" min="1" max="100" style="width: 54px; padding: 4px 6px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #fff; font-size: 0.8rem; text-align: center;">
              <button class="btn-small primary buy-tickets-btn" data-id="${raffle.id}" style="flex: 1; justify-content: center; font-weight: 700; background: #fbbf24; color: #000; border-radius: 4px;">🎟️ Buy Tickets</button>
            </div>
          ` : ''}
        </div>
      `;
    });

    container.innerHTML = html;

    // Bind buy ticket buttons
    container.querySelectorAll('.buy-tickets-btn').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-id');
        const input = document.getElementById(`ticket-buy-qty-${id}`);
        const qty = input ? parseInt(input.value, 10) : 1;
        await buyRaffleTickets(id, qty);
      };
    });

  } catch (err) {
    console.error('loadRafflesData error:', err);
    container.innerHTML = `<div style="color: #ef4444; font-size: 0.85rem; padding: 10px; text-align: center;">Network error loading raffles.</div>`;
  }
}

async function buyRaffleTickets(raffleId, count) {
  const user = getCurrentUser();
  if (!user) return alert('Please sign in to buy raffle tickets.');

  if (isNaN(count) || count <= 0) return alert('Please enter a valid ticket quantity.');

  try {
    const res = await authFetch(`/api/raffles/${raffleId}/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      alert(data.error || 'Failed to buy tickets.');
      return;
    }

    alert(`🎟️ Success! Bought ${count} ticket(s) for 🪙 ${data.totalCost} Coins!`);
    
    // Deduct locally and refresh views
    if (user) {
      user.coins = (user.coins || 0) - data.totalCost;
    }
    loadShopData(); // updates header shop balances
    loadRafflesData(); // refresh tickets count list
  } catch (err) {
    console.error('buyRaffleTickets error:', err);
    alert('Network error purchasing tickets.');
  }
}

function formatTimeLeft(endTimeStr) {
  const diff = new Date(endTimeStr).getTime() - Date.now();
  if (diff <= 0) return 'Ended';

  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m left`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h left`;

  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}
