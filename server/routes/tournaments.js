const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function saveBase64Image(base64Data) {
  try {
    const uploadDir = path.join(__dirname, '../../public/uploads/proof');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return null;
    }

    const ext = matches[1].split('/')[1] || 'png';
    const filename = `proof-${crypto.randomBytes(8).toString('hex')}-${Date.now()}.${ext}`;
    const filepath = path.join(uploadDir, filename);

    fs.writeFileSync(filepath, Buffer.from(matches[2], 'base64'));
    return `/uploads/proof/${filename}`;
  } catch (e) {
    console.error('Error saving proof image:', e);
    return null;
  }
}

const JWT_SECRET = process.env.SESSION_SECRET || 'nitro_jwt_secure_key_2026';

// Helper to authenticate request and get DB user
async function getAuthUser(req) {
  if (req.user) return req.user;

  // Try parsing from authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return await db.getUserByUsername(decoded.username);
    } catch (e) {}
  }

  // Try parsing from cookies
  if (req.cookies && req.cookies.nitro_jwt_token) {
    try {
      const decoded = jwt.verify(req.cookies.nitro_jwt_token, JWT_SECRET);
      return await db.getUserByUsername(decoded.username);
    } catch (e) {}
  }

  return null;
}

// GET /api/tournaments - Fetch active tournaments and their leaderboards
router.get('/', async (req, res) => {
  try {
    const activeTournaments = await db.getActiveTournaments();
    
    // Attach leaderboard data to each active tournament
    const tournamentsWithLeaderboards = await Promise.all(
      activeTournaments.map(async (t) => {
        const leaderboard = await db.getTournamentLeaderboard(t.id);
        return {
          ...t,
          leaderboard
        };
      })
    );

    res.json({ success: true, tournaments: tournamentsWithLeaderboards });
  } catch (err) {
    console.error('Fetch tournaments error:', err);
    res.status(500).json({ error: 'Failed to retrieve tournaments.' });
  }
});

// POST /api/tournaments/:id/submit - Submit score to a tournament
router.post('/:id/submit', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const tournamentId = parseInt(req.params.id, 10);
  const { score, proofImageUrl } = req.body;

  if (!score || isNaN(score) || parseInt(score, 10) <= 0) {
    return res.status(400).json({ error: 'Please enter a valid positive score.' });
  }
  if (!proofImageUrl || !proofImageUrl.trim().startsWith('data:image/')) {
    return res.status(400).json({ error: 'Please upload a valid screenshot proof.' });
  }

  const savedUrl = saveBase64Image(proofImageUrl);
  if (!savedUrl) {
    return res.status(400).json({ error: 'Failed to process screenshot file.' });
  }

  try {
    const submission = await db.createTournamentSubmission(
      user.id,
      user.username,
      tournamentId,
      score,
      savedUrl
    );

    if (!submission) {
      return res.status(500).json({ error: 'Failed to save tournament submission.' });
    }

    res.status(201).json({
      success: true,
      message: 'Score submitted successfully! An administrator has been notified to review your screenshot.',
      submissionId: submission.id
    });
  } catch (err) {
    console.error('Submit score error:', err);
    res.status(500).json({ error: 'Server error saving submission.' });
  }
});

module.exports = router;
