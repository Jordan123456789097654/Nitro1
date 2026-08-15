import { getCurrentUser } from './auth.js';

export function initFriends() {
  setupFriendsUI();
  fetchFriends();
}

export async function fetchFriends() {
  const acceptedList = document.getElementById('friends-accepted-list');
  const pendingList = document.getElementById('friends-pending-list');
  const pendingSection = document.getElementById('friends-pending-section');

  if (!acceptedList) return;

  try {
    const token = localStorage.getItem('nitro_jwt_token');
    if (!token) {
      acceptedList.innerHTML = '<div style="color: var(--text-muted); padding: 16px;">Please sign in to view and add friends.</div>';
      return;
    }

    const res = await fetch('/api/friends/list', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const friends = data.friends || [];
    const pending = data.pending || [];

    if (pending.length > 0) {
      if (pendingSection) pendingSection.style.display = 'block';
      if (pendingList) {
        pendingList.innerHTML = pending.map(p => 
          '<div style="display: flex; align-items: center; justify-content: space-between; background: rgba(251, 191, 36, 0.12); border: 1px solid #fbbf24; padding: 10px 14px; border-radius: 8px;">' +
            '<div style="display: flex; align-items: center; gap: 10px;">' +
              '<span style="font-size: 1.2rem;">👤</span>' +
              '<div>' +
                '<strong style="color: #fbbf24;">' + safeHtml(p.sender_display_name || p.sender_username) + '</strong>' +
                '<span style="display: block; font-size: 0.78rem; color: #94a3b8;">@' + safeHtml(p.sender_username) + '</span>' +
                '</div>' +
            '</div>' +
            '<div style="display: flex; gap: 6px;">' +
              '<button class="btn-small primary" onclick="window.respondFriendRequest(' + p.request_id + ', \'accepted\')">Accept</button>' +
              '<button class="btn-small danger" onclick="window.respondFriendRequest(' + p.request_id + ', \'declined\')">Decline</button>' +
            '</div>' +
          '</div>'
        ).join('');
      }
    } else {
      if (pendingSection) pendingSection.style.display = 'none';
    }

    if (friends.length === 0) {
      acceptedList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 24px;">No friends added yet. Type a student @username above to send a friend request!</div>';
      return;
    }

    acceptedList.innerHTML = friends.map(f => 
      '<div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.3); border: 1px solid var(--card-border); padding: 12px 16px; border-radius: 12px;">' +
        '<div style="display: flex; align-items: center; gap: 12px;">' +
          '<span style="font-size: 1.5rem;">🎓</span>' +
          '<div>' +
            '<strong style="color: #fff; font-size: 0.95rem;">' + safeHtml(f.display_name || f.username) + '</strong>' +
            '<span style="display: block; font-size: 0.78rem; color: #38bdf8;">@' + safeHtml(f.username) + '</span>' +
          '</div>' +
        '</div>' +
        '<div style="display: flex; gap: 8px;">' +
          '<button class="btn-small primary" onclick="window.quickDmUser(\'' + f.username + '\')">💬 DM</button>' +
          '<button class="btn-small" style="background: #10b981; color: #000; font-weight: 800;" onclick="window.inviteFriendVoice(\'' + f.username + '\')">🎤 Voice</button>' +
        '</div>' +
      '</div>'
    ).join('');
  } catch (e) {}
}

export async function sendFriendRequest(friendUsername) {
  const uname = String(friendUsername || '').trim().replace(/^@/, '');
  if (!uname) throw new Error('Please enter a student @username.');

  const token = localStorage.getItem('nitro_jwt_token');
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
    const token = localStorage.getItem('nitro_jwt_token');
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
