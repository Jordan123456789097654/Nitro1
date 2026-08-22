// server/routes/voice.js
const express = require('express');
const router = express.Router();
const voiceManager = require('../voiceManager');

// Middleware to ensure authenticated user
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Auth required' });
  next();
}

// List active channels (public)
router.get('/list', (req, res) => {
  const channels = voiceManager.listChannels();
  res.json({ success: true, channels });
});

// Create a new channel
router.post('/create', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Channel name required' });
  const channelId = voiceManager.createChannel(name, req.user.id);
  res.json({ success: true, channelId, name });
});

// Join a channel (adds participant, socket will join via socket.io later)
router.post('/join', requireAuth, async (req, res) => {
  const { channelId } = req.body;
  if (!channelId) return res.status(400).json({ error: 'channelId required' });
  const channel = voiceManager.getChannel(channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });
  // Update quest progress
  const db = require('../db');
  await db.updateQuestProgress(req.user.id, 'join_voice');
  // No socket join here; client will emit socket event after receiving OK.
  res.json({ success: true, channelId, name: channel.name });
});

// Leave a channel (socket will handle removal)
router.post('/leave', requireAuth, (req, res) => {
  const { channelId } = req.body;
  if (!channelId) return res.status(400).json({ error: 'channelId required' });
  const channel = voiceManager.getChannel(channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });
  res.json({ success: true, channelId });
});

module.exports = router;
