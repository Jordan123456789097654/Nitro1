const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const localDb = require('../localDb');
const { JWT_SECRET } = require('../secrets');

// Helper to extract user from session, cookies, or headers
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
      if (decoded.id) user = await db.getUserById(decoded.id);
    } catch (e) {}
  }

  if (!user && req.session && req.session.user) {
    user = await db.getUserById(req.session.user.id);
  }
  return user;
}

router.get('/', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const email = user.email || `${user.username}@nitromath.org`;
    const isOwner = user.role === 'owner' || user.username.toLowerCase() === 'jordandaniels';
    const isAdmin = isOwner ? 3 : (user.role === 'admin' ? 1 : 0);

    // Sync to local SQLite db so playlists work cleanly
    try {
      localDb.prepare(`
        INSERT INTO users (id, email, password_hash, username, created_at, updated_at, is_admin)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          username = excluded.username,
          is_admin = excluded.is_admin
      `).run(
        String(user.id),
        email,
        'placeholder_hash',
        user.username,
        Date.now(),
        Date.now(),
        isAdmin
      );
    } catch (dbErr) {
      console.error('Error syncing user to SQLite:', dbErr.message);
    }

    // Set Express session user for SQLite-based routers
    req.session.user = {
      id: String(user.id),
      email: email,
      username: user.username,
      is_admin: isAdmin,
      is_owner: isOwner
    };
    await new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));

    // Return in PeteZahGames frontend user schema format
    return res.json({
      user: {
        id: String(user.id),
        email: email,
        username: user.username,
        display_name: user.display_name || user.username,
        bio: user.bio || '',
        avatar_url: user.avatar_url || null,
        status: '',
        location: '',
        website: '',
        profile_color: '#4d8dff',
        banner_url: user.banner_url || null,
        favorite_music: [],
        showcase_badges: null,
        profile_public: true,
        show_activity: true,
        is_admin: isAdmin,
        is_owner: isOwner,
        created_at: Date.now()
      }
    });
  } catch (err) {
    console.error('Session verification error:', err);
    res.status(500).json({ error: 'Session verification failed.' });
  }
});

module.exports = router;
