// server/routes/gateway.js
// Brand New Proxy & Stealth Gateway Engine ("Nitro Shield Proxy v3.0")
// Completely rebuilt for high-speed streaming, dynamic link rewriting, header virtualization & ad blocking

// Disable TLS validation globally for proxy requests to avoid certificate errors (e.g. system clock drift)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const zlib = require('zlib');
const dns = require('dns');
const db = require('../db');
const { sendDiscordLog } = require('../discordLogger');

const { JWT_SECRET } = require('../secrets');
const { isOwner: checkIsOwner } = require('../permissions');

// -------------------------------------------------------------
// 1. STEALTH ENGINE PROFILE & VIRTUAL COOKIE STORE
// -------------------------------------------------------------
// Only one profile now: a plain Chrome/Windows UA. The previous multi-profile
// selector (including a "shield" Safari profile and an "Academic Disguise"
// profile that spoofed a Google Classroom referer) has been removed.
const CHROME_ENGINE = {
  name: 'Chrome',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  secChUa: '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  platform: '"Windows"',
  mobile: '?0'
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
function proxifyTargetUrl(rawUrl, baseUrl, gatewayPrefix, authSuffix = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const t = rawUrl.trim();
  if (t.startsWith('#') || t.startsWith('javascript:') || t.startsWith('data:') || t.startsWith('blob:') || t.startsWith('mailto:')) {
    return rawUrl;
  }
  if (t.includes('/api/gateway')) return rawUrl;
  try {
    const abs = new URL(t, baseUrl).href;
    return `${gatewayPrefix}${encodeURIComponent(abs)}${authSuffix}`;
  } catch (e) {
    return rawUrl;
  }
}

function rewriteCssUrls(cssText, baseUrl, gatewayPrefix, authSuffix = '') {
  if (!cssText || typeof cssText !== 'string') return cssText;
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, q, u) => {
    return `url("${proxifyTargetUrl(u, baseUrl, gatewayPrefix, authSuffix)}")`;
  });
}

function transformHtmlResponse(htmlText, baseUrl, gatewayPrefix, authSuffix = '') {
  if (!htmlText || typeof htmlText !== 'string') return htmlText;

  let html = htmlText;

  // Remove framing restrictions & CSP rules
  html = html.replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');
  html = html.replace(/<meta[^>]*frame-ancestors[^>]*>/gi, '');
  html = html.replace(/<meta[^>]*X-Frame-Options[^>]*>/gi, '');

  // Strip top window lock scripts
  html = html.replace(/if\s*\(\s*top\s*!==?\s*self\s*\)[^}]*\}/gi, '');
  html = html.replace(/top\.location\s*=\s*self\.location/gi, '');

  // Rewrite href, src, action attributes (handles both quoted and unquoted attributes)
  html = html.replace(/\b(href|src|action)\s*=\s*(?:(['"])(.*?)\2|([^\s>]+))/gi, (match, attr, q, quotedVal, unquotedVal) => {
    const val = quotedVal !== undefined ? quotedVal : unquotedVal;
    const quote = q !== undefined ? q : '';
    return `${attr}=${quote}${proxifyTargetUrl(val, baseUrl, gatewayPrefix, authSuffix)}${quote}`;
  });

  // Inject Shield Interceptor Script into <head>
  // BUGFIX: <base> previously pointed at the *wrapped* gateway URL (e.g.
  // ".../api/gateway?url=<encoded target>"). Any relative URL the page
  // resolves natively — anchors set via JS as `el.href = 'relative/path'`,
  // client-side routers, etc. — resolved against that base ignore its query
  // string entirely and land back on our own domain's bare path, producing a
  // broken link instead of the real target page. Pointing <base> at the real
  // target URL means native relative resolution works correctly, and the
  // click/fetch/XHR interceptors below still catch and re-wrap the result
  // into a proxied URL before anything actually navigates or requests it.
  const shieldScript = `
    <base href="${baseUrl}">
    <script>
      (function() {
        window.__NITRO_SHIELD_BASE__ = "${baseUrl}";
        window.__NITRO_SHIELD_PREFIX__ = "${gatewayPrefix}";
        // BUGFIX: previously proxify() only prepended the gateway prefix and the
        // encoded target URL, with no auth token or engine choice attached. That
        // meant every link click, fetch(), or XHR made *after* the first page
        // load silently fell back to an unauthenticated Guest request on the
        // default engine — breaking anything gated behind login, and losing
        // whatever proxy engine the user had picked. Now every rewritten
        // navigation carries the same auth/engine suffix as the page that
        // spawned it.
        window.__NITRO_SHIELD_SUFFIX__ = "${authSuffix.replace(/"/g, '\\"')}";

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

        function deproxify(u) {
          if (!u || typeof u !== 'string') return u;
          if (u.includes('/api/gateway?url=')) {
            try {
              var search = u.split('?url=')[1] || '';
              var encoded = search.split('&')[0] || '';
              return decodeURIComponent(encoded);
            } catch(e) {}
          }
          if (u.includes('/gateway?url=')) {
            try {
              var search = u.split('?url=')[1] || '';
              var encoded = search.split('&')[0] || '';
              return decodeURIComponent(encoded);
            } catch(e) {}
          }
          return u;
        }

        function proxify(u) {
          if (!u || typeof u !== 'string' || u.startsWith('data:') || u.startsWith('blob:') || u.includes('/api/gateway')) return u;
          try {
            return window.__NITRO_SHIELD_PREFIX__ + encodeURIComponent(new URL(u, window.__NITRO_SHIELD_BASE__).href) + window.__NITRO_SHIELD_SUFFIX__;
          } catch(e) { return u; }
        }

        // Intercept HTMLScriptElement.prototype.src for dynamic Webpack chunk imports
        try {
          Object.defineProperty(HTMLScriptElement.prototype, 'src', {
            get: function() { return deproxify(this.getAttribute('src') || ''); },
            set: function(val) { this.setAttribute('src', proxify(val)); },
            configurable: true,
            enumerable: true
          });
        } catch(e) {}

        // Intercept HTMLLinkElement.prototype.href for CSS & dynamic font loads
        try {
          Object.defineProperty(HTMLLinkElement.prototype, 'href', {
            get: function() { return deproxify(this.getAttribute('href') || ''); },
            set: function(val) { this.setAttribute('href', proxify(val)); },
            configurable: true,
            enumerable: true
          });
        } catch(e) {}

        // Intercept global setAttribute on Element prototype
        try {
          var _origSetAttr = Element.prototype.setAttribute;
          Element.prototype.setAttribute = function(name, val) {
            var lower = (this.tagName || '').toLowerCase();
            if (['script', 'img', 'link', 'iframe', 'audio', 'video', 'a', 'form'].indexOf(lower) !== -1) {
              if ((name === 'src' || name === 'href' || name === 'action') && val) {
                val = proxify(val);
              }
            }
            return _origSetAttr.call(this, name, val);
          };
        } catch(e) {}

        // Intercept document.createElement for dynamic scripts/styles
        try {
          var _createElement = document.createElement;
          document.createElement = function(tagName, options) {
            var el = _createElement.call(document, tagName, options);
            var lower = (tagName || '').toLowerCase();
            if (['script', 'img', 'link', 'iframe', 'audio', 'video'].indexOf(lower) !== -1) {
              var _origElSetAttr = el.setAttribute;
              el.setAttribute = function(name, val) {
                if ((name === 'src' || name === 'href') && val) {
                  val = proxify(val);
                }
                return _origElSetAttr.call(this, name, val);
              };

              if (lower === 'script' || lower === 'img' || lower === 'iframe' || lower === 'audio' || lower === 'video') {
                var _src = '';
                Object.defineProperty(el, 'src', {
                  get: function() { return deproxify(_src); },
                  set: function(val) {
                    _src = val;
                    var proxied = proxify(val);
                    try {
                      _origSetAttr.call(el, 'src', proxied);
                    } catch(e) {
                      try { el.src = proxied; } catch(err) {}
                    }
                  },
                  configurable: true,
                  enumerable: true
                });
              }
              if (lower === 'link') {
                var _href = '';
                Object.defineProperty(el, 'href', {
                  get: function() { return deproxify(_href); },
                  set: function(val) {
                    _href = val;
                    var proxied = proxify(val);
                    try {
                      _origSetAttr.call(el, 'href', proxied);
                    } catch(e) {
                      try { el.href = proxied; } catch(err) {}
                    }
                  },
                  configurable: true,
                  enumerable: true
                });
              }
            }
            return el;
          };
        } catch(e) {}

        // Intercept Fetch API
        var _fetch = window.fetch;
        if (_fetch) {
          window.fetch = function(url, opts) {
            if (url) {
              if (typeof url === 'string') {
                url = proxify(url);
              } else if (url instanceof URL) {
                url = proxify(url.href);
              } else if (typeof url === 'object' && url.url) {
                try {
                  var newRequest = new Request(proxify(url.url), url);
                  url = newRequest;
                } catch(e) {}
              }
            }
            return _fetch(url, opts);
          };
        }

        // Intercept XMLHttpRequest
        var _xhrOpen = XMLHttpRequest.prototype.open;
        if (_xhrOpen) {
          XMLHttpRequest.prototype.open = function(m, u, a, user, p) {
            if (u) {
              if (typeof u === 'string') u = proxify(u);
              else if (u instanceof URL) u = proxify(u.href);
            }
            return _xhrOpen.call(this, m, u, a, user, p);
          };
        }

        // Intercept Link Clicks & Form Submissions
        // BUGFIX: this used to run unguarded. If e.target.closest() or reading
        // a.href threw for any reason (detached nodes, non-Element targets,
        // exotic href values some sites use), the exception propagated out of
        // a capturing-phase listener and could leave the page's own click
        // handling in a broken state — which is what showed up as "the proxy
        // crashes" when clicking certain links. Every branch is now wrapped
        // so a single bad link degrades to "nothing happens" instead of
        // breaking navigation for the rest of the session. It also now reads
        // the raw href ATTRIBUTE (not the browser-resolved property) to
        // correctly detect '#', 'javascript:', 'mailto:', and 'tel:' links,
        // and hands off target="_blank" / ctrl+click / middle-click to the
        // parent Nitro Shield browser to open as a real new tab instead of
        // hijacking the current page's navigation.
        document.addEventListener('click', function(e) {
          try {
            var a = e.target && e.target.closest ? e.target.closest('a') : null;
            if (!a) return;
            var rawHref = a.getAttribute('href');
            if (!rawHref) return;
            var trimmed = rawHref.trim();
            if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('javascript:') ||
                trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('data:')) {
              return;
            }
            var targetAttr = (a.getAttribute('target') || '').toLowerCase();
            var wantsTopNavigation = targetAttr === '_top' || targetAttr === '_parent';
            if (wantsTopNavigation) {
              e.preventDefault();
              window.location.href = a.href;
              return;
            }

            if (!a.href || a.href.includes('/api/gateway')) return;

            var wantsNewTab = a.target === '_blank' || e.ctrlKey || e.metaKey || e.button === 1;
            if (wantsNewTab) {
              e.preventDefault();
              try {
                window.parent.postMessage({ __nitroShieldOpenTab: true, url: new URL(rawHref, window.__NITRO_SHIELD_BASE__).href }, '*');
              } catch (err) {
                // Fallback: still navigate current frame rather than doing nothing
                window.location.href = proxify(a.href);
              }
              return;
            }

            e.preventDefault();
            window.location.href = proxify(a.href);
          } catch (err) {
            // Swallow — a malformed link should never take down the rest of the page.
          }
        }, true);

        document.addEventListener('submit', function(e) {
          try {
            var form = e.target;
            if (form && form.action && !form.action.includes('/api/gateway')) {
              form.action = proxify(form.action);
            }
          } catch (err) {}
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

  const isOwner = checkIsOwner(user);

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

  // Engine Profile (single Chrome profile now — engine query param, if any,
  // from old bookmarked/cached links is simply ignored rather than erroring)
  const engine = CHROME_ENGINE;
  const engineKey = 'chrome';
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

  // BUGFIX: audio/video elements (music player, YouTube embeds, any <video>/<audio>
  // on a proxied page) request media in chunks via the Range header and expect a
  // 206 Partial Content response. Without forwarding it upstream, the target
  // always sends the full file back with 200 — which most players refuse to
  // treat as streamable, so playback silently fails or never starts.
  if (req.headers.range) {
    fetchHeaders['Range'] = req.headers.range;
  }

  if (cookies) fetchHeaders['Cookie'] = cookies;
  if (engine.secChUa) fetchHeaders['Sec-Ch-Ua'] = engine.secChUa;
  if (engine.platform) fetchHeaders['Sec-Ch-Ua-Platform'] = engine.platform;
  fetchHeaders['Referer'] = engine.referer || urlObj.origin;

  const https = require('https');
  const agent = new https.Agent({
    rejectUnauthorized: false
  });

  const fetchOptions = {
    method: ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) ? req.method : 'GET',
    headers: fetchHeaders,
    redirect: 'follow',
    timeout: 15000,
    compress: true,
    agent
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

    let setCookies = null;
    if (typeof response.headers.raw === 'function') {
      setCookies = response.headers.raw()['set-cookie'];
    } else if (typeof response.headers.getSetCookie === 'function') {
      setCookies = response.headers.getSetCookie();
    } else {
      const singleCookie = response.headers.get('set-cookie');
      if (singleCookie) setCookies = [singleCookie];
    }
    if (setCookies) saveCookiesFromResponse(sessionKey, urlObj.hostname, setCookies);

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

    if (response.status >= 400 && response.status < 500) {
      res.status(200);
    } else {
      res.status(response.status);
    }

    // Forward safe headers & strip target CORS origin headers
    const restricted = ['x-frame-options', 'content-security-policy', 'cross-origin-opener-policy', 'content-encoding', 'set-cookie', 'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-headers', 'access-control-allow-methods'];
    const gatewayPrefix = `${req.protocol}://${req.get('host')}/api/gateway?url=`;

    // BUGFIX: carry the auth token + chosen engine forward onto every link
    // this page will generate, so clicking further into a site doesn't drop
    // back to an unauthenticated Guest request on the default engine.
    const rawToken = req.query.token || '';
    const authSuffix = `${rawToken ? `&token=${encodeURIComponent(rawToken)}` : ''}&engine=${encodeURIComponent(engineKey)}`;

    response.headers.forEach((v, k) => {
      const l = k.toLowerCase();
      if (!restricted.includes(l)) {
        if (l === 'location') {
          res.setHeader('Location', proxifyTargetUrl(v, finalUrl, gatewayPrefix, authSuffix));
        } else {
          try { res.setHeader(k, v); } catch(e){}
        }
      }
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    let finalContentType = contentType;
    const lowerPath = urlObj.pathname.toLowerCase();
    if (lowerPath.endsWith('.css') || urlObj.href.includes('.css?') || urlObj.href.includes('/skin.css') || urlObj.href.includes('/skin/')) {
      finalContentType = 'text/css';
    } else if (lowerPath.endsWith('.js') || lowerPath.endsWith('.mjs') || urlObj.href.includes('.js?') || urlObj.href.includes('/b.js')) {
      finalContentType = 'application/javascript';
    }

    if (finalContentType.includes('text/html')) {
      const htmlText = buffer.toString('utf-8');
      const transformed = transformHtmlResponse(htmlText, finalUrl, gatewayPrefix, authSuffix);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(transformed);
    } else if (finalContentType.includes('text/css')) {
      const cssText = buffer.toString('utf-8');
      const transformed = rewriteCssUrls(cssText, finalUrl, gatewayPrefix, authSuffix);
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      return res.send(transformed);
    } else {
      res.setHeader('Content-Type', finalContentType);
      return res.send(buffer);
    }
  } catch (err) {
    console.error('[Gateway Proxy Error] target:', (urlObj && urlObj.href) || targetUrl, err);
    return res.status(502).send(`
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>Gateway Proxy Error</title>
      <style>body{background:#090a0f;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
      .card{background:rgba(239,68,68,0.15);border:1px solid #ef4444;padding:36px;border-radius:14px;max-width:600px;text-align:center;word-break:break-all;}</style>
      </head><body><div class="card">
        <h3 style="color:#ef4444;">🌐 Connection Failure</h3>
        <p>Unable to connect to target site: <strong>${err.message}</strong></p>
        <pre style="text-align:left; background:#000; padding:12px; border-radius:6px; font-size:0.75rem; color:#f87171; overflow-x:auto;">${err.stack || err}</pre>
      </div></body></html>
    `);
  }
});

module.exports = router;
