const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/themes/public - Fetch public themes
router.get('/public', async (req, res) => {
  try {
    const themes = await db.getPublicThemes();
    res.json({ success: true, themes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve public themes.' });
  }
});

// POST /api/themes/share - Share a custom theme publicly
router.post('/share', async (req, res) => {
  const { id, name, bg, accent, text, cardbg, muted } = req.body;
  if (!id || !name || !bg || !accent || !text || !cardbg || !muted) {
    return res.status(400).json({ error: 'Missing required theme fields.' });
  }

  try {
    const author = req.user ? req.user.username : 'Community';
    const shared = await db.sharePublicTheme({ id, name, bg, accent, text, cardbg, muted, author });
    if (shared) {
      res.json({ success: true, theme: shared, message: `Theme "${name}" shared successfully!` });
    } else {
      res.status(500).json({ error: 'Failed to share theme.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to share theme.' });
  }
});

module.exports = router;
