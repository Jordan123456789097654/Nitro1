// Real-time Voice Rooms & WebRTC Audio Signaling Engine
import { getCurrentUser } from './auth.js';
import { getSharedSocket } from './socket.js';

let voiceSocket = null;
let activeChannelId = null;
let localStream = null;
let peerConnections = {}; // targetSocketId -> RTCPeerConnection
let isMuted = false;
let isDeafened = false;

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export function initVoiceRooms() {
  setupVoiceUI();
  fetchVoiceChannels();
  initVoiceSocketConnection();
}

function initVoiceSocketConnection() {
  try {
    if (window.io) {
      voiceSocket = window.io('/voice', {
        transports: ['websocket', 'polling']
      });
      setupVoiceSocketListeners();
    }
  } catch (e) {
    console.warn('Voice socket init warning:', e.message);
  }
}

function setupVoiceSocketListeners() {
  if (!voiceSocket) return;

  voiceSocket.on('voice_participants', ({ participants }) => {
    updateVoiceParticipantsUI(participants);
    syncPeerConnections(participants);
  });

  voiceSocket.on('voice_offer', async ({ from, sdp }) => {
    const pc = createPeerConnection(from);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      voiceSocket.emit('voice_answer', { channelId: activeChannelId, targetSocketId: from, sdp: answer });
    } catch (e) {
      console.error('Error handling voice offer:', e);
    }
  });

  voiceSocket.on('voice_answer', async ({ from, sdp }) => {
    const pc = peerConnections[from];
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (e) {
        console.error('Error setting remote description:', e);
      }
    }
  });

  voiceSocket.on('ice_candidate', async ({ from, candidate }) => {
    const pc = peerConnections[from];
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error adding ICE candidate:', e);
      }
    }
  });
}

function createPeerConnection(targetSocketId) {
  if (peerConnections[targetSocketId]) return peerConnections[targetSocketId];

  const pc = new RTCPeerConnection(RTC_CONFIG);
  peerConnections[targetSocketId] = pc;

  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  pc.onicecandidate = (event) => {
    if (event.candidate && voiceSocket) {
      voiceSocket.emit('ice_candidate', {
        channelId: activeChannelId,
        targetSocketId,
        candidate: event.candidate
      });
    }
  };

  pc.ontrack = (event) => {
    let audioEl = document.getElementById(`audio-peer-${targetSocketId}`);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `audio-peer-${targetSocketId}`;
      audioEl.autoplay = true;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
    }
    audioEl.srcObject = event.streams[0];
    audioEl.muted = isDeafened;
  };

  return pc;
}

async function syncPeerConnections(participants) {
  const currentSocketId = voiceSocket ? voiceSocket.id : null;
  for (const p of participants) {
    const targetId = typeof p === 'string' ? p : p.socketId;
    if (targetId && targetId !== currentSocketId && !peerConnections[targetId]) {
      const pc = createPeerConnection(targetId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        voiceSocket.emit('voice_offer', {
          channelId: activeChannelId,
          targetSocketId: targetId,
          sdp: offer
        });
      } catch (e) {
        console.error('Error creating voice offer:', e);
      }
    }
  }
}

export async function fetchVoiceChannels() {
  const container = document.getElementById('voice-channels-list');
  if (!container) return;

  try {
    const token = localStorage.getItem('nitro_jwt_token');
    const res = await fetch('/api/voice/list', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const channels = data.channels || [];

    if (channels.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--text-muted);">
          <p>No active voice channels. Click "+ Create Room" to start one!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = channels.map(ch => `
      <div class="voice-channel-card ${activeChannelId === ch.id ? 'active' : ''}">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.4rem;">🎧</span>
          <div>
            <strong style="color: #fff; font-size: 0.95rem;">${ch.name}</strong>
            <span style="display: block; font-size: 0.78rem; color: #38bdf8;">${ch.participantCount} Participant${ch.participantCount === 1 ? '' : 's'} connected</span>
          </div>
        </div>
        <div>
          ${activeChannelId === ch.id 
            ? `<button class="btn-small danger" onclick="window.leaveVoiceChannel('${ch.id}')">Disconnect</button>`
            : `<button class="btn-small primary" onclick="window.joinVoiceChannel('${ch.id}', '${ch.name}')" style="background:#10b981; border-color:#10b981; color:#000; font-weight:800;">Connect</button>`}
        </div>
      </div>
    `).join('');
  } catch (e) {
    // Suppress network error
  }
}

function setupVoiceUI() {
  const createBtn = document.getElementById('create-voice-channel-btn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const name = prompt('Enter new Voice Room Name:', 'Study Hangout');
      if (!name || !name.trim()) return;

      try {
        const token = localStorage.getItem('nitro_jwt_token');
        const res = await fetch('/api/voice/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ name: name.trim() })
        });
        const data = await res.json();
        if (res.ok && data.channelId) {
          fetchVoiceChannels();
          window.joinVoiceChannel(data.channelId, data.name);
        }
      } catch (e) {
        alert('Failed to create voice channel.');
      }
    });
  }

  const muteBtn = document.getElementById('voice-mute-btn');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      isMuted = !isMuted;
      if (localStream) {
        localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
      }
      muteBtn.textContent = isMuted ? '🔇 Unmute Mic' : '🎙️ Mute Mic';
      muteBtn.style.background = isMuted ? '#ef4444' : 'rgba(255,255,255,0.1)';
    });
  }

  const deafenBtn = document.getElementById('voice-deafen-btn');
  if (deafenBtn) {
    deafenBtn.addEventListener('click', () => {
      isDeafened = !isDeafened;
      document.querySelectorAll('audio[id^="audio-peer-"]').forEach(a => a.muted = isDeafened);
      deafenBtn.textContent = isDeafened ? '🔈 Undeafen' : '🎧 Deafen';
      deafenBtn.style.background = isDeafened ? '#ef4444' : 'rgba(255,255,255,0.1)';
    });
  }
}

window.joinVoiceChannel = async (channelId, channelName) => {
  const user = getCurrentUser();
  if (!user) return alert('Please sign in to join voice channels.');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    alert('🎤 Microphone access permission is required for voice rooms.');
    return;
  }

  activeChannelId = channelId;
  const bar = document.getElementById('voice-connected-bar');
  const label = document.getElementById('voice-connected-label');
  if (bar) bar.style.display = 'flex';
  if (label) label.textContent = `🔊 Connected to: ${channelName}`;

  if (voiceSocket) {
    voiceSocket.emit('voice_join', { channelId, user });
  }
  fetchVoiceChannels();
};

window.leaveVoiceChannel = (channelId) => {
  if (activeChannelId && voiceSocket) {
    voiceSocket.emit('voice_leave', { channelId: activeChannelId });
  }

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};

  activeChannelId = null;
  const bar = document.getElementById('voice-connected-bar');
  if (bar) bar.style.display = 'none';

  fetchVoiceChannels();
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updateVoiceParticipantsUI(participants) {
  const list = document.getElementById('voice-participants-list');
  if (!list) return;

  if (!participants || participants.length === 0) {
    list.innerHTML = '<span style="color: #94a3b8; font-size: 0.8rem;">No participants currently in channel.</span>';
    return;
  }

  list.innerHTML = participants.map((p, idx) => {
    const isObj = typeof p === 'object' && p !== null;
    const username = isObj ? (p.username || 'Student') : `Peer #${idx + 1}`;
    const displayName = isObj ? (p.display_name || p.username || 'Student') : `Peer #${idx + 1}`;
    const role = isObj ? (p.role || 'member') : 'member';

    const isOwner = role === 'owner' || username.toLowerCase() === 'jordandaniels';
    const isPro = role === 'pro' || role === 'vip' || role === 'admin';
    const badgeLabel = isOwner ? '👑 OWNER' : (role ? role.toUpperCase() : 'STUDENT');
    const badgeBg = isOwner ? 'linear-gradient(90deg, #fbbf24, #ef4444)' : (isPro ? 'linear-gradient(90deg, #38bdf8, #818cf8)' : 'rgba(255,255,255,0.12)');
    const badgeColor = isOwner || isPro ? '#000' : '#94a3b8';

    return `
      <div style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1); padding: 6px 14px; border-radius: 99px; font-size: 0.85rem; color: #fff;">
        <span class="online-dot" style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; display: inline-block;"></span>
        <strong style="color: #fff;">${escapeHtml(displayName)}</strong>
        <span style="font-size: 0.75rem; color: #94a3b8;">(@${escapeHtml(username)})</span>
        <span style="font-size: 0.65rem; font-weight: 900; padding: 2px 7px; border-radius: 6px; background: ${badgeBg}; color: ${badgeColor}; text-transform: uppercase;">${badgeLabel}</span>
      </div>
    `;
  }).join('');
}
