const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const zlib = require('zlib');
const db = require('../db');
const { sendDiscordLog } = require('../discordLogger');

const JWT_SECRET = process.env.SESSION_SECRET || 'nitro_jwt_secure_key_2026';

// Engine Spoofing Profiles
const GATEWAY_ENGINES = {
  chrome: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
    platform: '"Windows"',
    mobile: '?0'
  },
  firefox: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
    secChUa: '',
    platform: '"Windows"',
    mobile: '?0'
  },
  safari: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    secChUa: '',
    platform: '"macOS"',
    mobile: '?0'
  },
  edge: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
    secChUa: '"Chromium";v="128", "Not;A=Brand";v="24", "Microsoft Edge";v="128"',
    platform: '"Windows"',
    mobile: '?0'
  },
  classroom: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Google-Classroom/2.4',
    secChUa: '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
    platform: '"Windows"',
    mobile: '?0',
    referer: 'https://classroom.google.com/'
  }
};

// SSRF IP Validation
function isInternalOrPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')) {
    return true;
  }
  // Check private IP ranges
  const ipParts = host.split('.').map(Number);
  if (ipParts.length === 4 && !ipParts.some(isNaN)) {
    if (ipParts[0] === 10) return true; // 10.0.0.0/8
    if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return true; // 172.16.0.0/12
    if (ipParts[0] === 192 && ipParts[1] === 168) return true; // 192.168.0.0/16
    if (ipParts[0] === 169 && ipParts[1] === 254) return true; // 169.254.169.254 metadata
    if (ipParts[0] === 127) return true;
  }
  return false;
}

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

  // Remove meta CSP and X-Frame-Options tags that block iframe rendering
  rewritten = rewritten.replace(/<meta[^>]*http-equiv=["']?(Content-Security-Policy|X-Frame-Options)["']?[^>]*>/gi, '');

  // Strip inline frame buster scripts that blank or redirect framed pages
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

  // Inject Base URL, Frame-Buster Shield & XHR Interceptor Relay Script into <head>
  const clientRelayScript = `
    <base href="${baseUrl}">
    <script>
      (function() {
        window.__NITRO_GATEWAY_BASE__ = "${baseUrl}";
        window.__NITRO_GATEWAY_PREFIX__ = "${gatewayPrefix}";

        // Frame Buster Shield: Lock window.top & window.parent to current window
        try {
          Object.defineProperty(window, 'top', { get: function() { return window; }, configurable: true });
          Object.defineProperty(window, 'parent', { get: function() { return window; }, configurable: true });
        } catch(e) {}

        // History API Security Patch to prevent cross-origin SecurityError
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

        // Disable Service Worker registration inside gateway iframe to avoid cross-origin registration errors
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
                input = new Request(pUrl, input);
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

// Remade High-Speed Unrestricted & Sandboxed Gateway Router
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
    const features = await db.getFeatureSettings();
    if (features.feature_gateway_enabled === 'false') {
      const isOwner = req.user && (req.user.role === 'owner' || req.user.username.toLowerCase() === 'jordandaniels');
      if (!isOwner) {
        return res.status(503).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Gateway Feature Offline</title>
            <style>
              body { background: #090a0f; color: #fff; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
              .card { background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; padding: 40px; border-radius: 16px; max-width: 500px; }
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
          <p>Your web gateway access has been restricted by an administrator or due to violation strikes.${timeoutMsg}</p>
          <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 20px;">Contact platform support or owner if you believe this is an error.</p>
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

  // SSRF Protection Check
  if (isInternalOrPrivateHost(hostname)) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><style>body{background:#090a0f;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}.card{background:rgba(239,68,68,0.15);border:1px solid #ef4444;padding:40px;border-radius:16px;text-align:center;}</style></head>
      <body><div class="card"><h2 style="color:#ef4444;">🛡️ SSRF Security Block</h2><p>Access to local and private IP addresses is blocked.</p></div></body>
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
            <title>Domain Access Restricted</title>
            <style>
              body { background: #090a0f; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
              .card { background: rgba(245, 158, 11, 0.12); border: 1px solid #f59e0b; padding: 44px; border-radius: 18px; max-width: 520px; box-shadow: 0 20px 50px rgba(0,0,0,0.7); }
              h2 { color: #fbbf24; font-size: 1.8rem; margin-top: 0; }
              p { color: #cbd5e1; font-size: 1rem; line-height: 1.6; }
              code { background: rgba(0,0,0,0.5); padding: 4px 8px; border-radius: 6px; color: #f59e0b; font-family: monospace; }
            </style>
          </head>
          <body>
            <div class="card">
              <div style="font-size: 4rem; margin-bottom: 12px;">🚫</div>
              <h2>Domain Access Restricted</h2>
              <p>The domain <code>${hostname}</code> has been restricted by the platform administrator.</p>
              <p style="font-size: 0.85rem; color: #94a3b8; margin-top: 18px;">Reason: ${matched.reason || 'Policy restriction'}</p>
            </div>
          </body>
          </html>
        `);
      }
    } catch (e) {}
  }

  // Fetch Target Content
  try {
    const selectedEngineKey = (req.query.engine || req.headers['x-gateway-engine'] || 'chrome').toLowerCase().trim();
    const engineConfig = GATEWAY_ENGINES[selectedEngineKey] || GATEWAY_ENGINES.chrome;

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
      if (typeof req.body === 'object') {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(req.body)) {
          params.append(k, v);
        }
        fetchOptions.body = params.toString();
        fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    const response = await fetch(parsedUrl.href, fetchOptions);
    const finalUrl = response.url || parsedUrl.href;
    const contentType = response.headers.get('content-type') || 'text/html';

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
      'content-encoding'
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

    if (contentType.includes('text/html')) {
      const htmlText = buffer.toString('utf8');
      const rewrittenHtml = rewriteHtml(htmlText, finalUrl, gatewayPrefix);
      return res.send(rewrittenHtml);
    } else if (contentType.includes('text/css')) {
      const cssText = buffer.toString('utf8');
      const rewrittenCss = rewriteCssUrls(cssText, finalUrl, gatewayPrefix);
      return res.send(rewrittenCss);
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
