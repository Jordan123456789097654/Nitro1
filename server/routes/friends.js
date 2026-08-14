const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.SESSION_SECRET || 'nitro_jwt_secure_key_2026';

function authenticateToken(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.nitro_jwt_token) {
    token = req.cookies.nitro_jwt_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

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
    if (!result || !result.success) {
      return res.status(400).json({ error: 'Failed to process request.' });
    }
    res.json({ success: true, status: result.status });
  } catch (err) {
    res.status(500).json({ error: 'Error processing friend request.' });
  }
});

module.exports = router;
