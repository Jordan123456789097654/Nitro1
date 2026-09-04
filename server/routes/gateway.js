// server/routes/gateway.js
// Ultra-Lightweight Nitro Game Gateway & Embed Streaming Engine v4.0
// Stripped of heavy browser cookie jars & complex DOM transforms for zero-latency game loading & minimum RAM footprint

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const zlib = require('zlib');
const dns = require('dns');
const http = require('http');
const https = require('https');
const db = require('../db');
const { isOwner: checkIsOwner } = require('../permissions');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 64 });
const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 64 });

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function isForbiddenPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) {
    return true;
  }
  const parts = host.split('.').map(Number);
  if (parts.length === 4 && !parts.some(isNaN)) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 127) return true;
  }
  return false;
}

async function isSafeHost(hostname) {
  if (isForbiddenPrivateHost(hostname)) return false;
  try {
    return new Promise((resolve) => {
      dns.lookup(hostname, (err, address) => {
        if (err || !address) resolve(true);
        else resolve(!isForbiddenPrivateHost(address));
      });
    });
  } catch (err) {
    return true;
  }
const SOUNDBOARD_ALLOWED_DOMAINS = [
  'soundbuttonsworld.com', 'myinstants.com', 'soundbuttons.com', 'soundboard.com',
  'cloudflareinsights.com'
];

const AD_TRACKER_PATTERNS = [
  'doubleclick.net', 'googlesyndication.com',
  'googletagservices.com', 'pagead2.googlesyndication.com',
  'pubads.g.doubleclick.net', 'adservice.google.com', 'amazon-adsystem.com'
];

function isKnownAdRequest(urlObj) {
  const host = urlObj.hostname.toLowerCase();
  return AD_TRACKER_PATTERNS.some(p => host.includes(p));
}

const GENERAL_WEB_BROWSING_DOMAINS = [
  'google.com', 'google.ca', 'google.co.uk', 'google.org',
  'bing.com', 'duckduckgo.com', 'search.brave.com', 'wikipedia.org',
  'yahoo.com', 'reddit.com', 'facebook.com', 'twitter.com', 'x.com',
  'instagram.com', 'tiktok.com'
];

router.all('/', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(204).end();

  let targetUrl = (req.query.url || '').trim();
  if (!targetUrl) {
    return res.setHeader('Content-Type', 'text/html; charset=utf-8').send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>Nitro Game Gateway</title>
      <style>body{background:#07090e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
      .box{text-align:center;color:#94a3b8;}</style></head>
      <body><div class="box"><h2 style="color:#38bdf8;">🎮 Nitro Game Gateway Active</h2><p>Game proxy stream helper ready.</p></div></body>
      </html>
    `);
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  let urlObj;
  try {
    urlObj = new URL(targetUrl);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return res.status(400).send('Invalid protocol.');
    }
  } catch (e) {
    return res.status(400).send('Invalid URL format.');
  }

  const targetHostLower = urlObj.hostname.toLowerCase();
  const isSoundboardDomain = SOUNDBOARD_ALLOWED_DOMAINS.some(d => targetHostLower.endsWith(d));

  // Handle ad tracker or sub-resource search requests gracefully
  if (isKnownAdRequest(urlObj)) {
    const isCss = urlObj.pathname.endsWith('.css');
    res.setHeader('Content-Type', isCss ? 'text/css' : 'application/javascript');
    return res.status(200).send('/* nitro ad blocked */');
  }

  // Restrict general search engine browsing (unless it is a Soundboard sub-resource)
  if (!isSoundboardDomain && GENERAL_WEB_BROWSING_DOMAINS.some(d => targetHostLower.endsWith(d))) {
    const acceptHeader = req.headers.accept || '';
    const isSubResource = !acceptHeader.includes('text/html') || urlObj.pathname.endsWith('.js') || urlObj.pathname.endsWith('.css') || urlObj.pathname.endsWith('.png') || urlObj.pathname.endsWith('.jpg') || urlObj.pathname.endsWith('.json');
    
    if (isSubResource) {
      const isCss = urlObj.pathname.endsWith('.css');
      res.setHeader('Content-Type', isCss ? 'text/css' : 'application/javascript');
      return res.status(200).send('/* nitro gateway stub */');
    }

    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>🕹️ Proxy Dedicated to Games</title>
      <style>
        body { background: #07090e; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.3); padding: 40px; border-radius: 20px; text-align: center; max-width: 500px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        h2 { color: #38bdf8; margin-top: 0; font-size: 1.6rem; }
        p { color: #cbd5e1; font-size: 0.95rem; line-height: 1.6; }
        .icon { font-size: 3rem; margin-bottom: 12px; display: block; }
      </style>
      </head>
      <body>
        <div class="card">
          <span class="icon">🕹️</span>
          <h2>Proxy Dedicated to Games</h2>
          <p>General web browsing proxying has been disabled to preserve zero-lag game performance across the platform.</p>
          <p style="font-size:0.85rem; color:#94a3b8; margin-top:16px;">The proxy engine is now dedicated strictly to loading platform games and game subresources.</p>
        </div>
      </body>
      </html>
    `);
  }

  if (!(await isSafeHost(urlObj.hostname))) {
    return res.status(403).send('Private network access restricted.');
  }

  const fetchHeaders = {
    'User-Agent': CHROME_UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': urlObj.origin + '/'
  };

  if (req.headers.range) fetchHeaders['Range'] = req.headers.range;

  const fetchOptions = {
    method: ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) ? req.method : 'GET',
    headers: fetchHeaders,
    redirect: 'follow',
    timeout: 15000,
    compress: true,
    agent: function(_parsedURL) {
      return _parsedURL && _parsedURL.protocol === 'http:' ? httpAgent : httpsAgent;
    }
  };

  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      fetchOptions.body = req.body;
    }
  }

  try {
    const response = await fetch(urlObj.href, fetchOptions);
    const finalUrl = response.url || urlObj.href;
    const contentType = response.headers.get('content-type') || '';

    const restrictedHeaders = [
      'x-frame-options', 'content-security-policy', 'cross-origin-opener-policy',
      'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive',
      'set-cookie', 'access-control-allow-origin', 'access-control-allow-credentials'
    ];

    res.status(response.status >= 400 && response.status < 500 ? 200 : response.status);

    response.headers.forEach((v, k) => {
      if (!restrictedHeaders.includes(k.toLowerCase())) {
        try { res.setHeader(k, v); } catch(e){}
      }
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    const isHtml = contentType.includes('text/html');

    // STREAM NON-HTML ASSETS DIRECTLY WITH ZERO MEMORY ALLOCATION
    if (!isHtml) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      if (response.body && typeof response.body.pipe === 'function') {
        req.on('close', () => {
          try { response.body?.destroy(); } catch(e){}
        });
        return response.body.pipe(res);
      } else {
        const arrayBuffer = await response.arrayBuffer();
        return res.send(Buffer.from(arrayBuffer));
      }
    }

    // FOR GAME HTML: DECOMPRESS & INJECT LIGHTWEIGHT <BASE> TAG & FRAMEBUSTER SHIELD
    let buffer;
    if (typeof response.buffer === 'function') {
      buffer = await response.buffer();
    } else {
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    const encoding = response.headers.get('content-encoding');
    if (encoding) {
      if (encoding.includes('gzip')) { try { buffer = zlib.gunzipSync(buffer); } catch(e){} }
      else if (encoding.includes('deflate')) { try { buffer = zlib.inflateSync(buffer); } catch(e){} }
      else if (encoding.includes('br')) { try { buffer = zlib.brotliDecompressSync(buffer); } catch(e){} }
    }

    let html = buffer.toString('utf-8');
    buffer = null; // Free buffer immediately

    // Strip top frame busters
    html = html.replace(/if\s*\(\s*top\s*!==?\s*self\s*\)[^}]*\}/gi, '');
    html = html.replace(/top\.location\s*=\s*self\.location/gi, '');

    const gameShieldScript = `
      <base href="${finalUrl}">
      <script>
        try {
          Object.defineProperty(window, 'top', { get: function() { return window; }, configurable: true });
          Object.defineProperty(window, 'parent', { get: function() { return window; }, configurable: true });
        } catch(e) {}
      </script>
    `;

    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${gameShieldScript}`);
    } else {
      html = gameShieldScript + html;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('[Game Gateway Error] target:', targetUrl, err.message);
    return res.status(502).send('Game proxy stream error.');
  }
});

router.clearCookieJar = function() {};

module.exports = router;
