const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const { sendDiscordLog } = require('../discordLogger');

const JWT_SECRET = process.env.SESSION_SECRET || 'nitro_jwt_secure_key_2026';

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

// Preset Web Applications
const PRESET_APPS = [
  {
    id: 1,
    title: 'Desmos Scientific Calculator',
    slug: 'desmos-calculator',
    category: 'Utilities',
    icon: '🧮',
    url: 'https://www.desmos.com/scientific',
    description: 'Advanced graphing & scientific calculator for math & science.',
    is_vip: false
  },
  {
    id: 2,
    title: 'Wikipedia Academic Research',
    slug: 'wikipedia-research',
    category: 'Educational',
    icon: '📚',
    url: 'https://en.wikipedia.org',
    description: 'Free encyclopedia for essay research & reference.',
    is_vip: false
  },
  {
    id: 3,
    title: 'Scratch Studio',
    slug: 'scratch-studio',
    category: 'Coding',
    icon: '🐱',
    url: 'https://scratch.mit.edu/create',
    description: 'Interactive visual programming language & game creation.',
    is_vip: false
  },
  {
    id: 4,
    title: 'GeoGebra Math Suite',
    slug: 'geogebra-suite',
    category: 'Educational',
    icon: '📐',
    url: 'https://www.geogebra.org/calculator',
    description: 'Interactive geometry, 3D math & calculus visualization.',
    is_vip: false
  },
  {
    id: 5,
    title: 'CodePen Sandbox',
    slug: 'codepen-sandbox',
    category: 'Coding',
    icon: '💻',
    url: 'https://codepen.io/pen/',
    description: 'Frontend HTML, CSS, and JS code playground.',
    is_vip: false
  },
  {
    id: 6,
    title: 'RetroArch Web Emulator',
    slug: 'retroarch-emulator',
    category: 'Emulators',
    icon: '🕹️',
    url: 'https://web.retroarch.com',
    description: 'Browser emulator for classic arcade & console games.',
    is_vip: true
  }
];

// GET /api/apps - List apps
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    let apps = [...PRESET_APPS];

    if (category && category !== 'All') {
      apps = apps.filter(a => a.category.toLowerCase() === category.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      apps = apps.filter(a => a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
    }

    res.json({ apps });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch web apps.' });
  }
});

// GET /api/apps/categories - Categories list
router.get('/categories', (req, res) => {
  res.json({ categories: ['All', 'Educational', 'Utilities', 'Coding', 'Emulators'] });
});

// POST /api/apps/suggest - Suggest a web app
router.post('/suggest', async (req, res) => {
  try {
    const user = await getAuthUser(req);
    const { title, details } = req.body;
    if (!title || !details) {
      return res.status(400).json({ error: 'Title and details are required.' });
    }

    const username = user ? user.username : 'Anonymous';
    await db.addGameSuggestion(title, `[APP SUGGESTION] ${details}`, username);

    sendDiscordLog('💡 App Suggestion Submitted', [
      { name: 'App Title', value: title, inline: true },
      { name: 'Suggested By', value: username, inline: true },
      { name: 'Details', value: details }
    ]);

    res.json({ success: true, message: 'App suggestion submitted successfully!' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to submit app suggestion.' });
  }
});

module.exports = router;
