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

// GET /api/voice/ice-config — WebRTC ICE server list for the client.
// STUN-only setups (the previous hardcoded RTC_CONFIG) fail to establish a
// peer connection at all on networks that block/restrict raw UDP — which is
// exactly the kind of restrictive network this app's users are commonly on.
// STUN just helps two peers discover each other's public address; it does
// nothing if the network won't let UDP media flow directly between them. A
// TURN server relays the actual audio over a connection the network will
// allow (often TCP/443), which is what actually fixes "voice doesn't work"
// for a lot of users. Configure TURN_URL / TURN_USERNAME / TURN_CREDENTIAL
// in your environment (e.g. from Twilio, Metered, or a self-hosted coturn)
// to enable it — TURN credentials are never hardcoded in client source.
router.get('/ice-config', (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ];

  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(',').map(u => u.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }

  res.json({ success: true, iceServers, turnConfigured: Boolean(process.env.TURN_URL) });
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
