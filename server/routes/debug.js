const express = require('express');
const router = express.Router();
const db = require('../db');

// Simple health check endpoint
router.get('/ping', async (req, res) => {
  try {
    const result = await db.pool.query('SELECT 1');
    res.json({ success: true, result: result.rows[0] });
  } catch (err) {
    console.error('Ping error:', err.message);
    res.status(500).json({ error: 'Ping failed' });
  }
});

// List all users (admin debugging)
router.get('/users', async (req, res) => {
  try {
    const users = await db.pool.query('SELECT id, username, role, is_banned FROM users ORDER BY id');
    res.json({ success: true, users: users.rows });
  } catch (err) {
    console.error('List users error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

module.exports = router;
