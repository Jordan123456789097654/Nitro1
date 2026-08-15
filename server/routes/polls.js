const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendDiscordLog } = require('../discordLogger');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.SESSION_SECRET || 'nitro_jwt_secure_key_2026';

async function getAuthUser(req) {
  if (req.user) return req.user;
  let user = null;
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.nitro_jwt_token) {
    token = req.cookies.nitro_jwt_token;
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const targetId = decoded.id || (decoded.user && decoded.user.id) || decoded.userId;
      if (targetId) {
        user = await db.getUserById(targetId);
      }
      if (!user && (decoded.username || (decoded.user && decoded.user.username))) {
        user = decoded.user || decoded;
      }
    } catch (e) {}
  }
  if (!user && req.session && req.session.user) {
    user = await db.getUserById(req.session.user.id);
  }
  return user;
}

// Get active community polls with vote percentages and user's voted option
router.get('/', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const userId = user ? user.id : null;
    const polls = await db.getPolls(userId);
    res.json({ polls });
  } catch (err) {
    console.error('Polls fetch error:', err);
    res.status(500).json({ error: 'Failed to load community polls.' });
  }
});

// Vote in a poll
router.post('/:id/vote', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'You must be logged in to vote in community polls.' });
  }

  const pollId = req.params.id;
  const { optionIndex } = req.body;

  if (optionIndex === undefined || optionIndex === null) {
    return res.status(400).json({ error: 'Option index is required.' });
  }

  try {
    await db.votePoll(pollId, user.id, parseInt(optionIndex, 10));

    sendDiscordLog({
      category: 'suggestions',
      action: 'POLL_VOTE_CAST',
      admin: user.username,
      target: `Poll #${pollId}`,
      details: `Voted for option index ${optionIndex}`
    });

    const updatedPolls = await db.getPolls(user.id);
    const updatedPoll = updatedPolls.find(p => p.id == pollId);

    res.json({ success: true, poll: updatedPoll });
  } catch (err) {
    console.error('Poll vote error:', err);
    res.status(500).json({ error: 'Failed to cast vote.' });
  }
});

// Admin: Create new community poll
router.post('/create', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || !['owner', 'admin'].includes(user.role)) {
    return res.status(403).json({ error: 'Only owners and administrators can create polls.' });
  }

  const { question, options } = req.body;
  if (!question || !options || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Question and at least 2 options are required.' });
  }

  try {
    const newPoll = await db.createPoll(question.trim(), options, user.username);

    sendDiscordLog({
      category: 'suggestions',
      action: 'NEW_COMMUNITY_POLL',
      admin: user.username,
      target: question.trim(),
      details: `Options: ${options.join(', ')}`
    });

    res.status(201).json({ success: true, poll: newPoll });
  } catch (err) {
    console.error('Create poll error:', err);
    res.status(500).json({ error: 'Failed to create poll.' });
  }
});

// Game Suggestions & Voting Board
router.get('/suggestions', async (req, res) => {
  try {
    const suggestions = await db.getGameSuggestions();
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve game suggestions.' });
  }
});

router.post('/suggestions', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in to submit a game suggestion.' });
  }
  const { title, description, gameUrl } = req.body;
  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Game title is required.' });
  }

  try {
    const suggestion = await db.createGameSuggestion(user.id, user.username, title.trim(), description, gameUrl);
    
    sendDiscordLog({
      category: 'suggestions',
      action: 'GAME_SUGGESTION_SUBMITTED',
      admin: user.username,
      target: title.trim(),
      details: description || 'No details'
    });

    res.status(201).json({ success: true, suggestion });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit game suggestion.' });
  }
});

router.post('/suggestions/:id/upvote', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in to upvote game suggestions.' });
  }

  try {
    const updated = await db.upvoteGameSuggestion(req.params.id, user.username);
    res.json({ success: true, suggestion: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upvote suggestion.' });
  }
});

module.exports = router;
