// Real-time Voice Rooms & WebRTC Audio Signaling Engine with Voice Changer FX, Spatial Audio, PTT & Screen Sharing
import { getCurrentUser } from './auth.js';
import { getSharedSocket } from './socket.js';

let voiceSocket = null;
let activeChannelId = null;
let activeChannelName = 'Study Hangout';
let localStream = null;
let processedStream = null;
let localScreenStream = null;
let peerConnections = {}; // targetSocketId -> RTCPeerConnection
let peerPannerNodes = {}; // targetSocketId -> StereoPannerNode
let isMuted = false;
let isDeafened = false;
let currentVoicePreset = 'normal';

// Voice Activation & Push-to-Talk (PTT)
let voiceActivationMode = 'voice_activity'; // 'voice_activity' | 'ptt'
let isPttPressed = false;

// Spatial 3D Stereo Audio
let isSpatialAudioEnabled = true;

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
  setupPttKeyListeners();
  setupStudyRoomModal();
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

  voiceSocket.on('voice_channels_list', ({ channels }) => {
    renderVoiceChannelsList(channels);
  });

  voiceSocket.on('voice_participants', ({ channelId, participants, screenSharer }) => {
    updateVoiceParticipantsUI(participants);
    updateSidebarVoiceParticipantsUI(participants);
    syncPeerConnections(participants);

    if (screenSharer && screenSharer !== voiceSocket.id) {
      const container = document.getElementById('voice-screen-video-container');
      const label = document.getElementById('voice-screen-sharer-label');
      if (container) container.style.display = 'block';
      if (label) label.textContent = '🖥️ Classmate Screen Share (Live)';
    }
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

  // Screen Sharing State Updates
  voiceSocket.on('screen_share_state', ({ sharerSocketId, isSharing }) => {
    const container = document.getElementById('voice-screen-video-container');
    const label = document.getElementById('voice-screen-sharer-label');
    if (!container) return;

    if (isSharing && sharerSocketId !== voiceSocket.id) {
      container.style.display = 'block';
      if (label) label.textContent = '🖥️ Classmate Screen Share (Live)';
    } else if (!isSharing && sharerSocketId !== voiceSocket.id) {
      container.style.display = 'none';
    }
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
      if (isMuted || !localStream || (voiceActivationMode === 'ptt' && !isPttPressed)) {
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
      const speaking = average > 16; // volume threshold for speaking glow

      if (speaking !== isSpeakingLocally) {
        isSpeakingLocally = speaking;
        broadcastLocalSpeakingState(speaking);
      }
    }, 100);

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

  const mainSel = document.getElementById('voice-changer-select');
  const sideSel = document.getElementById('sidebar-voice-changer-select');
  if (mainSel && mainSel.value !== currentVoicePreset) mainSel.value = currentVoicePreset;
  if (sideSel && sideSel.value !== currentVoicePreset) sideSel.value = currentVoicePreset;

  if (!localStream || !micSource || !audioCtx) return;

  fxNodes.forEach(n => { try { n.disconnect(); } catch (_) {} });
  fxNodes = [];

  const destination = audioCtx.createMediaStreamDestination();

  if (currentVoicePreset === 'normal') {
    micSource.connect(destination);
  } else if (currentVoicePreset === 'robot') {
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
    if (isSpeaking) {
      mainEl.classList.add('speaking', 'is-speaking');
    } else {
      mainEl.classList.remove('speaking', 'is-speaking');
    }
  }

  const sideEl = document.getElementById(`sidebar-voice-part-${socketId}`);
  const sideAvatar = document.getElementById(`sidebar-voice-avatar-${socketId}`);
  if (sideEl) {
    if (isSpeaking) {
      sideEl.classList.add('speaking', 'is-speaking');
      if (sideAvatar) sideAvatar.classList.add('speaking', 'speaking-ring');
    } else {
      sideEl.classList.remove('speaking', 'is-speaking');
      if (sideAvatar) sideAvatar.classList.remove('speaking', 'speaking-ring');
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

  // Add screen track if currently sharing
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(t => pc.addTrack(t, localScreenStream));
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
    const stream = event.streams[0];
    const isVideo = event.track.kind === 'video';

    if (isVideo) {
      const screenVideo = document.getElementById('voice-screen-video');
      const screenContainer = document.getElementById('voice-screen-video-container');
      if (screenVideo) {
        screenVideo.srcObject = stream;
        if (screenContainer) screenContainer.style.display = 'block';
      }
      return;
    }

    let audioEl = document.getElementById(`audio-peer-${targetSocketId}`);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `audio-peer-${targetSocketId}`;
      audioEl.autoplay = true;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
    }
    audioEl.srcObject = stream;
    audioEl.muted = isDeafened;

    // Apply Spatial 3D Stereo Panning
    try {
      if (audioCtx && isSpatialAudioEnabled) {
        const peerSource = audioCtx.createMediaStreamSource(stream);
        const panner = audioCtx.createStereoPanner();
        // Spread peer pan between -0.7 (left) and +0.7 (right)
        const peerCount = Object.keys(peerConnections).length;
        const panVal = Math.max(-0.8, Math.min(0.8, (peerCount % 2 === 0 ? 0.6 : -0.6) * (0.5 + (peerCount * 0.15))));
        panner.pan.setValueAtTime(panVal, audioCtx.currentTime);
        peerSource.connect(panner);
        panner.connect(audioCtx.destination);
        peerPannerNodes[targetSocketId] = panner;
      }
    } catch (e) {}
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
  if (voiceSocket) {
    voiceSocket.emit('get_voice_channels');
  }
}

function renderVoiceChannelsList(channels) {
  const container = document.getElementById('voice-channels-list');
  if (!container) return;

  if (!channels || channels.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted);">
        <p>No active voice channels. Click "+ Create Voice Room" to start one!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = channels.map(ch => {
    const isConnected = activeChannelId === ch.id;
    const count = ch.participantCount || 0;
    const limit = ch.limit || 15;
    const isFull = count >= limit;
    const cat = ch.category || 'Study';

    return `
      <div class="voice-channel-card ${isConnected ? 'active' : ''}" style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.3); border: 1px solid ${isConnected ? '#38bdf8' : 'var(--card-border)'}; padding: 14px 18px; border-radius: var(--radius-md); transition: all 0.2s ease;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.5rem;">${cat === 'Gaming' ? '🎮' : cat === 'Math' ? '📐' : cat === 'Coding' ? '💻' : cat === 'Chill' ? '☕' : '🎧'}</span>
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <strong style="color: #fff; font-size: 0.95rem;">${escapeHtml(ch.name)}</strong>
              <span style="font-size: 0.7rem; padding: 2px 8px; border-radius: 6px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 800;">${escapeHtml(cat)}</span>
              ${ch.screenSharer ? '<span style="font-size: 0.68rem; padding: 2px 6px; border-radius: 6px; background: rgba(168,85,247,0.25); color: #c084fc; font-weight: 800;">🖥️ SCREEN LIVE</span>' : ''}
            </div>
            <span style="display: block; font-size: 0.78rem; color: ${isFull ? '#ef4444' : '#10b981'}; margin-top: 3px; font-weight: 600;">
              ● ${count} / ${limit} Students Connected ${isFull ? '(FULL)' : ''}
            </span>
          </div>
        </div>
        <div>
          ${isConnected 
            ? `<button class="btn-small danger" onclick="window.leaveVoiceChannel('${ch.id}')" style="padding: 7px 16px; font-weight: 700;">Disconnect</button>`
            : `<button class="btn-small primary" onclick="window.joinVoiceChannel('${ch.id}', '${escapeHtml(ch.name)}')" ${isFull ? 'disabled' : ''} style="background: ${isFull ? 'rgba(255,255,255,0.1)' : '#10b981'}; border-color: ${isFull ? 'rgba(255,255,255,0.1)' : '#10b981'}; color: ${isFull ? '#64748b' : '#000'}; font-weight: 800; padding: 7px 16px;">Connect</button>`}
        </div>
      </div>
    `;
  }).join('');
}

function setupPttKeyListeners() {
  window.addEventListener('keydown', (e) => {
    if (voiceActivationMode !== 'ptt' || !activeChannelId || !localStream) return;
    const tag = e.target.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    if (e.code === 'Space' || e.code === 'KeyV') {
      if (!isPttPressed) {
        isPttPressed = true;
        if (!isMuted) localStream.getAudioTracks().forEach(t => t.enabled = true);
        const pttBadge = document.getElementById('voice-ptt-active-badge');
        if (pttBadge) pttBadge.style.display = 'inline-block';
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (voiceActivationMode !== 'ptt' || !activeChannelId || !localStream) return;
    if (e.code === 'Space' || e.code === 'KeyV') {
      isPttPressed = false;
      localStream.getAudioTracks().forEach(t => t.enabled = false);
      const pttBadge = document.getElementById('voice-ptt-active-badge');
      if (pttBadge) pttBadge.style.display = 'none';
      if (isSpeakingLocally) {
        isSpeakingLocally = false;
        broadcastLocalSpeakingState(false);
      }
    }
  });
}

function setupStudyRoomModal() {
  const modal = document.getElementById('create-study-room-modal');
  const form = document.getElementById('create-study-room-form');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('study-room-name-input')?.value.trim();
      const category = document.getElementById('study-room-category-select')?.value;
      const limit = document.getElementById('study-room-limit-input')?.value;
      const user = getCurrentUser();

      if (!name) return alert('Room title is required.');

      if (voiceSocket) {
        voiceSocket.emit('create_study_room', { name, category, limit, user });
      }

      if (modal) modal.style.display = 'none';
      form.reset();
    });
  }
}

function setupVoiceUI() {
  const createBtn = document.getElementById('create-voice-channel-btn');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      const modal = document.getElementById('create-study-room-modal');
      if (modal) modal.style.display = 'flex';
    });
  }

  const muteBtn = document.getElementById('voice-mute-btn');
  if (muteBtn) muteBtn.addEventListener('click', toggleMute);

  const deafenBtn = document.getElementById('voice-deafen-btn');
  if (deafenBtn) deafenBtn.addEventListener('click', toggleDeafen);

  const mainFxSelect = document.getElementById('voice-changer-select');
  if (mainFxSelect) {
    mainFxSelect.addEventListener('change', (e) => applyVoicePreset(e.target.value));
  }

  // Push-to-talk mode toggle
  const actModeSelect = document.getElementById('voice-activation-mode-select');
  if (actModeSelect) {
    actModeSelect.addEventListener('change', (e) => {
      voiceActivationMode = e.target.value;
      if (voiceActivationMode === 'ptt') {
        if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = false);
        alert('Push-to-Talk Enabled: Hold [SPACEBAR] or [V] while speaking in the voice room!');
      } else {
        if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
      }
    });
  }

  // Spatial Audio Toggle
  const spatialBtn = document.getElementById('voice-spatial-toggle-btn');
  if (spatialBtn) {
    spatialBtn.addEventListener('click', () => {
      isSpatialAudioEnabled = !isSpatialAudioEnabled;
      spatialBtn.textContent = isSpatialAudioEnabled ? '🎧 Spatial: ON' : '🎧 Spatial: OFF';
      spatialBtn.style.background = isSpatialAudioEnabled ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.1)';
      spatialBtn.style.color = isSpatialAudioEnabled ? '#38bdf8' : '#94a3b8';
    });
  }

  // Screen Sharing
  const screenBtn = document.getElementById('voice-share-screen-btn');
  if (screenBtn) {
    screenBtn.addEventListener('click', toggleScreenShare);
  }

  const screenCloseBtn = document.getElementById('voice-screen-close-btn');
  if (screenCloseBtn) {
    screenCloseBtn.addEventListener('click', stopScreenSharing);
  }

  const screenFullscreenBtn = document.getElementById('voice-screen-fullscreen-btn');
  if (screenFullscreenBtn) {
    screenFullscreenBtn.addEventListener('click', () => {
      const vid = document.getElementById('voice-screen-video');
      if (vid && vid.requestFullscreen) vid.requestFullscreen();
    });
  }
}

async function toggleScreenShare() {
  if (localScreenStream) {
    stopScreenSharing();
  } else {
    startScreenSharing();
  }
}

async function startScreenSharing() {
  if (!activeChannelId) return alert('Please join a voice room first to share your screen.');

  try {
    localScreenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: false
    });

    const screenVideo = document.getElementById('voice-screen-video');
    const screenContainer = document.getElementById('voice-screen-video-container');
    const screenBtn = document.getElementById('voice-share-screen-btn');
    const label = document.getElementById('voice-screen-sharer-label');

    if (screenVideo) screenVideo.srcObject = localScreenStream;
    if (screenContainer) screenContainer.style.display = 'block';
    if (label) label.textContent = '🖥️ Your Screen (Broadcasting Live)';
    if (screenBtn) {
      screenBtn.textContent = '🛑 Stop Sharing';
      screenBtn.style.background = '#ef4444';
      screenBtn.style.borderColor = '#ef4444';
      screenBtn.style.color = '#fff';
    }

    const videoTrack = localScreenStream.getVideoTracks()[0];
    Object.values(peerConnections).forEach(pc => {
      pc.addTrack(videoTrack, localScreenStream);
    });

    if (voiceSocket) {
      voiceSocket.emit('screen_share_start', { channelId: activeChannelId });
    }

    videoTrack.onended = () => {
      stopScreenSharing();
    };
  } catch (err) {
    console.warn('Screen share canceled or failed:', err.message);
  }
}

function stopScreenSharing() {
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(t => t.stop());
    localScreenStream = null;
  }

  const screenContainer = document.getElementById('voice-screen-video-container');
  const screenVideo = document.getElementById('voice-screen-video');
  const screenBtn = document.getElementById('voice-share-screen-btn');

  if (screenVideo) screenVideo.srcObject = null;
  if (screenContainer) screenContainer.style.display = 'none';
  if (screenBtn) {
    screenBtn.textContent = '🖥️ Share Screen';
    screenBtn.style.background = 'rgba(168, 85, 247, 0.2)';
    screenBtn.style.borderColor = '#a855f7';
    screenBtn.style.color = '#c084fc';
  }

  if (voiceSocket && activeChannelId) {
    voiceSocket.emit('screen_share_stop', { channelId: activeChannelId });
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
  if (muteBtn) muteBtn.addEventListener('click', toggleMute);

  const deafenBtn = document.getElementById('sidebar-voice-deafen-btn');
  if (deafenBtn) deafenBtn.addEventListener('click', toggleDeafen);

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
    mainMuteBtn.textContent = isMuted ? '🔇 Unmute' : '🎙️ Mute';
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
    if (voiceActivationMode === 'ptt') {
      localStream.getAudioTracks().forEach(t => t.enabled = false);
    }
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
  stopScreenSharing();

  if (activeChannelId && voiceSocket) {
    voiceSocket.emit('voice_leave', { channelId: activeChannelId });
  }

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }

  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};
  peerPannerNodes = {};

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
      <div id="voice-part-${socketId}" class="voice-participant-chip voice-participant-pill ${isSpeaking ? 'speaking is-speaking' : ''}" style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.35); border: 1px solid ${isSpeaking ? '#10b981' : 'rgba(255,255,255,0.1)'}; padding: 6px 14px; border-radius: 99px; font-size: 0.85rem; color: #fff; transition: all 0.2s ease;">
        <span class="online-dot voice-avatar ${isSpeaking ? 'speaking' : ''}" style="width: 10px; height: 10px; background: #10b981; border-radius: 50%; display: inline-block;"></span>
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
      <div id="sidebar-voice-part-${socketId}" class="voice-participant-row ${isSpeaking ? 'speaking is-speaking' : ''}">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div id="sidebar-voice-avatar-${socketId}" class="voice-avatar-wrap voice-avatar ${isSpeaking ? 'speaking speaking-ring' : ''}">
            👤
          </div>
          <span style="color: #fff; font-weight: 700; font-size: 0.82rem;">${escapeHtml(displayName)}</span>
        </div>
        <span style="font-size: 0.7rem; color: #10b981;">● Live</span>
      </div>
    `;
  }).join('');
}
