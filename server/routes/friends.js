const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');

const { JWT_SECRET } = require('../secrets');

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
    if (result.autoAccepted && result.friend) {
      await db.updateQuestProgress(req.user.id, 'add_friends');
      await db.updateQuestProgress(result.friend.id, 'add_friends');
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
    if (result.status === 'accepted') {
      await db.updateQuestProgress(req.user.id, 'add_friends');
      if (result.senderId) {
        await db.updateQuestProgress(result.senderId, 'add_friends');
      }
    }
    res.json({ success: true, status: result.status });
  } catch (err) {
    res.status(500).json({ error: 'Error processing friend request.' });
  }
});

// Get pending friend requests specifically
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const pending = await db.getPendingFriendRequests(req.user.id);
    res.json({ success: true, pending });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch friend requests.' });
  }
});

// Remove / Unfriend
router.delete('/:friendId', authenticateToken, async (req, res) => {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (!friendId) return res.status(400).json({ error: 'Invalid friend ID.' });

    await db.removeFriend(req.user.id, friendId);
    res.json({ success: true, message: 'Friend removed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove friend.' });
  }
});

module.exports = router;
