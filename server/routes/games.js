const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const { sendDiscordLog } = require('../discordLogger');

const JWT_SECRET = process.env.SESSION_SECRET || 'nitro_jwt_secure_key_2026';

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '-')
    .replace(/^-+|-+$/g, '') + '-' + Date.now().toString().slice(-4);
}

// Helper to extract user from session or JWT bearer token
async function getAuthUser(req) {
  let user = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      user = await db.getUserById(decoded.id);
    } catch (e) {}
  }
  if (!user && req.session && req.session.user) {
    user = await db.getUserById(req.session.user.id);
  }
  return user;
}

// 1. Get games: All games accessible (Premium paused until further notice)
router.get('/', async (req, res) => {
  try {
    const { search, category, sort, vipOnly } = req.query;
    const games = await db.getGames({ search, category, sort, vipOnly });
    res.json({ games });
  } catch (err) {
    console.error('Games fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve games.' });
  }
});

// 2. Multiplayer Playtime & Game Count Leaderboards
router.get('/leaderboards/playtime', async (req, res) => {
  try {
    const leaderboard = await db.getTopPlaytimeLeaderboard();
    res.json({ leaderboard });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch playtime leaderboard.' });
  }
});

router.get('/leaderboards/games', async (req, res) => {
  try {
    const leaderboard = await db.getTopGamesLeaderboard();
    res.json({ leaderboard });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch games played leaderboard.' });
  }
});

// Record Playtime Tick (every 60s while playing)
router.post('/playtime', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Auth required.' });

  const { seconds, is_new_play } = req.body;
  try {
    const stat = await db.recordGamePlaytime(
      user.id,
      user.username,
      parseInt(seconds, 10) || 60,
      Boolean(is_new_play)
    );
    res.json({ success: true, stat });
  } catch (e) {
    res.status(500).json({ error: 'Failed to record playtime.' });
  }
});

// 3. User Favorites
router.get('/favorites', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Auth required.' });

  try {
    const favorites = await db.getUserFavorites(user.id);
    res.json({ favorites });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load favorites.' });
  }
});

router.post('/favorites/toggle', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Auth required.' });

  const { gameId } = req.body;
  if (!gameId) return res.status(400).json({ error: 'gameId required.' });

  try {
    const result = await db.toggleUserFavorite(user.id, gameId);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: 'Failed to toggle favorite.' });
  }
});

// 4. Custom Game Playlists
router.get('/playlists', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Auth required.' });

  try {
    const playlists = await db.getUserPlaylists(user.id);
    res.json({ playlists });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load playlists.' });
  }
});

router.post('/playlists', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Auth required.' });

  const { title } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Playlist title required.' });

  try {
    const playlist = await db.createPlaylist(user.id, title.trim());
    res.status(201).json({ success: true, playlist });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create playlist.' });
  }
});

router.post('/playlists/add', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Auth required.' });

  const { playlistId, gameId } = req.body;
  try {
    const success = await db.addGameToPlaylist(user.id, playlistId, gameId);
    res.json({ success });
  } catch (e) {
    res.status(500).json({ error: 'Failed to add game to playlist.' });
  }
});

router.delete('/playlists/:id', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Auth required.' });

  try {
    await db.deletePlaylist(user.id, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete playlist.' });
  }
});

// 5. Cloud Game Saves (Backup / Sync)
router.get('/:slug/cloud-save', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Auth required.' });

  try {
    const save = await db.getCloudGameSave(user.id, req.params.slug);
    res.json({ success: true, save: save ? save.save_data : null, updated_at: save?.updated_at });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load cloud save.' });
  }
});

router.post('/:slug/cloud-save', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Auth required.' });

  const { save_data } = req.body;
  if (!save_data) return res.status(400).json({ error: 'save_data required.' });

  try {
    const save = await db.saveCloudGameSave(user.id, req.params.slug, save_data);
    res.json({ success: true, save });
  } catch (e) {
    res.status(500).json({ error: 'Failed to sync cloud save.' });
  }
});

// 6. Community Star Ratings & Reviews
router.get('/:slug/reviews', async (req, res) => {
  try {
    const data = await db.getGameReviews(req.params.slug);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load reviews.' });
  }
});

router.post('/:slug/reviews', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'You must be logged in to leave a review.' });

  const { rating, review_text, tips } = req.body;
  try {
    const review = await db.addGameReview(
      user.id,
      user.username,
      req.params.slug,
      rating,
      review_text,
      tips
    );

    sendDiscordLog({
      category: 'suggestions',
      action: 'GAME_REVIEW_POSTED',
      admin: user.username,
      target: req.params.slug,
      details: `Rating: ${rating}/5 Stars. Review: "${review_text || 'No text'}"`
    });

    res.status(201).json({ success: true, review });
  } catch (e) {
    res.status(500).json({ error: 'Failed to post review.' });
  }
});

// 7. Suggestions & Bug Reports
router.post('/suggest', async (req, res) => {
  const { title, details } = req.body;
  const user = await getAuthUser(req);
  const username = user ? user.username : 'Guest User';

  if (!title || !details) {
    return res.status(400).json({ error: 'Please provide both the game title and game link/details.' });
  }

  try {
    const userId = user ? user.id : null;
    const suggestion = await db.createGameSuggestion(userId, username, title.trim(), details.trim(), '');
    await db.createModerationLog('GAME_SUGGESTION', username, title.trim(), details.trim());

    sendDiscordLog({
      category: 'suggestions',
      action: 'GAME_SUGGESTION',
      admin: username,
      target: title.trim(),
      details: details.trim()
    });

    res.status(201).json({ success: true, message: 'Game suggestion submitted! Admins have been notified.' });
  } catch (err) {
    console.error('Suggestion error:', err);
    res.status(500).json({ error: 'Failed to submit game suggestion.' });
  }
});

router.post('/bug-report', async (req, res) => {
  const { title, category, description } = req.body;
  const user = await getAuthUser(req);
  const username = user ? user.username : 'Guest User';

  if (!title || !description) {
    return res.status(400).json({ error: 'Please provide a title and description for the bug report.' });
  }

  try {
    const report = await db.createBugReport(title.trim(), category || 'General', description.trim(), username);
    await db.createModerationLog('BUG_REPORT', username, title.trim(), `Category: ${category || 'General'} | ${description.trim()}`);

    sendDiscordLog({
      category: 'bugs',
      action: 'BUG_REPORT',
      admin: username,
      target: `[${category || 'General'}] ${title.trim()}`,
      details: description.trim()
    });

    res.status(201).json({ success: true, message: 'Bug report sent to administrators. Thank you!' });
  } catch (err) {
    console.error('Bug report error:', err);
    res.status(500).json({ error: 'Failed to submit bug report.' });
  }
});

// 8. Get Single Game
router.get('/:slug', async (req, res) => {
  try {
    const game = await db.getGameBySlug(req.params.slug);
    if (!game) {
      return res.status(404).json({ error: 'Game not found.' });
    }

    if (game.is_vip) {
      const user = await getAuthUser(req);
      if (!user || (!['pro', 'vip', 'premium_vip', 'elite_patron', 'moderator', 'admin', 'owner'].includes(user.role))) {
        return res.status(403).json({
          error: 'PRO Exclusive: You must have a PRO, VIP, or elevated membership to play this game.',
          is_vip_locked: true
        });
      }
    }

    const updatedClicks = await db.incrementGameClicks(game.id);
    game.clicks = parseInt(updatedClicks, 10);

    res.json({ game });
  } catch (err) {
    console.error('Game detail error:', err);
    res.status(500).json({ error: 'Failed to load game.' });
  }
});

// 9. Add Custom Game
router.post('/add', async (req, res) => {
  const user = await getAuthUser(req);
  if (!user || !['owner', 'admin'].includes(user.role)) {
    return res.status(403).json({ error: 'Only owners and administrators can publish custom games to the catalog.' });
  }

  const { title, author, thumbnail_url, embed_type, embed_content, category, is_vip } = req.body;

  if (!title || !embed_content) {
    return res.status(400).json({ error: 'Game title and embed code/URL are required.' });
  }

  const cleanTitle = title.trim();
  const slug = slugify(cleanTitle);
  const cleanThumb = thumbnail_url && thumbnail_url.trim() !== '' 
    ? thumbnail_url.trim() 
    : 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500&auto=format&fit=crop&q=60';

  const vipFlag = Boolean(is_vip);
  const gameCategory = category || 'Custom';
  const gameAuthor = author || user.username;

  try {
    const newGame = await db.createGame({
      title: cleanTitle,
      slug,
      author: gameAuthor,
      thumbnail_url: cleanThumb,
      embed_type: embed_type || 'html_code',
      embed_content,
      is_vip: vipFlag,
      category: gameCategory,
      created_by: user.username
    });

    await db.createModerationLog('ADD_GAME', user.username, cleanTitle, `Type: ${embed_type}, Category: ${gameCategory}`);

    sendDiscordLog({
      category: 'updates',
      action: 'ADD_GAME',
      admin: user.username,
      target: cleanTitle,
      details: `Type: ${embed_type}, Category: ${gameCategory}, PRO Only: ${vipFlag ? 'Yes' : 'No'}`
    });

    res.status(201).json({
      success: true,
      gameId: newGame.id,
      slug
    });
  } catch (err) {
    console.error('Add game error:', err);
    res.status(500).json({ error: 'Failed to save game to library.' });
  }
});

module.exports = router;
