// server/routes/gateway.js
// Brand New Proxy & Stealth Gateway Engine ("Nitro Shield Proxy v3.0")
// Completely rebuilt for high-speed streaming, dynamic link rewriting, header virtualization & ad blocking

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const zlib = require('zlib');
const dns = require('dns');
const db = require('../db');
const { sendDiscordLog } = require('../discordLogger');

const JWT_SECRET = process.env.SESSION_SECRET || 'nitro_jwt_secure_key_2026';

// -------------------------------------------------------------
// 1. STEALTH ENGINE PROFILES & VIRTUAL COOKIE STORE
// -------------------------------------------------------------
const PROXY_ENGINES = {
  turbo: {
    name: '⚡ Stealth Turbo Engine',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
    platform: '"Windows"',
    mobile: '?0'
  },
  shield: {
    name: '🛡️ Shield Ultra Engine',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    secChUa: '',
    platform: '"macOS"',
    mobile: '?0'
  },
  academic: {
    name: '🎓 Academic Disguise Engine',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Google-Classroom/2.4',
    secChUa: '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
    platform: '"Windows"',
    mobile: '?0',
    referer: 'https://classroom.google.com/'
  },
  mirror: {
    name: '🌀 Dynamic Mirror Engine',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="128", "Not;A=Brand";v="24"',
    platform: '"Linux"',
    mobile: '?0'
  }
};

// Global Cookie Jar per User Session
// { sessionKey -> { cookies: Map, lastAccessed: timestamp } }
const COOKIE_JAR = new Map();
const COOKIE_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes idle

// Evict stale sessions every 10 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [sessionKey, session] of COOKIE_JAR.entries()) {
    if (now - session.lastAccessed > COOKIE_SESSION_TTL_MS) {
      COOKIE_JAR.delete(sessionKey);
    }
  }
}, 10 * 60 * 1000).unref();

function getCookiesForRequest(sessionKey, targetDomain) {
  const session = COOKIE_JAR.get(sessionKey);
  if (!session) return '';
  session.lastAccessed = Date.now();
  const validCookies = [];
  const now = Date.now();
  for (const [key, c] of session.cookies.entries()) {
    if (c.expires && c.expires < now) {
      session.cookies.delete(key);
      continue;
    }
    if (!c.domain || targetDomain.includes(c.domain.replace(/^\./, ''))) {
      validCookies.push(`${c.name}=${c.value}`);
    }
  }
  return validCookies.join('; ');
}

function saveCookiesFromResponse(sessionKey, targetDomain, setCookieHeader) {
  if (!setCookieHeader) return;
  if (!COOKIE_JAR.has(sessionKey)) {
    COOKIE_JAR.set(sessionKey, { cookies: new Map(), lastAccessed: Date.now() });
  }
  const session = COOKIE_JAR.get(sessionKey);
  session.lastAccessed = Date.now();
  const jar = session.cookies;
  const lines = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];

  lines.forEach(line => {
    const parts = line.split(';').map(p => p.trim());
    if (parts.length === 0) return;
    const [kv] = parts;
    const eqIdx = kv.indexOf('=');
    if (eqIdx === -1) return;
    const name = kv.substring(0, eqIdx).trim();
    const value = kv.substring(eqIdx + 1).trim();

    let domain = targetDomain;
    let expires = null;

    for (let i = 1; i < parts.length; i++) {
      const p = parts[i].toLowerCase();
      if (p.startsWith('domain=')) domain = parts[i].substring(7).trim();
      if (p.startsWith('expires=')) {
        const d = new Date(parts[i].substring(8).trim());
        if (!isNaN(d.getTime())) expires = d.getTime();
      }
      if (p.startsWith('max-age=')) {
        const secs = parseInt(parts[i].substring(8).trim(), 10);
        if (!isNaN(secs)) expires = Date.now() + (secs * 1000);
      }
    }
    jar.set(name, { name, value, domain, expires });
  });
}

// -------------------------------------------------------------
// 2. SSRF SAFETY & AD BLOCKER
// -------------------------------------------------------------
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
        if (err) {
          resolve(true);
        } else if (address) {
          resolve(!isForbiddenPrivateHost(address));
        } else {
          resolve(true);
        }
      });
    });
  } catch (err) {
    return true;
  }
}

const AD_TRACKER_PATTERNS = [
  'doubleclick.net', 'googlesyndication.com', 'google-analytics.com',
  'googletagservices.com', 'pagead2.googlesyndication.com',
  'pubads.g.doubleclick.net', 'adservice.google.com', 'adsystem.com',
  'amazon-adsystem.com', 'criteo.com', 'adnxs.com', 'taboola.com'
];

function isKnownAdRequest(urlObj) {
  const host = urlObj.hostname.toLowerCase();
  if (AD_TRACKER_PATTERNS.some(p => host.includes(p))) return true;
  if (/\/(ads|adserver|popunder|tracker|pixel)\.(js|css|php)/i.test(urlObj.pathname)) return true;
  return false;
}

// -------------------------------------------------------------
// 3. DYNAMIC URL REWRITER & CLIENT INTERCEPTOR SCRIPT
// -------------------------------------------------------------
function proxifyTargetUrl(rawUrl, baseUrl, gatewayPrefix) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const t = rawUrl.trim();
  if (t.startsWith('#') || t.startsWith('javascript:') || t.startsWith('data:') || t.startsWith('blob:') || t.startsWith('mailto:')) {
    return rawUrl;
  }
  if (t.includes('/api/gateway')) return rawUrl;
  try {
    const abs = new URL(t, baseUrl).href;
    return `${gatewayPrefix}${encodeURIComponent(abs)}`;
  } catch (e) {
    return rawUrl;
  }
}

function rewriteCssUrls(cssText, baseUrl, gatewayPrefix) {
  if (!cssText || typeof cssText !== 'string') return cssText;
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, q, u) => {
    return `url("${proxifyTargetUrl(u, baseUrl, gatewayPrefix)}")`;
  });
}

function transformHtmlResponse(htmlText, baseUrl, gatewayPrefix) {
  if (!htmlText || typeof htmlText !== 'string') return htmlText;

  let html = htmlText;

  // Remove framing restrictions & CSP rules
  html = html.replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');
  html = html.replace(/<meta[^>]*frame-ancestors[^>]*>/gi, '');
  html = html.replace(/<meta[^>]*X-Frame-Options[^>]*>/gi, '');

  // Strip top window lock scripts
  html = html.replace(/if\s*\(\s*top\s*!==?\s*self\s*\)[^}]*\}/gi, '');
  html = html.replace(/top\.location\s*=\s*self\.location/gi, '');

  // Rewrite href, src, action attributes
  html = html.replace(/\b(href|src|action)\s*=\s*(['"])([^'"]+)\2/gi, (match, attr, q, url) => {
    return `${attr}=${q}${proxifyTargetUrl(url, baseUrl, gatewayPrefix)}${q}`;
  });

  // Inject Shield Interceptor Script into <head>
  const shieldScript = `
    <base href="${gatewayPrefix}${encodeURIComponent(baseUrl)}">
    <script>
      (function() {
        window.__NITRO_SHIELD_BASE__ = "${baseUrl}";
        window.__NITRO_SHIELD_PREFIX__ = "${gatewayPrefix}";

        // Frame Buster Shield: Lock window.top & window.parent
        try {
          Object.defineProperty(window, 'top', { get: function() { return window; }, configurable: true });
          Object.defineProperty(window, 'parent', { get: function() { return window; }, configurable: true });
        } catch(e) {}

        // Safeguard History API on window.history & History.prototype
        try {
          var _noopHistory = function() {};
          if (window.History && window.History.prototype) {
            window.History.prototype.replaceState = function(s, t, u) {
              try { return _noopHistory.call(this); } catch(e){}
            };
            window.History.prototype.pushState = function(s, t, u) {
              try { return _noopHistory.call(this); } catch(e){}
            };
          }
          if (window.history) {
            window.history.replaceState = function(s, t, u) {
              try { return _noopHistory.call(this); } catch(e){}
            };
            window.history.pushState = function(s, t, u) {
              try { return _noopHistory.call(this); } catch(e){}
            };
          }
        } catch(e) {}

        function proxify(u) {
          if (!u || typeof u !== 'string' || u.startsWith('data:') || u.startsWith('blob:') || u.includes('/api/gateway')) return u;
          try {
            return window.__NITRO_SHIELD_PREFIX__ + encodeURIComponent(new URL(u, window.__NITRO_SHIELD_BASE__).href);
          } catch(e) { return u; }
        }

        // Intercept HTMLScriptElement.prototype.src for dynamic Webpack chunk imports
        try {
          var scriptSrcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
          if (scriptSrcDesc && scriptSrcDesc.set) {
            Object.defineProperty(HTMLScriptElement.prototype, 'src', {
              get: function() { return scriptSrcDesc.get.call(this); },
              set: function(val) {
                scriptSrcDesc.set.call(this, proxify(val));
              },
              configurable: true,
              enumerable: true
            });
          }
        } catch(e) {}

        // Intercept HTMLLinkElement.prototype.href for CSS & dynamic font loads
        try {
          var linkHrefDesc = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, 'href');
          if (linkHrefDesc && linkHrefDesc.set) {
            Object.defineProperty(HTMLLinkElement.prototype, 'href', {
              get: function() { return linkHrefDesc.get.call(this); },
              set: function(val) {
                linkHrefDesc.set.call(this, proxify(val));
              },
              configurable: true,
              enumerable: true
            });
          }
        } catch(e) {}

        // Intercept document.createElement for dynamic scripts/styles
        try {
          var _createElement = document.createElement;
          document.createElement = function(tagName, options) {
            var el = _createElement.call(document, tagName, options);
            var lower = (tagName || '').toLowerCase();
            if (['script', 'img', 'link', 'iframe', 'audio', 'video'].indexOf(lower) !== -1) {
              var _origSetAttr = el.setAttribute;
              el.setAttribute = function(name, val) {
                if ((name === 'src' || name === 'href') && val) {
                  val = proxify(val);
                }
                return _origSetAttr.call(this, name, val);
              };
            }
            return el;
          };
        } catch(e) {}

        // Intercept Fetch API
        var _fetch = window.fetch;
        if (_fetch) {
          window.fetch = function(url, opts) {
            if (typeof url === 'string') url = proxify(url);
            return _fetch.call(this, url, opts);
          };
        }

        // Intercept XMLHttpRequest
        var _xhrOpen = XMLHttpRequest.prototype.open;
        if (_xhrOpen) {
          XMLHttpRequest.prototype.open = function(m, u, a, user, p) {
            return _xhrOpen.call(this, m, proxify(u), a, user, p);
          };
        }

        // Intercept Link Clicks & Form Submissions
        document.addEventListener('click', function(e) {
          var a = e.target.closest('a');
          if (a && a.href && !a.href.startsWith('#') && !a.href.includes('/api/gateway')) {
            e.preventDefault();
            window.location.href = proxify(a.href);
          }
        }, true);

        document.addEventListener('submit', function(e) {
          var form = e.target;
          if (form && form.action && !form.action.includes('/api/gateway')) {
            form.action = proxify(form.action);
          }
        }, true);
      })();
    </script>
  `;

  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>${shieldScript}`);
  } else if (html.includes('<html>')) {
    html = html.replace('<html>', `<html><head>${shieldScript}</head>`);
  } else {
    html = shieldScript + html;
  }

  return html;
}

// -------------------------------------------------------------
// 4. MAIN PROXY HANDLER
// -------------------------------------------------------------
router.all('/', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(204).end();

  let rawUrl = (req.query.url || '').trim();
  let user = req.user;

  if (!user && req.query.token) {
    try {
      const decoded = jwt.verify(req.query.token, JWT_SECRET);
      user = await db.getUserById(decoded.id);
    } catch (e) {}
  }

  if (!user) {
    user = { id: null, username: 'Guest', role: 'member', is_banned: false };
  }

  // Check explicit Proxy Ban set by Admin
  if (user.is_gateway_banned) {
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>🚫 Proxy Access Banned</title>
      <style>body{background:#0a0c14;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
      .box{background:rgba(239,68,68,0.2);border:2px solid #ef4444;padding:40px;border-radius:18px;text-align:center;max-width:480px;}</style>
      </head>
      <body><div class="box"><h2>🚫 Proxy Access Suspended</h2><p>An administrator has restricted your account from accessing the proxy gateway.</p></div></body>
      </html>
    `);
  }

  const isOwner = user.role === 'owner' || (user.username && user.username.toLowerCase() === 'jordandaniels');

  // Blocked Domain Notice
  if (!isOwner && rawUrl) {
    try {
      const blocked = await db.getBlockedDomains();
      const lowerUrl = rawUrl.toLowerCase();
      const match = (blocked || []).find(b => {
        if (!b.domain) return false;
        const cleanRule = b.domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').trim();
        if (!cleanRule) return false;
        return lowerUrl.includes(cleanRule);
      });

      if (match) {
        return res.status(200).send(`
          <!DOCTYPE html>
          <html><head><meta charset="UTF-8"><title>⚠️ Domain Restricted</title>
          <style>body{background:#0c0e17;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
          .card{background:rgba(245,158,11,0.15);border:2px solid #f59e0b;padding:36px;border-radius:16px;text-align:center;max-width:480px;}</style>
          </head><body><div class="card"><h2 style="color:#fbbf24;">⚠️ Domain Restricted</h2><p>Access to <code>${match.domain}</code> is restricted by platform policy.</p></div></body></html>
        `);
      }
    } catch(e) {}
  }

  // Proxy Timeout Check (Strike 2)
  if (user.is_gateway_banned || (user.gateway_timeout_until && new Date(user.gateway_timeout_until) > new Date())) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>⛔ STRIKE 2</title>
      <style>body{background:#0c0e17;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
      .card{background:rgba(239,68,68,0.15);border:2px solid #ef4444;padding:36px;border-radius:16px;text-align:center;max-width:480px;}</style>
      </head><body><div class="card"><h2 style="color:#ef4444;">⛔ 30-Minute Proxy Timeout Active</h2><p>Proxy access is temporarily suspended due to 2 policy strikes.</p></div></body></html>
    `);
  }

  let targetUrl = rawUrl;
  if (!targetUrl) {
    return res.setHeader('Content-Type', 'text/html; charset=utf-8').send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>Nitro Shield Gateway</title>
      <style>body{background:#07090e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
      .box{text-align:center;color:#94a3b8;}</style></head>
      <body><div class="box"><h2 style="color:#38bdf8;">🌐 Nitro Shield Gateway</h2><p>Enter any web URL or query above to begin browsing securely.</p></div></body>
      </html>
    `);
  }
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
      targetUrl = 'https://' + targetUrl;
    } else {
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
    }
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

  // Ad Blocker Filtering
  if (isKnownAdRequest(urlObj)) {
    if (urlObj.pathname.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
      return res.send('/* nitro shield ad blocked */');
    }
    res.setHeader('Content-Type', 'application/javascript');
    return res.send('/* nitro shield ad blocked */');
  }

  // SSRF Check
  if (!(await isSafeHost(urlObj.hostname))) {
    return res.status(403).send('Private network access restricted.');
  }

  // Engine Profile
  const engineKey = req.query.engine || 'turbo';
  const engine = PROXY_ENGINES[engineKey] || PROXY_ENGINES.turbo;
  const sessionKey = user.username || req.ip || 'default_session';
  const cookies = getCookiesForRequest(sessionKey, urlObj.hostname);

  const fetchHeaders = {
    'User-Agent': engine.userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none'
  };

  if (cookies) fetchHeaders['Cookie'] = cookies;
  if (engine.secChUa) fetchHeaders['Sec-Ch-Ua'] = engine.secChUa;
  if (engine.platform) fetchHeaders['Sec-Ch-Ua-Platform'] = engine.platform;
  fetchHeaders['Referer'] = engine.referer || urlObj.origin;

  const fetchOptions = {
    method: ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) ? req.method : 'GET',
    headers: fetchHeaders,
    redirect: 'follow',
    timeout: 15000,
    compress: false
  };

  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      fetchOptions.body = req.body;
    } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        fetchOptions.body = JSON.stringify(req.body);
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        fetchOptions.body = new URLSearchParams(req.body).toString();
      } else {
        fetchOptions.body = JSON.stringify(req.body);
      }
    }
  }

  try {
    const response = await fetch(urlObj.href, fetchOptions);
    const finalUrl = response.url || urlObj.href;
    const contentType = response.headers.get('content-type') || 'text/html';

    const setCookies = response.headers.raw()['set-cookie'];
    if (setCookies) saveCookiesFromResponse(sessionKey, urlObj.hostname, setCookies);

    let buffer = await response.buffer();
    const encoding = response.headers.get('content-encoding');

    if (encoding) {
      if (encoding.includes('gzip')) { try { buffer = zlib.gunzipSync(buffer); } catch(e){} }
      else if (encoding.includes('deflate')) { try { buffer = zlib.inflateSync(buffer); } catch(e){} }
      else if (encoding.includes('br')) { try { buffer = zlib.brotliDecompressSync(buffer); } catch(e){} }
    }

    if (response.status >= 400 && response.status < 500) {
      res.status(200);
    } else {
      res.status(response.status);
    }

    // Forward safe headers & strip target CORS origin headers
    const restricted = ['x-frame-options', 'content-security-policy', 'cross-origin-opener-policy', 'content-encoding', 'set-cookie', 'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-headers', 'access-control-allow-methods'];
    const gatewayPrefix = `${req.protocol}://${req.get('host')}/api/gateway?url=`;

    response.headers.forEach((v, k) => {
      const l = k.toLowerCase();
      if (!restricted.includes(l)) {
        if (l === 'location') {
          res.setHeader('Location', proxifyTargetUrl(v, finalUrl, gatewayPrefix));
        } else {
          try { res.setHeader(k, v); } catch(e){}
        }
      }
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (contentType.includes('text/html')) {
      const htmlText = buffer.toString('utf-8');
      const transformed = transformHtmlResponse(htmlText, finalUrl, gatewayPrefix);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(transformed);
    } else if (contentType.includes('text/css')) {
      const cssText = buffer.toString('utf-8');
      const transformed = rewriteCssUrls(cssText, finalUrl, gatewayPrefix);
      res.setHeader('Content-Type', 'text/css');
      return res.send(transformed);
    } else {
      res.setHeader('Content-Type', contentType);
      return res.send(buffer);
    }
  } catch (err) {
    return res.status(502).send(`
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>Gateway Proxy Error</title>
      <style>body{background:#090a0f;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
      .card{background:rgba(239,68,68,0.15);border:1px solid #ef4444;padding:36px;border-radius:14px;max-width:480px;text-align:center;}</style>
      </head><body><div class="card"><h3 style="color:#ef4444;">🌐 Connection Failure</h3><p>Unable to connect to target site: ${err.message}</p></div></body></html>
    `);
  }
});

module.exports = router;
