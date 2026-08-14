const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth');

// Get user's friend list & pending requests
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const [friends, pending] = await Promise.all([
      db.getUserFriends(req.user.id),
      db.getPendingFriendRequests(req.user.id)
    ]);
    res.json({ success: true, friends, pending });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch friends.' });
  }
});

// Send a friend request
router.post('/request', authenticateToken, async (req, res) => {
  const { friendUsername } = req.body;
  if (!friendUsername || !friendUsername.trim()) {
    return res.status(400).json({ error: 'Username required.' });
  }

  try {
    const result = await db.sendFriendRequest(req.user.id, friendUsername.trim());
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, message: `Friend request sent to @${friendUsername}!`, result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send request.' });
  }
});

// Respond to a friend request (accept / decline)
router.post('/respond', authenticateToken, async (req, res) => {
  const { requestId, status } = req.body;
  if (!requestId || !['accepted', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'Valid requestId and status required.' });
  }

  try {
    const result = await db.respondFriendRequest(req.user.id, requestId, status);
    if (!result || !reqult.success) {
      return res.status(400).json({ error: 'Failed to process request.' });
    }
    res.json({ success: true, status: result.status });
  } catch (err) {
    res.status(500).json({ error: 'Error processing friend request.' });
  }
});

module.exports = router;
