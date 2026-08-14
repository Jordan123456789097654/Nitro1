const express = require('express');
const router = express.Router();
const db = require('../db');

// Get latest published update log / patch note
router.get('/latest', async (req, res) => {
  try {
    const update = await db.getLatestUpdateLog();
    res.json({ update });
  } catch (err) {
    console.error('Update fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve latest update.' });
  }
});

// Get all update logs
router.get('/', async (req, res) => {
  try {
    const updates = await db.getAllUpdateLogs();
    res.json({ updates });
  } catch (err) {
    console.error('All updates fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve updates.' });
  }
});

module.exports = router;
