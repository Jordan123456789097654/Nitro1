// Real-time Global Chat, DMs, Private Rooms, GIF Picker & Collaborative Study Whiteboard
import { getCurrentUser, renderAvatarElement } from './auth.js';
import { getSharedSocket } from './socket.js';

let socket = null;
let activeChatMode = 'global'; // 'global', 'dm', 'room', 'whiteboard'
let activeDmRecipient = null;
let activeRoomCode = null;
let slowmodeSeconds = 0;
let pendingChatImageBase64 = null;

// Curated High-Reliability Animated Stickers & GIFs Library
const STICKER_PACK = [
  // Memes
  { name: 'Cat Vibe', category: 'memes', url: 'https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif' },
  { name: 'Popcat', category: 'memes', url: 'https://media.giphy.com/media/A7Zc53y83fP6o/giphy.gif' },
  { name: 'Mind Blown', category: 'memes', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
  { name: 'Rickroll Dance', category: 'memes', url: 'https://media.giphy.com/media/g7GKYSzwKDypa/giphy.gif' },
  { name: 'Doge Vibe', category: 'memes', url: 'https://media.giphy.com/media/OGH78iLfV6LFm/giphy.gif' },
  { name: 'Pepe Dance', category: 'memes', url: 'https://media.giphy.com/media/13Z5kutu0m0SmA/giphy.gif' },
  { name: 'Party Blob', category: 'memes', url: 'https://media.giphy.com/media/l3q2u6MXJ28D843yy/giphy.gif' },
  { name: 'Gigachad', category: 'memes', url: 'https://media.giphy.com/media/CAYVZA5NRb529kKQUc/giphy.gif' },
  { name: 'Thinking Meme', category: 'memes', url: 'https://media.giphy.com/media/d3mlE7uhX8KFgEmY/giphy.gif' },

  // Gaming
  { name: 'GG WP', category: 'gaming', url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif' },
  { name: 'Hacker Matrix', category: 'gaming', url: 'https://media.giphy.com/media/QHE5gWI0QjqF2/giphy.gif' },
  { name: 'Pixel Fire', category: 'gaming', url: 'https://media.giphy.com/media/l41FJv0d4C4GvVzTq/giphy.gif' },
  { name: 'Pixel Space', category: 'gaming', url: 'https://media.giphy.com/media/3o6Zt8z5f96T8cZz3y/giphy.gif' },
  { name: 'Game Over', category: 'gaming', url: 'https://media.giphy.com/media/l2Je66zG6mAAZxgqI/giphy.gif' },
  { name: 'Minecraft Dance', category: 'gaming', url: 'https://media.giphy.com/media/1tZ4j4e9vT0xG/giphy.gif' },
  { name: 'Victory Royale', category: 'gaming', url: 'https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif' },

  // Anime & Chill
  { name: 'Lo-Fi Girl', category: 'anime', url: 'https://media.giphy.com/media/l0HlTy9x8FZo0XO1i/giphy.gif' },
  { name: 'Anime Dance', category: 'anime', url: 'https://media.giphy.com/media/b95WwT5T2m4AAAAC/anime.gif' },
  { name: 'Pixel Sunset', category: 'anime', url: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif' },
  { name: 'Coffee Chill', category: 'anime', url: 'https://media.giphy.com/media/h36vh423PiV9K/giphy.gif' },
  { name: 'Chibi Cheer', category: 'anime', url: 'https://media.giphy.com/media/13l7w7N4Vr1yA0/giphy.gif' },

  // Reactions
  { name: 'Confused', category: 'reactions', url: 'https://media.giphy.com/media/g01ZnwAUvctuK8GIQn/giphy.gif' },
  { name: 'Clapping', category: 'reactions', url: 'https://media.giphy.com/media/13G7rg64OGEh32/giphy.gif' },
  { name: 'Shocked', category: 'reactions', url: 'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif' },
  { name: 'Facepalm', category: 'reactions', url: 'https://media.giphy.com/media/xsF1FSDbjguis/giphy.gif' },
  { name: 'Thumbs Up', category: 'reactions', url: 'https://media.giphy.com/media/10g8gVlA1g3y6M/giphy.gif' },

  // Stickers
  { name: 'Sparkles', category: 'stickers', url: 'https://media.giphy.com/media/26tPplGWjN0xLybiU/giphy.gif' },
  { name: 'Dancing Penguin', category: 'stickers', url: 'https://media.giphy.com/media/l0HlTy9x8FZo0XO1i/giphy.gif' },
  { name: 'Fire Heart', category: 'stickers', url: 'https://media.giphy.com/media/3o7TKrEzvLbsVAxWko/giphy.gif' },
  { name: 'Happy Frog', category: 'stickers', url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif' }
];

export function initChat() {
  socket = getSharedSocket();
  if (!socket) return;

  setupSocketListeners();
  setupChatTabs();
  setupChatForm();
  setupChatImageUpload();
  setupPrivateRoomForm();
  setupDmForm();
  setupGifPicker();
  setupWhiteboard();
  setupVoiceRecorder();
}

let mediaRecorder = null;
let audioChunks = [];
let isRecordingVoice = false;

function setupVoiceRecorder() {
  const btn = document.getElementById('chat-voice-record-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (!user) return alert('Please log in to record voice memos.');

    if (isRecordingVoice) {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
      }

      mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        isRecordingVoice = false;
        btn.textContent = '🎙️ Mic';
        btn.style.background = 'rgba(239,68,68,0.15)';
        btn.style.color = '#ef4444';

        stream.getTracks().forEach(track => track.stop());

        if (audioChunks.length === 0) return;
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;
          if (activeChatMode === 'global') {
            socket.emit('send_message', { user, text: '🎙️ Voice Memo', audioUrl: base64Audio });
          } else if (activeChatMode === 'dm' && activeDmRecipient) {
            socket.emit('send_dm', { sender: user, recipientUsername: activeDmRecipient, text: '🎙️ Voice Memo', audioUrl: base64Audio });
          }
        };
      };

      mediaRecorder.start();
      isRecordingVoice = true;
      btn.textContent = '🔴 Rec...';
      btn.style.background = '#ef4444';
      btn.style.color = '#fff';

      setTimeout(() => {
        if (isRecordingVoice && mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      }, 15000);
    } catch (err) {
      alert('Microphone access denied or unavailable.');
    }
  });
}

function setupGifPicker() {
  const gifBtn = document.getElementById('chat-gif-btn');
  const drawer = document.getElementById('chat-gif-drawer');
  const grid = document.getElementById('chat-gif-grid');
  const searchInput = document.getElementById('chat-gif-search');
  const catBtns = document.querySelectorAll('.gif-cat-btn');

  let currentCategory = 'all';

  function renderGifs(items) {
    if (!grid) return;
    grid.innerHTML = items.map(g => `
      <div class="chat-gif-item" data-url="${g.url}">
        <img src="${g.url}" loading="lazy" alt="${g.name}" onerror="this.onerror=null; this.src='https://media.tenor.com/2roovnT3zCIAAAAC/cat-cat-vibe.gif';">
      </div>
    `).join('');

    grid.querySelectorAll('.chat-gif-item').forEach(el => {
      el.addEventListener('click', () => {
        const url = el.dataset.url;
        const user = getCurrentUser();
        if (!user) return alert('Please log in to send GIFs.');
        if (activeChatMode === 'global') {
          socket.emit('send_message', { user, text: '', gifUrl: url });
        } else if (activeChatMode === 'room' && activeRoomCode) {
          socket.emit('send_private_room_msg', { roomCode: activeRoomCode, user, text: `[GIF:${url}]` });
        }
        if (drawer) drawer.style.display = 'none';
      });
    });
  }

  function filterAndRender() {
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
    let filtered = STICKER_PACK;

    if (currentCategory !== 'all') {
      filtered = filtered.filter(g => g.category === currentCategory);
    }

    if (q) {
      filtered = filtered.filter(g => g.name.toLowerCase().includes(q) || g.category.includes(q));
    }

    renderGifs(filtered);
  }

  catBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      catBtns.forEach(b => {
        b.style.background = 'rgba(255,255,255,0.05)';
        b.style.color = '#94a3b8';
      });
      btn.style.background = 'rgba(255,255,255,0.15)';
      btn.style.color = '#fff';

      currentCategory = btn.dataset.cat;
      filterAndRender();
    });
  });

  if (gifBtn && drawer) {
    gifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      drawer.style.display = drawer.style.display === 'block' ? 'none' : 'block';
      filterAndRender();
    });

    document.addEventListener('click', (e) => {
      if (drawer && !drawer.contains(e.target) && e.target !== gifBtn) {
        drawer.style.display = 'none';
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      filterAndRender();
    });
  }
}

function setupSocketListeners() {
  const container = document.getElementById('chat-messages');

  socket.off('connect');
  socket.off('initial_messages');
  socket.off('new_message');
  socket.off('new_dm');
  socket.off('dm_history');
  socket.off('private_room_message');
  socket.off('private_room_system_msg');
  socket.off('message_deleted');

  socket.off('open_dms_list');
  socket.off('open_dms_update');

  socket.on('connect', () => {
    const user = getCurrentUser();
    if (user) {
      socket.emit('user_connected', { user, activity: 'Global Chat' });
    }
  });

  socket.on('open_dms_list', (conversations) => {
    renderOpenDmsPills(conversations);
  });

  socket.on('open_dms_update', () => {
    const user = getCurrentUser();
    if (user && socket) {
      socket.emit('get_open_dms', { username: user.username });
    }
  });

  socket.on('initial_messages', (messages) => {
    cachedGlobalMessages = messages || [];
    if (activeChatMode === 'global') {
      renderGlobalChatMessages();
    }
  });

  socket.on('new_message', (msg) => {
    if (msg) cachedGlobalMessages.push(msg);
    if (activeChatMode === 'global') {
      appendChatMessage(msg);
      scrollChatToBottom();
    }
  });

  socket.on('new_dm', (dm) => {
    if (activeChatMode === 'dm' && activeDmRecipient && 
       (dm.sender_username.toLowerCase() === activeDmRecipient.toLowerCase() || 
        dm.receiver_username.toLowerCase() === activeDmRecipient.toLowerCase())) {
      appendDmMessage(dm);
      scrollChatToBottom();
    } else {
      const user = getCurrentUser();
      if (user && dm.receiver_username.toLowerCase() === user.username.toLowerCase()) {
        const notifBadge = document.getElementById('chat-dm-badge');
        if (notifBadge) notifBadge.style.display = 'inline-block';
      }
    }
  });

  socket.on('dm_history', ({ otherUser, messages }) => {
    if (activeChatMode === 'dm' && activeDmRecipient === otherUser) {
      container.innerHTML = '';
      messages.forEach(appendDmMessage);
      scrollChatToBottom();
    }
  });

  socket.on('private_room_message', (msg) => {
    if (activeChatMode === 'room' && activeRoomCode === msg.roomCode) {
      appendRoomMessage(msg);
      scrollChatToBottom();
    }
  });

  socket.on('private_room_system_msg', ({ roomCode, message }) => {
    if (activeChatMode === 'room' && activeRoomCode === roomCode) {
      const sysDiv = document.createElement('div');
      sysDiv.style.cssText = 'text-align: center; font-size: 0.8rem; color: #94a3b8; margin: 8px 0; font-style: italic;';
      sysDiv.textContent = message;
      container.appendChild(sysDiv);
      scrollChatToBottom();
    }
  });

  socket.on('message_deleted', ({ messageId }) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.innerHTML = '<em style="color: var(--text-muted); font-size: 0.8rem;">[Message deleted by administrator]</em>';
    }
  });

  socket.on('slowmode_status', ({ seconds }) => {
    slowmodeSeconds = seconds;
    const slowmodeIndicator = document.getElementById('chat-slowmode-indicator');
    if (slowmodeIndicator) {
      slowmodeIndicator.textContent = seconds > 0 ? `⏳ Slowmode: ${seconds}s` : '';
      slowmodeIndicator.style.display = seconds > 0 ? 'inline-block' : 'none';
    }
  });

  socket.on('user_muted', ({ username, durationMinutes }) => {
    const user = getCurrentUser();
    if (user && user.username && user.username.toLowerCase() === username.toLowerCase()) {
      if (confirm(`🔇 You have been temporarily muted for ${durationMinutes} minutes.\n\nWould you like to submit an appeal to staff?`)) {
        if (window.openAppealModal) window.openAppealModal(user.username);
      }
    }
  });

  socket.on('force_disconnect', ({ reason }) => {
    alert(`⚠️ Disconnected: ${reason}`);
    window.location.reload();
  });

  socket.on('error_message', (msg) => {
    if (typeof msg === 'string' && (msg.includes('muted') || msg.includes('Muted') || msg.includes('banned') || msg.includes('Suspended') || msg.includes('prohibited word'))) {
      if (confirm(`⚠️ ${msg}\n\nWould you like to submit an appeal to staff?`)) {
        const user = getCurrentUser();
        if (window.openAppealModal) window.openAppealModal(user ? user.username : '');
      }
    } else {
      alert(`⚠️ ${msg}`);
    }
  });

  socket.on('online_count', (count) => {
    const onlineEl = document.getElementById('chat-online-count');
    if (onlineEl) onlineEl.textContent = `${count} Online`;
  });

  socket.on('private_room_members_update', ({ roomCode, owner, members, hasPassword }) => {
    if (activeChatMode !== 'room' || activeRoomCode !== roomCode) return;

    const controlsPanel = document.getElementById('chat-room-controls');
    if (controlsPanel) controlsPanel.style.display = 'flex';

    const ownerName = document.getElementById('chat-room-owner-name');
    if (ownerName) ownerName.textContent = `@${owner}`;

    const lockStatus = document.getElementById('chat-room-lock-status');
    if (lockStatus) {
      lockStatus.textContent = hasPassword ? '🔒 Protected' : '🔓 Public';
      lockStatus.style.color = hasPassword ? '#ef4444' : '#10b981';
    }

    const actionsRow = document.getElementById('chat-room-actions-row');
    const user = getCurrentUser();
    const isOwner = user && user.username === owner;
    if (actionsRow) {
      actionsRow.style.display = isOwner ? 'flex' : 'none';
    }

    const pillsContainer = document.getElementById('chat-room-members-pills');
    if (pillsContainer) {
      pillsContainer.innerHTML = members.map(m => `
        <span style="font-size: 0.68rem; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.08); color: ${m === owner ? '#fbbf24' : '#fff'}; font-weight: ${m === owner ? '800' : 'normal'};">
          ${m === owner ? '👑 ' : ''}@${m}
        </span>
      `).join('');
    }
  });

  socket.on('private_room_auth_challenge', ({ roomCode, error }) => {
    const pw = prompt(`${error || 'This room is password-protected.'} Enter room password:`);
    if (pw !== null) {
      const user = getCurrentUser();
      socket.emit('join_private_room', { roomCode, user, password: pw });
    } else {
      activeRoomCode = '';
      const activeLabel = document.getElementById('chat-room-active-label');
      if (activeLabel) activeLabel.textContent = '';
      const controlsPanel = document.getElementById('chat-room-controls');
      if (controlsPanel) controlsPanel.style.display = 'none';
    }
  });

  socket.on('kicked_from_private_room', ({ roomCode }) => {
    alert(`👢 You were kicked from private room #${roomCode} by the host.`);
    activeRoomCode = '';
    const activeLabel = document.getElementById('chat-room-active-label');
    if (activeLabel) activeLabel.textContent = '';
    document.getElementById('chat-messages').innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">You were kicked from this room.</div>';
    const controlsPanel = document.getElementById('chat-room-controls');
    if (controlsPanel) controlsPanel.style.display = 'none';
  });
}

function renderOpenDmsPills(conversations) {
  const container = document.getElementById('chat-open-dms-pills');
  if (!container) return;

  if (!conversations || conversations.length === 0) {
    container.innerHTML = '<span style="font-size: 0.78rem; color: var(--text-muted); font-style: italic;">No open conversations yet. Type a username above!</span>';
    return;
  }

  container.innerHTML = conversations.map(c => {
    const isActive = activeDmRecipient && activeDmRecipient.toLowerCase() === c.other_user.toLowerCase();
    return `
      <button class="btn-small" onclick="window.openDmConversation('${c.other_user}')" style="background: ${isActive ? '#38bdf8' : 'rgba(255,255,255,0.08)'}; color: ${isActive ? '#000' : '#fff'}; font-weight: 700; border: 1px solid ${isActive ? '#38bdf8' : 'rgba(255,255,255,0.12)'}; padding: 4px 10px; border-radius: 99px; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="${escapeHtml(c.message || '')}">
        <span>💬</span>
        <span>@${escapeHtml(c.other_user)}</span>
      </button>
    `;
  }).join('');
}

window.openDmConversation = (targetUsername) => {
  if (!targetUsername) return;
  const user = getCurrentUser();
  if (!user) return alert('Please log in to chat.');

  activeDmRecipient = targetUsername;
  document.getElementById('chat-dm-active-label').textContent = `💬 Chatting with @${targetUsername}`;
  socket.emit('get_dm_history', { username1: user.username, username2: targetUsername });
  socket.emit('get_open_dms', { username: user.username });
};

function setupChatTabs() {
  const tabs = document.querySelectorAll('.chat-mode-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (activeRoomCode && tab.dataset.mode !== 'room' && tab.dataset.mode !== 'whiteboard') {
        socket.emit('leave_private_room', { roomCode: activeRoomCode });
        activeRoomCode = '';
        const controlsPanel = document.getElementById('chat-room-controls');
        if (controlsPanel) controlsPanel.style.display = 'none';
      }

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      activeChatMode = tab.dataset.mode;
      const globalHeader = document.getElementById('chat-global-subhead');
      const dmBar = document.getElementById('chat-dm-bar');
      const roomBar = document.getElementById('chat-room-bar');
      const whiteboardContainer = document.getElementById('chat-whiteboard-container');
      const voiceContainer = document.getElementById('chat-voice-container');
      const chatMessagesContainer = document.getElementById('chat-messages');
      const chatInputForm = document.getElementById('chat-form');

      const friendsContainer = document.getElementById('chat-friends-container');

      if (activeChatMode === 'voice') {
        if (globalHeader) globalHeader.style.display = 'none';
        if (dmBar) dmBar.style.display = 'none';
        if (roomBar) roomBar.style.display = 'none';
        if (chatMessagesContainer) chatMessagesContainer.style.display = 'none';
        if (chatInputForm) chatInputForm.style.display = 'none';
        if (whiteboardContainer) whiteboardContainer.style.display = 'none';
        if (friendsContainer) friendsContainer.style.display = 'none';
        if (voiceContainer) voiceContainer.style.display = 'flex';
        return;
      }

      if (activeChatMode === 'friends') {
        if (globalHeader) globalHeader.style.display = 'none';
        if (dmBar) dmBar.style.display = 'none';
        if (roomBar) roomBar.style.display = 'none';
        if (chatMessagesContainer) chatMessagesContainer.style.display = 'none';
        if (chatInputForm) chatInputForm.style.display = 'none';
        if (whiteboardContainer) whiteboardContainer.style.display = 'none';
        if (voiceContainer) voiceContainer.style.display = 'none';
        if (friendsContainer) friendsContainer.style.display = 'flex';
        if (window.fetchFriends) window.fetchFriends();
        return;
      }

      if (voiceContainer) voiceContainer.style.display = 'none';
      if (friendsContainer) friendsContainer.style.display = 'none';

      if (activeChatMode === 'whiteboard') {
        if (whiteboardContainer) whiteboardContainer.style.display = 'flex';
        if (chatMessagesContainer) chatMessagesContainer.style.display = 'none';
        if (chatInputForm) chatInputForm.style.display = 'none';
        initWhiteboardCanvas();
        return;
      }

      if (whiteboardContainer) whiteboardContainer.style.display = 'none';
      if (chatMessagesContainer) chatMessagesContainer.style.display = 'flex';
      if (chatInputForm) chatInputForm.style.display = 'flex';
      chatMessagesContainer.innerHTML = '';

      if (activeChatMode === 'global') {
        if (globalHeader) globalHeader.style.display = 'flex';
        if (dmBar) dmBar.style.display = 'none';
        if (roomBar) roomBar.style.display = 'none';
        const user = getCurrentUser();
        if (socket && user) {
          socket.emit('user_connected', { user, activity: 'Global Chat' });
          socket.emit('get_initial_messages');
        }
      } else if (activeChatMode === 'dm') {
        if (globalHeader) globalHeader.style.display = 'none';
        if (dmBar) dmBar.style.display = 'flex';
        if (roomBar) roomBar.style.display = 'none';
        const notifBadge = document.getElementById('chat-dm-badge');
        if (notifBadge) notifBadge.style.display = 'none';
        const user = getCurrentUser();
        if (user && socket) {
          socket.emit('get_open_dms', { username: user.username });
        }
        chatMessagesContainer.innerHTML = '<div style="text-align:center; padding:30px; color:#94a3b8;">Enter a student username above or click an Open DM to load your conversation.</div>';
      } else if (activeChatMode === 'room') {
        if (globalHeader) globalHeader.style.display = 'none';
        if (dmBar) dmBar.style.display = 'none';
        if (roomBar) roomBar.style.display = 'flex';
        chatMessagesContainer.innerHTML = '<div style="text-align:center; padding:30px; color:#94a3b8;">Enter or create a Private Room Code (e.g. "math-squad") to join a private group chat.</div>';
      }
    });
  });
}

let whiteboardStrokes = [];

function setupWhiteboard() {
  const canvas = document.getElementById('whiteboard-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let currentColor = '#38bdf8';
  let currentWidth = 3;
  let isEraser = false;

  function redrawAll() {
    const parent = canvas.parentElement;
    if (parent && (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight - 60)) {
      canvas.width = parent.clientWidth || 800;
      canvas.height = Math.max(400, (parent.clientHeight || 500) - 60);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    whiteboardStrokes.forEach(drawSegmentLocal);
  }

  function drawSegmentLocal(seg) {
    if (!seg || seg.fromX === undefined) return;
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = seg.width || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = seg.color || '#38bdf8';
    ctx.moveTo(seg.fromX * canvas.width, seg.fromY * canvas.height);
    ctx.lineTo(seg.toX * canvas.width, seg.toY * canvas.height);
    ctx.stroke();
    ctx.restore();
  }

  window.addEventListener('resize', redrawAll);
  setTimeout(redrawAll, 100);

  const colorBtns = document.querySelectorAll('.wb-color-btn');
  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      isEraser = false;
      colorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentColor = btn.dataset.color || '#38bdf8';
    });
  });

  const eraserBtn = document.getElementById('wb-eraser-btn');
  if (eraserBtn) {
    eraserBtn.addEventListener('click', () => {
      isEraser = true;
      colorBtns.forEach(b => b.classList.remove('active'));
      eraserBtn.classList.add('active');
    });
  }

  const clearBtn = document.getElementById('wb-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      whiteboardStrokes = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const room = activeRoomCode || 'global';
      if (socket) socket.emit('whiteboard_clear', { roomCode: room });
    });
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return {
      normX: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      normY: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    };
  }

  function startDraw(e) {
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.normX;
    lastY = pos.normY;
  }

  function draw(e) {
    if (!isDrawing) return;
    const pos = getPos(e);
    const seg = {
      fromX: lastX,
      fromY: lastY,
      toX: pos.normX,
      toY: pos.normY,
      color: isEraser ? '#090a0f' : currentColor,
      width: isEraser ? 18 : currentWidth
    };
    drawSegmentLocal(seg);
    whiteboardStrokes.push(seg);
    lastX = pos.normX;
    lastY = pos.normY;

    const room = activeRoomCode || 'global';
    if (socket) {
      socket.emit('whiteboard_draw', {
        roomCode: room,
        stroke: seg
      });
    }
  }

  function stopDraw() {
    isDrawing = false;
  }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDraw);
  canvas.addEventListener('mouseleave', stopDraw);

  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); }, { passive: false });
  canvas.addEventListener('touchend', stopDraw);

  if (socket) {
    socket.on('whiteboard_draw', ({ stroke }) => {
      if (!stroke) return;
      whiteboardStrokes.push(stroke);
      drawSegmentLocal(stroke);
    });

    socket.on('whiteboard_clear', () => {
      whiteboardStrokes = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    socket.on('whiteboard_history', ({ strokes }) => {
      whiteboardStrokes = strokes || [];
      redrawAll();
    });
  }
}

function initWhiteboardCanvas() {
  const room = activeRoomCode || 'global';
  if (socket) socket.emit('join_whiteboard', { roomCode: room });
}

function setupDmForm() {
  const startDmBtn = document.getElementById('chat-start-dm-btn');
  const dmUserSelect = document.getElementById('chat-dm-target-user');

  if (startDmBtn && dmUserSelect) {
    startDmBtn.addEventListener('click', () => {
      const recipient = dmUserSelect.value.trim();
      const user = getCurrentUser();
      if (!user) return alert('Please log in to start direct messaging.');
      if (!recipient) return alert('Please enter a username to direct message.');
      if (recipient.toLowerCase() === user.username.toLowerCase()) return alert('You cannot direct message yourself.');

      activeDmRecipient = recipient;
      document.getElementById('chat-dm-active-label').textContent = `💬 Chat with: ${recipient}`;
      socket.emit('get_dm_history', { username1: user.username, username2: recipient });
    });
  }
}

function setupPrivateRoomForm() {
  const joinBtn = document.getElementById('chat-join-room-btn');
  const codeInput = document.getElementById('chat-room-code-input');

  const setPwBtn = document.getElementById('chat-room-set-pw-btn');
  const kickBtn = document.getElementById('chat-room-kick-btn');
  const transferBtn = document.getElementById('chat-room-transfer-btn');

  if (joinBtn && codeInput) {
    joinBtn.addEventListener('click', () => {
      const code = codeInput.value.trim();
      if (!code) return;
      activeRoomCode = code;
      const user = getCurrentUser();

      socket.emit('join_private_room', { roomCode: code, user });
      document.getElementById('chat-messages').innerHTML = '';
      document.getElementById('chat-room-active-label').textContent = `🔒 Room: #${code}`;
    });
  }

  if (setPwBtn) {
    setPwBtn.addEventListener('click', () => {
      if (!activeRoomCode) return;
      const pw = prompt('Enter a new password for this room (leave blank to remove password protection):');
      if (pw !== null) {
        socket.emit('set_room_password', { roomCode: activeRoomCode, password: pw });
      }
    });
  }

  if (kickBtn) {
    kickBtn.addEventListener('click', () => {
      if (!activeRoomCode) return;
      const target = prompt('Enter username of the student you want to kick:');
      if (target && target.trim()) {
        socket.emit('kick_room_user', { roomCode: activeRoomCode, targetUsername: target.trim() });
      }
    });
  }

  if (transferBtn) {
    transferBtn.addEventListener('click', () => {
      if (!activeRoomCode) return;
      const target = prompt('Enter username of the student to transfer host ownership to:');
      if (target && target.trim()) {
        socket.emit('transfer_room_ownership', { roomCode: activeRoomCode, targetUsername: target.trim() });
      }
    });
  }
}

async function processChatImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Invalid image file.'));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1280;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          resolve(compressed || dataUrl);
        } catch (err) {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function setupChatImageUpload() {
  const fileInput = document.getElementById('chat-image-file-input');
  const btn = document.getElementById('chat-image-btn');
  const previewBar = document.getElementById('chat-image-preview-bar');
  const previewThumb = document.getElementById('chat-image-preview-thumb');
  const previewName = document.getElementById('chat-image-preview-name');
  const removeBtn = document.getElementById('chat-image-remove-btn');

  if (btn && fileInput) {
    btn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (file.size > 25 * 1024 * 1024) {
          alert('Image file must be smaller than 25MB.');
          fileInput.value = '';
          return;
        }
        try {
          pendingChatImageBase64 = await processChatImageFile(file);
          if (previewThumb) previewThumb.src = pendingChatImageBase64;
          if (previewName) previewName.textContent = file.name;
          if (previewBar) previewBar.style.display = 'flex';
        } catch (e) {
          console.error('Error processing image:', e);
          alert('Could not process image file. Please try a standard JPG, PNG, WEBP, or GIF image.');
        }
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      pendingChatImageBase64 = null;
      if (fileInput) fileInput.value = '';
      if (previewBar) previewBar.style.display = 'none';
    });
  }

  // Clipboard Paste Image Support (Ctrl + V)
  window.addEventListener('paste', async (e) => {
    const chatView = document.getElementById('view-chat');
    if (!chatView || chatView.style.display === 'none') return;

    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        try {
          pendingChatImageBase64 = await processChatImageFile(file);
          if (previewThumb) previewThumb.src = pendingChatImageBase64;
          if (previewName) previewName.textContent = `Pasted_Screenshot_${Date.now()}.png`;
          if (previewBar) previewBar.style.display = 'flex';
        } catch (err) {
          console.error('Error processing pasted image:', err);
        }
        break;
      }
    }
  });

  // Lightbox Modal Handler
  const lightboxModal = document.getElementById('chat-image-lightbox-modal');
  const lightboxImg = document.getElementById('chat-image-lightbox-img');
  const lightboxClose = document.getElementById('chat-image-lightbox-close');

  window.openChatImageLightbox = (url) => {
    if (lightboxModal && lightboxImg) {
      lightboxImg.src = url;
      lightboxModal.style.display = 'flex';
    }
  };

  if (lightboxClose && lightboxModal) {
    lightboxClose.addEventListener('click', () => {
      lightboxModal.style.display = 'none';
    });
  }
  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) lightboxModal.style.display = 'none';
    });
  }
}

function setupChatForm() {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const fileInput = document.getElementById('chat-image-file-input');
  const previewBar = document.getElementById('chat-image-preview-bar');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    const imageUrl = pendingChatImageBase64 || '';
    if (!text && !imageUrl) return;

    if (text.startsWith('/image ') || text.startsWith('/imagine ')) {
      generateAndSendAiImage(text, activeChatMode, activeDmRecipient, activeRoomCode);
      input.value = '';
      return;
    }

    let user = getCurrentUser();
    if (!user) {
      let guestName = localStorage.getItem('guest_nickname');
      if (!guestName) {
        guestName = prompt('Please enter your name/nickname to chat:');
        if (!guestName || !guestName.trim()) {
          guestName = 'Guest_' + Math.floor(Math.random() * 8999 + 1000);
        } else {
          guestName = guestName.trim().replace(/\s+/g, '_');
        }
        localStorage.setItem('guest_nickname', guestName);
      }
      user = { id: null, username: guestName, display_name: guestName, role: 'member' };
    }

    const activeSocket = socket || getSharedSocket();
    if (!activeSocket) return alert('Chat connection re-establishing... Please try again in a second.');

    if (activeChatMode === 'global') {
      activeSocket.emit('send_message', { user, text, imageUrl });
    } else if (activeChatMode === 'dm') {
      if (!activeDmRecipient) return alert('Please select a student to direct message first.');
      activeSocket.emit('send_dm', { sender: user, recipientUsername: activeDmRecipient, text, imageUrl });
    } else if (activeChatMode === 'room') {
      if (!activeRoomCode) return alert('Please join a private room first.');
      activeSocket.emit('send_private_room_msg', { roomCode: activeRoomCode, user, text, imageUrl });
    }

    input.value = '';
    pendingChatImageBase64 = null;
    if (fileInput) fileInput.value = '';
    if (previewBar) previewBar.style.display = 'none';
  });
}

async function generateAndSendAiImage(text, mode, recipient, roomCode) {
  const prompt = text.replace(/^\/(image|imagine)\s+/, '').trim();
  if (!prompt) return;

  const container = document.getElementById('chat-messages');
  if (!container) return;

  const tempRow = document.createElement('div');
  tempRow.className = 'chat-message-row system-msg';
  tempRow.style.cssText = 'color: #10b981; font-style: italic; background: rgba(16,185,129,0.05); padding: 8px 14px; border-radius: 8px; border-left: 3px solid #10b981; margin: 6px 0;';
  tempRow.innerHTML = `🤖 Generating AI Image for: "<strong>${escapeHtml(prompt)}</strong>"... please wait (may take 5-10s)...`;
  container.appendChild(tempRow);
  container.scrollTop = container.scrollHeight;

  try {
    const token = localStorage.getItem('nitro_jwt_token') || '';
    const res = await fetch('/api/ai/generate-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({ prompt, width: 512, height: 512 })
    });

    const data = await res.json();
    tempRow.remove();

    if (res.ok && data.success && data.imageUrl) {
      let user = getCurrentUser();
      if (!user) {
        const guestName = localStorage.getItem('guest_nickname') || ('Guest_' + Math.floor(Math.random() * 8999 + 1000));
        user = { id: null, username: guestName, display_name: guestName, role: 'member' };
      }
      const activeSocket = socket || getSharedSocket();
      if (!activeSocket) return alert('Chat connection lost. Failed to send generated image.');

      const captionText = `🎨 Generated: "${prompt}"`;

      if (mode === 'global') {
        activeSocket.emit('send_message', { user, text: captionText, imageUrl: data.imageUrl });
      } else if (mode === 'dm') {
        activeSocket.emit('send_dm', { sender: user, recipientUsername: recipient, text: captionText, imageUrl: data.imageUrl });
      } else if (mode === 'room') {
        activeSocket.emit('send_private_room_msg', { roomCode, user, text: captionText, imageUrl: data.imageUrl });
      }
    } else {
      alert(data.error || 'Failed to generate AI image.');
    }
  } catch (err) {
    if (tempRow) tempRow.remove();
    console.error('Error generating AI image:', err);
    alert('Network error generating AI image.');
  }
}

function formatMessageText(text, imageUrl, audioUrl, gifUrl) {
  const content = text || '';

  // 1. Dedicated GIF syntax [GIF:url]
  if (content.trim().startsWith('[GIF:') && content.includes(']')) {
    const match = content.match(/\[GIF:(https?:\/\/[^\]]+)\]/i);
    const url = match ? match[1] : (gifUrl || '');
    if (url) {
      return `<div class="chat-gif-wrapper"><img src="${escapeHtml(url)}" class="chat-inline-gif" loading="lazy" alt="GIF" onerror="this.onerror=null; this.parentElement.style.display='none';"></div>`;
    }
  }

  // 2. Escape raw HTML input
  let html = escapeHtml(content);
  if (audioUrl && String(audioUrl).trim() && (content.trim() === '🎙️ Voice Memo' || content.trim() === '🎙️ Audio Memo')) {
    html = '';
  }

  // 3. YouTube Rich Cards
  html = html.replace(/(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11}))[^\s<]*/gi, (match, url, videoId) => {
    return `<div class="chat-rich-embed" style="margin-top: 8px; max-width: 440px; border-radius: 8px; overflow: hidden; border: 1px solid var(--card-border);">
      <iframe src="https://www.youtube.com/embed/${videoId}" style="width: 100%; height: 220px; border: none;" allowfullscreen></iframe>
    </div>`;
  });

  // 4. Standalone Image Links
  html = html.replace(/(https?:\/\/[^\s<]+\.(?:png|jpg|jpeg|gif|webp))[^\s<]*/gi, (match, url) => {
    return `<div class="chat-rich-embed" style="margin-top: 6px; max-width: 320px; border-radius: 8px; overflow: hidden; border: 1px solid var(--card-border);">
      <img src="${url}" style="width: 100%; max-height: 220px; object-fit: contain; border-radius: 6px; cursor: pointer;" onclick="window.openChatImageLightbox('${url}')" onerror="this.onerror=null; this.parentElement.style.display='none';">
    </div>`;
  });

  // 5. Image Attachment (Scanned by Groq AI Vision)
  if (imageUrl && String(imageUrl).trim()) {
    const cleanImgUrl = String(imageUrl).trim();
    html += `
      <div class="chat-image-card" style="margin-top: 8px; max-width: 360px; border-radius: 10px; overflow: hidden; border: 1px solid var(--card-border); background: #000; cursor: pointer;" onclick="window.openChatImageLightbox('${escapeHtml(cleanImgUrl)}')">
        <img src="${escapeHtml(cleanImgUrl)}" style="width: 100%; max-height: 280px; object-fit: contain; border-radius: 8px; display: block;" loading="lazy" alt="Shared Image">
        <div style="padding: 4px 8px; background: rgba(0,0,0,0.6); font-size: 0.68rem; color: #10b981; display: flex; align-items: center; gap: 4px;">
          <span>🤖 Groq AI Vision Verified</span>
        </div>
      </div>
    `;
  }

  // 6. Audio Player Attachment
  if (audioUrl && String(audioUrl).trim()) {
    html += `
      <div class="chat-audio-card" style="margin-top: 8px; padding: 10px 14px; background: rgba(56, 189, 248, 0.1); border: 1px solid #38bdf8; border-radius: 8px; display: flex; align-items: center; gap: 10px; max-width: 320px;">
        <span style="font-size: 1.2rem;">🎙️</span>
        <audio controls src="${escapeHtml(audioUrl)}" style="height: 32px; width: 100%;"></audio>
      </div>
    `;
  }

  // 7. Direct gifUrl payload attachment
  if (gifUrl && !content.includes('[GIF:')) {
    html += `<div class="chat-gif-wrapper"><img src="${escapeHtml(gifUrl)}" class="chat-inline-gif" loading="lazy" alt="GIF" onerror="this.onerror=null; this.parentElement.style.display='none';"></div>`;
  }

  return html;
}

let cachedGlobalMessages = [];
let lastRenderedDateStr = '';

function renderGlobalChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  container.innerHTML = '';
  lastRenderedDateStr = '';
  cachedGlobalMessages.forEach(appendChatMessage);
  scrollChatToBottom();
}

function formatChatTimestamp(rawTimestamp) {
  let d;
  if (!rawTimestamp) {
    d = new Date();
  } else if (rawTimestamp instanceof Date) {
    d = rawTimestamp;
  } else {
    let str = String(rawTimestamp).trim();
    if (!str.endsWith('Z') && !str.includes('+') && !str.includes('Z')) {
      str = str.replace(' ', 'T') + 'Z';
    }
    d = new Date(str);
  }

  if (isNaN(d.getTime())) {
    d = new Date();
  }

  const todayStr = new Date().toDateString();
  const msgDateStr = d.toDateString();
  let datePart = '';
  
  if (todayStr === msgDateStr) {
    datePart = 'Today';
  } else {
    datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const timePart = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }) + ' EST';
  return `${datePart} at ${timePart}`;
}

function appendChatMessage(msg) {
  if (!msg) return;
  if (msg.id && document.getElementById(`msg-${msg.id}`)) return;

  const container = document.getElementById('chat-messages');
  if (!container) return;

  // Insert Date Divider if calendar day changed
  const rawD = msg.created_at ? (msg.created_at instanceof Date ? msg.created_at : new Date(String(msg.created_at).trim().endsWith('Z') ? msg.created_at : String(msg.created_at).replace(' ', 'T') + 'Z')) : new Date();
  const validD = isNaN(rawD.getTime()) ? new Date() : rawD;
  const dateHeaderStr = validD.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  if (lastRenderedDateStr !== dateHeaderStr) {
    lastRenderedDateStr = dateHeaderStr;
    const divider = document.createElement('div');
    divider.className = 'chat-date-divider';
    divider.style.cssText = 'display: flex; align-items: center; justify-content: center; margin: 16px 0 10px; color: #94a3b8; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;';
    divider.innerHTML = `
      <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1);"></div>
      <span style="padding: 3px 14px; background: rgba(15, 23, 42, 0.8); border-radius: 99px; border: 1px solid rgba(255,255,255,0.12); color: #38bdf8;">📅 ${dateHeaderStr}</span>
      <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1);"></div>
    `;
    container.appendChild(divider);
  }

  const user = getCurrentUser();
  const isAdmin = user && (user.role === 'admin' || user.role === 'owner');

  const row = document.createElement('div');
  row.className = 'chat-message-row';
  if (msg.id) row.id = `msg-${msg.id}`;

  const role = (msg.role || 'member').toLowerCase();
  const roleBadgeMap = {
    owner: '<span class="chat-badge owner" style="background: linear-gradient(90deg, #fbbf24, #ef4444); color: #000; font-weight: 900;">👑 OWNER</span>',
    admin: '<span class="chat-badge admin" style="background: #ef4444; color: #fff;">🛡️ ADMIN</span>',
    moderator: '<span class="chat-badge moderator" style="background: #a855f7; color: #fff;">🛡️ MOD</span>',
    elite_patron: '<span class="chat-badge elite_patron" style="background: #ec4899; color: #fff;">💎 ELITE</span>',
    premium_vip: '<span class="chat-badge premium_vip" style="background: #f59e0b; color: #000;">⭐ VIP</span>',
    pro: '<span class="chat-badge pro" style="background: #38bdf8; color: #000;">⚡ PRO</span>',
    vip: '<span class="chat-badge vip" style="background: #fbbf24; color: #000;">⭐ VIP</span>',
    early_member: '<span class="chat-badge early_member" style="background: linear-gradient(90deg, #34d399, #059669); color: #000; font-weight: 800;">🌱 EARLY</span>',
    student_plus: '<span class="chat-badge student_plus" style="background: #10b981; color: #000;">🎓 PLUS</span>',
    member: '<span class="chat-badge member" style="background: rgba(255,255,255,0.1); color: #94a3b8;">MEMBER</span>'
  };
  const roleBadge = roleBadgeMap[role] || roleBadgeMap.member;
  
  const customFlair = msg.pro_custom_flair ? `<span class="custom-flair-badge">${escapeHtml(msg.pro_custom_flair)}</span>` : '';
  const glowClass = role === 'owner' ? 'glow-owner' : role === 'early_member' ? 'glow-green' : (msg.pro_chat_glow ? `glow-${msg.pro_chat_glow}` : '');

  const time = formatChatTimestamp(msg.created_at);
  const displayName = msg.display_name || msg.username || 'Student';
  const deleteBtn = (isAdmin && msg.id) ? `<button class="chat-delete-btn" onclick="window.deleteChat(${msg.id})">✕</button>` : '';

  const rawContent = msg.message !== undefined ? msg.message : (msg.text !== undefined ? msg.text : (msg.content || ''));
  const bodyHtml = formatMessageText(rawContent, msg.image_url || msg.imageUrl, msg.audio_url || msg.audioUrl, msg.gif_url || msg.gifUrl);

  row.innerHTML = `
    <div style="display: flex; gap: 10px; width: 100%;">
      <div class="chat-msg-avatar" id="msg-avatar-${msg.id || Date.now()}" onclick="window.openPublicProfile('${escapeHtml(msg.username || '')}')" style="width: 34px; height: 34px; flex-shrink: 0; font-size: 1.1rem; border-radius: 50%; cursor: pointer;" title="Click to view @${escapeHtml(msg.username || '')}'s profile">👤</div>
      <div style="flex: 1;">
        <div class="chat-msg-header">
          <div onclick="window.openPublicProfile('${msg.username || ''}')" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px;" title="Click to view @${msg.username || ''}'s profile">
            <strong class="chat-msg-username ${glowClass}">
              ${escapeHtml(displayName)}
              ${customFlair}
              <span style="font-size: 0.72rem; color: #94a3b8; font-weight: normal;">(@${msg.username || 'user'})</span>
            </strong>
            ${roleBadge}
          </div>
          <span class="chat-msg-time">${time}</span>
          ${deleteBtn}
        </div>
        <div class="chat-msg-body">${bodyHtml}</div>
      </div>
    </div>
  `;

  container.appendChild(row);
  renderAvatarElement(row.querySelector(`#msg-avatar-${msg.id || Date.now()}`), msg.avatar_url, '👤');
}

function appendDmMessage(dm) {
  if (!dm) return;
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const user = getCurrentUser();
  const isMine = user && dm.sender_username && dm.sender_username.toLowerCase() === user.username.toLowerCase();

  const row = document.createElement('div');
  row.className = 'chat-message-row';
  row.style.background = isMine ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.04)';
  row.style.borderLeft = isMine ? '3px solid #38bdf8' : '3px solid #8b5cf6';

  const time = formatChatTimestamp(dm.created_at);
  const rawText = dm.content !== undefined ? dm.content : (dm.message !== undefined ? dm.message : (dm.text || ''));

  row.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
      <strong style="color: ${isMine ? '#38bdf8' : '#8b5cf6'}; cursor: pointer; font-size: 0.92rem;" onclick="window.openPublicProfile('${dm.sender_username || ''}')" title="Click to view @${dm.sender_username || ''}'s profile">@${escapeHtml(dm.sender_username || 'user')}</strong>
      <span class="chat-msg-time" style="font-size: 0.75rem; color: #94a3b8;">${time}</span>
    </div>
    <div class="chat-msg-body" style="font-size: 0.92rem; color: #f8fafc;">${formatMessageText(rawText, dm.image_url || dm.imageUrl, dm.audio_url || dm.audioUrl, dm.gif_url || dm.gifUrl)}</div>
  `;

  container.appendChild(row);
}

function appendRoomMessage(msg) {
  const container = document.getElementById('chat-messages');
  const row = document.createElement('div');
  row.className = 'chat-message-row';
  const isPro = msg.role === 'pro' || msg.role === 'vip';
  const time = formatChatTimestamp(msg.created_at);

  row.innerHTML = `
    <div class="chat-msg-header">
      <strong class="${isPro ? 'glow-gold' : ''}">${msg.username}</strong>
      <span class="chat-msg-time">${time}</span>
    </div>
    <div class="chat-msg-body">${formatMessageText(msg.message || msg.content || '', msg.image_url || msg.imageUrl, msg.audio_url || msg.audioUrl, msg.gif_url || msg.gifUrl)}</div>
  `;

  container.appendChild(row);
}

function scrollChatToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text ? text.replace(/[&<>"']/g, m => map[m]) : '';
}

window.refreshChatViewOnNavigate = () => {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  window.addChatReaction = (messageId, emoji) => {
  const user = getCurrentUser();
  const socket = getSharedSocket();
  if (socket) {
    socket.emit('chat_message_reaction', { messageId, emoji, user });
  }

  const container = document.getElementById(`reactions-for-msg-${messageId}`);
  if (container) {
    const existing = container.querySelector(`.reaction-pill-${emoji}`);
    if (existing) {
      let count = parseInt(existing.dataset.count || '1', 10) + 1;
      existing.dataset.count = count;
      existing.textContent = `${emoji} ${count}`;
    } else {
      const pill = document.createElement('span');
      pill.className = `reaction-pill-${emoji}`;
      pill.dataset.count = '1';
      pill.style.cssText = 'font-size: 0.72rem; padding: 2px 7px; border-radius: 99px; background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; color: #38bdf8; font-weight: 800;';
      pill.textContent = `${emoji} 1`;
      container.appendChild(pill);
    }
  }
};

window.setReplyMessageContext = (username, snippet) => {
  const chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.value = `Replying to @${username}: "${snippet}" → `;
    chatInput.focus();
  }
};

window.showUserProfileModal = (username) => {
  if (window.openPublicProfile) {
    window.openPublicProfile(username);
  }
};

  if (activeChatMode === 'global') {
    if (cachedGlobalMessages.length > 0) {
      renderGlobalChatMessages();
    }
    if (socket) socket.emit('get_initial_messages');
  }
};

window.deleteChat = (messageId) => {
  const user = getCurrentUser();
  if (user && ['admin', 'owner'].includes(user.role) && socket) {
    socket.emit('delete_message', { adminUser: user, messageId });
  } else {
    alert('Administrator or Owner permission required to delete messages.');
  }
};

window.quickDmUser = (username) => {
  const user = getCurrentUser();
  if (!user) return alert('Please log in to direct message.');
  if (username.toLowerCase() === user.username.toLowerCase()) return;

  const dmTab = document.querySelector('.chat-mode-tab[data-mode="dm"]');
  if (dmTab) dmTab.click();

  const dmInput = document.getElementById('chat-dm-target-user');
  if (dmInput) dmInput.value = username;

  const startBtn = document.getElementById('chat-start-dm-btn');
  if (startBtn) startBtn.click();
};

export function updateSocketActivity(activity) {
  const user = getCurrentUser();
  if (socket) {
    socket.emit('user_connected', { user, activity });
  }
}

export function emitPlaytimeTick(seconds = 60, isNewPlay = false) {
  const user = getCurrentUser();
  if (socket && user) {
    socket.emit('playtime_tick', { userId: user.id, username: user.username, seconds, is_new_play: isNewPlay });
  }
}
