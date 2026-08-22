// Admin Dashboard, Live Connections Monitor, Slowmode & Moderation
import { getCurrentUser, applySignupsGateUI } from './auth.js';

const COIN_SVG = `<svg class="coin-icon" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:3px;" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#fbbf24" stroke="#d97706" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="#f59e0b" stroke="#b45309" stroke-width="1"/><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="#78350f" font-size="9" font-weight="900" font-family="sans-serif">$</text></svg>`;
import { loadGames } from './games.js';
import { checkStatusAndAnnouncements, checkUpdateLogs } from './app.js';
import { loadPolls } from './polls.js';
import { getSharedSocket } from './socket.js';

let adminSocket = null;

function getLocalOrCookieToken() {
  const token = localStorage.getItem('nitro_jwt_token');
  if (token && token !== 'null' && token !== 'undefined') return token;
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf('nitro_jwt_token=') === 0) return decodeURIComponent(c.substring('nitro_jwt_token='.length));
  }
  return null;
}

function authFetch(url, options = {}) {
  const token = getLocalOrCookieToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers, credentials: 'same-origin' });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function initAdmin() {
  setupAdminTabs();
  setupAdminActions();
  setupMaintenanceToggle();
  setupAiMaintenanceToggle();
  setupSignupsToggle();
  setupAnnouncementForm();
  setupDomainBlockForm();
  setupUpdateLogForm();
  setupPollCreateForm();
  setupSlowmodeControls();
  setupCreateUserForm();
  setupCreateShopForm();
  setupCreateQuestForm();
  setupAnnouncementDisableControls();
  setupUpdateDisableControls();
  setupBulkImporter();
  setupAiModerationStudio();
  setupEditFilterModal();
  setupAppealsReviewStudio();
  connectAdminSocket();
}



// Global Admin Kick Handler
window.adminKickConnection = (socketId) => {
  const user = getCurrentUser();
  if (adminSocket && user) {
    adminSocket.emit('admin_kick_connection', { targetSocketId: socketId, adminUser: user });
    alert('⚡ Connection kick command sent!');
    setTimeout(() => { fetchLiveConnections(); }, 500);
  } else {
    alert('Socket connection offline. Could not send kick command.');
  }
};

window.adminFetchIpLogs = async () => {
  const tbody = document.getElementById('admin-ip-logs-tbody');
  if (!tbody) return;

  try {
    const res = await authFetch('/api/admin/ip-tracker');
    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;">Error fetching IP tracker logs.</td></tr>';
      return;
    }
    const data = await res.json();
    const logs = data.logs || [];

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No user IP traffic recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr>
        <td><code>${l.ip_address}</code> ${l.is_banned ? '<span class="chat-badge owner" style="background:#ef4444;color:#fff;">BANNED</span>' : ''}</td>
        <td><strong>${l.username}</strong></td>
        <td><span style="font-size:0.8rem; color:#94a3b8;">${(l.user_agent || '').slice(0, 40)}...</span></td>
        <td><span style="color:#38bdf8;">${l.location_info || 'Unknown'}</span></td>
        <td><span style="font-size:0.8rem; color:#94a3b8;">${new Date(l.created_at).toLocaleString()}</span></td>
        <td>
          ${l.is_banned 
            ? `<button class="btn-small primary" onclick="window.adminUnbanIp('${l.ip_address}')">Unban IP</button>` 
            : `<button class="btn-small danger" onclick="window.adminBanIp('${l.ip_address}')">Ban IP</button>`}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;">Network error loading IP tracker.</td></tr>';
  }
};

window.adminBanIp = async (ip) => {
  const reason = prompt(`Enter ban reason for IP ${ip}:`, 'Violation of platform terms');
  if (reason === null) return;

  try {
    const res = await authFetch('/api/admin/ip-tracker/ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip_address: ip, reason })
    });
    if (res.ok) {
      alert(`🚫 IP ${ip} banned globally!`);
      window.adminFetchIpLogs();
    } else {
      alert('Failed to ban IP.');
    }
  } catch (e) {
    alert('Error banning IP address.');
  }
};

window.adminUnbanIp = async (ip) => {
  if (!confirm(`Unban IP address ${ip}?`)) return;

  try {
    const res = await authFetch('/api/admin/ip-tracker/unban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip_address: ip })
    });
    if (res.ok) {
      alert(`✅ IP ${ip} unbanned!`);
      window.adminFetchIpLogs();
    } else {
      alert('Failed to unban IP.');
    }
  } catch (e) {
    alert('Error unbanning IP address.');
  }
};

export function connectAdminSocket() {
  adminSocket = getSharedSocket();
  if (adminSocket) {
    adminSocket.off('active_connections_update');
    adminSocket.on('active_connections_update', ({ count, connections, slowmode }) => {
      renderLiveConnections(count, connections);
      const slowmodeSelect = document.getElementById('admin-slowmode-select');
      if (slowmodeSelect && slowmode !== undefined) slowmodeSelect.value = slowmode.toString();
    });

    const user = getCurrentUser();
    if (user && ['admin', 'owner', 'moderator'].includes(user.role)) {
      adminSocket.emit('user_connected', { user, activity: 'In Admin Panel' });
      adminSocket.emit('request_live_connections');
    }
  }
}

export async function fetchLiveConnections() {
  try {
    if (adminSocket) {
      const user = getCurrentUser();
      if (user && user.role === 'admin') {
        adminSocket.emit('user_connected', { user, activity: 'In Admin Panel' });
      }
      adminSocket.emit('request_live_connections');
    }

    const res = await authFetch('/api/admin/connections');
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;

    const data = await res.json();
    if (data && data.connections) {
      renderLiveConnections(data.count, data.connections);
    }
  } catch (e) {
    // Suppress network drops
  }
}

export async function loadAdminData() {
  const user = getCurrentUser();
  if (!user || !['owner', 'admin'].includes(user.role)) return;

  connectAdminSocket();

  await Promise.allSettled([
    fetchMaintenance(),
    fetchSignupsStatus(),
    fetchStats(),
    fetchUsers(),
    fetchLiveConnections(),
    fetchAdminGames(),
    fetchBlockedDomains(),
    fetchFilters(),
    fetchLogs(),
    fetchAdminWebhooks(),
    fetchActivityRadar()
  ]);
}

async function fetchSignupsStatus() {
  try {
    const res = await authFetch('/api/admin/signups-status');
    if (!res.ok) return;
    const data = await res.json();
    updateSignupsUI(data.signups_enabled);
  } catch (e) {}
}

function updateSignupsUI(enabled) {
  const badge = document.getElementById('admin-signups-status-badge');
  const btn = document.getElementById('admin-toggle-signups-btn');
  if (badge) {
    badge.textContent = enabled ? 'Signups ENABLED' : 'Signups DISABLED';
    badge.style.background = enabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    badge.style.borderColor = enabled ? '#10b981' : '#ef4444';
    badge.style.color = enabled ? '#10b981' : '#ef4444';
  }
  if (btn) {
    btn.textContent = enabled ? 'Disable Signups' : 'Enable Signups';
    btn.style.background = enabled ? '#e11d48' : '#10b981';
  }
}

function setupSignupsToggle() {
  const btn = document.getElementById('admin-toggle-signups-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (!user || (user.role !== 'owner' && user.username?.toLowerCase() !== 'jordandaniels')) {
      alert('Toggling account registration is restricted to Supreme Owner rank (OWNER ONLY).');
      return;
    }

    try {
      const currentBadge = document.getElementById('admin-signups-status-badge');
      const isCurrentlyEnabled = currentBadge ? currentBadge.textContent.includes('ENABLED') : true;
      const targetState = !isCurrentlyEnabled;

      if (!confirm(`Are you sure you want to ${targetState ? 'ENABLE' : 'DISABLE'} new user signups?`)) return;

      const res = await authFetch('/api/admin/toggle-signups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: targetState })
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message || `Signups are now ${targetState ? 'ENABLED' : 'DISABLED'}`);
        updateSignupsUI(data.signups_enabled);
        // Also update the login gate UI in real-time
        applySignupsGateUI(data.signups_enabled);
      } else {
        alert(data.error || 'Failed to update registration status. Owner privileges required.');
      }
    } catch (e) {
      alert('Error updating signup status.');
    }
  });
}

function renderLiveConnections(count, connections) {
  const countEl = document.getElementById('admin-live-conn-count');
  const tbody = document.getElementById('admin-connections-tbody');
  if (countEl) countEl.textContent = `${count} Active`;
  if (!tbody) return;

  if (!connections || connections.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 18px;">No active connections</td></tr>';
    return;
  }

  tbody.innerHTML = connections.map(c => `
    <tr>
      <td><code>${c.socketId ? c.socketId.slice(0, 8) : ''}...</code></td>
      <td><strong>${c.username || 'Visitor'}</strong></td>
      <td><span class="chat-badge ${c.role || 'member'}">${(c.role || 'member').toUpperCase()}</span></td>
      <td><span style="color: #38bdf8;">${c.currentActivity || 'Active'}</span></td>
      <td><span style="font-size: 0.8rem; color: #94a3b8;">${new Date(c.connectedAt || Date.now()).toLocaleTimeString()}</span></td>
      <td>
        <button class="btn-small danger" onclick="window.adminKickConnection('${c.socketId}')">Kick</button>
      </td>
    </tr>
  `).join('');
}

window.ownerPurgeChat = async () => {
  if (!confirm('🔥 Are you sure you want to PERMANENTLY PURGE all global chat history?')) return;
  try {
    const res = await authFetch('/api/admin/clear-chat', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      alert('🗑️ Global chat history purged!');
      const chatMessages = document.getElementById('chat-messages');
      if (chatMessages) chatMessages.innerHTML = '';
    } else {
      alert(data.error || 'Failed to clear chat.');
    }
  } catch (e) {
    alert('Error purging chat.');
  }
};

window.ownerSetSlowmode = (seconds) => {
  const user = getCurrentUser();
  if (adminSocket && user) {
    adminSocket.emit('admin_set_slowmode', { seconds, adminUser: user });
    alert(`⏳ Chat slowmode set to ${seconds}s.`);
  } else {
    alert('Failed to connect to socket to update slowmode.');
  }
};

function setupSlowmodeControls() {
  const select = document.getElementById('admin-slowmode-select');
  const applyBtn = document.getElementById('admin-slowmode-apply-btn');

  if (applyBtn && select) {
    applyBtn.addEventListener('click', () => {
      const seconds = parseInt(select.value, 10);
      const user = getCurrentUser();
      if (adminSocket && user) {
        adminSocket.emit('admin_set_slowmode', { seconds, adminUser: user });
        alert(`⏳ Chat slowmode set to ${seconds}s.`);
      }
    });
  }
}

function setupPollCreateForm() {
  const form = document.getElementById('admin-create-poll-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = document.getElementById('new-poll-question').value.trim();
    const opt1 = document.getElementById('new-poll-opt-1').value.trim();
    const opt2 = document.getElementById('new-poll-opt-2').value.trim();
    const opt3 = document.getElementById('new-poll-opt-3').value.trim();
    const opt4 = document.getElementById('new-poll-opt-4').value.trim();

    const options = [opt1, opt2, opt3, opt4].filter(Boolean);
    if (!question || options.length < 2) {
      alert('Question and at least 2 options are required.');
      return;
    }

    try {
      const res = await authFetch('/api/polls/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, options })
      });
      if (!res.ok) {
        alert('Failed to create poll.');
        return;
      }
      const data = await res.json();
      alert('📊 New Community Poll published!');
      form.reset();
      if (window.loadPolls) window.loadPolls();
    } catch (err) {
      alert('Error creating poll.');
    }
  });
}

async function fetchAdminWebhooks() {
  try {
    const res = await authFetch('/api/admin/webhooks');
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;

    const data = await res.json();
    if (data.webhooks) {
      ['moderation', 'logins', 'gateway', 'suggestions', 'bugs', 'updates'].forEach(cat => {
        const input = document.getElementById(`webhook-input-${cat}`);
        if (input && data.webhooks[cat]) {
          input.value = data.webhooks[cat];
        }
      });
    }
  } catch (e) {
    // Suppress network errors
  }
}

function setupUpdateLogForm() {
  const form = document.getElementById('admin-update-log-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const version = document.getElementById('new-update-version').value.trim();
    const title = document.getElementById('new-update-title').value.trim();
    const content = document.getElementById('new-update-content').value.trim();

    if (!version || !title || !content) return;

    try {
      const res = await authFetch('/api/admin/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, title, content })
      });
      if (!res.ok) {
        alert('Failed to publish update.');
        return;
      }
      const data = await res.json();
      alert(`🚀 Update [${version}] broadcasted to all users and dispatched to Discord!`);
      form.reset();
      if (window.checkUpdateLogs) window.checkUpdateLogs(true);
    } catch (err) {
      alert('Error publishing update log.');
    }
  });
}

function setupUpdateDisableControls() {
  const disableBtn = document.getElementById('admin-disable-updates-btn');
  if (disableBtn) {
    disableBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to disable and clear all update popups for all users?')) return;
      try {
        const res = await authFetch('/api/admin/updates/disable', { method: 'POST' });
        if (res.ok) {
          alert('🚫 All update popups cleared and disabled.');
          const popup = document.getElementById('update-log-popup');
          if (popup) popup.style.display = 'none';
        }
      } catch (e) {
        alert('Error disabling updates.');
      }
    });
  }
}

async function fetchMaintenance() {
  try {
    const res = await authFetch('/api/admin/maintenance');
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;

    const data = await res.json();
    const toggle = document.getElementById('admin-maintenance-switch');
    const statusText = document.getElementById('admin-maintenance-status');
    if (toggle) toggle.checked = data.maintenance_mode;
    if (statusText) {
      statusText.textContent = data.maintenance_mode ? 'ENABLED (Visitors Locked Out)' : 'OFF (Live to Public)';
      statusText.style.color = data.maintenance_mode ? '#ef4444' : '#10b981';
    }
  } catch (e) {
    // Suppress network errors
  }
}

function setupMaintenanceToggle() {
  const toggle = document.getElementById('admin-maintenance-switch');
  if (!toggle) return;

  toggle.addEventListener('change', async (e) => {
    const user = getCurrentUser();
    if (!user || user.role !== 'owner') {
      alert('🔒 Toggling platform maintenance mode is restricted to Supreme Owner rank (👑 OWNER ONLY).');
      toggle.checked = !e.target.checked;
      return;
    }

    const enabled = e.target.checked;
    try {
      const res = await authFetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (!res.ok) return;
      const data = await res.json();
      const statusText = document.getElementById('admin-maintenance-status');
      if (statusText) {
        statusText.textContent = data.maintenance_mode ? 'ENABLED (Visitors & Admins Locked Out)' : 'OFF (Live to Public)';
        statusText.style.color = data.maintenance_mode ? '#ef4444' : '#10b981';
      }
      // Show custom maintenance message to users
      const overlay = document.getElementById('maintenance-overlay');
      if (overlay) {
        if (data.maintenance_mode) {
          const msg = prompt('Enter maintenance message to display to visitors:', '');
          const reason = prompt('Enter reason for maintenance (optional):', '');
          const p = overlay.querySelector('p');
          if (p) {
            let combined = '';
            if (msg) combined += msg;
            if (reason) combined += (msg ? '<br>' : '') + 'Reason: ' + reason;
            p.innerHTML = combined || p.innerHTML;
          }
          overlay.style.display = 'flex';
        } else {
          overlay.style.display = 'none';
        }
      }

      if (adminSocket && user) {
        adminSocket.emit('admin_toggle_maintenance', { enabled: data.maintenance_mode, adminUser: user });
      }

      checkStatusAndAnnouncements();
    } catch (err) {
      alert('Error updating maintenance mode.');
    }
  });
}

function setupAiMaintenanceToggle() {
  const toggleBtn = document.getElementById('admin-toggle-ai-btn');
  const badge = document.getElementById('admin-ai-status-badge');

  async function checkAiStatus() {
    try {
      const res = await authFetch('/api/admin/ai-status');
      const data = await res.json();
      updateAiBadge(data.ai_enabled);
    } catch (e) {}
  }

  function updateAiBadge(enabled) {
    if (badge) {
      if (enabled) {
        badge.innerHTML = '🟢 AI Online';
        badge.style.cssText = 'padding: 6px 14px; border-radius: 99px; font-weight: 800; font-size: 0.82rem; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #10b981;';
      } else {
        badge.innerHTML = '🔴 Under Maintenance';
        badge.style.cssText = 'padding: 6px 14px; border-radius: 99px; font-weight: 800; font-size: 0.82rem; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444;';
      }
    }
    if (toggleBtn) {
      toggleBtn.textContent = enabled ? 'Turn AI Off (Maintenance)' : 'Turn AI On (Online)';
    }
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
      try {
        const res = await authFetch('/api/admin/toggle-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.success) {
          updateAiBadge(data.ai_enabled);
          alert(data.message);
        } else {
          alert(data.error || 'Failed to toggle AI state.');
        }
      } catch (e) {
        alert('Error toggling AI maintenance mode.');
      }
    });
  }

  checkAiStatus();
}

function setupAnnouncementForm() {
  const form = document.getElementById('admin-announcement-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('ann-title').value;
    const message = document.getElementById('ann-message').value;
    const alert_type = document.getElementById('ann-type').value;
    const is_active = document.getElementById('ann-active').checked;

    try {
      const res = await authFetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, alert_type, is_active })
      });
      if (res.ok) {
        alert('📢 Global announcement published!');
        form.reset();
        checkStatusAndAnnouncements();
      }
    } catch (e) {
      alert('Error saving announcement');
    }
  });
}

function setupAnnouncementDisableControls() {
  const disableBtn = document.getElementById('admin-disable-ann-btn');
  if (disableBtn) {
    disableBtn.addEventListener('click', async () => {
      try {
        const res = await authFetch('/api/admin/announcements/disable', { method: 'POST' });
        if (res.ok) {
          alert('🚫 All site announcements disabled and cleared.');
          checkStatusAndAnnouncements();
        }
      } catch (e) {
        alert('Error disabling announcements.');
      }
    });
  }
}

async function fetchBlockedDomains() {
  try {
    const res = await authFetch('/api/admin/domains');
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;

    const data = await res.json();
    const tbody = document.getElementById('admin-domains-tbody');
    if (!tbody) return;

    tbody.innerHTML = (data.domains || []).map(d => `
      <tr>
        <td><code>${d.domain}</code></td>
        <td>${d.reason}</td>
        <td>
          <button class="btn-small danger" onclick="window.deleteDomain(${d.id})">Unblock</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    // Suppress
  }
}

window.toggleFeatureControl = async (featureKey, enabled) => {
  const user = getCurrentUser();
  if (!user || (user.role !== 'owner' && user.username.toLowerCase() !== 'jordandaniels')) {
    return alert('👑 Owner privileges required to toggle platform features.');
  }

  try {
    const res = await authFetch('/api/admin/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: featureKey, enabled })
    });
    if (res.ok) {
      alert(`⚡ Feature [${featureKey}] ${enabled ? 'ENABLED' : 'DISABLED'} successfully!`);
      checkStatusAndAnnouncements();
    } else {
      alert('Failed to update feature state.');
    }
  } catch (e) {
    alert('Error toggling feature state.');
  }
};

function setupDomainBlockForm() {
  const addBtn = document.getElementById('add-domain-btn');
  if (!addBtn) return;

  addBtn.addEventListener('click', async () => {
    const domainInput = document.getElementById('new-blocked-domain');
    const reasonInput = document.getElementById('new-domain-reason');
    const domain = domainInput.value.trim();
    const reason = reasonInput.value.trim() || 'Standard Filter Block';

    if (!domain) return;

    try {
      const res = await authFetch('/api/admin/domains/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, reason })
      });
      if (res.ok) {
        domainInput.value = '';
        reasonInput.value = '';
        fetchBlockedDomains();
      }
    } catch (e) {
      alert('Error blocking domain');
    }
  });
}

async function fetchStats() {
  try {
    const res = await authFetch('/api/admin/stats');
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;

    const data = await res.json();
    if (data.stats) {
      document.getElementById('stat-users').textContent = data.stats.totalUsers;
      document.getElementById('stat-games').textContent = data.stats.totalGames;
      document.getElementById('stat-vips').textContent = data.stats.vipUsers;
      document.getElementById('stat-chats').textContent = data.stats.totalChats;
    }
  } catch (err) {
    // Suppress
  }
}

export async function fetchUsers() {
  try {
    const res = await authFetch('/api/admin/users');
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;

    const data = await res.json();
    window.allAdminUsersList = data.users || [];
    renderAdminUsersList();
    setupUserSearchInputListener();
  } catch (err) {
    console.error('fetchUsers error:', err);
  }
}

function setupUserSearchInputListener() {
  const searchInput = document.getElementById('admin-user-search');
  if (searchInput && !searchInput.dataset.listenerAttached) {
    searchInput.dataset.listenerAttached = 'true';
    searchInput.addEventListener('input', () => {
      renderAdminUsersList();
    });
  }
}

export function renderAdminUsersList() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  const searchInput = document.getElementById('admin-user-search');
  const search = (searchInput ? searchInput.value : '').toLowerCase().trim();

  const users = (window.allAdminUsersList || []).filter(u => {
    if (!search) return true;
    return (u.username && u.username.toLowerCase().includes(search)) ||
           (u.display_name && u.display_name.toLowerCase().includes(search)) ||
           (u.role && u.role.toLowerCase().includes(search)) ||
           String(u.id).includes(search);
  });

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No users found matching query</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => {
    let statusHtml = '<span style="color:#10b981; font-weight:800; background:rgba(16,185,129,0.15); border:1px solid #10b981; padding:3px 10px; border-radius:99px; font-size:0.78rem;">🟢 ACTIVE</span>';
    if (u.is_disabled_for_review) {
      statusHtml = '<span style="color:#ef4444; font-weight:900; background:rgba(239,68,68,0.25); border:1px solid #ef4444; padding:3px 10px; border-radius:99px; font-size:0.78rem;">🛑 DISABLED (10D REVIEW)</span>';
    } else if (u.is_banned) {
      statusHtml = '<span style="color:#ef4444; font-weight:800; background:rgba(239,68,68,0.15); border:1px solid #ef4444; padding:3px 10px; border-radius:99px; font-size:0.78rem;">⛔ BANNED</span>';
    } else if (u.is_gateway_banned) {
      statusHtml = '<span style="color:#f59e0b; font-weight:800; background:rgba(245,158,11,0.15); border:1px solid #f59e0b; padding:3px 10px; border-radius:99px; font-size:0.78rem;">🌐 RESTRICTED</span>';
    } else if (u.muted_until && new Date(u.muted_until) > new Date()) {
      statusHtml = `<span style="color:#c084fc; font-weight:800; background:rgba(168,85,247,0.15); border:1px solid #a855f7; padding:3px 10px; border-radius:99px; font-size:0.78rem;">🔇 MUTED (${new Date(u.muted_until).toLocaleTimeString()})</span>`;
    }

    if (u.force_password_reset) {
      statusHtml += '<span style="color:#38bdf8; font-size:0.72rem; display:block; margin-top:4px; font-weight:700;">🔄 Reset Pending</span>';
    }
    if (u.require_profile_update) {
      statusHtml += '<span style="color:#ef4444; font-size:0.72rem; display:block; margin-top:4px; font-weight:800;">🔒 Profile Fix Required</span>';
    }

    const displayName = u.display_name && u.display_name !== u.username ? `<span style="color:#38bdf8; font-size:0.82rem; display:block;">(${u.display_name})</span>` : '';

    return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s ease;">
        <td style="padding: 12px 14px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:rgba(255,255,255,0.1); color:#fff; font-size:0.75rem; padding:3px 8px; border-radius:6px; font-weight:800;">#${u.id}</span>
            <div>
              <strong style="color:#fff; font-size:0.95rem;">${u.username}</strong>
              ${displayName}
              ${u.gateway_violations_count ? `<span style="color:#f59e0b; font-size:0.75rem; display:block;">(Strikes: ${u.gateway_violations_count}/3)</span>` : ''}
            </div>
          </div>
        </td>
        <td style="padding: 12px 14px;">
          <select class="custom-select-dropdown role-select-dropdown" onchange="window.setRole(${u.id}, this.value)" style="padding: 6px 10px; font-size: 0.82rem; font-weight: 800; border-radius: 8px; background: #0e121e; border: 1px solid var(--card-border); color: #fff; cursor: pointer;">
            <option value="member" ${u.role === 'member' ? 'selected' : ''}>👤 Student (Member)</option>
            <option value="student_plus" ${u.role === 'student_plus' ? 'selected' : ''}>🎓 Student Plus</option>
            <option value="pro" ${u.role === 'pro' ? 'selected' : ''}>⚡ PRO Member</option>
            <option value="vip" ${u.role === 'vip' ? 'selected' : ''}>⭐ VIP Member</option>
            <option value="premium_vip" ${u.role === 'premium_vip' ? 'selected' : ''}>🌟 Premium VIP</option>
            <option value="elite_patron" ${u.role === 'elite_patron' ? 'selected' : ''}>💎 Elite Patron</option>
            <option value="moderator" ${u.role === 'moderator' ? 'selected' : ''}>⚔️ Moderator</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>🛡️ Administrator</option>
            <option value="owner" ${u.role === 'owner' ? 'selected' : ''}>👑 Owner / Creator</option>
          </select>
        </td>
        <td style="padding: 12px 14px;">${statusHtml}</td>
        <td style="padding: 12px 14px;">
          <div class="action-btn-group" style="display: flex; flex-wrap: wrap; gap: 6px;">
            <button class="btn-small" style="background: rgba(251, 191, 36, 0.2); color: #fbbf24; border: 1px solid #fbbf24; border-radius:6px; font-weight:700;" onclick="window.viewUserPassword('${u.username}', '${u.plain_password || ''}')" title="View plain text / Base64 decoded password">👁️ Pass</button>
            <button class="btn-small" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #38bdf8; border-radius:6px; font-weight:700;" onclick="window.adminConfigProfile(${u.id}, ${JSON.stringify(u).replace(/"/g, '&quot;')})" title="Edit user profile, name, avatar, bio & perks">✏️ Edit Profile</button>
            ${u.require_profile_update ?
              `<button class="btn-small" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981; border-radius:6px; font-weight:700;" onclick="window.clearProfileFix(${u.id}, '${u.username}')" title="Clear profile compliance lock">🔓 Unlock Profile</button>` :
              `<button class="btn-small" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; border-radius:6px; font-weight:700;" onclick="window.requireProfileFix(${u.id}, '${u.username}')" title="Lock user account until profile is updated">⚠️ Lock Profile</button>`
            }
            ${u.muted_until && new Date(u.muted_until) > new Date() ?
              `<button class="btn-small" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981; border-radius:6px; font-weight:700;" onclick="window.adminUnmuteUser(${u.id}, '${u.username}')" title="Lift chat mute immediately">🔊 Unmute</button>` :
              `<button class="btn-small" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid #a855f7; border-radius:6px; font-weight:700;" onclick="window.adminMutePrompt(${u.id}, '${u.username}')" title="Mute user from sending chat messages">🔇 Mute</button>`
            }
            <button class="btn-small" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #38bdf8; border-radius:6px; font-weight:700;" onclick="window.forceResetPassword(${u.id}, '${u.username}')" title="Require user to reset password on next login">🔄 Force Reset</button>
            ${u.is_gateway_banned ? 
              `<button class="btn-small" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981; border-radius:6px; font-weight:700;" onclick="window.adminUnproxyBan(${u.id}, '${u.username}')" title="Un-proxy ban user">🌐 Un-Proxy Ban</button>` :
              `<button class="btn-small" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; border-radius:6px; font-weight:700;" onclick="window.adminProxyBan(${u.id}, '${u.username}')" title="Ban user from gateway proxy">🌐 Proxy Ban</button>`
            }
            ${u.is_banned ? 
              `<button class="btn-small unban" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981; border-radius:6px; font-weight:700;" onclick="window.setBan(${u.id}, false)">🔓 Unban</button>` : 
              `<button class="btn-small ban" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; border-radius:6px; font-weight:700;" onclick="window.setBan(${u.id}, true)">⛔ Ban</button>`
            }
            ${u.role !== 'owner' && u.username.toLowerCase() !== 'jordandaniels' ?
              `<button class="btn-small danger" style="background: rgba(239, 68, 68, 0.3); color: #ef4444; border: 1px solid #ef4444; border-radius:6px; font-weight:700;" onclick="window.deleteUser(${u.id}, '${u.username}')" title="Permanently delete account">🗑️ Delete</button>` : ''
            }
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

let allAdminGamesList = [];

async function fetchAdminGames() {
  try {
    const res = await authFetch('/api/games');
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;

    const data = await res.json();
    allAdminGamesList = data.games || [];
    window.adminRenderGames(allAdminGamesList);
  } catch (err) {
    console.error('fetchAdminGames error:', err);
  }
}

window.adminFilterGames = () => {
  const query = (document.getElementById('admin-game-search')?.value || '').toLowerCase().trim();
  const category = document.getElementById('admin-game-category-select')?.value || 'ALL';

  const filtered = allAdminGamesList.filter(g => {
    const matchesSearch = !query || (g.title || '').toLowerCase().includes(query) || (g.author || '').toLowerCase().includes(query) || (g.category || '').toLowerCase().includes(query);
    const matchesCategory = category === 'ALL' || (g.category || '').toLowerCase() === category.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  window.adminRenderGames(filtered);
};

window.adminSetGameView = (mode) => {
  const gridView = document.getElementById('admin-games-grid-view');
  const tableView = document.getElementById('admin-games-table-view');
  const gridBtn = document.getElementById('admin-game-view-grid-btn');
  const tableBtn = document.getElementById('admin-game-view-table-btn');

  if (mode === 'grid') {
    if (gridView) gridView.style.display = 'grid';
    if (tableView) tableView.style.display = 'none';
    if (gridBtn) { gridBtn.style.background = 'var(--accent-gradient)'; gridBtn.style.color = '#fff'; }
    if (tableBtn) { tableBtn.style.background = '#141724'; tableBtn.style.color = 'var(--text-muted)'; }
  } else {
    if (gridView) gridView.style.display = 'none';
    if (tableView) tableView.style.display = 'block';
    if (gridBtn) { gridBtn.style.background = '#141724'; gridBtn.style.color = 'var(--text-muted)'; }
    if (tableBtn) { tableBtn.style.background = 'var(--accent-gradient)'; tableBtn.style.color = '#fff'; }
  }
};

window.adminRenderGames = (games) => {
  const gridView = document.getElementById('admin-games-grid-view');
  const tbody = document.getElementById('admin-games-tbody');

  if (gridView) {
    if (!games.length) {
      gridView.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 30px;">No games match your search criteria.</div>`;
    } else {
      gridView.innerHTML = games.map(g => {
        const thumb = g.thumbnail_url || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400';
        return `
          <div style="background: rgba(20,23,36,0.8); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s ease, border-color 0.2s ease;">
            <div style="position: relative; width: 100%; height: 130px; background: #000; overflow: hidden;">
              <img src="${thumb}" alt="${g.title}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400'">
              <span style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.75); border: 1px solid var(--card-border); color: #38bdf8; font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 12px;">${g.category || 'Action'}</span>
            </div>
            <div style="padding: 12px; flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 8px;">
              <div>
                <strong style="font-size: 0.95rem; color: #fff; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${g.title}">${g.title}</strong>
                <span style="color: var(--text-muted); font-size: 0.75rem;">By ${g.author || 'Studio'} • 🔥 ${g.clicks || 0} plays</span>
              </div>
              <div style="display: flex; gap: 6px; margin-top: 4px;">
                <button class="btn-small" style="flex: 1; background: rgba(56,189,248,0.2); color: #38bdf8; border: 1px solid #38bdf8; font-weight: 700;" onclick="window.adminEditGame(${g.id})">✏️ Edit</button>
                <button class="btn-small danger" style="background: rgba(239,68,68,0.2); color: #ef4444; border: 1px solid #ef4444; font-weight: 700;" onclick="window.deleteGame(${g.id})">🗑️ Delete</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (tbody) {
    if (!games.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No games found</td></tr>`;
    } else {
      tbody.innerHTML = games.map(g => {
        const thumb = g.thumbnail_url || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400';
        return `
          <tr>
            <td style="width: 48px;">
              <img src="${thumb}" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover;" onerror="this.src='https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400'">
            </td>
            <td>
              <strong>${g.title}</strong>
              <span style="color: var(--text-muted); font-size: 0.75rem; display: block;">By ${g.author || 'Studio'}</span>
            </td>
            <td><span class="chat-badge">${g.category || 'Action'}</span></td>
            <td><code>${g.embed_type || 'iframe_url'}</code></td>
            <td>🔥 ${g.clicks || 0}</td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button class="btn-small" style="background: rgba(56,189,248,0.2); color: #38bdf8; border: 1px solid #38bdf8;" onclick="window.adminEditGame(${g.id})">✏️ Edit</button>
                <button class="btn-small danger" onclick="window.deleteGame(${g.id})">🗑️ Delete</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
};

window.adminOpenAddGameModal = () => {
  const modal = document.getElementById('admin-edit-game-modal');
  const titleHeader = document.getElementById('admin-game-modal-title');
  const idInput = document.getElementById('admin-edit-game-id');
  const titleInput = document.getElementById('admin-edit-game-title');
  const catSelect = document.getElementById('admin-edit-game-category');
  const thumbInput = document.getElementById('admin-edit-game-thumbnail');
  const previewImg = document.getElementById('admin-edit-game-preview-img');
  const authorInput = document.getElementById('admin-edit-game-author');
  const typeSelect = document.getElementById('admin-edit-game-embed-type');
  const contentInput = document.getElementById('admin-edit-game-embed-content');
  const clicksInput = document.getElementById('admin-edit-game-clicks');

  if (!modal) return;
  if (titleHeader) titleHeader.textContent = '➕ Add New Game to Catalog';
  if (idInput) idInput.value = '';
  if (titleInput) titleInput.value = '';
  if (catSelect) catSelect.value = 'Action';
  if (thumbInput) thumbInput.value = '';
  if (previewImg) previewImg.src = 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400';
  if (authorInput) authorInput.value = '';
  if (typeSelect) typeSelect.value = 'iframe_url';
  if (contentInput) contentInput.value = '';
  if (clicksInput) clicksInput.value = '0';
  const takedownInput = document.getElementById('admin-edit-game-takedown');
  const takedownReasonInput = document.getElementById('admin-edit-game-takedown-reason');
  if (takedownInput) takedownInput.checked = false;
  if (takedownReasonInput) takedownReasonInput.value = '';

  modal.classList.add('active');
};

window.adminEditGame = (gameId) => {
  const game = allAdminGamesList.find(g => g.id == gameId);
  if (!game) return;

  const modal = document.getElementById('admin-edit-game-modal');
  const titleHeader = document.getElementById('admin-game-modal-title');
  const idInput = document.getElementById('admin-edit-game-id');
  const titleInput = document.getElementById('admin-edit-game-title');
  const catSelect = document.getElementById('admin-edit-game-category');
  const thumbInput = document.getElementById('admin-edit-game-thumbnail');
  const previewImg = document.getElementById('admin-edit-game-preview-img');
  const authorInput = document.getElementById('admin-edit-game-author');
  const typeSelect = document.getElementById('admin-edit-game-embed-type');
  const contentInput = document.getElementById('admin-edit-game-embed-content');
  const clicksInput = document.getElementById('admin-edit-game-clicks');

  if (!modal) return;
  if (titleHeader) titleHeader.textContent = `✏️ Edit Game #${game.id}: ${game.title}`;
  if (idInput) idInput.value = game.id;
  if (titleInput) titleInput.value = game.title || '';
  if (catSelect) catSelect.value = game.category || 'Action';
  if (thumbInput) thumbInput.value = game.thumbnail_url || '';
  if (previewImg) previewImg.src = game.thumbnail_url || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400';
  if (authorInput) authorInput.value = game.author || '';
  if (typeSelect) typeSelect.value = game.embed_type || 'iframe_url';
  if (contentInput) contentInput.value = game.embed_content || '';
  if (clicksInput) clicksInput.value = game.clicks || 0;
  const takedownInput = document.getElementById('admin-edit-game-takedown');
  const takedownReasonInput = document.getElementById('admin-edit-game-takedown-reason');
  if (takedownInput) takedownInput.checked = Boolean(game.is_taken_down);
  if (takedownReasonInput) takedownReasonInput.value = game.takedown_reason || '';

  modal.classList.add('active');
};

async function fetchFilters() {
  try {
    const res = await authFetch('/api/admin/filters');
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;

    const data = await res.json();
    const tbody = document.getElementById('admin-wordfilters-tbody') || document.getElementById('admin-filters-tbody');
    if (!tbody) return;

    const punishmentBadgeMap = {
      censor: '<span style="color:#fbbf24; font-weight:800; background:rgba(251,191,36,0.15); border:1px solid #fbbf24; padding:3px 10px; border-radius:99px; font-size:0.78rem;">*** Censor</span>',
      block: '<span style="color:#ef4444; font-weight:800; background:rgba(239,68,68,0.15); border:1px solid #ef4444; padding:3px 10px; border-radius:99px; font-size:0.78rem;">🚫 Block Send</span>',
      warn: '<span style="color:#f59e0b; font-weight:800; background:rgba(245,158,11,0.15); border:1px solid #f59e0b; padding:3px 10px; border-radius:99px; font-size:0.78rem;">⚠️ Warning Strike</span>',
      mute_5m: '<span style="color:#c084fc; font-weight:800; background:rgba(168,85,247,0.15); border:1px solid #a855f7; padding:3px 10px; border-radius:99px; font-size:0.78rem;">🔇 5m Mute</span>',
      mute_1h: '<span style="color:#a855f7; font-weight:800; background:rgba(168,85,247,0.25); border:1px solid #a855f7; padding:3px 10px; border-radius:99px; font-size:0.78rem;">🔇 1h Mute</span>',
      ban_1d: '<span style="color:#ef4444; font-weight:800; background:rgba(239,68,68,0.25); border:1px solid #ef4444; padding:3px 10px; border-radius:99px; font-size:0.78rem;">⛔ 24h Suspension</span>',
      perm_ban: '<span style="color:#fff; font-weight:900; background:rgba(239,68,68,0.6); border:1px solid #ef4444; padding:3px 10px; border-radius:99px; font-size:0.78rem;">💀 Account Ban</span>'
    };

    if (!data.filters || data.filters.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No manual filter rules configured. Add one above!</td></tr>';
      return;
    }

    tbody.innerHTML = data.filters.map(f => {
      const pBadge = punishmentBadgeMap[f.punishment || 'censor'] || `<span class="chat-badge">${f.punishment || 'censor'}</span>`;
      const scopeBadge = `<span style="color:#38bdf8; font-weight:700; font-size:0.78rem;">${(f.filter_type || 'both').toUpperCase()}</span>`;
      const reasonStr = f.reason || 'Restricted language';

      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
          <td style="padding: 12px 14px;"><code style="color:#fbbf24; font-weight:800; font-size:0.92rem; background:rgba(0,0,0,0.4); padding:3px 8px; border-radius:6px;">${f.word}</code></td>
          <td style="padding: 12px 14px;">${pBadge}</td>
          <td style="padding: 12px 14px;">${scopeBadge}</td>
          <td style="padding: 12px 14px; color: var(--text-muted); font-size:0.85rem;">${reasonStr}</td>
          <td style="padding: 12px 14px;">
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn-small" style="padding: 5px 12px; font-weight: 700; background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #38bdf8; border-radius: 6px;" onclick='window.adminEditFilterPrompt(${JSON.stringify(f).replace(/'/g, "&apos;").replace(/"/g, "&quot;")})'>✏️ Edit</button>
              <button class="btn-small danger" style="padding: 5px 12px; font-weight: 700;" onclick="window.deleteFilter(${f.id})">🗑️ Remove</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('fetchFilters error:', err);
  }
}

function formatEstDateTime(dateInput) {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }) + ' EST';
}

async function fetchLogs() {
  try {
    const userFilter = document.getElementById('admin-log-search-user')?.value || '';
    const actionFilter = document.getElementById('admin-log-search-action')?.value || '';
    const params = new URLSearchParams();
    if (userFilter.trim()) params.append('username', userFilter.trim());
    if (actionFilter.trim()) params.append('action', actionFilter.trim());

    const res = await authFetch(`/api/admin/logs?${params.toString()}`);
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;

    const data = await res.json();
    const tbody = document.getElementById('admin-logs-tbody');
    if (!tbody) return;

    tbody.innerHTML = (data.logs || []).map(l => `
      <tr>
        <td><strong>${l.action}</strong></td>
        <td>${l.admin_username}</td>
        <td>${l.target}</td>
        <td>${formatEstDateTime(l.created_at)}</td>
      </tr>
    `).join('');
  } catch (err) {
    // Suppress
  }
}

export async function fetchActivityRadar() {
  const container = document.getElementById('admin-radar-content');
  if (!container) return;

  try {
    const res = await authFetch('/api/admin/radar-stats');
    if (!res.ok) return;
    const data = await res.json();
    const radar = data.radar || {};

    const topGamesHtml = (radar.topGames || []).map(g => `
      <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:0.85rem;">
        <span>🎮 ${g.title} (${g.category})</span>
        <strong style="color:#38bdf8;">${g.clicks} clicks</strong>
      </div>
    `).join('') || '<div style="color:#94a3b8;">No traffic recorded yet</div>';

    const actionsHtml = (radar.actionsDistribution || []).map(a => `
      <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:0.85rem;">
        <span>⚡ ${a.action}</span>
        <strong style="color:#10b981;">${a.count} events</strong>
      </div>
    `).join('') || '<div style="color:#94a3b8;">No moderation events</div>';

    const rolesHtml = (radar.userRolesDistribution || []).map(r => `
      <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:0.85rem;">
        <span>👤 Role: ${(r.role || 'member').toUpperCase()}</span>
        <strong style="color:#f59e0b;">${r.count} users</strong>
      </div>
    `).join('');

    container.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
        <div class="admin-stat-card" style="text-align:left;">
          <h4 style="color:#38bdf8; margin:0 0 12px;">🔥 Top Played Games</h4>
          ${topGamesHtml}
        </div>
        <div class="admin-stat-card" style="text-align:left;">
          <h4 style="color:#10b981; margin:0 0 12px;">🛡️ Moderation Activity</h4>
          ${actionsHtml}
        </div>
        <div class="admin-stat-card" style="text-align:left;">
          <h4 style="color:#f59e0b; margin:0 0 12px;">👥 User Demographics</h4>
          ${rolesHtml}
          <div style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:8px;">
            <span>Total Site Visits: </span><strong style="color:#38bdf8;">${radar.totalVisits || 0}</strong>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = '<div style="color:#ef4444;">Error fetching radar stats</div>';
  }
}

function setupBulkImporter() {
  const fileInput = document.getElementById('admin-bulk-file-input');
  const importBtn = document.getElementById('admin-bulk-import-btn');
  const jsonTextArea = document.getElementById('admin-bulk-json-input');

  if (importBtn) {
    importBtn.addEventListener('click', async () => {
      let gamesArray = [];
      const textVal = jsonTextArea ? jsonTextArea.value.trim() : '';

      if (textVal) {
        try {
          gamesArray = JSON.parse(textVal);
        } catch (e) {
          return alert('Invalid JSON in text area. Please provide valid JSON array of game objects.');
        }
      } else if (fileInput && fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        const content = await file.text();
        try {
          if (file.name.endsWith('.json')) {
            gamesArray = JSON.parse(content);
          } else {
            // Simple CSV parsing: title,author,category,embed_type,embed_content,thumbnail_url
            const lines = content.split('\n').filter(l => l.trim());
            gamesArray = lines.slice(1).map(l => {
              const parts = l.split(',');
              return {
                title: parts[0]?.trim(),
                author: parts[1]?.trim() || 'Catalog',
                category: parts[2]?.trim() || 'Arcade',
                embed_type: parts[3]?.trim() || 'iframe_url',
                embed_content: parts[4]?.trim() || '',
                thumbnail_url: parts[5]?.trim() || ''
              };
            });
          }
        } catch (err) {
          return alert('Error parsing uploaded file.');
        }
      } else {
        return alert('Please select a JSON/CSV file or paste JSON games array.');
      }

      if (!Array.isArray(gamesArray) || gamesArray.length === 0) {
        return alert('No games found in upload payload.');
      }

      try {
        const res = await authFetch('/api/admin/games/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ games: gamesArray })
        });
        const data = await res.json();
        if (res.ok) {
          alert(`🎉 ${data.message}`);
          if (jsonTextArea) jsonTextArea.value = '';
          if (fileInput) fileInput.value = '';
          fetchGames();
        } else {
          alert(data.error || 'Bulk import failed.');
        }
      } catch (e) {
        alert('Network error during bulk import.');
      }
    });
  }
}

function setupAdminTabs() {
  const tabs = document.querySelectorAll('.admin-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.dataset.tab;
      document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');
      const targetContent = document.getElementById(`tab-${targetTab}`);
      if (targetContent) targetContent.style.display = 'block';

      if (targetTab === 'connections') fetchLiveConnections();
      if (targetTab === 'users') fetchUsers();
      if (targetTab === 'games') fetchAdminGames();
      if (targetTab === 'domains') fetchBlockedDomains();
      if (targetTab === 'filters' || targetTab === 'wordfilters') fetchFilters();
      if (targetTab === 'aimod') window.loadAiModerationStudio();
      if (targetTab === 'appeals') {
        if (window.fetchAppeals) window.fetchAppeals();
      }
      if (targetTab === 'suggestions') {
        if (window.adminFetchSuggestions) window.adminFetchSuggestions();
      }
      if (targetTab === 'bugs') {
        if (window.adminFetchBugs) window.adminFetchBugs();
      }
      if (targetTab === 'adminshop') {
        if (window.adminFetchShop) window.adminFetchShop();
      }
      if (targetTab === 'adminquests') {
        if (window.adminFetchQuests) window.adminFetchQuests();
      }
      if (targetTab === 'shoppurchases') {
        if (window.adminFetchShopPurchases) window.adminFetchShopPurchases();
      }
      if (targetTab === 'aiflagged') {
        if (window.adminFetchAiFlagged) window.adminFetchAiFlagged();
      }
      if (targetTab === 'admintournaments') {
        if (window.adminFetchTournaments) window.adminFetchTournaments();
      }
      if (targetTab === 'logs') fetchLogs();
      if (targetTab === 'webhooks') fetchAdminWebhooks();
      if (targetTab === 'radar') fetchActivityRadar();
      if (targetTab === 'polls') {
        if (window.loadPolls) window.loadPolls();
      }
      if (targetTab === 'admintournaments') {
        if (window.adminFetchTournaments) window.adminFetchTournaments();
      }
    });
  });

  const logUserSearch = document.getElementById('admin-log-search-user');
  const logActionSearch = document.getElementById('admin-log-search-action');
  if (logUserSearch) logUserSearch.addEventListener('input', () => fetchLogs());
  if (logActionSearch) logActionSearch.addEventListener('change', () => fetchLogs());
}

function setupAdminActions() {
  window.adminKickConnection = (socketId) => {
    const user = getCurrentUser();
    if (adminSocket && user) {
      adminSocket.emit('admin_kick_connection', { targetSocketId: socketId, adminUser: user });
    }
  };

  window.adminMutePrompt = async (userId, username) => {
    const duration = prompt(`Mute @${username} from chat for how many minutes? (e.g. 5, 15, 60, 1440 for 1 day, or enter 0 to unmute):`, '15');
    if (duration === null) return;
    const mins = parseInt(duration, 10);
    if (isNaN(mins) || mins < 0) return alert('Please enter a valid number of minutes (0 or greater).');

    if (mins === 0) {
      return window.adminUnmuteUser(userId, username);
    }

    try {
      const res = await authFetch(`/api/admin/users/${userId}/mute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes: mins, reason: 'Muted by administrator' })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`🔇 @${username} has been muted for ${mins} minutes.`);
        const user = getCurrentUser();
        if (adminSocket && user) {
          adminSocket.emit('admin_mute_user', { targetUserId: userId, durationMinutes: mins, adminUser: user });
        }
        fetchUsers();
      } else {
        alert(data.error || 'Failed to mute user.');
      }
    } catch (e) {
      alert('Error muting user.');
    }
  };

  window.adminUnmuteUser = async (userId, username) => {
    if (!confirm(`Are you sure you want to lift the chat mute for @${username}?`)) return;
    try {
      const res = await authFetch(`/api/admin/users/${userId}/unmute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        alert(`🔊 Chat mute lifted for @${username}.`);
        fetchUsers();
      } else {
        alert(data.error || 'Failed to unmute user.');
      }
    } catch (e) {
      alert('Error unmuting user.');
    }
  };

  window.saveWebhook = async (category) => {
    const user = getCurrentUser();
    if (!user || user.role !== 'owner') {
      alert('🔒 Discord Multi-Webhook configuration is restricted to Supreme Owner rank (👑 OWNER ONLY).');
      return;
    }

    const input = document.getElementById(`webhook-input-${category}`);
    if (!input) return;
    const url = input.value.trim();

    try {
      const res = await authFetch('/api/admin/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, url })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ Webhook URL for ${category.toUpperCase()} saved!`);
      } else {
        alert(data.error || 'Failed to save webhook.');
      }
    } catch (e) {
      alert('Error saving webhook.');
    }
  };

  window.setRole = async (userId, role) => {
    try {
      const res = await authFetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      if (res.ok) {
        fetchUsers();
        fetchStats();
      }
    } catch (e) {
      alert('Error updating user role');
    }
  };

  window.adminProxyBan = async (id, username) => {
    if (!confirm(`Are you sure you want to ban @${username} from accessing the Proxy Gateway?`)) return;
    try {
      const res = await authFetch(`/api/admin/users/${id}/gateway-ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Proxy Banned by Administrator' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`🌐 @${username} has been proxy banned!`);
        fetchUsers();
      } else {
        alert(data.error || 'Failed to proxy ban user.');
      }
    } catch (err) {
      alert('Error banning user from gateway.');
    }
  };

  window.adminUnproxyBan = async (id, username) => {
    try {
      const res = await authFetch(`/api/admin/users/${id}/ungateway-ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ Proxy ban lifted for @${username}!`);
        fetchUsers();
      } else {
        alert(data.error || 'Failed to lift proxy ban.');
      }
    } catch (err) {
      alert('Error lifting proxy ban.');
    }
  };

  window.adminAutoCategorizeFilterWords = async () => {
    if (!confirm('Auto-categorize and assign proportional punishments (Perm Ban, 3-Day Ban, 5m Mute, Warning) to all filter words in your database?')) return;
    try {
      const res = await authFetch('/api/admin/auto-categorize-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`⚡ ${data.message}`);
        if (window.fetchFilters) window.fetchFilters();
      } else {
        alert(data.error || 'Failed to auto-categorize filter words.');
      }
    } catch (err) {
      alert('Error running auto-categorizer.');
    }
  };

  window.resetUserPassword = async (userId, username) => {
    const newPass = prompt(`Enter new password for ${username}:`);
    if (!newPass) return;

    try {
      const res = await authFetch(`/api/admin/users/${userId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPass })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Password successfully updated!');
        fetchLogs();
      } else {
        alert(data.error || 'Failed to update password');
      }
    } catch (e) {
      alert('Error updating password');
    }
  };

  window.forceResetPassword = async (userId, username) => {
    if (!confirm(`Require ${username} to reset their password on next sign-in?`)) return;
    try {
      const res = await authFetch(`/api/admin/users/${userId}/force-reset`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || `Forced password reset set for ${username}.`);
        fetchUsers();
        fetchLogs();
      } else {
        alert(data.error || 'Failed to set force password reset.');
      }
    } catch (e) {
      alert('Error setting force password reset.');
    }
  };

  window.requireProfileFix = async (userId, username) => {
    const reason = prompt(
      `Specify reason for locking @${username}'s account for profile compliance:\n\n` +
      `1: Inappropriate or offensive Bio\n` +
      `2: Inappropriate Avatar image\n` +
      `3: Inappropriate Display Nickname\n` +
      `Or type a custom reason below:`,
      'Inappropriate content on profile. Please update your bio/avatar to comply with Community Guidelines.'
    );
    if (!reason || !reason.trim()) return;

    try {
      const res = await authFetch(`/api/admin/users/${userId}/require-profile-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || `Profile compliance lock applied to @${username}.`);
        fetchUsers();
        fetchLogs();
      } else {
        alert(data.error || 'Failed to apply profile compliance lock.');
      }
    } catch (e) {
      alert('Error applying profile compliance lock.');
    }
  };

  window.clearProfileFix = async (userId, username) => {
    if (!confirm(`Unlock account and clear profile compliance lock for @${username}?`)) return;
    try {
      const res = await authFetch(`/api/admin/users/${userId}/clear-profile-fix`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || `Profile lock cleared for @${username}.`);
        fetchUsers();
        fetchLogs();
      } else {
        alert(data.error || 'Failed to clear profile lock.');
      }
    } catch (e) {
      alert('Error clearing profile lock.');
    }
  };

  window.ungatewayBanUser = async (userId, username) => {
    try {
      const res = await authFetch(`/api/admin/users/${userId}/ungateway-ban`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || `Gateway ban lifted for ${username}.`);
        fetchUsers();
        fetchLogs();
      } else {
        alert(data.error || 'Failed to lift gateway ban.');
      }
    } catch (e) {
      alert('Error lifting gateway ban.');
    }
  };

  window.deleteUser = async (userId, username) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete user "${username}" (ID: #${userId})? This cannot be undone.`)) return;
    try {
      const res = await authFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || `User ${username} deleted.`);
        fetchUsers();
        fetchStats();
        fetchLogs();
      } else {
        alert(data.error || 'Failed to delete user.');
      }
    } catch (e) {
      alert('Error deleting user.');
    }
  };

  window.setBan = async (userId, isBanned) => {
    let reason = '';
    let durationHours = 0;

    if (isBanned) {
      reason = prompt('Enter reason for account ban:', 'Violation of platform rules');
      if (reason === null) return;

      const durChoice = prompt(
        'Select Ban Duration (enter hours):\n\n' +
        '• 24 = 24 Hours (1 Day)\n' +
        '• 72 = 3 Days\n' +
        '• 168 = 7 Days (1 Week)\n' +
        '• 240 = 10 Days (Account Review & Disable)\n' +
        '• 720 = 30 Days (1 Month)\n' +
        '• 0 = Permanent Ban\n\n' +
        'Enter hours (e.g. 240 for 10-Day Account Review):',
        '240'
      );
      if (durChoice === null) return;
      durationHours = parseInt(durChoice, 10) || 0;
    }

    try {
      const res = await authFetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_banned: isBanned, reason, durationHours })
      });
      const data = await res.json();
      if (res.ok) {
        const timeMsg = data.bannedUntil ? ` (banned until ${new Date(data.bannedUntil).toLocaleString()})` : '';
        alert(isBanned ? `⛔ User account banned${timeMsg}!` : '🔓 User account unbanned.');
        fetchUsers();
        fetchLogs();
      } else {
        alert(data.error || 'Failed to update ban status');
      }
    } catch (e) {
      alert('Error updating ban status');
    }
  };

  window.setGatewayBan = async (userId, isGatewayBanned) => {
    let reason = '';
    let durationHours = 0;

    if (isGatewayBanned) {
      reason = prompt('Enter reason for gateway ban:', 'Gateway access revoked');
      if (reason === null) return;

      const durChoice = prompt(
        'Select Gateway Ban Duration (enter hours):\n\n' +
        '• 1 = 1 Hour\n' +
        '• 12 = 12 Hours\n' +
        '• 24 = 24 Hours (1 Day)\n' +
        '• 72 = 3 Days\n' +
        '• 168 = 7 Days (1 Week)\n' +
        '• 720 = 30 Days (1 Month)\n' +
        '• 0 = Permanent Gateway Ban\n\n' +
        'Enter hours (or 0 for Permanent):',
        '24'
      );
      if (durChoice === null) return;
      durationHours = parseInt(durChoice, 10) || 0;
    }

    try {
      const res = await authFetch(`/api/admin/users/${userId}/gateway-ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_gateway_banned: isGatewayBanned, reason, durationHours })
      });
      const data = await res.json();
      if (res.ok) {
        const timeMsg = data.timeoutUntil ? ` (gateway restricted until ${new Date(data.timeoutUntil).toLocaleString()})` : '';
        alert(isGatewayBanned ? `🌐 User gateway access restricted${timeMsg}!` : '🔓 User gateway access restored.');
        fetchUsers();
        fetchLogs();
      } else {
        alert(data.error || 'Failed to update gateway ban status');
      }
    } catch (e) {
      alert('Error updating gateway ban status');
    }
  };

  window.deleteGame = async (gameId) => {
    if (!confirm('Are you sure you want to permanently delete this game?')) return;
    try {
      const res = await authFetch(`/api/admin/games/${gameId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAdminGames();
        fetchStats();
        loadGames();
      }
    } catch (e) {
      alert('Error deleting game');
    }
  };

  window.deleteDomain = async (domainId) => {
    try {
      const res = await authFetch(`/api/admin/domains/${domainId}`, { method: 'DELETE' });
      if (res.ok) fetchBlockedDomains();
    } catch (e) {
      alert('Error unblocking domain');
    }
  };

  window.deleteFilter = async (filterId) => {
    try {
      const res = await authFetch(`/api/admin/filters/${filterId}`, { method: 'DELETE' });
      if (res.ok) fetchFilters();
    } catch (e) {
      alert('Error deleting filter');
    }
  };

  window.viewUserPassword = (username, plainPassword) => {
    alert(`🔑 Account Password for ${username}:\n\n${plainPassword || '[No password set or encrypted]'}`);
  };

  window.adminConfigProfile = (userId, user) => {
    const modal = document.getElementById('admin-user-profile-modal');
    if (!modal) return;

    document.getElementById('admin-edit-user-id').value = userId;
    document.getElementById('admin-edit-target-username').textContent = user.username;
    document.getElementById('admin-edit-user-role').value = user.role || 'member';
    document.getElementById('admin-edit-user-display-name').value = user.display_name || user.username;
    document.getElementById('admin-edit-user-avatar-url').value = user.avatar_url || '';
    document.getElementById('admin-edit-user-bio').value = user.bio || '';
    document.getElementById('admin-edit-user-glow').value = user.pro_chat_glow || 'gold';
    document.getElementById('admin-edit-user-flair').value = user.pro_custom_flair || '';
    document.getElementById('admin-edit-user-new-password').value = '';
    const flairLockedCheck = document.getElementById('admin-edit-user-flair-locked');
    if (flairLockedCheck) {
      flairLockedCheck.checked = Boolean(user.is_flair_locked);
    }

    // Fetch and render moderation history timeline
    const timelineEl = document.getElementById('admin-user-mod-timeline');
    if (timelineEl) {
      timelineEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 12px;">Loading moderation history...</div>';
      
      authFetch(`/api/admin/users/${encodeURIComponent(user.username)}/mod-history`)
        .then(res => res.json())
        .then(data => {
          if (!data.success || !data.history) {
            timelineEl.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 12px;">Failed to load history.</div>';
            return;
          }
          const history = data.history;
          if (history.length === 0) {
            timelineEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No moderation actions recorded for this student.</div>';
            return;
          }
          
          timelineEl.innerHTML = history.map(item => {
            let badgeBg = '#3b82f6';
            let badgeText = item.source.toUpperCase();
            
            if (item.source === 'manual') {
              badgeBg = '#ef4444';
              badgeText = item.action || 'PUNISH';
            } else if (item.source === 'ai') {
              badgeBg = '#eab308';
              badgeText = `AI FLAG (${item.action})`;
            } else if (item.source === 'appeal') {
              badgeBg = item.action === 'approved' ? '#10b981' : item.action === 'rejected' ? '#ef4444' : '#6366f1';
              badgeText = `APPEAL (${item.action.toUpperCase()})`;
            }
            
            const reasonStr = item.reason ? `<div style="margin-top: 4px; color: #cbd5e1; line-height: 1.4;">${escapeHtml(item.reason)}</div>` : '';
            const adminStr = item.admin_username ? `<span style="color: var(--text-muted); margin-left: auto; font-size: 0.72rem;">by @${item.admin_username}</span>` : '';
            
            let extraStr = '';
            if (item.extra) {
              if (item.source === 'ai') {
                extraStr = `<div style="font-size: 0.7rem; color: #a855f7; margin-top: 2px;">Category: ${item.extra.category} | Severity: ${item.extra.severity} (Confidence: ${Math.round(item.extra.confidence * 100)}%)</div>`;
              } else if (item.source === 'appeal') {
                extraStr = `<div style="font-size: 0.72rem; border-left: 2px solid rgba(255,255,255,0.15); padding-left: 8px; margin-top: 4px; color: #94a3b8;">
                  <strong>Type:</strong> ${item.extra.punishment_type} | <strong>AI Recommendation:</strong> ${item.extra.ai_recommendation}<br>
                  <strong>AI Rationale:</strong> ${item.extra.ai_rationale || 'N/A'}<br>
                  <strong>Admin Notes:</strong> ${item.extra.admin_notes || 'None'}
                </div>`;
              }
            }
            
            return `
              <div style="border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; margin-bottom: 4px; display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="background: ${badgeBg}; color: #000; font-weight: 800; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px;">${badgeText}</span>
                  <span style="color: var(--text-muted); font-size: 0.7rem;">${new Date(item.created_at).toLocaleString()}</span>
                  ${adminStr}
                </div>
                ${reasonStr}
                ${extraStr}
              </div>
            `;
          }).join('');
        })
        .catch(err => {
          console.error(err);
          timelineEl.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 12px;">Connection error loading timeline.</div>';
        });
    }

    modal.classList.add('active');
  };

  const adminProfileModalClose = document.getElementById('admin-user-profile-modal-close');
  if (adminProfileModalClose) {
    adminProfileModalClose.addEventListener('click', () => {
      document.getElementById('admin-user-profile-modal')?.classList.remove('active');
    });
  }

  const adminProfileForm = document.getElementById('admin-user-profile-form');
  if (adminProfileForm) {
    adminProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = document.getElementById('admin-edit-user-id').value;
      const targetUsername = document.getElementById('admin-edit-target-username').textContent;
      const role = document.getElementById('admin-edit-user-role').value;
      const display_name = document.getElementById('admin-edit-user-display-name').value.trim();
      const avatar_url = document.getElementById('admin-edit-user-avatar-url').value.trim();
      const bio = document.getElementById('admin-edit-user-bio').value.trim();
      const pro_chat_glow = document.getElementById('admin-edit-user-glow').value;
      const pro_custom_flair = document.getElementById('admin-edit-user-flair').value.trim();
      const new_password = document.getElementById('admin-edit-user-new-password').value;
      const is_flair_locked = document.getElementById('admin-edit-user-flair-locked')?.checked || false;

      try {
        const res = await authFetch(`/api/admin/users/${userId}/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role,
            display_name,
            avatar_url,
            bio,
            pro_chat_glow,
            pro_custom_flair,
            new_password,
            is_flair_locked
          })
        });
        const data = await res.json();
        if (res.ok) {
          alert(`✅ Profile for ${targetUsername} configured successfully!`);
          document.getElementById('admin-user-profile-modal')?.classList.remove('active');
          fetchUsers();
          fetchLogs();
        } else {
          alert(data.error || 'Failed to update user profile');
        }
      } catch (err) {
        alert('Network error updating user profile');
      }
    });
  }

  const addWordfilterForm = document.getElementById('admin-add-wordfilter-form');
  if (addWordfilterForm) {
    addWordfilterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const word = document.getElementById('admin-filter-word-input')?.value.trim();
      const punishment = document.getElementById('admin-filter-punishment-select')?.value || 'censor';
      const filter_type = document.getElementById('admin-filter-target-select')?.value || 'both';
      const reason = document.getElementById('admin-filter-reason-input')?.value.trim() || '';

      if (!word) return alert('Forbidden word or phrase required.');

      try {
        const res = await authFetch('/api/admin/filters/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word, punishment, filter_type, reason })
        });
        const data = await res.json();
        if (res.ok) {
          document.getElementById('admin-filter-word-input').value = '';
          if (document.getElementById('admin-filter-reason-input')) document.getElementById('admin-filter-reason-input').value = '';
          alert(`Filter rule for "${word}" (${punishment}) added successfully!`);
          fetchFilters();
        } else {
          alert(data.error || 'Failed to add filter rule.');
        }
      } catch (err) {
        alert('Error adding filter rule.');
      }
    });
  }

  // Bulk word block form handling
  const bulkForm = document.getElementById('admin-bulk-wordfilter-form');
  if (bulkForm) {
    bulkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const textarea = document.getElementById('admin-bulk-words-textarea');
      const wordsText = textarea ? textarea.value : '';
      const punishment = document.getElementById('admin-bulk-punishment-select')?.value || 'censor';
      const filter_type = document.getElementById('admin-bulk-target-select')?.value || 'both';
      const reason = document.getElementById('admin-bulk-reason-input')?.value.trim() || '';

      const words = wordsText.split(/[\n,;]+/).map(w => w.trim()).filter(Boolean);
      if (words.length === 0) return alert('Please enter at least one word or phrase to block.');

      try {
        const res = await authFetch('/api/admin/filters/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ words, filter_type, punishment, reason })
        });
        const data = await res.json();
        if (res.ok) {
          textarea.value = '';
          if (document.getElementById('admin-bulk-reason-input')) document.getElementById('admin-bulk-reason-input').value = '';
          alert(data.message || `Successfully added ${data.count || words.length} word(s).`);
          fetchFilters();
        } else {
          alert(data.error || 'Failed to bulk add filter rules.');
        }
      } catch (err) {
        alert('Error during bulk block operation.');
      }
    });
  }

  const editGameModalClose = document.getElementById('admin-edit-game-modal-close');
  if (editGameModalClose) {
    editGameModalClose.addEventListener('click', () => {
      document.getElementById('admin-edit-game-modal')?.classList.remove('active');
    });
  }

  const editGameForm = document.getElementById('admin-edit-game-form');
  if (editGameForm) {
    editGameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const gameId = document.getElementById('admin-edit-game-id')?.value;
      const title = document.getElementById('admin-edit-game-title')?.value;
      const category = document.getElementById('admin-edit-game-category')?.value;
      const thumbnail_url = document.getElementById('admin-edit-game-thumbnail')?.value;
      const author = document.getElementById('admin-edit-game-author')?.value;
      const embed_type = document.getElementById('admin-edit-game-embed-type')?.value;
      const embed_content = document.getElementById('admin-edit-game-embed-content')?.value;
      const clicks = document.getElementById('admin-edit-game-clicks')?.value;
      const is_taken_down = document.getElementById('admin-edit-game-takedown')?.checked || false;
      const takedown_reason = document.getElementById('admin-edit-game-takedown-reason')?.value || '';

      try {
        if (gameId) {
          const res = await authFetch(`/api/admin/games/${gameId}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, category, thumbnail_url, author, embed_type, embed_content, clicks, is_taken_down, takedown_reason })
          });
          const data = await res.json();
          if (res.ok) {
            alert('✅ Game details updated successfully!');
            document.getElementById('admin-edit-game-modal')?.classList.remove('active');
            fetchAdminGames();
          } else {
            alert(data.error || 'Failed to update game.');
          }
        } else {
          const res = await authFetch('/api/admin/games/bulk-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              games: [{ title, category, thumbnail_url, author, embed_type, embed_content }]
            })
          });
          const data = await res.json();
          if (res.ok) {
            alert('🎉 New game added to catalog!');
            document.getElementById('admin-edit-game-modal')?.classList.remove('active');
            fetchAdminGames();
          } else {
            alert(data.error || 'Failed to add new game.');
          }
        }
      } catch (err) {
        alert('Error saving game changes.');
      }
    });
  }

  // Suggestions Manager Methods
  window.adminFetchSuggestions = async () => {
    const tbody = document.getElementById('admin-suggestions-tbody');
    if (!tbody) return;

    try {
      const res = await authFetch('/api/admin/suggestions');
      if (!res.ok) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef4444;">Error loading suggestions list.</td></tr>';
        return;
      }
      const data = await res.json();
      const list = data.suggestions || [];

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:30px;">No user suggestions currently in queue.</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(s => {
        const details = s.game_url || s.details || s.description || '[No Link/Details Provided]';
        const author = s.username || 'Guest';
        return `
          <tr>
            <td><strong>${s.title}</strong></td>
            <td><code>${details}</code></td>
            <td>👤 ${author}</td>
            <td>⭐ ${s.upvotes || 1}</td>
            <td>
              <div style="display:flex;gap:6px;">
                <button class="btn-small" style="background:rgba(16,185,129,0.2);color:#10b981;border:1px solid #10b981;font-weight:700;" onclick="window.adminApproveSuggestion(${s.id})">✔️ Approve</button>
                <button class="btn-small danger" style="background:rgba(239,68,68,0.2);color:#ef4444;border:1px solid #ef4444;font-weight:700;" onclick="window.adminDenySuggestion(${s.id})">❌ Deny</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef4444;">Connection error loading suggestions.</td></tr>';
    }
  };

  window.adminApproveSuggestion = async (id) => {
    try {
      const res = await authFetch(`/api/admin/suggestions/${id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Suggestion approved and published!');
        window.adminFetchSuggestions();
      } else {
        alert(data.error || 'Failed to approve suggestion.');
      }
    } catch (err) {
      alert('Error approving suggestion.');
    }
  };

  window.adminDenySuggestion = async (id) => {
    if (!confirm('Are you sure you want to deny and permanently delete this suggestion?')) return;
    try {
      const res = await authFetch(`/api/admin/suggestions/${id}/deny`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Suggestion denied and removed.');
        window.adminFetchSuggestions();
      } else {
        alert(data.error || 'Failed to deny suggestion.');
      }
    } catch (err) {
      alert('Error denying suggestion.');
    }
  };
}

// 🤖 Groq AI Safety & Moderation Studio Frontend Module
function setupAiModerationStudio() {
  const form = document.getElementById('aimod-settings-form');
  const toggleBtn = document.getElementById('aimod-studio-toggle-btn');
  const statusBadge = document.getElementById('aimod-studio-status-badge');
  const testBtn = document.getElementById('aimod-run-test-btn');
  const clearTestBtn = document.getElementById('aimod-clear-test-btn');

  function updateStatusUi(enabled) {
    const isOnline = Boolean(enabled);
    if (statusBadge) {
      if (isOnline) {
        statusBadge.textContent = '🟢 AI ONLINE';
        statusBadge.style.cssText = 'padding: 6px 14px; border-radius: 99px; font-weight: 800; font-size: 0.82rem; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #10b981;';
      } else {
        statusBadge.textContent = '🔴 UNDER MAINTENANCE';
        statusBadge.style.cssText = 'padding: 6px 14px; border-radius: 99px; font-weight: 800; font-size: 0.82rem; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444;';
      }
    }
    if (toggleBtn) {
      toggleBtn.textContent = isOnline ? 'Turn AI Off (Maintenance)' : 'Turn AI On (Online)';
      toggleBtn.style.background = isOnline 
        ? 'linear-gradient(135deg, #e11d48, #be123c)'
        : 'linear-gradient(135deg, #10b981, #059669)';
    }

    // Also sync radar toggle badge if present
    const radarBadge = document.getElementById('admin-ai-status-badge');
    const radarToggleBtn = document.getElementById('admin-toggle-ai-btn');
    if (radarBadge) {
      radarBadge.textContent = isOnline ? '🟢 AI Online' : '🔴 Under Maintenance';
      radarBadge.style.cssText = isOnline 
        ? 'padding: 6px 14px; border-radius: 99px; font-weight: 800; font-size: 0.82rem; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #10b981;'
        : 'padding: 6px 14px; border-radius: 99px; font-weight: 800; font-size: 0.82rem; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444;';
    }
    if (radarToggleBtn) {
      radarToggleBtn.textContent = isOnline ? 'Turn AI Off (Maintenance)' : 'Turn AI On (Online)';
    }
  }

  const radarToggleBtn = document.getElementById('admin-toggle-ai-btn');
  if (radarToggleBtn && !radarToggleBtn.dataset.bound) {
    radarToggleBtn.dataset.bound = 'true';
    radarToggleBtn.addEventListener('click', async () => {
      try {
        const res = await authFetch('/api/admin/toggle-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const data = await res.json();
        if (res.ok) {
          updateStatusUi(data.ai_enabled);
          alert(data.message);
        } else {
          alert(data.error || 'Failed to toggle AI engine.');
        }
      } catch (e) {
        alert('Error toggling AI engine.');
      }
    });
  }

  window.loadAiModerationStudio = async () => {
    try {
      const res = await authFetch('/api/admin/ai-config');
      if (res.ok) {
        const data = await res.json();
        const cfg = data.config || {};

        // Chat AI fields
        const chatModel = document.getElementById('simple-chat-model');
        const chatPersonality = document.getElementById('simple-chat-personality');
        const chatTemp = document.getElementById('simple-chat-temp');
        const chatRateLimit = document.getElementById('simple-chat-ratelimit');
        const chatDirectives = document.getElementById('simple-chat-directives');

        if (chatModel && cfg.chatModel) chatModel.value = cfg.chatModel;
        if (chatPersonality && cfg.chatPersonality) chatPersonality.value = cfg.chatPersonality;
        if (chatTemp && cfg.chatTemperature !== undefined) chatTemp.value = String(cfg.chatTemperature);
        if (chatRateLimit && cfg.chatRateLimit) chatRateLimit.value = String(cfg.chatRateLimit);
        if (chatDirectives && cfg.chatCustomDirectives !== undefined) chatDirectives.value = cfg.chatCustomDirectives;

        // Moderation fields
        const modStrictness = document.getElementById('simple-mod-strictness');
        const modPolicy = document.getElementById('simple-mod-policy');
        const modModel = document.getElementById('simple-mod-model');
        const modReviewThreshold = document.getElementById('simple-mod-review-threshold');

        if (modStrictness && cfg.strictness) modStrictness.value = cfg.strictness;
        if (modPolicy && cfg.actionPolicy) modPolicy.value = cfg.actionPolicy;
        if (modModel && cfg.model) modModel.value = cfg.model;

        try {
          const tRes = await authFetch('/api/admin/review-threshold');
          const tData = await tRes.json();
          if (tData.threshold && modReviewThreshold) {
            modReviewThreshold.value = tData.threshold;
          }
        } catch(e) {}

        updateStatusUi(cfg.enabled && cfg.chatEnabled !== false);
      }
    } catch (e) {
      console.warn('loadAiModerationStudio config error:', e);
    }
    window.fetchAiLogs();
  };

  // Handle saving Chat AI settings
  const chatForm = document.getElementById('clean-ai-chat-form');
  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const chatModel = document.getElementById('simple-chat-model')?.value || 'gemini-2.5-flash';
      const chatPersonality = document.getElementById('simple-chat-personality')?.value || 'friendly';
      const chatTemperature = parseFloat(document.getElementById('simple-chat-temp')?.value || '0.7');
      const chatRateLimit = parseInt(document.getElementById('simple-chat-ratelimit')?.value || '30', 10);
      const chatCustomDirectives = document.getElementById('simple-chat-directives')?.value || '';

      try {
        const res = await authFetch('/api/admin/ai-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatModel, chatPersonality, chatTemperature, chatRateLimit, chatCustomDirectives })
        });
        const data = await res.json();
        if (res.ok) {
          alert('✅ Chat AI Assistant settings saved successfully!');
        } else {
          alert(data.error || 'Failed to save Chat AI settings.');
        }
      } catch (err) {
        alert('Network error saving Chat AI settings.');
      }
    });
  }

  // Handle saving Moderation settings
  const modForm = document.getElementById('clean-ai-mod-form');
  if (modForm) {
    modForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const strictness = document.getElementById('simple-mod-strictness')?.value || 'strict';
      const actionPolicy = document.getElementById('simple-mod-policy')?.value || 'auto_punish';
      const model = document.getElementById('simple-mod-model')?.value || 'openai/gpt-oss-safeguard-20b';
      const threshold = document.getElementById('simple-mod-review-threshold')?.value || '10d';

      try {
        const res = await authFetch('/api/admin/ai-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strictness, actionPolicy, model })
        });
        await authFetch('/api/admin/review-threshold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threshold })
        });
        const data = await res.json();
        if (res.ok) {
          alert('✅ Chat Safety Policy & Admin Review Threshold saved successfully!');
        } else {
          alert(data.error || 'Failed to update Safety policy.');
        }
      } catch (err) {
        alert('Network error saving Safety policy.');
      }
    });
  }

  // Handle Master Toggle in AI Studio
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
      try {
        const res = await authFetch('/api/admin/toggle-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const data = await res.json();
        if (res.ok) {
          updateStatusUi(data.ai_enabled);
          alert(data.message);
        } else {
          alert(data.error || 'Failed to toggle AI engine.');
        }
      } catch (e) {
        alert('Error toggling AI engine.');
      }
    });
  }

  // Interactive Live Playground Tester
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const input = document.getElementById('aimod-test-input');
      const text = input ? input.value.trim() : '';
      if (!text) return alert('Please enter sample text to test.');

      const resultBox = document.getElementById('aimod-test-result-box');
      const badge = document.getElementById('aimod-test-badge');
      const latency = document.getElementById('aimod-test-latency');
      const details = document.getElementById('aimod-test-details');

      testBtn.disabled = true;
      testBtn.textContent = '⏳ Analyzing...';

      const strictness = document.getElementById('simple-mod-strictness')?.value || document.getElementById('aimod-strictness-select')?.value || 'balanced';
      const actionPolicy = document.getElementById('simple-mod-policy')?.value || document.getElementById('aimod-policy-select')?.value || 'auto_punish';
      const model = document.getElementById('simple-mod-model')?.value || document.getElementById('aimod-model-select')?.value || 'openai/gpt-oss-safeguard-20b';

      try {
        const res = await authFetch('/api/admin/ai-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, strictness, actionPolicy, model })
        });
        const data = await res.json();

        if (res.ok && data.evaluation) {
          const ev = data.evaluation;
          if (resultBox) resultBox.style.display = 'block';

          if (badge) {
            if (ev.flagged) {
              badge.textContent = `⛔ FLAGGED (${(ev.severity || 'MEDIUM').toUpperCase()})`;
              badge.style.cssText = 'background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #ef4444; font-weight: 800; padding: 3px 10px; border-radius: 99px; font-size: 0.76rem;';
            } else {
              badge.textContent = '🟢 SAFE / ACCEPTABLE';
              badge.style.cssText = 'background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #10b981; font-weight: 800; padding: 3px 10px; border-radius: 99px; font-size: 0.76rem;';
            }
          }

          if (latency) {
            latency.textContent = `⏱️ ${ev.latencyMs || 0}ms (${ev.modelUsed || model})`;
          }

          if (details) {
            details.innerHTML = `
              <div style="margin-bottom: 4px;"><strong>Category:</strong> <span style="color:#fbbf24;">${ev.category || 'none'}</span> &bull; <strong>Confidence:</strong> ${Math.round((ev.confidence || 1) * 100)}%</div>
              <div style="margin-bottom: 4px;"><strong>Recommended Action:</strong> <code style="color:#38bdf8; background:rgba(0,0,0,0.4); padding:2px 6px; border-radius:4px;">${ev.recommended_action || 'allow'}</code></div>
              <div style="margin-bottom: 4px;"><strong>Reason:</strong> ${ev.reason || 'N/A'}</div>
              ${ev.censored_text ? `<div style="margin-top: 6px; padding: 6px 10px; background: rgba(255,255,255,0.05); border-radius: 6px;"><strong>Censored Preview:</strong> <em>"${ev.censored_text}"</em></div>` : ''}
            `;
          }
        } else {
          alert(data.error || 'AI evaluation failed.');
        }
      } catch (err) {
        alert('Network error testing AI moderation.');
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = '⚡ Test AI Moderation';
      }
    });
  }

  if (clearTestBtn) {
    clearTestBtn.addEventListener('click', () => {
      const input = document.getElementById('aimod-test-input');
      const resultBox = document.getElementById('aimod-test-result-box');
      if (input) input.value = '';
      if (resultBox) resultBox.style.display = 'none';
    });
  }

  // Fetch AI Moderation Incident Feed
  window.fetchAiLogs = async () => {
    const tbody = document.getElementById('aimod-logs-tbody');
    if (!tbody) return;

    try {
      const res = await authFetch('/api/admin/ai-logs');
      if (!res.ok) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:20px;">Failed to load incident logs.</td></tr>';
        return;
      }
      const data = await res.json();
      const logs = data.logs || [];

      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No AI violations recorded yet. The chat is clean! 🎉</td></tr>';
        return;
      }

      const severityBadgeMap = {
        low: '<span style="color:#fbbf24; font-weight:800; background:rgba(251,191,36,0.15); border:1px solid #fbbf24; padding:2px 8px; border-radius:99px; font-size:0.75rem;">LOW</span>',
        medium: '<span style="color:#f59e0b; font-weight:800; background:rgba(245,158,11,0.15); border:1px solid #f59e0b; padding:2px 8px; border-radius:99px; font-size:0.75rem;">MEDIUM</span>',
        high: '<span style="color:#ef4444; font-weight:800; background:rgba(239,68,68,0.15); border:1px solid #ef4444; padding:2px 8px; border-radius:99px; font-size:0.75rem;">HIGH</span>',
        extreme: '<span style="color:#fff; font-weight:900; background:#dc2626; border:1px solid #ef4444; padding:2px 8px; border-radius:99px; font-size:0.75rem;">EXTREME</span>'
      };

      tbody.innerHTML = logs.map(l => {
        const sev = severityBadgeMap[l.severity?.toLowerCase()] || `<span class="chat-badge">${l.severity || 'MED'}</span>`;
        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 10px 12px; font-size: 0.8rem; color: #94a3b8; white-space: nowrap;">${formatEstDateTime(l.created_at)}</td>
            <td style="padding: 10px 12px;"><strong style="color: #38bdf8;">@${l.username || 'User'}</strong></td>
            <td style="padding: 10px 12px; max-width: 280px; word-break: break-word;"><code style="color:#ff6b6b; background:rgba(0,0,0,0.5); padding:2px 6px; border-radius:4px;">${l.message || ''}</code></td>
            <td style="padding: 10px 12px;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="color:#cbd5e1; font-size:0.82rem; font-weight:700;">${l.category || 'general'}</span>
                ${sev}
              </div>
            </td>
            <td style="padding: 10px 12px;"><span style="color:#10b981; font-weight:800; font-size:0.82rem;">${(l.action_taken || 'blocked').toUpperCase()}</span></td>
            <td style="padding: 10px 12px; color: var(--text-muted); font-size: 0.82rem;">${l.reason || 'Flagged'}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:20px;">Connection error fetching logs.</td></tr>';
    }
  };

  window.clearAiLogs = async () => {
    if (!confirm('Are you sure you want to clear all AI moderation incident history?')) return;
    try {
      const res = await authFetch('/api/admin/ai-logs', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'AI incident logs cleared.');
        window.fetchAiLogs();
      } else {
        alert(data.error || 'Failed to clear logs.');
      }
    } catch (e) {
      alert('Error clearing AI incident logs.');
    }
  };
}

// ✏️ Edit Word Filter & Punishment Modal Controller
function setupEditFilterModal() {
  const modal = document.getElementById('admin-edit-filter-modal');
  const form = document.getElementById('admin-edit-filter-form');
  const closeBtn = document.getElementById('close-edit-filter-modal-btn');
  const cancelBtn = document.getElementById('cancel-edit-filter-btn');

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  window.adminEditFilterPrompt = (filter) => {
    if (!modal || !filter) return;
    const idInput = document.getElementById('edit-filter-id');
    const wordInput = document.getElementById('edit-filter-word-input');
    const punishmentSelect = document.getElementById('edit-filter-punishment-select');
    const targetSelect = document.getElementById('edit-filter-target-select');
    const reasonInput = document.getElementById('edit-filter-reason-input');

    if (idInput) idInput.value = filter.id;
    if (wordInput) wordInput.value = filter.word || '';
    if (punishmentSelect) punishmentSelect.value = filter.punishment || 'censor';
    if (targetSelect) targetSelect.value = filter.filter_type || 'both';
    if (reasonInput) reasonInput.value = filter.reason || '';

    modal.style.display = 'flex';
  };

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-filter-id')?.value;
      const word = document.getElementById('edit-filter-word-input')?.value.trim();
      const punishment = document.getElementById('edit-filter-punishment-select')?.value;
      const filter_type = document.getElementById('edit-filter-target-select')?.value;
      const reason = document.getElementById('edit-filter-reason-input')?.value.trim();

      if (!id || !word) return alert('Word/phrase cannot be empty.');

      try {
        const res = await authFetch(`/api/admin/filters/${id}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word, punishment, filter_type, reason })
        });
        const data = await res.json();
        if (res.ok) {
          alert(data.message || 'Filter rule updated successfully!');
          closeModal();
          fetchFilters();
        } else {
          alert(data.error || 'Failed to update filter rule.');
        }
      } catch (err) {
        alert('Network error updating filter rule.');
      }
    });
  }
}

// ==========================================
// 🛡️ STUDENT PUNISHMENT APPEALS REVIEW STUDIO
// ==========================================
function setupAppealsReviewStudio() {
  window.fetchAppeals = async (status = null) => {
    const listEl = document.getElementById('admin-appeals-list');
    const badgeEl = document.getElementById('admin-appeals-badge');
    const filterSelect = document.getElementById('admin-appeals-filter');
    const filterVal = status || (filterSelect ? filterSelect.value : 'pending');

    if (!listEl) return;

    try {
      const res = await authFetch(`/api/admin/appeals?status=${encodeURIComponent(filterVal)}`);
      if (!res.ok) {
        listEl.innerHTML = '<div style="text-align:center; color:#ef4444; padding:20px;">Failed to load appeals.</div>';
        return;
      }

      const data = await res.json();
      const appeals = data.appeals || [];

      // Update pending badge count
      const pendingCount = appeals.filter(a => a.status === 'pending').length;
      if (badgeEl) {
        if (pendingCount > 0) {
          badgeEl.textContent = pendingCount;
          badgeEl.style.display = 'inline-block';
        } else {
          badgeEl.style.display = 'none';
        }
      }

      if (appeals.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); padding: 40px; background: rgba(0,0,0,0.25); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">
            <span style="font-size: 2.2rem; display: block; margin-bottom: 8px;">✨</span>
            <strong style="color: #fff; font-size: 1.05rem;">No ${filterVal === 'pending' ? 'Pending' : ''} Appeals Found</strong>
            <p style="margin: 4px 0 0; font-size: 0.82rem;">All punishment appeals have been reviewed and processed.</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = appeals.map(a => {
        const isPending = a.status === 'pending';
        const isApproved = a.status === 'approved';
        const isRejected = a.status === 'rejected';

        const aiRec = a.ai_recommendation || 'review';
        const isAiApprove = aiRec.toLowerCase().includes('approve');
        const aiBadgeBg = isAiApprove ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
        const aiBadgeBorder = isAiApprove ? '#10b981' : '#ef4444';
        const aiBadgeColor = isAiApprove ? '#34d399' : '#f87171';
        const aiIcon = isAiApprove ? '✅' : '❌';

        const statusBadgeBg = isApproved ? 'rgba(16, 185, 129, 0.2)' : isRejected ? 'rgba(239, 68, 68, 0.2)' : 'rgba(251, 191, 36, 0.2)';
        const statusBadgeColor = isApproved ? '#10b981' : isRejected ? '#ef4444' : '#fbbf24';

        const formattedDate = formatEstDateTime(a.created_at);

        return `
          <div style="background: #0e121e; border: 1px solid ${isPending ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255,255,255,0.08)'}; border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.4rem;">👤</span>
                <div>
                  <strong style="color: #fff; font-size: 1.05rem;">@${escapeHtml(a.username)}</strong>
                  <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 6px;">(Appeal #${a.id} • ${escapeHtml(a.punishment_type.toUpperCase())})</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.75rem; padding: 3px 10px; border-radius: 99px; font-weight: 800; background: ${statusBadgeBg}; color: ${statusBadgeColor};">
                  ${escapeHtml(a.status.toUpperCase())}
                </span>
                <span style="font-size: 0.78rem; color: var(--text-muted);">${formattedDate}</span>
              </div>
            </div>

            <!-- Original Infraction -->
            <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 10px 14px; border: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <div>
                <span style="font-size: 0.75rem; color: #f59e0b; font-weight: 800; text-transform: uppercase;">⚠️ Original Punishment Reason:</span>
                <p style="margin: 3px 0 0; font-size: 0.85rem; color: #cbd5e1;">${escapeHtml(a.original_reason || 'Policy violation')}</p>
              </div>
              <div style="background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.3); border-radius: 6px; padding: 3px 10px;">
                <span style="font-size: 0.75rem; color: #38bdf8; font-weight: 700;">Category: ${escapeHtml(a.incident_category || 'General')}</span>
              </div>
            </div>

            <!-- Student's Detailed Questionnaire Responses -->
            <div style="background: rgba(56, 189, 248, 0.04); border-left: 3px solid #38bdf8; border-radius: 4px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;">
              <div>
                <span style="font-size: 0.75rem; color: #fbbf24; font-weight: 800; text-transform: uppercase;">1. Incident Context & Explanation:</span>
                <p style="margin: 3px 0 0; font-size: 0.85rem; color: #fff; line-height: 1.45; white-space: pre-wrap;">${escapeHtml(a.incident_description || a.appeal_text)}</p>
              </div>
              ${a.why_second_chance ? `
                <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px;">
                  <span style="font-size: 0.75rem; color: #a855f7; font-weight: 800; text-transform: uppercase;">2. Second Chance Plea & Remorse:</span>
                  <p style="margin: 3px 0 0; font-size: 0.85rem; color: #cbd5e1; line-height: 1.45; white-space: pre-wrap;">${escapeHtml(a.why_second_chance)}</p>
                </div>
              ` : ''}
              ${a.prevention_commitment ? `
                <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px;">
                  <span style="font-size: 0.75rem; color: #10b981; font-weight: 800; text-transform: uppercase;">3. Future Prevention Commitment:</span>
                  <p style="margin: 3px 0 0; font-size: 0.85rem; color: #cbd5e1; line-height: 1.45; white-space: pre-wrap;">${escapeHtml(a.prevention_commitment)}</p>
                </div>
              ` : ''}
            </div>

            <!-- Groq AI Pre-Review Assessment -->
            <div style="background: rgba(0,0,0,0.4); border: 1px solid ${aiBadgeBorder}; border-radius: 10px; padding: 12px 16px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 1rem;">🤖</span>
                  <strong style="color: #fff; font-size: 0.85rem;">Groq AI Safety Arbitrator Recommendation:</strong>
                </div>
                <span style="font-size: 0.75rem; padding: 3px 10px; border-radius: 99px; font-weight: 900; background: ${aiBadgeBg}; color: ${aiBadgeColor}; border: 1px solid ${aiBadgeBorder};">
                  ${aiIcon} AI Suggestion: ${escapeHtml(aiRec.toUpperCase())}
                </span>
              </div>
              <p style="margin: 0; font-size: 0.82rem; color: #cbd5e1; line-height: 1.4;">${escapeHtml(a.ai_rationale || 'Evaluated based on remorse and risk criteria.')}</p>
            </div>

            ${!isPending ? `
              <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 10px 14px; font-size: 0.8rem; color: var(--text-muted);">
                <span>Reviewed by <strong style="color:#fff;">${escapeHtml(a.reviewed_by || 'Admin')}</strong> • Notes: <span style="color:#cbd5e1;">${escapeHtml(a.admin_notes || 'None')}</span></span>
              </div>
            ` : `
              <!-- Admin Action Decision Buttons -->
              <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px;">
                <button class="btn-small danger" onclick="window.adminReviewAppeal(${a.id}, 'rejected', '${escapeHtml(a.username)}')" style="padding: 8px 16px; font-weight: 700; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #ef4444;">
                  ❌ Reject Appeal
                </button>
                <button class="btn-pill primary" onclick="window.adminReviewAppeal(${a.id}, 'approved', '${escapeHtml(a.username)}')" style="padding: 8px 20px; font-weight: 800; background: #10b981; border-color: #10b981; color: #000;">
                  ✅ Approve & Lift Punishment
                </button>
              </div>
            `}
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('fetchAppeals error:', err);
      listEl.innerHTML = '<div style="text-align:center; color:#ef4444; padding:20px;">Connection error loading appeals.</div>';
    }
  };

  window.adminReviewAppeal = async (appealId, decision, username) => {
    const notes = prompt(`Enter optional review notes for @${username} (Decision: ${decision.toUpperCase()}):`, '');
    if (notes === null) return; // User cancelled

    try {
      const res = await authFetch(`/api/admin/appeals/${appealId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, adminNotes: notes })
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message || `Appeal #${appealId} successfully ${decision}.`);
        window.fetchAppeals();
        if (window.fetchUsers) window.fetchUsers();
      } else {
        alert(data.error || 'Failed to review appeal.');
      }
    } catch (err) {
      alert('Network error reviewing appeal.');
    }
  };
}

function setupCreateUserForm() {
  const form = document.getElementById('admin-create-user-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('admin-create-username').value.trim();
      const display_name = document.getElementById('admin-create-displayname').value.trim();
      const password = document.getElementById('admin-create-password').value.trim();
      const role = document.getElementById('admin-create-role').value;

      if (!username || !password) {
        return alert('Username and Password are required.');
      }

      try {
        const res = await authFetch('/api/admin/users/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, display_name, password, role })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          alert(data.message);
          form.reset();
          document.getElementById('admin-create-user-card').style.display = 'none';
          if (typeof fetchUsers === 'function') fetchUsers();
        } else {
          alert(data.error || 'Failed to create user account.');
        }
      } catch (err) {
        console.error('Error creating user:', err);
        alert('Network error creating user.');
      }
    });
  }
}

window.adminFetchBugs = async function() {
  const tbody = document.getElementById('admin-bugs-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Loading bug reports...</td></tr>`;

  try {
    const res = await authFetch('/api/admin/bugs');
    const data = await res.json();

    if (res.ok && data.success) {
      if (data.bugs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">🎉 No bug reports found. Good job!</td></tr>`;
        return;
      }

      tbody.innerHTML = data.bugs.map(b => {
        const dateStr = b.created_at ? new Date(b.created_at).toLocaleString() : 'N/A';
        return `
          <tr style="border-bottom: 1px solid var(--card-border);">
            <td style="padding: 12px 14px; font-weight: 700; color: #ef4444;">#${b.id}</td>
            <td style="padding: 12px 14px; color: #fff;">
              <strong style="display: block;">${escapeHtml(b.title)}</strong>
              <span style="font-size: 0.72rem; padding: 2px 6px; background: rgba(239,68,68,0.15); color: #ef4444; border-radius: 4px; font-weight: 800; text-transform: uppercase;">${escapeHtml(b.category)}</span>
            </td>
            <td style="padding: 12px 14px; color: var(--text-muted); font-size: 0.8rem; line-height: 1.4; max-width: 320px; overflow-wrap: break-word;">${escapeHtml(b.description)}</td>
            <td style="padding: 12px 14px; color: #38bdf8; font-weight: 600;">@${escapeHtml(b.username || 'anonymous')}</td>
            <td style="padding: 12px 14px; color: var(--text-muted); font-size: 0.75rem;">${dateStr}</td>
            <td style="padding: 12px 14px;">
              <button class="btn-small primary" onclick="window.adminDeleteBug(${b.id})" style="background: #ef4444; color: #fff; font-weight: 800; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer;">Resolve & Delete</button>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #ef4444; font-size: 0.85rem;">Failed to load bugs: ${data.error || 'Server error'}</td></tr>`;
    }
  } catch (err) {
    console.error('Error fetching bugs:', err);
    tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #ef4444; font-size: 0.85rem;">Network error fetching bugs.</td></tr>`;
  }
};

window.adminDeleteBug = async function(id) {
  if (!confirm(`Are you sure you want to delete and resolve bug report #${id}?`)) return;

  try {
    const res = await authFetch(`/api/admin/bugs/${id}/delete`, {
      method: 'POST'
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert('Bug report deleted successfully!');
      window.adminFetchBugs();
    } else {
      alert(data.error || 'Failed to delete bug report.');
    }
  } catch (err) {
    console.error('Error deleting bug:', err);
    alert('Network error deleting bug report.');
  }
};

let adminShopItemsCache = [];

window.adminFetchShop = async function() {
  const tbody = document.getElementById('admin-shop-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Loading store items...</td></tr>`;

  try {
    const res = await authFetch('/api/shop/items');
    const data = await res.json();

    if (res.ok && data.success) {
      adminShopItemsCache = data.items || [];
      if (data.items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No shop items found.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.items.map(item => {
        const stockStr = item.stock_count !== undefined && item.stock_count !== null && item.stock_count >= 0
          ? (item.stock_count === 0 ? '<span style="color:#ef4444; font-weight:800;">SOLD OUT</span>' : `${item.stock_count} units`)
          : 'Unlimited';

        return `
          <tr style="border-bottom: 1px solid var(--card-border);">
            <td style="padding: 12px 14px; font-weight: 700; color: #10b981;">#${item.id}</td>
            <td style="padding: 12px 14px; color: #fff;">
              <strong style="display: block;">${escapeHtml(item.name)}</strong>
              <span style="font-size: 0.76rem; color: var(--text-muted);">${escapeHtml(item.description)}</span>
            </td>
            <td style="padding: 12px 14px; text-transform: uppercase; font-size: 0.75rem; color: #38bdf8; font-weight: 700;">${item.category.replace('_', ' ')}</td>
            <td style="padding: 12px 14px; color: #fbbf24; font-weight: 800;">${COIN_SVG} ${item.price}</td>
            <td style="padding: 12px 14px; font-family: monospace; font-size: 0.8rem; color: #cbd5e1;">${escapeHtml(item.perk_value || 'None')}</td>
            <td style="padding: 12px 14px; font-weight: 700; font-size: 0.8rem; color: #fbbf24;">${stockStr}</td>
            <td style="padding: 12px 14px; display: flex; gap: 6px;">
              <button class="btn-small secondary" onclick="window.adminOpenEditShopModal(${item.id})" style="background: #10b981; border: none; color: #000; font-weight: 800; cursor: pointer; border-radius: 4px; padding: 4px 10px;">Edit</button>
              <button class="btn-small primary" onclick="window.adminDeleteShopItem(${item.id})" style="background: #ef4444; border: none; color: #fff; font-weight: 800; cursor: pointer; border-radius: 4px; padding: 4px 10px;">Delete</button>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="7" style="padding: 24px; text-align: center; color: #ef4444; font-size: 0.85rem;">Failed to load items: ${data.error || 'Server error'}</td></tr>`;
    }
  } catch (err) {
    console.error('Error fetching shop:', err);
    tbody.innerHTML = `<tr><td colspan="7" style="padding: 24px; text-align: center; color: #ef4444; font-size: 0.85rem;">Network error fetching items.</td></tr>`;
  }
};

window.adminOpenEditShopModal = function(id) {
  const item = adminShopItemsCache.find(x => x.id === id);
  if (!item) return;

  document.getElementById('admin-edit-shop-id').value = item.id;
  document.getElementById('admin-edit-shop-name').value = item.name;
  document.getElementById('admin-edit-shop-desc').value = item.description;
  document.getElementById('admin-edit-shop-price').value = item.price;
  document.getElementById('admin-edit-shop-stock').value = item.stock_count !== undefined && item.stock_count !== null ? item.stock_count : -1;
  document.getElementById('admin-edit-shop-cat').value = item.category;
  document.getElementById('admin-edit-shop-perk').value = item.perk_value || '';
  document.getElementById('admin-edit-shop-delivery-note').value = item.delivery_note || '';

  const modal = document.getElementById('admin-edit-shop-modal');
  if (modal) modal.style.display = 'flex';
};

window.adminDeleteShopItem = async function(id) {
  if (!confirm(`Are you sure you want to delete shop item #${id}?`)) return;

  try {
    const res = await authFetch(`/api/admin/shop/${id}/delete`, {
      method: 'POST'
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert('Shop item deleted successfully!');
      window.adminFetchShop();
    } else {
      alert(data.error || 'Failed to delete shop item.');
    }
  } catch (err) {
    console.error('Error deleting shop item:', err);
    alert('Network error deleting shop item.');
  }
};

window.adminFetchQuests = async function() {
  const tbody = document.getElementById('admin-quests-tbody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Loading quests...</td></tr>`;

  try {
    const res = await authFetch('/api/shop/quests');
    const data = await res.json();

    if (res.ok && data.success) {
      if (data.quests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No quests found.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.quests.map(q => {
        return `
          <tr style="border-bottom: 1px solid var(--card-border);">
            <td style="padding: 12px 14px; font-weight: 700; color: #38bdf8;">#${q.id}</td>
            <td style="padding: 12px 14px; color: #fff;">
              <strong style="display: block;">${escapeHtml(q.title)}</strong>
              <span style="font-size: 0.76rem; color: var(--text-muted);">${escapeHtml(q.description)}</span>
            </td>
            <td style="padding: 12px 14px; font-family: monospace; font-size: 0.8rem; color: #a855f7;">${q.type}</td>
            <td style="padding: 12px 14px; color: #cbd5e1; font-weight: 700;">${q.target_value}</td>
            <td style="padding: 12px 14px; font-size: 0.75rem; font-weight: 700;">
              <span style="color: #fbbf24; display: block;">${COIN_SVG} +${q.reward_coins} Coins</span>
              <span style="color: #38bdf8; display: block;">🏆 +${q.reward_xp} XP</span>
            </td>
            <td style="padding: 12px 14px;">
              <button class="btn-small primary" onclick="window.adminDeleteQuest(${q.id})" style="background: #ef4444; border: none; color: #fff; font-weight: 800; cursor: pointer; border-radius: 4px; padding: 4px 10px;">Delete</button>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #ef4444; font-size: 0.85rem;">Failed to load quests: ${data.error || 'Server error'}</td></tr>`;
    }
  } catch (err) {
    console.error('Error fetching quests:', err);
    tbody.innerHTML = `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #ef4444; font-size: 0.85rem;">Network error fetching quests.</td></tr>`;
  }
};

window.adminDeleteQuest = async function(id) {
  if (!confirm(`Are you sure you want to delete quest #${id}?`)) return;

  try {
    const res = await authFetch(`/api/admin/quests/${id}/delete`, {
      method: 'POST'
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert('Quest deleted successfully!');
      window.adminFetchQuests();
    } else {
      alert(data.error || 'Failed to delete quest.');
    }
  } catch (err) {
    console.error('Error deleting quest:', err);
    alert('Network error deleting quest.');
  }
};

function setupCreateShopForm() {
  const form = document.getElementById('admin-create-shop-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('admin-shop-name').value.trim();
      const description = document.getElementById('admin-shop-desc').value.trim();
      const price = document.getElementById('admin-shop-price').value.trim();
      const category = document.getElementById('admin-shop-cat').value;
      const perk_value = document.getElementById('admin-shop-perk').value.trim();
      const delivery_note = document.getElementById('admin-shop-delivery-note')?.value.trim() || '';
      const stock_count = document.getElementById('admin-shop-stock')?.value.trim() || '-1';

      try {
        const res = await authFetch('/api/admin/shop/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, price, category, perk_value, delivery_note, stock_count })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert(data.message);
          form.reset();
          document.getElementById('admin-create-shop-card').style.display = 'none';
          window.adminFetchShop();
        } else {
          alert(data.error || 'Failed to create shop item.');
        }
      } catch (err) {
        console.error(err);
        alert('Error creating shop item.');
      }
    });
  }

  // Bulk shop importer
  const bulkBtn = document.getElementById('admin-bulk-shop-submit-btn');
  if (bulkBtn) {
    bulkBtn.addEventListener('click', async () => {
      const textarea = document.getElementById('admin-bulk-shop-textarea');
      if (!textarea) return;
      
      const raw = textarea.value.trim();
      if (!raw) return alert('Please enter products JSON array.');

      try {
        const items = JSON.parse(raw);
        if (!Array.isArray(items)) {
          return alert('Input must be a valid JSON array of objects.');
        }

        const res = await authFetch('/api/admin/shop/bulk-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          alert(`Successfully imported ${data.count} shop products!`);
          textarea.value = '';
          document.getElementById('admin-bulk-shop-card').style.display = 'none';
          window.adminFetchShop();
        } else {
          alert(data.error || 'Failed to bulk import products.');
        }
      } catch (err) {
        console.error(err);
        alert('Invalid JSON format: ' + err.message);
      }
    });
  }

  // Setup Edit Shop Product Modal Forms
  const editForm = document.getElementById('admin-edit-shop-form');
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('admin-edit-shop-id').value;
      const name = document.getElementById('admin-edit-shop-name').value.trim();
      const description = document.getElementById('admin-edit-shop-desc').value.trim();
      const price = document.getElementById('admin-edit-shop-price').value.trim();
      const category = document.getElementById('admin-edit-shop-cat').value;
      const perk_value = document.getElementById('admin-edit-shop-perk').value.trim();
      const delivery_note = document.getElementById('admin-edit-shop-delivery-note').value.trim();
      const stock_count = document.getElementById('admin-edit-shop-stock').value.trim();

      try {
        const res = await authFetch(`/api/admin/shop/${id}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, price, category, perk_value, delivery_note, stock_count })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert(data.message);
          document.getElementById('admin-edit-shop-modal').style.display = 'none';
          window.adminFetchShop();
        } else {
          alert(data.error || 'Failed to update product.');
        }
      } catch (err) {
        console.error(err);
        alert('Error updating product.');
      }
    });
  }

  const closeBtn = document.getElementById('admin-edit-shop-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('admin-edit-shop-modal').style.display = 'none';
    });
  }
}

function setupCreateQuestForm() {
  const form = document.getElementById('admin-create-quest-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('admin-quest-title').value.trim();
      const description = document.getElementById('admin-quest-desc').value.trim();
      const type = document.getElementById('admin-quest-type').value;
      const target_value = document.getElementById('admin-quest-target').value.trim();
      const reward_coins = document.getElementById('admin-quest-coins').value.trim();
      const reward_xp = document.getElementById('admin-quest-xp').value.trim();

      try {
        const res = await authFetch('/api/admin/quests/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, type, target_value, reward_coins, reward_xp })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert(data.message);
          form.reset();
          document.getElementById('admin-create-quest-card').style.display = 'none';
          window.adminFetchQuests();
        } else {
          alert(data.error || 'Failed to create quest.');
        }
      } catch (err) {
        console.error(err);
        alert('Error creating quest.');
      }
    });
  }
}

window.adminFetchShopPurchases = async () => {
  const tbody = document.getElementById('shoppurchases-tbody');
  if (!tbody) return;

  try {
    const res = await authFetch('/api/admin/shop/purchases');
    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef4444;padding:20px;">Failed to load purchase history.</td></tr>';
      return;
    }
    const data = await res.json();
    const purchases = data.purchases || [];

    if (purchases.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">No shop purchases recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = purchases.map(p => {
      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
          <td style="padding: 10px 12px; font-size: 0.8rem; color: #94a3b8; white-space: nowrap;">${formatEstDateTime(p.purchased_at)}</td>
          <td style="padding: 10px 12px;"><strong style="color: #38bdf8;">@${escapeHtml(p.username)}</strong></td>
          <td style="padding: 10px 12px; color: #fff; font-weight: 700;">${escapeHtml(p.item_name)}</td>
          <td style="padding: 10px 12px;"><span style="color:#cbd5e1; font-size:0.82rem; font-weight:700;">${escapeHtml(p.category)}</span></td>
          <td style="padding: 10px 12px; color: #fbbf24; font-weight: 800;">${COIN_SVG} ${p.price}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('adminFetchShopPurchases error:', err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef4444;padding:20px;">Connection error fetching purchases.</td></tr>';
  }
};

window.adminFetchAiFlagged = async () => {
  const punsTbody = document.getElementById('aipuns-tbody');
  const appealsTbody = document.getElementById('aiappeals-tbody');
  const auditsTbody = document.getElementById('aiaudits-tbody');
  if (!punsTbody || !appealsTbody) return;

  try {
    const res = await authFetch('/api/admin/ai-flagged-cases');
    if (!res.ok) {
      punsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:20px;">Failed to load cases.</td></tr>';
      appealsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:20px;">Failed to load appeals.</td></tr>';
      if (auditsTbody) auditsTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:20px;">Failed to load audits.</td></tr>';
      return;
    }
    const data = await res.json();
    const violations = data.violations || [];
    const appeals = data.appeals || [];
    const audits = data.audits || [];

    // Render violations (auto-bans/mutes)
    if (violations.length === 0) {
      punsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No AI auto-punishments recorded yet.</td></tr>';
    } else {
      punsTbody.innerHTML = violations.map(l => {
        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 10px 12px; font-size: 0.8rem; color: #94a3b8; white-space: nowrap;">${formatEstDateTime(l.created_at)}</td>
            <td style="padding: 10px 12px;"><strong style="color: #38bdf8;">@${escapeHtml(l.username)}</strong></td>
            <td style="padding: 10px 12px; max-width: 280px; word-break: break-word;"><code style="color:#ff6b6b; background:rgba(0,0,0,0.5); padding:2px 6px; border-radius:4px;">${escapeHtml(l.message || '')}</code></td>
            <td style="padding: 10px 12px;"><span style="color:#cbd5e1; font-weight:700; font-size:0.82rem;">${escapeHtml(l.category)}</span></td>
            <td style="padding: 10px 12px;"><span style="color:#ef4444; font-weight:800; font-size:0.82rem;">${(l.action_taken || 'blocked').toUpperCase()}</span></td>
            <td style="padding: 10px 12px; color: var(--text-muted); font-size: 0.82rem;">${escapeHtml(l.reason || 'Flagged')}</td>
          </tr>
        `;
      }).join('');
    }

    // Render AI pre-reviewed appeals
    if (appeals.length === 0) {
      appealsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No AI pre-reviewed appeals found.</td></tr>';
    } else {
      appealsTbody.innerHTML = appeals.map(a => {
        const statusColor = a.status === 'approved' ? '#10b981' : a.status === 'rejected' ? '#ef4444' : '#fbbf24';
        const aiRec = a.ai_recommendation || 'review';
        const aiColor = aiRec === 'approve' ? '#10b981' : aiRec === 'reject' ? '#ef4444' : '#fbbf24';
        
        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 10px 12px; font-size: 0.8rem; color: #94a3b8; white-space: nowrap;">${formatEstDateTime(a.created_at)}</td>
            <td style="padding: 10px 12px;"><strong style="color: #38bdf8;">@${escapeHtml(a.username)}</strong></td>
            <td style="padding: 10px 12px; color: #cbd5e1; font-size: 0.82rem; font-weight: 700;">${escapeHtml(a.punishment_type.toUpperCase())}</td>
            <td style="padding: 10px 12px;"><span style="color:${aiColor}; font-weight:800; font-size:0.82rem;">${aiRec.toUpperCase()}</span></td>
            <td style="padding: 10px 12px; font-size: 0.82rem; color: #fff;">
              ${escapeHtml(a.ai_rationale || 'N/A')}
              <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">Confidence: ${Math.round((a.ai_confidence || 0.95) * 100)}%</div>
            </td>
            <td style="padding: 10px 12px;"><span style="color:${statusColor}; font-weight:800; font-size:0.82rem;">${a.status.toUpperCase()}</span></td>
          </tr>
        `;
      }).join('');
    }

    // Render AI admin audits (Watchdog)
    if (auditsTbody) {
      if (audits.length === 0) {
        auditsTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">No AI admin audits recorded yet.</td></tr>';
      } else {
        auditsTbody.innerHTML = audits.map(au => {
          const evalColor = au.ai_evaluation === 'approved' ? '#10b981' : au.ai_evaluation === 'flagged_inappropriate' ? '#fbbf24' : '#ef4444';
          const scoreColor = au.ai_score >= 0.8 ? '#10b981' : au.ai_score >= 0.5 ? '#fbbf24' : '#ef4444';
          
          return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 10px 12px; font-size: 0.8rem; color: #94a3b8; white-space: nowrap;">${formatEstDateTime(au.created_at)}</td>
              <td style="padding: 10px 12px;"><strong style="color: #a855f7;">@${escapeHtml(au.admin_username)}</strong></td>
              <td style="padding: 10px 12px;"><span style="color:#cbd5e1; font-weight:700; font-size:0.82rem;">${escapeHtml(au.action)}</span></td>
              <td style="padding: 10px 12px; color: #38bdf8; font-weight: 700;">${escapeHtml(au.target || 'N/A')}</td>
              <td style="padding: 10px 12px; max-width: 250px; font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(au.reason || 'N/A')}</td>
              <td style="padding: 10px 12px;"><strong style="color:${scoreColor};">${Math.round((au.ai_score || 1.0) * 100)}%</strong></td>
              <td style="padding: 10px 12px;">
                <span style="display:inline-block; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:800; background:rgba(0,0,0,0.4); color:${evalColor}; margin-bottom:4px;">
                  ${au.ai_evaluation.replace(/_/g, ' ').toUpperCase()}
                </span>
                <div style="font-size:0.78rem; color:#fff;">${escapeHtml(au.ai_feedback || 'Passed audit')}</div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('adminFetchAiFlagged error:', err);
    punsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:20px;">Connection error fetching cases.</td></tr>';
    appealsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;padding:20px;">Connection error fetching appeals.</td></tr>';
    if (auditsTbody) auditsTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;padding:20px;">Connection error fetching audits.</td></tr>';
  }
};

// ==========================================
// 🏆 TOURNAMENTS (JAMS) MANAGEMENT
// ==========================================

window.adminFetchTournaments = async function() {
  const tbody = document.getElementById('admin-tour-submissions-tbody');
  const gameSelect = document.getElementById('admin-tour-game-select');

  if (gameSelect && gameSelect.options.length <= 1) {
    try {
      const res = await authFetch('/api/games');
      const data = await res.json();
      if (data.games) {
        gameSelect.innerHTML = '<option value="">Select Game...</option>' + 
          data.games.map(g => `<option value="${g.id}">${g.title}</option>`).join('');
      }
    } catch(e) {
      console.error('Failed to fetch games for select dropdown:', e);
    }
  }

  try {
    const res = await authFetch('/api/admin/tournaments/submissions');
    const data = await res.json();

    if (!tbody) return;

    if (data.success && data.submissions && data.submissions.length > 0) {
      tbody.innerHTML = data.submissions.map(sub => {
        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 10px 12px;"><strong style="color: #38bdf8;">@${escapeHtml(sub.username)}</strong></td>
            <td style="padding: 10px 12px;">
              <strong>${escapeHtml(sub.tournament_title)}</strong>
              <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">Game: ${escapeHtml(sub.game_title || 'N/A')}</span>
            </td>
            <td style="padding: 10px 12px; font-weight: 800; color: #fbbf24; font-size: 1rem;">${sub.score.toLocaleString()}</td>
            <td style="padding: 10px 12px;">
              <img src="${sub.proof_image_url}" style="width: 70px; height: 42px; border-radius: 4px; object-fit: cover; cursor: pointer; border: 1px solid rgba(255,255,255,0.15);" onclick="window.adminShowLightbox('${sub.proof_image_url}')" title="Click to view full size screenshot proof">
            </td>
            <td style="padding: 10px 12px; text-align: center;">
              <div style="display: flex; gap: 6px; justify-content: center;">
                <button class="btn-small" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981;" onclick="window.adminReviewSubmission(${sub.id}, 'approved')">✅ Approve</button>
                <button class="btn-small danger" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444;" onclick="window.adminReviewSubmission(${sub.id}, 'rejected')">✕ Reject</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 24px; text-align: center; color: var(--text-muted);">
            No pending scores to verify. Queue is empty!
          </td>
        </tr>
      `;
    }
  } catch (err) {
    console.error('adminFetchTournaments error:', err);
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ef4444; padding: 20px;">Connection error fetching queue.</td></tr>';
    }
  }
};

window.adminReviewSubmission = async function(submissionId, decision) {
  const notes = decision === 'rejected' ? prompt('Please enter rejection notes/reason (optional):') : '';
  if (decision === 'rejected' && notes === null) return;

  try {
    const res = await authFetch(`/api/admin/tournaments/submissions/${submissionId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, adminNotes: notes || '' })
    });
    
    const data = await res.json();
    if (res.ok) {
      alert(`Score submission successfully ${decision}!`);
      window.adminFetchTournaments();
    } else {
      alert(data.error || 'Failed to review submission.');
    }
  } catch (e) {
    alert('Network error reviewing submission.');
  }
};

window.adminShowLightbox = function(url) {
  const modal = document.getElementById('tour-lightbox-modal');
  const img = document.getElementById('tour-lightbox-img');
  if (modal && img) {
    img.src = url;
    modal.style.display = 'flex';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const tourForm = document.getElementById('admin-tournament-form');
  if (tourForm) {
    tourForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = document.getElementById('admin-tour-title').value.trim();
      const gameId = document.getElementById('admin-tour-game-select').value;
      const description = document.getElementById('admin-tour-desc').value.trim();
      const rewardCoins = document.getElementById('admin-tour-coins').value;
      const rewardXp = document.getElementById('admin-tour-xp').value;
      const rewardFlair = document.getElementById('admin-tour-flair').value.trim();
      const rewardCustom = document.getElementById('admin-tour-custom-reward') ? document.getElementById('admin-tour-custom-reward').value.trim() : '';
      const endAt = document.getElementById('admin-tour-end').value;

      try {
        const res = await authFetch('/api/admin/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: parseInt(gameId, 10),
            title,
            description,
            rewardCoins: parseInt(rewardCoins, 10),
            rewardXp: parseInt(rewardXp, 10),
            rewardFlair,
            rewardCustom,
            endAt
          })
        });

        const data = await res.json();
        if (res.ok) {
          alert('🏆 Tournament successfully started and broadcasted!');
          tourForm.reset();
          window.adminFetchTournaments();
        } else {
          alert(data.error || 'Failed to launch tournament.');
        }
      } catch (err) {
        alert('Network error launching tournament.');
      }
    });
  }
});
