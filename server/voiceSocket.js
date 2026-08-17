// server/voiceSocket.js
// Modern WebRTC signaling namespace for ephemeral voice channels, screen sharing, PTT & spatial audio

module.exports = function initVoiceSocket(io) {
  const voiceNamespace = io.of('/voice');
  const VoiceManager = require('./voiceManager');

  voiceNamespace.on('connection', socket => {
    // Send initial channel list
    socket.emit('voice_channels_list', { channels: VoiceManager.listChannels() });

    // Request fresh channel list
    socket.on('get_voice_channels', () => {
      socket.emit('voice_channels_list', { channels: VoiceManager.listChannels() });
    });

    // Create a new custom voice room
    socket.on('create_study_room', ({ name, category, limit, password, user }) => {
      const cleanName = (name || 'Voice Room').trim().slice(0, 45);
      const cleanCategory = (category || 'Study').trim().slice(0, 20);
      const userLimit = Math.max(2, Math.min(50, parseInt(limit, 10) || 20));
      const creatorId = (user && user.id) || 0;

      const channelId = VoiceManager.createChannel(cleanName, creatorId, false, {
        category: cleanCategory,
        limit: userLimit,
        password: password ? String(password).trim() : ''
      });

      voiceNamespace.emit('voice_channels_list', { channels: VoiceManager.listChannels() });
      socket.emit('study_room_created', { channelId, name: cleanName });
    });

    // Join voice channel
    socket.on('voice_join', ({ channelId, password, user }) => {
      const channel = VoiceManager.getChannel(channelId);
      if (!channel) {
        return socket.emit('voice_error', { message: 'Voice channel no longer exists.' });
      }

      if (channel.password && channel.password !== String(password || '').trim()) {
        return socket.emit('voice_error', { message: 'Incorrect channel password.' });
      }

      if (channel.participants.size >= channel.limit) {
        return socket.emit('voice_error', { message: `Channel is full (Capacity: ${channel.limit} users).` });
      }

      VoiceManager.addParticipant(channelId, socket.id, user || {});
      socket.join(channelId);

      const participants = VoiceManager.getParticipants(channelId);
      voiceNamespace.to(channelId).emit('voice_participants', {
        channelId,
        screenSharer: channel.screenSharer,
        participants
      });
      voiceNamespace.emit('voice_channels_list', { channels: VoiceManager.listChannels() });
    });

    // Leave voice channel
    socket.on('voice_leave', ({ channelId }) => {
      if (!channelId) return;
      VoiceManager.removeParticipant(channelId, socket.id);
      socket.leave(channelId);
      const channel = VoiceManager.getChannel(channelId);
      if (channel) {
        const participants = VoiceManager.getParticipants(channelId);
        voiceNamespace.to(channelId).emit('voice_participants', {
          channelId,
          screenSharer: channel.screenSharer,
          participants
        });
      }
      voiceNamespace.emit('voice_channels_list', { channels: VoiceManager.listChannels() });
    });

    // WebRTC Signaling: SDP Offers/Answers & ICE Candidates
    socket.on('voice_offer', ({ channelId, targetSocketId, sdp }) => {
      voiceNamespace.to(targetSocketId).emit('voice_offer', { from: socket.id, sdp });
    });

    socket.on('voice_answer', ({ channelId, targetSocketId, sdp }) => {
      voiceNamespace.to(targetSocketId).emit('voice_answer', { from: socket.id, sdp });
    });

    socket.on('ice_candidate', ({ channelId, targetSocketId, candidate }) => {
      voiceNamespace.to(targetSocketId).emit('ice_candidate', { from: socket.id, candidate });
    });

    // Real-Time Active Speaking State
    socket.on('speaking_state', ({ channelId, isSpeaking }) => {
      if (channelId) {
        socket.to(channelId).emit('speaking_state', { from: socket.id, isSpeaking: Boolean(isSpeaking) });
      }
    });

    // Screen Share Controls
    socket.on('screen_share_start', ({ channelId }) => {
      if (!channelId) return;
      VoiceManager.setScreenSharer(channelId, socket.id);
      voiceNamespace.to(channelId).emit('screen_share_state', {
        channelId,
        sharerSocketId: socket.id,
        isSharing: true
      });
    });

    socket.on('screen_share_stop', ({ channelId }) => {
      if (!channelId) return;
      const ch = VoiceManager.getChannel(channelId);
      if (ch && ch.screenSharer === socket.id) {
        VoiceManager.setScreenSharer(channelId, null);
        voiceNamespace.to(channelId).emit('screen_share_state', {
          channelId,
          sharerSocketId: null,
          isSharing: false
        });
      }
    });

    socket.on('disconnect', () => {
      const allChannels = VoiceManager.listChannels();
      allChannels.forEach(ch => {
        if (ch.participantCount > 0 && VoiceManager.removeParticipant(ch.id, socket.id)) {
          const channel = VoiceManager.getChannel(ch.id);
          if (channel) {
            const participants = VoiceManager.getParticipants(ch.id);
            voiceNamespace.to(ch.id).emit('voice_participants', {
              channelId: ch.id,
              screenSharer: channel.screenSharer,
              participants
            });
          }
        }
      });
      voiceNamespace.emit('voice_channels_list', { channels: VoiceManager.listChannels() });
    });
  });
};
