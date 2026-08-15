const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const zlib = require('zlib');
const db = require('../db');
const { sendDiscordLog } = require('../discordLogger');

const JWT_SECRET = process.env.SESSION_SECRET || 'nitro_jwt_secure_key_2026';

// -------------------------------------------------------------
// 1. ENGINE SPOOFING PROFILES & COOKIE STORAGE
// -------------------------------------------------------------
const GATEWAY_ENGINES = {
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

// In-Memory Cookie Store per Session Key
const SESSION_COOKIE_STORE = new Map();

function getSessionCookies(sessionKey, targetDomain) {
  const store = SESSION_COOKIE_STORE.get(sessionKey);
  if (!store) return '';
  const cookies = [];
  const now = Date.now();
  for (const [key, item] of store.entries()) {
    if (item.expires && item.expires < now) {
      store.delete(key);
      continue;
    }
    if (!item.domain || targetDomain.includes(item.domain.replace(/^\./, ''))) {
      cookies.push(`${item.name}=${item.value}`);
    }
  }
  return cookies.join('; ');
}

function storeSessionCookies(sessionKey, targetDomain, setCookieHeader) {
  if (!setCookieHeader) return;
  if (!SESSION_COOKIE_STORE.has(sessionKey)) {
    SESSION_COOKIE_STORE.set(sessionKey, new Map());
  }
  const store = SESSION_COOKIE_STORE.get(sessionKey);
  const cookieLines = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];

  for (const line of cookieLines) {
    const parts = line.split(';').map(p => p.trim());
    if (parts.length === 0) continue;
    const [kv] = parts;
    const eqIdx = kv.indexOf('=');
    if (eqIdx === -1) continue;
    const name = kv.substring(0, eqIdx).trim();
    const value = kv.substring(eqIdx + 1).trim();

    let domain = targetDomain;
    let expires = null;

    for (let i = 1; i < parts.length; i++) {
      const pLower = parts[i].toLowerCase();
      if (pLower.startsWith('domain=')) {
        domain = parts[i].substring(7).trim();
      } else if (pLower.startsWith('expires=')) {
        const expDate = new Date(parts[i].substring(8).trim());
        if (!isNaN(expDate.getTime())) expires = expDate.getTime();
      } else if (pLower.startsWith('max-age=')) {
        const seconds = parseInt(parts[i].substring(8).trim(), 10);
        if (!isNaN(seconds)) expires = Date.now() + (seconds * 1000);
      }
    }

    store.set(name, { name, value, domain, expires });
  }
}

// -------------------------------------------------------------
// 2. SSRF PROTECTION
// -------------------------------------------------------------
function isInternalOrPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) {
    return true;
  }
  const ipParts = host.split('.').map(Number);
  if (ipParts.length === 4 && !ipParts.some(isNaN)) {
    if (ipParts[0] === 10) return true;
    if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return true;
    if (ipParts[0] === 192 && ipParts[1] === 168) return true;
    if (ipParts[0] === 169 && ipParts[1] === 254) return true;
    if (ipParts[0] === 127) return true;
  }
  return false;
}

// -------------------------------------------------------------
// 3. URL REWRITING & CLIENT RELAY INJECTION
// -------------------------------------------------------------
function resolveAndGatewayUrl(rawUrl, baseUrl, gatewayPrefix) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const trimmed = rawUrl.trim();
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:')
  ) {
    return rawUrl;
  }
  if (trimmed.includes('/api/gateway')) return rawUrl;
  try {
    const resolved = new URL(trimmed, baseUrl).href;
    return `${gatewayPrefix}${encodeURIComponent(resolved)}`;
  } catch (e) {
    return rawUrl;
  }
}

function rewriteCssUrls(cssContent, baseUrl, gatewayPrefix) {
  if (!cssContent || typeof cssContent !== 'string') return cssContent;
  return cssContent.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, urlVal) => {
    const proxied = resolveAndGatewayUrl(urlVal, baseUrl, gatewayPrefix);
    return `url("${proxied}")`;
  });
}

function rewriteHtml(htmlContent, baseUrl, gatewayPrefix) {
  if (!htmlContent || typeof htmlContent !== 'string') return htmlContent;

  let rewritten = htmlContent;

  // Comprehensive Meta CSP & Frame-Ancestors Stripping
  rewritten = rewritten.replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');
  rewritten = rewritten.replace(/<meta[^>]*frame-ancestors[^>]*>/gi, '');
  rewritten = rewritten.replace(/<meta[^>]*X-Frame-Options[^>]*>/gi, '');
  rewritten = rewritten.replace(/<meta[^>]*http-equiv=["']?(Content-Security-Policy|X-Frame-Options)["']?[^>]*>/gi, '');

  // Strip inline frame buster scripts
  rewritten = rewritten.replace(/if\s*\(\s*(self|window)\.top\s*!==?\s*(self|window)\.self\s*\)\s*\{[^}]*\}/gi, '');
  rewritten = rewritten.replace(/top\.location\.href\s*=\s*self\.location\.href/gi, '');
  rewritten = rewritten.replace(/top\.location\s*=\s*self\.location/gi, '');

  // Rewrite href, src, action
  rewritten = rewritten.replace(/\b(href|src|action)\s*=\s*(['"])([^'"]+)\2/gi, (match, attr, quote, urlVal) => {
    const proxied = resolveAndGatewayUrl(urlVal, baseUrl, gatewayPrefix);
    return `${attr}=${quote}${proxied}${quote}`;
  });

  // Rewrite inline CSS style attributes
  rewritten = rewritten.replace(/\bstyle\s*=\s*(['"])([^'"]+)\1/gi, (match, quote, cssVal) => {
    const rewrittenCss = rewriteCssUrls(cssVal, baseUrl, gatewayPrefix);
    return `style=${quote}${rewrittenCss}${quote}`;
  });

  // Inject Base URL, Frame-Buster Shield & Client Relay Interceptor
  const clientRelayScript = `
    <base href="${baseUrl}">
    <script>
      (function() {
        window.__NITRO_GATEWAY_BASE__ = "${baseUrl}";
        window.__NITRO_GATEWAY_PREFIX__ = "${gatewayPrefix}";

        // Dynamic Meta CSP & Frame-Ancestors Destroyer
        try {
          var destroyCspMetas = function() {
            var metas = document.querySelectorAll('meta');
            metas.forEach(function(m) {
              var equiv = m.getAttribute('http-equiv') || '';
              var content = m.getAttribute('content') || '';
              if (/content-security-policy/i.test(equiv) || /frame-ancestors/i.test(content) || /x-frame-options/i.test(equiv)) {
                m.parentNode && m.parentNode.removeChild(m);
              }
            });
          };
          destroyCspMetas();
          var observer = new MutationObserver(function() { destroyCspMetas(); });
          observer.observe(document.documentElement || document, { childList: true, subtree: true });
        } catch(e) {}

        // Frame Buster Shield: Lock window.top & window.parent to current window
        try {
          Object.defineProperty(window, 'top', { get: function() { return window; }, configurable: true });
          Object.defineProperty(window, 'parent', { get: function() { return window; }, configurable: true });
        } catch(e) {}

        // History API Security Patch
        try {
          var _origReplace = history.replaceState;
          var _origPush = history.pushState;
          history.replaceState = function(state, unused, url) {
            try {
              return _origReplace.call(history, state, unused, window.location.href);
            } catch (e) {}
          };
          history.pushState = function(state, unused, url) {
            try {
              return _origPush.call(history, state, unused, window.location.href);
            } catch (e) {}
          };
        } catch(e) {}

        // Disable Service Worker registration inside gateway iframe
        if (navigator.serviceWorker) {
          navigator.serviceWorker.register = function() {
            return Promise.reject(new Error('ServiceWorker disabled in gateway.'));
          };
        }

        // Helper function to proxify URLs
        function proxifyUrl(raw) {
          if (!raw || typeof raw !== 'string') return raw;
          if (raw.startsWith('data:') || raw.startsWith('blob:') || raw.includes('/api/gateway')) return raw;
          try {
            var absolute = new URL(raw, window.__NITRO_GATEWAY_BASE__).href;
            return window.__NITRO_GATEWAY_PREFIX__ + encodeURIComponent(absolute);
          } catch(e) {
            return raw;
          }
        }

        // Override fetch to route API requests through gateway
        var origFetch = window.fetch;
        if (origFetch) {
          window.fetch = function(input, init) {
            var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
            if (url) {
              var pUrl = proxifyUrl(url);
              if (typeof input === 'string') {
                input = pUrl;
              } else if (input && input.url) {
                try {
                  input = new Request(pUrl, input);
                } catch(e) {
                  input = pUrl;
                }
              }
            }
            return origFetch.call(this, input, init);
          };
        }

        // Override XMLHttpRequest to route XHR requests through gateway
        var origXhrOpen = XMLHttpRequest.prototype.open;
        if (origXhrOpen) {
          XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
            var pUrl = proxifyUrl(url);
            return origXhrOpen.call(this, method, pUrl, async, user, password);
          };
        }

        // Override window.open
        var origOpen = window.open;
        window.open = function(url, target, features) {
          if (url) {
            url = proxifyUrl(url);
          }
          return origOpen.call(window, url, target, features);
        };

        // Intercept dynamic DOM attribute setters (element.src, element.href, setAttribute)
        var origSetAttribute = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function(name, value) {
          if (typeof name === 'string' && typeof value === 'string') {
            var lower = name.toLowerCase();
            if ((lower === 'src' || lower === 'href' || lower === 'action') && !value.startsWith('data:') && !value.startsWith('blob:') && !value.includes('/api/gateway')) {
              value = proxifyUrl(value);
            }
          }
          return origSetAttribute.call(this, name, value);
        };

        try {
          var scriptSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
          if (scriptSrcDescriptor && scriptSrcDescriptor.set) {
            Object.defineProperty(HTMLScriptElement.prototype, 'src', {
              get: scriptSrcDescriptor.get,
              set: function(val) {
                return scriptSrcDescriptor.set.call(this, proxifyUrl(val));
              },
              configurable: true
            });
          }
        } catch(e) {}

        try {
          var iframeSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
          if (iframeSrcDescriptor && iframeSrcDescriptor.set) {
            Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
              get: iframeSrcDescriptor.get,
              set: function(val) {
                return iframeSrcDescriptor.set.call(this, proxifyUrl(val));
              },
              configurable: true
            });
          }
        } catch(e) {}

        // Intercept link clicks to route subdomain & external links through gateway
        document.addEventListener('click', function(e) {
          var target = e.target;
          while (target && target.tagName !== 'A') {
            target = target.parentElement;
          }
          if (target && target.href) {
            var rawHref = target.getAttribute('href');
            if (rawHref && !rawHref.startsWith('#') && !rawHref.startsWith('javascript:') && !rawHref.includes('/api/gateway')) {
              e.preventDefault();
              var absolute = new URL(rawHref, window.__NITRO_GATEWAY_BASE__).href;
              window.location.href = window.__NITRO_GATEWAY_PREFIX__ + encodeURIComponent(absolute);
            }
          }
        }, true);

        // Intercept form submissions
        document.addEventListener('submit', function(e) {
          var form = e.target;
          if (form && form.action) {
            var rawAction = form.getAttribute('action');
            if (rawAction && !rawAction.includes('/api/gateway')) {
              var absolute = new URL(rawAction, window.__NITRO_GATEWAY_BASE__).href;
              form.action = window.__NITRO_GATEWAY_PREFIX__ + encodeURIComponent(absolute);
            }
          }
        }, true);
      })();
    </script>
  `;

  if (rewritten.includes('<head>')) {
    rewritten = rewritten.replace('<head>', `<head>${clientRelayScript}`);
  } else if (rewritten.includes('<html>')) {
    rewritten = rewritten.replace('<html>', `<html><head>${clientRelayScript}</head>`);
  } else {
    rewritten = clientRelayScript + rewritten;
  }

  return rewritten;
}

// -------------------------------------------------------------
// 4. MAIN PROXY GATEWAY ROUTER
// -------------------------------------------------------------
router.all('/', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', '*');
  res.set('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Check Feature Toggle
  try {
    const isEnabled = await db.getSetting('enable_gateway');
    if (isEnabled === 'false') {
      const user = req.user;
      if (!user || (!['owner', 'admin'].includes(user.role))) {
        return res.status(503).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Gateway Disabled</title>
            <style>
              body { background: #090a0f; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
              .card { background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 40px; border-radius: 16px; max-width: 500px; }
              h2 { color: #ef4444; margin-top: 0; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>🔒 Web Gateway Disabled</h2>
              <p>The Web Gateway feature has been temporarily disabled by the platform owner.</p>
            </div>
          </body>
          </html>
        `);
      }
    }
  } catch (e) {}

  let targetUrl = req.query.url;
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

  if (user.is_banned || user.is_gateway_banned || (user.gateway_timeout_until && new Date(user.gateway_timeout_until) > new Date())) {
    const timeoutMsg = user.gateway_timeout_until ? ` (Timeout active until ${new Date(user.gateway_timeout_until).toLocaleString()})` : '';
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Gateway Access Revoked</title>
        <style>
          body { background: #090a0f; color: #fff; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .card { background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 40px; border-radius: 16px; max-width: 500px; box-shadow: 0 0 30px rgba(239, 68, 68, 0.4); }
          h2 { color: #ef4444; margin-top: 0; font-size: 1.6rem; }
          p { color: #cbd5e1; font-size: 0.95rem; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🚫 Gateway Access Revoked</h2>
          <p>Your web gateway access has been restricted by an administrator.${timeoutMsg}</p>
        </div>
      </body>
      </html>
    `);
  }

  if (!targetUrl || targetUrl.trim() === '') {
    targetUrl = 'https://html.duckduckgo.com/html/?q=math+solver';
  }

  targetUrl = targetUrl.trim();

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
      targetUrl = 'https://' + targetUrl;
    } else {
      targetUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(targetUrl)}`;
    }
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).send('<h1>Invalid protocol (only HTTP/HTTPS supported)</h1>');
    }
  } catch (e) {
    return res.status(400).send('<h1>Invalid URL format</h1>');
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Built-in Ad & Tracker Suppressor Filter
  const isAdDomain = [
    'adsinnov.com',
    'doubleclick.net',
    'googlesyndication.com',
    'google-analytics.com',
    'googletagservices.com',
    'pagead2.googlesyndication.com',
    'pubads.g.doubleclick.net'
  ].some(domain => hostname.includes(domain));

  const isAdFile = /\/(ads|ad|gpt|pop|tracker)\.(js|css)/i.test(parsedUrl.pathname);

  if (isAdDomain || isAdFile) {
    if (parsedUrl.pathname.endsWith('.css') || req.query.url?.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
      return res.send('/* gateway ad blocked */');
    }
    res.setHeader('Content-Type', 'application/javascript');
    return res.send('/* gateway ad blocked */');
  }

  // SSRF Protection Check
  if (isInternalOrPrivateHost(hostname)) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Access Restricted</title>
        <style>
          body { background: #090a0f; color: #f8fafc; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .card { background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; padding: 40px; border-radius: 16px; max-width: 480px; }
          h2 { color: #ef4444; margin-top: 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🚫 Access Restricted</h2>
          <p>Access to internal network addresses or private IPs is restricted.</p>
        </div>
      </body>
      </html>
    `);
  }

  const isOwnerOrAdmin = ['owner', 'admin'].includes(user.role);

  // Blocked Domains Check
  if (!isOwnerOrAdmin) {
    try {
      const blockedDomains = await db.getBlockedDomains();
      const matched = (blockedDomains || []).find(b => hostname.includes(b.domain.toLowerCase()));
      if (matched) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Domain Restricted</title>
            <style>
              body { background: #090a0f; color: #f8fafc; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
              .card { background: rgba(245, 158, 11, 0.12); border: 1px solid #f59e0b; padding: 40px; border-radius: 16px; max-width: 480px; }
              h2 { color: #fbbf24; margin-top: 0; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>🚫 Domain Restricted</h2>
              <p>The domain <code>${hostname}</code> has been restricted by platform policy.</p>
            </div>
          </body>
          </html>
        `);
      }
    } catch (e) {}
  }

  // Engine Resolution & Headers
  const selectedEngineKey = req.query.engine || 'turbo';
  const engineConfig = GATEWAY_ENGINES[selectedEngineKey] || GATEWAY_ENGINES.turbo;

  const sessionKey = user.username || req.ip || 'default_session';
  const sessionCookies = getSessionCookies(sessionKey, hostname);

  const fetchHeaders = {
    'User-Agent': engineConfig.userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };

  if (sessionCookies) {
    fetchHeaders['Cookie'] = sessionCookies;
  }

  if (engineConfig.secChUa) fetchHeaders['Sec-Ch-Ua'] = engineConfig.secChUa;
  if (engineConfig.platform) fetchHeaders['Sec-Ch-Ua-Platform'] = engineConfig.platform;
  if (engineConfig.mobile) fetchHeaders['Sec-Ch-Ua-Mobile'] = engineConfig.mobile;
  if (engineConfig.referer !== undefined) {
    if (engineConfig.referer) fetchHeaders['Referer'] = engineConfig.referer;
  } else {
    fetchHeaders['Referer'] = parsedUrl.origin;
  }

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
    } else if (typeof req.body === 'object') {
      if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        fetchOptions.body = JSON.stringify(req.body);
        fetchOptions.headers['Content-Type'] = 'application/json';
      } else {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(req.body)) {
          params.append(k, v);
        }
        fetchOptions.body = params.toString();
        fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }
  }

  try {
    const response = await fetch(parsedUrl.href, fetchOptions);
    const finalUrl = response.url || parsedUrl.href;
    const contentType = response.headers.get('content-type') || 'text/html';

    // Store returned Set-Cookie headers in session cookie store
    const rawSetCookies = response.headers.raw()['set-cookie'];
    if (rawSetCookies && rawSetCookies.length > 0) {
      storeSessionCookies(sessionKey, hostname, rawSetCookies);
    }

    let buffer = await response.buffer();
    const contentEncoding = response.headers.get('content-encoding');

    if (contentEncoding) {
      if (contentEncoding.includes('gzip')) {
        try { buffer = zlib.gunzipSync(buffer); } catch (e) {}
      } else if (contentEncoding.includes('deflate')) {
        try { buffer = zlib.inflateSync(buffer); } catch (e) {}
      } else if (contentEncoding.includes('br')) {
        try { buffer = zlib.brotliDecompressSync(buffer); } catch (e) {}
      }
    }

    res.status(response.status);

    // Forward safe response headers, stripping restrictive framing & CSP rules
    const restrictedHeaders = [
      'x-frame-options',
      'content-security-policy',
      'content-security-policy-report-only',
      'cross-origin-opener-policy',
      'cross-origin-embedder-policy',
      'cross-origin-resource-policy',
      'strict-transport-security',
      'transfer-encoding',
      'content-encoding',
      'set-cookie'
    ];

    const forwardedProto = req.headers['x-forwarded-proto'];
    const reqProtocol = (forwardedProto && forwardedProto.split(',')[0].trim()) || req.protocol || 'https';
    const hostHeader = req.get('host') || 'nitromath.site';
    const gatewayPrefix = `${reqProtocol}://${hostHeader}/api/gateway?url=`;

    response.headers.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (!restrictedHeaders.includes(lowerKey)) {
        if (lowerKey === 'location') {
          const redirected = resolveAndGatewayUrl(val, finalUrl, gatewayPrefix);
          res.setHeader('Location', redirected);
        } else {
          try { res.setHeader(key, val); } catch(e) {}
        }
      }
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('x-frame-options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('content-security-policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    res.removeHeader('content-security-policy-report-only');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('cross-origin-opener-policy');
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.removeHeader('cross-origin-embedder-policy');
    res.removeHeader('Cross-Origin-Resource-Policy');
    res.removeHeader('cross-origin-resource-policy');
    res.removeHeader('Set-Cookie');
    res.removeHeader('set-cookie');

    if (contentType.includes('text/html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const htmlText = buffer.toString('utf8');
      const rewrittenHtml = rewriteHtml(htmlText, finalUrl, gatewayPrefix);
      return res.send(rewrittenHtml);
    } else if (contentType.includes('text/css') || finalUrl.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      const cssText = buffer.toString('utf8');
      const rewrittenCss = rewriteCssUrls(cssText, finalUrl, gatewayPrefix);
      return res.send(rewrittenCss);
    } else if (contentType.includes('javascript') || finalUrl.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      return res.send(buffer);
    } else {
      return res.send(buffer);
    }
  } catch (err) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><style>body{background:#090a0f;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}.card{background:rgba(239,68,68,0.15);border:1px solid #ef4444;padding:40px;border-radius:16px;text-align:center;}</style></head>
      <body><div class="card"><h2 style="color:#ef4444;">Gateway Connection Failure</h2><p>Unable to connect to target URL: ${err.message}</p></div></body>
      </html>
    `);
  }
});

module.exports = router;
