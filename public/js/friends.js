import { getCurrentUser } from './auth.js';
import { getSharedSocket } from './socket.js';

let liveFriendStatuses = {};

export function initFriends() {
  setupFriendsUI();
  setupFriendSocketListeners();
  fetchFriends();
}

function setupFriendSocketListeners() {
  const socket = getSharedSocket();
  if (!socket) {
    setTimeout(setupFriendSocketListeners, 500);
    return;
  }

  socket.on('friend_status_broadcast', (statusMap) => {
    liveFriendStatuses = statusMap || {};
    renderFriendStatuses();
  });
}

function getAuthToken() {
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }
  return localStorage.getItem('nitro_jwt_token') || getCookie('nitro_jwt_token');
}

export async function fetchFriends() {
  const acceptedList = document.getElementById('friends-accepted-list');
  const pendingList = document.getElementById('friends-pending-list');
  const pendingSection = document.getElementById('friends-pending-section');

  if (!acceptedList) return;

  try {
    const token = getAuthToken();
    const currentUser = getCurrentUser();

    if (!token && !currentUser) {
      acceptedList.innerHTML = '<div style="color: var(--text-muted); padding: 16px;">Please sign in to view and add friends.</div>';
      if (pendingSection) pendingSection.style.display = 'none';
      return;
    }

    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch('/api/friends/list', { headers });
    if (!res.ok) {
      acceptedList.innerHTML = '<div style="color: var(--text-muted); padding: 16px;">Please sign in to view and add friends.</div>';
      if (pendingSection) pendingSection.style.display = 'none';
      return;
    }

    const data = await res.json();
    const friends = data.friends || [];
    const pending = data.pending || [];

    if (pending.length > 0) {
      if (pendingSection) pendingSection.style.display = 'block';
      if (pendingList) {
        pendingList.innerHTML = pending.map(p => 
          `<div style="display: flex; align-items: center; justify-content: space-between; background: rgba(251, 191, 36, 0.12); border: 1px solid #fbbf24; padding: 10px 14px; border-radius: 8px; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.2rem;">👤</span>
              <div>
                <strong style="color: #fbbf24;">${safeHtml(p.sender_display_name || p.sender_username)}</strong>
                <span style="display: block; font-size: 0.78rem; color: #94a3b8;">@${safeHtml(p.sender_username)}</span>
              </div>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="btn-small primary btn-accept-req" data-req-id="${p.request_id}">Accept</button>
              <button class="btn-small danger btn-decline-req" data-req-id="${p.request_id}">Decline</button>
            </div>
          </div>`
        ).join('');

        pendingList.querySelectorAll('.btn-accept-req').forEach(btn => {
          btn.addEventListener('click', () => window.respondFriendRequest(btn.dataset.reqId, 'accepted'));
        });
        pendingList.querySelectorAll('.btn-decline-req').forEach(btn => {
          btn.addEventListener('click', () => window.respondFriendRequest(btn.dataset.reqId, 'declined'));
        });
      }
    } else {
      if (pendingSection) pendingSection.style.display = 'none';
    }

    window._cachedFriends = friends;
    renderFriendStatuses();
  } catch (e) {
    console.error('fetchFriends error:', e);
  }
}

function renderFriendStatuses() {
  const acceptedList = document.getElementById('friends-accepted-list');
  const friends = window._cachedFriends || [];
  if (!acceptedList) return;

  if (friends.length === 0) {
    acceptedList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 24px;">No friends added yet. Type a student @username above to send a friend request!</div>';
    return;
  }

  acceptedList.innerHTML = friends.map(f => {
    const unameLower = String(f.username || '').toLowerCase();
    const liveObj = liveFriendStatuses[unameLower];
    const isOnline = Boolean(liveObj);
    const activityStr = liveObj ? (liveObj.activity || 'Online') : 'Offline';

    let badgeClass = 'offline';
    let badgeIcon = '⚪';
    if (isOnline) {
      if (activityStr.includes('Playing') || activityStr.includes('Game')) {
        badgeClass = 'playing';
        badgeIcon = '🎮';
      } else if (activityStr.includes('Voice') || activityStr.includes('Room')) {
        badgeClass = 'voice';
        badgeIcon = '🎧';
      } else if (activityStr.includes('Idle')) {
        badgeClass = 'idle';
        badgeIcon = '🌙';
      } else {
        badgeClass = 'online';
        badgeIcon = '🟢';
      }
    }

    return `
      <div class="friend-card-row">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.5rem; position: relative;">
            🎓
            <span style="position: absolute; bottom: -2px; right: -2px; width: 10px; height: 10px; border-radius: 50%; background: ${isOnline ? '#10b981' : '#64748b'}; border: 2px solid #000;"></span>
          </span>
          <div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="color: #fff; font-size: 0.95rem;">${safeHtml(f.display_name || f.username)}</strong>
              <span class="friend-status-badge ${badgeClass}">${badgeIcon} ${safeHtml(activityStr)}</span>
            </div>
            <span style="display: block; font-size: 0.78rem; color: #38bdf8;">@${safeHtml(f.username)}</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-small primary" onclick="window.quickDmUser('${safeHtml(f.username)}')">💬 DM</button>
          <button class="btn-small" style="background: #10b981; color: #000; font-weight: 800;" onclick="window.inviteFriendVoice('${safeHtml(f.username)}')">🎤 Voice</button>
        </div>
      </div>
    `;
  }).join('');
}

export async function sendFriendRequest(friendUsername) {
  const uname = String(friendUsername || '').trim().replace(/^@/, '');
  if (!uname) throw new Error('Please enter a student @username.');

  const token = getAuthToken();
  if (!token) throw new Error('Please sign in to send a friend request.');

  const res = await fetch('/api/friends/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ friendUsername: uname })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Friend request failed.');
  }

  fetchFriends();
  return data;
}

function setupFriendsUI() {
  const addBtn = document.getElementById('send-friend-request-btn');
  const input = document.getElementById('friend-request-username-input');

  if (addBtn && input) {
    addBtn.addEventListener('click', async () => {
      const uname = input.value.trim().replace(/^@/, '');
      if (!uname) return alert('Please enter a student @username.');

      try {
        await sendFriendRequest(uname);
        alert('Friend request sent!');
        input.value = '';
      } catch (e) {
        alert(e.message || 'Error sending friend request.');
      }
    });
  }
}

window.quickDmUser = (username) => {
  const dmTab = document.querySelector('.chat-mode-tab[data-mode="dm"]');
  if (dmTab) dmTab.click();
  setTimeout(() => {
    const dmInput = document.getElementById('chat-dm-target-user');
    if (dmInput) {
      dmInput.value = username;
      const dmSubmit = document.getElementById('chat-start-dm-btn');
      if (dmSubmit) dmSubmit.click();
    }
  }, 100);
};

window.respondFriendRequest = async (requestId, status) => {
  try {
    const token = getAuthToken();
    const res = await fetch('/api/friends/respond', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ requestId, status })
    });
    if (res.ok) {
      fetchFriends();
    }
  } catch (e) {}
};

window.inviteFriendVoice = (username) => {
  alert('Mic invite sent to @' + username + '! Join a voice room in the Voice Rooms tab.');
  const voiceTab = document.querySelector('.chat-mode-tab[data-mode="voice"]');
  if (voiceTab) voiceTab.click();
};

window.fetchFriends = fetchFriends;

function safeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
