// Real-time Voice Rooms & WebRTC Audio Signaling Engine with Voice Changer FX
import { getCurrentUser } from './auth.js';
import { getSharedSocket } from './socket.js';

let voiceSocket = null;
let activeChannelId = null;
let activeChannelName = 'Study Hangout';
let localStream = null;
let processedStream = null;
let peerConnections = {}; // targetSocketId -> RTCPeerConnection
let isMuted = false;
let isDeafened = false;
let currentVoicePreset = 'normal';

// Audio Context & Level Detection for Speaking Indicator & Voice FX
let audioCtx = null;
let micSource = null;
let micAnalyser = null;
let audioCheckInterval = null;
let isSpeakingLocally = false;
const peerSpeakingStates = {}; // socketId -> boolean
let fxNodes = [];

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export function initVoiceRooms() {
  setupVoiceUI();
  setupSidebarVoiceDockUI();
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
    updateSidebarVoiceParticipantsUI(participants);
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

  // Real-time Speaking Indicators Event
  voiceSocket.on('speaking_state', ({ from, isSpeaking }) => {
    peerSpeakingStates[from] = isSpeaking;
    updateParticipantSpeakingUI(from, isSpeaking);
  });
}

function startAudioLevelDetection(stream) {
  try {
    stopAudioLevelDetection();
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    micSource = audioCtx.createMediaStreamSource(stream);
    micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize = 512;
    micSource.connect(micAnalyser);

    const bufferLength = micAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    audioCheckInterval = setInterval(() => {
      if (isMuted || !localStream) {
        if (isSpeakingLocally) {
          isSpeakingLocally = false;
          broadcastLocalSpeakingState(false);
        }
        return;
      }

      micAnalyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const speaking = average > 18; // volume threshold

      if (speaking !== isSpeakingLocally) {
        isSpeakingLocally = speaking;
        broadcastLocalSpeakingState(speaking);
      }
    }, 120);

    // Apply voice preset if selected
    if (currentVoicePreset !== 'normal') {
      applyVoicePreset(currentVoicePreset);
    }
  } catch (e) {
    console.warn('Audio level detection init error:', e.message);
  }
}

function stopAudioLevelDetection() {
  if (audioCheckInterval) {
    clearInterval(audioCheckInterval);
    audioCheckInterval = null;
  }
  fxNodes.forEach(n => { try { n.disconnect(); } catch (_) {} });
  fxNodes = [];
  if (audioCtx) {
    try { audioCtx.close(); } catch (e) {}
    audioCtx = null;
  }
  micSource = null;
  micAnalyser = null;
  processedStream = null;
  isSpeakingLocally = false;
}

function applyVoicePreset(preset) {
  currentVoicePreset = preset || 'normal';

  // Synchronize dropdowns
  const mainSel = document.getElementById('voice-changer-select');
  const sideSel = document.getElementById('sidebar-voice-changer-select');
  if (mainSel && mainSel.value !== currentVoicePreset) mainSel.value = currentVoicePreset;
  if (sideSel && sideSel.value !== currentVoicePreset) sideSel.value = currentVoicePreset;

  if (!localStream || !micSource || !audioCtx) return;

  // Clean up previous FX nodes
  fxNodes.forEach(n => { try { n.disconnect(); } catch (_) {} });
  fxNodes = [];

  const destination = audioCtx.createMediaStreamDestination();

  if (currentVoicePreset === 'normal') {
    micSource.connect(destination);
  } else if (currentVoicePreset === 'robot') {
    // Robot FX: Ring Modulation
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(50, audioCtx.currentTime);
    osc.type = 'sine';
    osc.start();

    micSource.connect(gain);
    osc.connect(gain.gain);
    gain.connect(destination);
    fxNodes.push(osc, gain);
  } else if (currentVoicePreset === 'deep') {
    // Deep Vader FX: Lowpass Filter & Bass Boost
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(320, audioCtx.currentTime);

    const bass = audioCtx.createGain();
    bass.gain.setValueAtTime(2.2, audioCtx.currentTime);

    micSource.connect(lp);
    lp.connect(bass);
    bass.connect(destination);
    fxNodes.push(lp, bass);
  } else if (currentVoicePreset === 'helium') {
    // Helium FX: Highpass Filter & Treble Boost
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1400, audioCtx.currentTime);

    const treble = audioCtx.createGain();
    treble.gain.setValueAtTime(2.0, audioCtx.currentTime);

    micSource.connect(hp);
    hp.connect(treble);
    treble.connect(destination);
    fxNodes.push(hp, treble);
  } else if (currentVoicePreset === 'alien') {
    // Alien FX: Bandpass Filter & Frequency LFO Modulation
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1200, audioCtx.currentTime);
    bp.Q.setValueAtTime(4.0, audioCtx.currentTime);

    const lfo = audioCtx.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.setValueAtTime(28, audioCtx.currentTime);
    lfo.start();

    const lfoGain = audioCtx.createGain();
    lfoGain.gain.setValueAtTime(450, audioCtx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);

    micSource.connect(bp);
    bp.connect(destination);
    fxNodes.push(bp, lfo, lfoGain);
  } else if (currentVoicePreset === 'radio') {
    // Walkie-Talkie FX: Bandpass + Waveshaper Distortion
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(400, audioCtx.currentTime);

    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, audioCtx.currentTime);

    const dist = audioCtx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = (3 + 10) * x * 20 * (Math.PI / 180) / (Math.PI + 10 * Math.abs(x));
    }
    dist.curve = curve;

    micSource.connect(hp);
    hp.connect(lp);
    lp.connect(dist);
    dist.connect(destination);
    fxNodes.push(hp, lp, dist);
  } else if (currentVoicePreset === 'echo') {
    // Space Echo FX: Delay & Feedback
    const delay = audioCtx.createDelay();
    delay.delayTime.setValueAtTime(0.25, audioCtx.currentTime);

    const feedback = audioCtx.createGain();
    feedback.gain.setValueAtTime(0.42, audioCtx.currentTime);

    const dryGain = audioCtx.createGain();
    dryGain.gain.setValueAtTime(1.0, audioCtx.currentTime);

    micSource.connect(dryGain);
    dryGain.connect(destination);

    micSource.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(destination);

    fxNodes.push(delay, feedback, dryGain);
  }

  processedStream = destination.stream;
  const newTrack = processedStream.getAudioTracks()[0];

  if (newTrack) {
    Object.values(peerConnections).forEach(pc => {
      const senders = pc.getSenders();
      const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
      if (audioSender) {
        audioSender.replaceTrack(newTrack);
      }
    });
  }
}

function broadcastLocalSpeakingState(isSpeaking) {
  if (voiceSocket && activeChannelId) {
    voiceSocket.emit('speaking_state', { channelId: activeChannelId, isSpeaking });
    if (voiceSocket.id) {
      updateParticipantSpeakingUI(voiceSocket.id, isSpeaking);
    }
  }
}

function updateParticipantSpeakingUI(socketId, isSpeaking) {
  const mainEl = document.getElementById(`voice-part-${socketId}`);
  if (mainEl) {
    if (isSpeaking) mainEl.classList.add('is-speaking');
    else mainEl.classList.remove('is-speaking');
  }

  const sideEl = document.getElementById(`sidebar-voice-part-${socketId}`);
  const sideAvatar = document.getElementById(`sidebar-voice-avatar-${socketId}`);
  if (sideEl) {
    if (isSpeaking) {
      sideEl.classList.add('is-speaking');
      if (sideAvatar) sideAvatar.classList.add('speaking-ring');
    } else {
      sideEl.classList.remove('is-speaking');
      if (sideAvatar) sideAvatar.classList.remove('speaking-ring');
    }
  }
}

function createPeerConnection(targetSocketId) {
  if (peerConnections[targetSocketId]) return peerConnections[targetSocketId];

  const pc = new RTCPeerConnection(RTC_CONFIG);
  peerConnections[targetSocketId] = pc;

  const activeTrack = (processedStream && currentVoicePreset !== 'normal') 
    ? processedStream.getAudioTracks()[0] 
    : (localStream ? localStream.getAudioTracks()[0] : null);

  if (activeTrack && localStream) {
    pc.addTrack(activeTrack, localStream);
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
            <strong style="color: #fff; font-size: 0.95rem;">${escapeHtml(ch.name)}</strong>
            <span style="display: block; font-size: 0.78rem; color: #38bdf8;">${ch.participantCount} Participant${ch.participantCount === 1 ? '' : 's'} connected</span>
          </div>
        </div>
        <div>
          ${activeChannelId === ch.id 
            ? `<button class="btn-small danger" onclick="window.leaveVoiceChannel('${ch.id}')">Disconnect</button>`
            : `<button class="btn-small primary" onclick="window.joinVoiceChannel('${ch.id}', '${escapeHtml(ch.name)}')" style="background:#10b981; border-color:#10b981; color:#000; font-weight:800;">Connect</button>`}
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
    muteBtn.addEventListener('click', toggleMute);
  }

  const deafenBtn = document.getElementById('voice-deafen-btn');
  if (deafenBtn) {
    deafenBtn.addEventListener('click', toggleDeafen);
  }

  const mainFxSelect = document.getElementById('voice-changer-select');
  if (mainFxSelect) {
    mainFxSelect.addEventListener('change', (e) => applyVoicePreset(e.target.value));
  }
}

function setupSidebarVoiceDockUI() {
  const disconnectBtn = document.getElementById('sidebar-voice-disconnect-btn');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => {
      if (activeChannelId) window.leaveVoiceChannel(activeChannelId);
    });
  }

  const muteBtn = document.getElementById('sidebar-voice-mute-btn');
  if (muteBtn) {
    muteBtn.addEventListener('click', toggleMute);
  }

  const deafenBtn = document.getElementById('sidebar-voice-deafen-btn');
  if (deafenBtn) {
    deafenBtn.addEventListener('click', toggleDeafen);
  }

  const sideFxSelect = document.getElementById('sidebar-voice-changer-select');
  if (sideFxSelect) {
    sideFxSelect.addEventListener('change', (e) => applyVoicePreset(e.target.value));
  }
}

function toggleMute() {
  isMuted = !isMuted;
  if (localStream) {
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  }

  const mainMuteBtn = document.getElementById('voice-mute-btn');
  if (mainMuteBtn) {
    mainMuteBtn.textContent = isMuted ? '🔇 Unmute Mic' : '🎙️ Mute Mic';
    mainMuteBtn.style.background = isMuted ? '#ef4444' : 'rgba(255,255,255,0.1)';
  }

  const sideMuteBtn = document.getElementById('sidebar-voice-mute-btn');
  const sideMuteIcon = document.getElementById('sidebar-voice-mute-icon');
  const sideMuteText = document.getElementById('sidebar-voice-mute-text');
  if (sideMuteBtn) {
    if (isMuted) sideMuteBtn.classList.add('active');
    else sideMuteBtn.classList.remove('active');
  }
  if (sideMuteIcon) sideMuteIcon.textContent = isMuted ? '🔇' : '🎙️';
  if (sideMuteText) sideMuteText.textContent = isMuted ? 'Muted' : 'Mute';
}

function toggleDeafen() {
  isDeafened = !isDeafened;
  document.querySelectorAll('audio[id^="audio-peer-"]').forEach(a => a.muted = isDeafened);

  const mainDeafenBtn = document.getElementById('voice-deafen-btn');
  if (mainDeafenBtn) {
    mainDeafenBtn.textContent = isDeafened ? '🔈 Undeafen' : '🎧 Deafen';
    mainDeafenBtn.style.background = isDeafened ? '#ef4444' : 'rgba(255,255,255,0.1)';
  }

  const sideDeafenBtn = document.getElementById('sidebar-voice-deafen-btn');
  const sideDeafenIcon = document.getElementById('sidebar-voice-deafen-icon');
  const sideDeafenText = document.getElementById('sidebar-voice-deafen-text');
  if (sideDeafenBtn) {
    if (isDeafened) sideDeafenBtn.classList.add('active');
    else sideDeafenBtn.classList.remove('active');
  }
  if (sideDeafenIcon) sideDeafenIcon.textContent = isDeafened ? '🔈' : '🎧';
  if (sideDeafenText) sideDeafenText.textContent = isDeafened ? 'Deafened' : 'Deafen';
}

window.joinVoiceChannel = async (channelId, channelName) => {
  const user = getCurrentUser();
  if (!user) return alert('Please sign in to join voice channels.');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    startAudioLevelDetection(localStream);
  } catch (e) {
    alert('🎤 Microphone access permission is required for voice rooms.');
    return;
  }

  activeChannelId = channelId;
  activeChannelName = channelName || 'Study Hangout';

  const bar = document.getElementById('voice-connected-bar');
  const label = document.getElementById('voice-connected-label');
  if (bar) bar.style.display = 'flex';
  if (label) label.textContent = `🔊 Connected to: ${activeChannelName}`;

  const sideDock = document.getElementById('sidebar-voice-dock');
  const sideLabel = document.getElementById('sidebar-voice-channel-name');
  if (sideDock) sideDock.style.display = 'block';
  if (sideLabel) sideLabel.textContent = activeChannelName;

  if (voiceSocket) {
    voiceSocket.emit('voice_join', { channelId, user });
  }

  const sharedSocket = getSharedSocket();
  if (sharedSocket) {
    sharedSocket.emit('update_activity', { activity: `In Voice Room #${activeChannelName}` });
  }

  fetchVoiceChannels();
};

window.leaveVoiceChannel = (channelId) => {
  stopAudioLevelDetection();

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

  const sideDock = document.getElementById('sidebar-voice-dock');
  if (sideDock) sideDock.style.display = 'none';

  const sharedSocket = getSharedSocket();
  if (sharedSocket) {
    sharedSocket.emit('update_activity', { activity: 'Exploring Hub' });
  }

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
    const socketId = isObj ? (p.socketId || `peer_${idx}`) : p;
    const username = isObj ? (p.username || 'Student') : `Peer #${idx + 1}`;
    const displayName = isObj ? (p.display_name || p.username || 'Student') : `Peer #${idx + 1}`;
    const role = isObj ? (p.role || 'member') : 'member';

    const isSpeaking = peerSpeakingStates[socketId] || (socketId === voiceSocket?.id && isSpeakingLocally);

    const isOwner = role === 'owner' || username.toLowerCase() === 'jordandaniels';
    const isPro = role === 'pro' || role === 'vip' || role === 'admin';
    const badgeLabel = isOwner ? '👑 OWNER' : (role ? role.toUpperCase() : 'STUDENT');
    const badgeBg = isOwner ? 'linear-gradient(90deg, #fbbf24, #ef4444)' : (isPro ? 'linear-gradient(90deg, #38bdf8, #818cf8)' : 'rgba(255,255,255,0.12)');
    const badgeColor = isOwner || isPro ? '#000' : '#94a3b8';

    return `
      <div id="voice-part-${socketId}" class="voice-participant-chip ${isSpeaking ? 'is-speaking' : ''}" style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1); padding: 6px 14px; border-radius: 99px; font-size: 0.85rem; color: #fff; transition: all 0.2s ease;">
        <span class="online-dot" style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; display: inline-block;"></span>
        <strong style="color: #fff;">${escapeHtml(displayName)}</strong>
        <span style="font-size: 0.75rem; color: #94a3b8;">(@${escapeHtml(username)})</span>
        <span style="font-size: 0.65rem; font-weight: 900; padding: 2px 7px; border-radius: 6px; background: ${badgeBg}; color: ${badgeColor}; text-transform: uppercase;">${badgeLabel}</span>
      </div>
    `;
  }).join('');
}

function updateSidebarVoiceParticipantsUI(participants) {
  const tray = document.getElementById('sidebar-voice-participants-tray');
  if (!tray) return;

  if (!participants || participants.length === 0) {
    tray.innerHTML = '<span style="color: #94a3b8; font-size: 0.75rem;">Connecting to channel...</span>';
    return;
  }

  tray.innerHTML = participants.map((p, idx) => {
    const isObj = typeof p === 'object' && p !== null;
    const socketId = isObj ? (p.socketId || `peer_${idx}`) : p;
    const username = isObj ? (p.username || 'Student') : `Peer #${idx + 1}`;
    const displayName = isObj ? (p.display_name || p.username || 'Student') : `Peer #${idx + 1}`;
    const isSpeaking = peerSpeakingStates[socketId] || (socketId === voiceSocket?.id && isSpeakingLocally);

    return `
      <div id="sidebar-voice-part-${socketId}" class="voice-participant-row ${isSpeaking ? 'is-speaking' : ''}">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div id="sidebar-voice-avatar-${socketId}" class="voice-avatar-wrap ${isSpeaking ? 'speaking-ring' : ''}">
            👤
          </div>
          <span style="color: #fff; font-weight: 700; font-size: 0.82rem;">${escapeHtml(displayName)}</span>
        </div>
        <span style="font-size: 0.7rem; color: #10b981;">● Live</span>
      </div>
    `;
  }).join('');
}
