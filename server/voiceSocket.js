// server/voiceSocket.js
// Handles WebRTC signaling for ephemeral voice channels, study rooms, screen sharing & spatial audio

module.exports = function initVoiceSocket(io) {
  const voiceNamespace = io.of('/voice');
  const VoiceManager = require('./voiceManager');

  voiceNamespace.on('connection', socket => {
    // Send list of available channels
    socket.emit('voice_channels_list', { channels: VoiceManager.listChannels() });

    // Request channel list
    socket.on('get_voice_channels', () => {
      socket.emit('voice_channels_list', { channels: VoiceManager.listChannels() });
    });

    // Create a new study voice room
    socket.on('create_study_room', ({ name, category, limit, user }) => {
      const cleanName = (name || 'Study Room').trim().slice(0, 40);
      const cleanCategory = (category || 'Study').trim().slice(0, 20);
      const userLimit = Math.max(2, Math.min(50, parseInt(limit, 10) || 15));
      const creatorId = (user && user.id) || 0;

      const channelId = VoiceManager.createChannel(cleanName, creatorId, false, {
        category: cleanCategory,
        limit: userLimit
      });

      // Broadcast new channel list to all voice clients
      voiceNamespace.emit('voice_channels_list', { channels: VoiceManager.listChannels() });
      socket.emit('study_room_created', { channelId, name: cleanName });
    });

    // Join a voice channel
    socket.on('voice_join', ({ channelId, user }) => {
      const channel = VoiceManager.getChannel(channelId);
      if (!channel) {
        socket.emit('voice_error', { message: 'Channel does not exist.' });
        return;
      }
      if (channel.participants.size >= channel.limit) {
        socket.emit('voice_error', { message: `Channel is full (Max ${channel.limit} students).` });
        return;
      }

      VoiceManager.addParticipant(channelId, socket.id, user || {});
      socket.join(channelId);

      // Notify participants in the channel about updated list
      const participants = VoiceManager.getParticipants(channelId);
      voiceNamespace.to(channelId).emit('voice_participants', {
        channelId,
        screenSharer: channel.screenSharer,
        participants
      });
      voiceNamespace.emit('voice_channels_list', { channels: VoiceManager.listChannels() });
    });

    // Leave a voice channel
    socket.on('voice_leave', ({ channelId }) => {
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

    // Signaling: exchange SDP offers/answers and ICE candidates
    socket.on('voice_offer', ({ channelId, targetSocketId, sdp }) => {
      voiceNamespace.to(targetSocketId).emit('voice_offer', { from: socket.id, sdp });
    });

    socket.on('voice_answer', ({ channelId, targetSocketId, sdp }) => {
      voiceNamespace.to(targetSocketId).emit('voice_answer', { from: socket.id, sdp });
    });

    socket.on('ice_candidate', ({ channelId, targetSocketId, candidate }) => {
      voiceNamespace.to(targetSocketId).emit('ice_candidate', { from: socket.id, candidate });
    });

    // Real-time Speaking Indicators Event
    socket.on('speaking_state', ({ channelId, isSpeaking }) => {
      if (channelId) {
        socket.to(channelId).emit('speaking_state', { from: socket.id, isSpeaking: Boolean(isSpeaking) });
      }
    });

    // Screen Sharing Signaling
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
      // Remove socket from any channels it was part of
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
