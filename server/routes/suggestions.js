const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendDiscordLog } = require('../discordLogger');

// POST /api/suggestions - Submit Game Suggestion
router.post('/', async (req, res) => {
  try {
    const { title, details, username } = req.body;
    if (!title || !details) {
      return res.status(400).json({ error: 'Title and details are required.' });
    }

    const cleanUsername = (username || 'Guest').trim();
    const suggestion = await db.createGameSuggestion(title.trim(), details.trim(), cleanUsername);

    sendDiscordLog({
      category: 'suggestions',
      action: 'GAME_SUGGESTION_SUBMITTED',
      admin: cleanUsername,
      target: title,
      details: details
    });

    res.json({ success: true, suggestion, message: 'Game suggestion submitted successfully!' });
  } catch (err) {
    console.error('Submit suggestion error:', err);
    res.status(500).json({ error: 'Failed to submit game suggestion.' });
  }
});

// GET /api/suggestions - List Suggestions (Admin)
router.get('/', async (req, res) => {
  try {
    const suggestions = await db.getGameSuggestions();
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch suggestions.' });
  }
});

// POST /api/bugs - Submit Bug Report
router.post('/bugs', async (req, res) => {
  try {
    const { title, category, description, username } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required.' });
    }

    const cleanUsername = (username || 'Guest').trim();
    const report = await db.createBugReport(title.trim(), category || 'General', description.trim(), cleanUsername);

    sendDiscordLog({
      category: 'bugs',
      action: 'BUG_REPORT_SUBMITTED',
      admin: cleanUsername,
      target: `[${category || 'General'}] ${title}`,
      details: description
    });

    res.json({ success: true, report, message: 'Bug report submitted successfully!' });
  } catch (err) {
    console.error('Submit bug error:', err);
    res.status(500).json({ error: 'Failed to submit bug report.' });
  }
});

// GET /api/bugs - List Bug Reports (Admin)
router.get('/bugs', async (req, res) => {
  try {
    const reports = await db.getBugReports();
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bug reports.' });
  }
});

module.exports = router;
