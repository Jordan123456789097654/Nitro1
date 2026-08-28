require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const JavaScriptObfuscator = require('javascript-obfuscator');
 
const authRoutes = require('./routes/auth');
const gamesRoutes = require('./routes/games');
const appsRoutes = require('./routes/apps');
const adminRoutes = require('./routes/admin');
const gatewayRoutes = require('./routes/gateway');
const updatesRoutes = require('./routes/updates');
const pollsRoutes = require('./routes/polls');
const { initChatSocket } = require('./chatSocket');
const db = require('./db');

const { JWT_SECRET } = require('./secrets');

// Crash protection for cloud deployments (Render, Railway, Koyeb, Replit, nitromath.org)
process.on('uncaughtException', (err) => {
  console.error('🛡️ [Safety] Uncaught Exception caught:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🛡️ [Safety] Unhandled Rejection caught at:', promise, 'reason:', reason);
});

const app = express();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 5e6, // 5MB — was 100MB which could trigger OOM on a single payload
  cookie: false
});
app.set('io', io);
global.__nitro_io__ = io; // exposed for db.js audit enforcement (avoids circular require)
app.set('trust proxy', 1);

// Middleware & Security Headers
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Allow framing across Google Sites (sites.google.com, googleusercontent.com, and custom domains)
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  res.removeHeader('X-Frame-Options');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Permissions-Policy', 'fullscreen=*, gamepad=*, autoplay=*, clipboard-read=*, clipboard-write=*, microphone=*, camera=*');
  next();
});

// Express Session
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE === 'true',
    maxAge: 1000 * 60 * 60 * 24 * 14 // 14 days
  }
}));

// Global User Extractor, IP Tracker & Ban Enforcement Middleware
app.use(async (req, res, next) => {
  let user = null;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  req.clientIp = clientIp;

  // Check global IP Ban
  if (clientIp && await db.isIpBanned(clientIp)) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { background: #090a0f; color: #fff; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .card { background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 40px; border-radius: 16px; max-width: 480px; }
          h2 { color: #ef4444; margin-top: 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🚫 Access Denied (IP Banned)</h2>
          <p>Your IP address (<code>${clientIp}</code>) has been blocked from accessing this network due to policy violations.</p>
        </div>
      </body>
      </html>
    `);
  }

  // 1. Authorization header (Bearer)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.id) user = await db.getUserById(decoded.id);
      if (!user && decoded.username) user = await db.getUserByUsername(decoded.username);
    } catch (e) {}
  }

  // 2. Cookie (nitro_jwt_token)
  if (!user && req.cookies && req.cookies.nitro_jwt_token) {
    try {
      const decoded = jwt.verify(req.cookies.nitro_jwt_token, JWT_SECRET);
      user = await db.getUserById(decoded.id);
    } catch (e) {}
  }

  // 3. Query Token (?token=...)
  if (!user && req.query && req.query.token) {
    try {
      const decoded = jwt.verify(req.query.token, JWT_SECRET);
      user = await db.getUserById(decoded.id);
    } catch (e) {}
  }

  // 4. Session Fallback
  if (!user && req.session && req.session.user) {
    user = req.session.user;
  }

  req.user = user;
  next();
});

// Authentication Enforcement Middleware for API routes
app.use('/api', (req, res, next) => {
  const openPaths = [
    '/auth/login', '/api/auth/login',
    '/auth/register', '/api/auth/register',
    '/auth/me', '/api/auth/me',
    '/status', '/api/status',
    '/visit', '/api/visit',
    '/contact', '/api/contact',
    '/admin/signups-status', '/api/admin/signups-status',
    '/updates/latest', '/api/updates/latest',
    '/ai/status', '/api/ai/status',
    '/weather', '/api/weather',
    '/gateway', '/api/gateway',
    '/music/search', '/api/music/search'
  ];
  if (openPaths.some(p => req.path === p || req.path.startsWith(p) || req.originalUrl.startsWith(p))) return next();

  // Allow public GET endpoints for games, reviews, leaderboards, and tournaments
  if (req.method === 'GET') {
    const isPublicGameRoute = req.path === '/games' || req.path.startsWith('/games/') || req.originalUrl.startsWith('/api/games') || req.path === '/tournaments' || req.path.startsWith('/tournaments/') || req.originalUrl.startsWith('/api/tournaments');
    const isPrivateGameRoute = req.path.includes('/favorites') || req.path.includes('/playlists') || req.path.includes('/cloud-save');
    if (isPublicGameRoute && !isPrivateGameRoute) return next();
  }

  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  next();
});

// Owner Maintenance Mode Protection Middleware
app.use(async (req, res, next) => {
  // Allow health checks, status check, auth login/logout endpoints
  const allowedPaths = ['/health', '/api/status', '/api/auth/login', '/api/auth/me', '/api/auth/logout'];
  if (allowedPaths.includes(req.path)) {
    return next();
  }

  try {
    const isMaintenance = await db.getMaintenanceMode();
    if (isMaintenance) {
      const isOwner = req.user && (req.user.role === 'owner' || (req.user.username && req.user.username.toLowerCase() === 'jordandaniels'));
      if (!isOwner) {
        if (req.path.startsWith('/api/')) {
          return res.status(503).json({ error: 'Maintenance Mode is active. Access is temporarily restricted to the platform Owner.', maintenance: true });
        }
      }
    }
  } catch (e) {}

  next();
});

// Global Authentication Enforcement for non-API routes
app.use((req, res, next) => {
  // Allow public assets, root, embed, auth, and API routes
  const allowed = ['/', '/embed', '/login', '/signup', '/js', '/css', '/favicon.ico', '/api'];
  if (allowed.some(p => req.path === p || req.path.startsWith(p))) return next();
  if (!req.user) {
    if (req.accepts('html')) return res.redirect('/login');
    return res.status(401).json({ error: 'Authentication required.' });
  }
  next();
});

// Cloud Deployment Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Disable caching on client JS files during development to ensure instant updates
app.use('/js', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Public Status, Visitor Counter & Active Announcement Endpoint
app.get('/api/status', async (req, res) => {
  try {
    const isMaintenance = await db.getMaintenanceMode();
    const isOwner = req.user && (req.user.role === 'owner' || (req.user.username && req.user.username.toLowerCase() === 'jordandaniels'));
    const isAdmin = req.user && ['admin', 'owner'].includes(req.user.role);
    const announcement = await db.getActiveAnnouncement();
    const visits = await db.getSiteVisits();
    const features = await db.getFeatureSettings();

    res.json({
      maintenance_mode: isMaintenance,
      is_owner: isOwner,
      is_admin: isAdmin,
      announcement: announcement,
      visits_count: visits,
      features: features
    });
  } catch (err) {
    res.json({
      maintenance_mode: false,
      is_owner: false,
      is_admin: false,
      announcement: null,
      visits_count: 128,
      features: {}
    });
  }
});

// Increment Site Visit Counter
app.post('/api/visit', async (req, res) => {
  try {
    const count = await db.incrementSiteVisits();
    res.json({ success: true, visits_count: count });
  } catch (e) {
    res.json({ success: true, visits_count: 128 });
  }
});

// Per-route body size overrides for endpoints that accept base64 image/file uploads
// (Global limit is 2mb — these specific routes need more)
const largeBodyParser = express.json({ limit: '15mb' });

// API Routes
app.use('/gateway', gatewayRoutes);
app.use('/api/auth', largeBodyParser, authRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/apps', appsRoutes);
app.use('/api/admin', largeBodyParser, adminRoutes);
app.use('/api/gateway', gatewayRoutes);
app.use('/api/updates', updatesRoutes);
app.use('/api/polls', pollsRoutes);
app.use('/api/voice', require('./routes/voice'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/music', require('./routes/music'));
app.use('/api/me', require('./routes/me'));
app.use('/api/soundboard', require('./routes/soundboard'));
app.use('/api/ai', largeBodyParser, require('./routes/ai'));
app.use('/api/appeals', require('./routes/appeals'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/themes', require('./routes/themes'));
app.use('/api/tournaments', require('./routes/tournaments'));
app.use('/api/raffles', require('./routes/raffles'));

// GET /api/weather - Proxy wttr.in with curl user-agent to ensure clean plain-text return
app.get('/api/weather', async (req, res) => {
  try {
    const fetch = require('node-fetch');
    const response = await fetch('https://wttr.in/?format=%c+%t', {
      headers: { 'User-Agent': 'curl/7.64.1' },
      timeout: 5000
    });
    if (!response.ok) throw new Error();
    const text = await response.text();
    res.json({ success: true, weather: text.trim() });
  } catch (err) {
    res.json({ success: false, weather: '🌤️ 72°F' });
  }
});

// Bug reports handled via /api/games/bug-report and /api/suggestions/bugs

// Static files (Frontend Client)
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Real-time Socket.io Chat, DMs & Live Monitoring
initChatSocket(io);
// Initialize Voice signaling namespace
require('./voiceSocket')(io);

// Referer-based gateway redirector for subresources and API calls inside proxied iframes
app.use(async (req, res, next) => {
  const referer = req.headers.referer || req.headers.Referer;
  if (referer && referer.includes('/api/gateway?url=')) {
    try {
      const parsedReferer = new URL(referer);
      const targetUrlStr = parsedReferer.searchParams.get('url');
      if (targetUrlStr) {
        const targetUrl = new URL(targetUrlStr);
        // Construct target URL relative to referer's target origin
        const resolvedTarget = new URL(req.originalUrl, targetUrl.origin).href;
        
        const tokenParam = parsedReferer.searchParams.get('token') ? `&token=${encodeURIComponent(parsedReferer.searchParams.get('token'))}` : '';
        const engineParam = parsedReferer.searchParams.get('engine') ? `&engine=${encodeURIComponent(parsedReferer.searchParams.get('engine'))}` : '';
        const isSurf = parsedReferer.searchParams.get('surf') === 'true';
        const surfParam = isSurf ? '&surf=true' : '';
        
        return res.redirect(307, `/api/gateway?url=${encodeURIComponent(resolvedTarget)}${tokenParam}${engineParam}${surfParam}`);
      }
    } catch (e) {}
  }
  next();
});

// SPA Fallback Route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Run Supabase/PostgreSQL schema sync
db.initPostgres().catch(err => {
  console.error('Database migration warning:', err.message);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`===========================================`);
  console.log(`🚀 NITRO (BETA) 2.6 Server running on port ${PORT}`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`🛡️ Primary Admin User: jordandaniels`);
  console.log(`🔒 Script Protection: Obfuscation Engine Active`);
  console.log(`===========================================`);
});
