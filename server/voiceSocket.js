// server/voiceSocket.js
// Handles WebRTC signaling for ephemeral voice channels via Socket.io
// This module exports a function that receives the main io instance.

module.exports = function initVoiceSocket(io) {
  const voiceNamespace = io.of('/voice');
  const VoiceManager = require('./voiceManager');

  // Cleanup inactive channels every 5 minutes (handled by manager if empty)
  setInterval(() => {
    // No-op: removal of empty channels is done when participants leave.
  }, 5 * 60 * 1000);

  voiceNamespace.on('connection', socket => {
    console.log('🔊 Voice socket connected:', socket.id);

    // Join a voice channel
    socket.on('voice_join', ({ channelId, user }) => {
      const channel = VoiceManager.getChannel(channelId);
      if (!channel) {
        socket.emit('voice_error', { message: 'Channel does not exist.' });
        return;
      }
      VoiceManager.addParticipant(channelId, socket.id, user || {});
      socket.join(channelId);
      // Notify participants in the channel about updated list
      const participants = VoiceManager.getParticipants(channelId);
      voiceNamespace.to(channelId).emit('voice_participants', { participants });
    });

    // Leave a voice channel
    socket.on('voice_leave', ({ channelId }) => {
      VoiceManager.removeParticipant(channelId, socket.id);
      socket.leave(channelId);
      const channel = VoiceManager.getChannel(channelId);
      if (channel) {
        const participants = VoiceManager.getParticipants(channelId);
        voiceNamespace.to(channelId).emit('voice_participants', { participants });
      }
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

    socket.on('disconnect', () => {
      // Remove socket from any channels it was part of
      const allChannels = VoiceManager.listChannels();
      allChannels.forEach(ch => {
        if (ch.participantCount > 0 && VoiceManager.removeParticipant(ch.id, socket.id)) {
          // Notify remaining participants
          const channel = VoiceManager.getChannel(ch.id);
          if (channel) {
            const participants = VoiceManager.getParticipants(ch.id);
            voiceNamespace.to(ch.id).emit('voice_participants', { participants });
          }
        }
      });
    });
  });
};
