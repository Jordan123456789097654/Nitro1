// Admin Dashboard, Live Connections Monitor, Slowmode & Moderation
import { getCurrentUser } from './auth.js';
import { loadGames } from './games.js';
import { checkStatusAndAnnouncements, checkUpdateLogs } from './app.js';
import { loadPolls } from './polls.js';
import { getSharedSocket } from './socket.js';

let adminSocket = null;

function authFetch(url, options = {}) {
  const token = localStorage.getItem('nitro_jwt_token');
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers, credentials: 'same-origin' });
}

export function initAdmin() {
  setupAdminTabs();
  setupAdminActions();
  setupMaintenanceToggle();
  setupAnnouncementForm();
  setupDomainBlockForm();
  setupUpdateLogForm();
  setupPollCreateForm();
  setupSlowmodeControls();
  setupAnnouncementDisableControls();
  setupUpdateDisableControls();
  setupBulkImporter();
  setupCreateUserForm();
  connectAdminSocket();
}

function setupCreateUserForm() {
  const form = document.getElementById('admin-create-user-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('admin-new-username').value.trim();
    const display_name = document.getElementById('admin-new-displayname').value.trim();
    const password = document.getElementById('admin-new-password').value.trim();
    const role = document.getElementById('admin-new-role').value;

    if (!username || !password) return alert('Username and Password are required.');

    try {
      const res = await authFetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, display_name, password, role })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || `Account @${username} created successfully!`);
        form.reset();
        fetchUsers();
      } else {
        alert(data.error || 'Failed to create user account.');
      }
    } catch (err) {
      alert('Error creating user account.');
    }
  });
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
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;

    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No users found</td></tr>';
      return;
    }

    tbody.innerHTML = data.users.map(u => {
      let statusHtml = '<span style="color:#10b981; font-weight:700;">ACTIVE</span>';
      if (u.is_banned) {
        statusHtml = '<span style="color:#ef4444; font-weight:700;">⛔ BANNED</span>';
      } else if (u.is_gateway_banned) {
        statusHtml = '<span style="color:#f59e0b; font-weight:700;">🌐 GATEWAY RESTRICTED</span>';
      } else if (u.muted_until && new Date(u.muted_until) > new Date()) {
        statusHtml = `<span style="color:#a855f7; font-weight:700;">MUTED (Until ${new Date(u.muted_until).toLocaleTimeString()})</span>`;
      } else if (u.gateway_timeout_until && new Date(u.gateway_timeout_until) > new Date()) {
        statusHtml = '<span style="color:#f59e0b; font-weight:700;">GATEWAY TIMEOUT</span>';
      }

      if (u.force_password_reset) {
        statusHtml += ' <span style="color:#38bdf8; font-size:0.75rem; display:block;">(Force Reset Pending)</span>';
      }

      const displayName = u.display_name && u.display_name !== u.username ? `<span style="color:#38bdf8; font-size:0.82rem;">(${u.display_name})</span>` : '';

      return `
        <tr>
          <td>#${u.id}</td>
          <td>
            <strong>${u.username}</strong> ${displayName}
            ${u.gateway_violations_count ? `<span style="color:#f59e0b; font-size:0.75rem; display:block;">(Strikes: ${u.gateway_violations_count}/3)</span>` : ''}
          </td>
          <td>
            <select class="custom-select-dropdown role-select-dropdown" onchange="window.setRole(${u.id}, this.value)" style="padding: 4px 8px; font-size: 0.8rem; font-weight: 800; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid var(--card-border); color: #fff; cursor: pointer;">
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
          <td>${statusHtml}</td>
          <td>
            <div class="action-btn-group" style="display: flex; flex-wrap: wrap; gap: 4px;">
              <button class="btn-small" style="background: rgba(251, 191, 36, 0.2); color: #fbbf24; border: 1px solid #fbbf24;" onclick="window.viewUserPassword('${u.username}', '${u.plain_password || ''}')" title="View plain text / Base64 decoded password">👁️ Pass</button>
              <button class="btn-small" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #38bdf8;" onclick="window.adminConfigProfile(${u.id}, ${JSON.stringify(u).replace(/"/g, '&quot;')})" title="Edit user profile, name, avatar, bio & perks">✏️ Edit Profile</button>
              <button class="btn-small" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid #a855f7;" onclick="window.adminMutePrompt(${u.id}, '${u.username}')">🔇 Mute</button>
              <button class="btn-small" style="background: rgba(255,255,255,0.1); color: #fff;" onclick="window.resetUserPassword(${u.id}, '${u.username}')">🔑 Pass</button>
              <button class="btn-small" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #38bdf8;" onclick="window.forceResetPassword(${u.id}, '${u.username}')" title="Require user to reset password on next login">🔄 Force Reset</button>
              ${u.is_banned ? 
                `<button class="btn-small unban" onclick="window.setBan(${u.id}, false)">🔓 Unban</button>` : 
                `<button class="btn-small ban" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444;" onclick="window.setBan(${u.id}, true)">⛔ Ban</button>`
              }
              ${u.is_gateway_banned ? 
                `<button class="btn-small" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981;" onclick="window.setGatewayBan(${u.id}, false)">🔓 Ungateway</button>` : 
                `<button class="btn-small" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b;" onclick="window.setGatewayBan(${u.id}, true)">🌐 Gateway Ban</button>`
              }
              ${u.role !== 'admin' || u.username.toLowerCase() !== 'jordandaniels' ?
                `<button class="btn-small danger" onclick="window.deleteUser(${u.id}, '${u.username}')" title="Permanently delete account">🗑️ Delete</button>` : ''
              }
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('fetchUsers error:', err);
  }
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

  modal.classList.add('active');
};

async function fetchFilters() {
  try {
    const res = await authFetch('/api/admin/filters');
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;

    const data = await res.json();
    const tbody = document.getElementById('admin-filters-tbody');
    if (!tbody) return;

    tbody.innerHTML = (data.filters || []).map(f => `
      <tr>
        <td><code>${f.word}</code></td>
        <td><span class="chat-badge">${f.filter_type}</span></td>
        <td>
          <button class="btn-small danger" onclick="window.deleteFilter(${f.id})">Remove</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    // Suppress
  }
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
        <td>${new Date(l.created_at).toLocaleString()}</td>
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
      if (targetTab === 'filters') fetchFilters();
      if (targetTab === 'suggestions') window.adminFetchSuggestions();
      if (targetTab === 'logs') fetchLogs();
      if (targetTab === 'webhooks') fetchAdminWebhooks();
      if (targetTab === 'radar') fetchActivityRadar();
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

  window.adminMutePrompt = (userId, username) => {
    const duration = prompt(`Mute ${username} for how many minutes? (e.g. 5, 15, 60):`, '15');
    if (!duration) return;
    const mins = parseInt(duration, 10);
    if (isNaN(mins) || mins <= 0) return alert('Invalid duration');

    const user = getCurrentUser();
    if (adminSocket && user) {
      adminSocket.emit('admin_mute_user', { targetUserId: userId, durationMinutes: mins, adminUser: user });
      alert(`🔇 ${username} muted for ${mins} minutes.`);
      setTimeout(fetchUsers, 500);
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
        '• 1 = 1 Hour\n' +
        '• 12 = 12 Hours\n' +
        '• 24 = 24 Hours (1 Day)\n' +
        '• 72 = 3 Days\n' +
        '• 168 = 7 Days (1 Week)\n' +
        '• 720 = 30 Days (1 Month)\n' +
        '• 0 = Permanent Ban\n\n' +
        'Enter hours (or 0 for Permanent):',
        '24'
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
            new_password
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

  const addFilterBtn = document.getElementById('add-filter-btn');
  if (addFilterBtn) {
    addFilterBtn.addEventListener('click', async () => {
      const wordInput = document.getElementById('new-filter-word');
      const word = wordInput.value.trim();
      if (!word) return;

      try {
        const res = await authFetch('/api/admin/filters/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word, filter_type: 'both' })
        });
        if (res.ok) {
          wordInput.value = '';
          fetchFilters();
        }
      } catch (e) {
        alert('Error adding filter rule');
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

      try {
        if (gameId) {
          const res = await authFetch(`/api/admin/games/${gameId}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, category, thumbnail_url, author, embed_type, embed_content, clicks })
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
