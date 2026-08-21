// server/routes/music.js
// Universal Music Search API Endpoint (Live YouTube Music / Invidious Query Proxy)

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

// Invidious / Piped public instance fallbacks for zero-API-key YouTube search
const SEARCH_INSTANCES_FALLBACK = [
  'https://invidious.nerdvpn.de/api/v1/search',
  'https://invidious.drgns.space/api/v1/search',
  'https://inv.tux.pizza/api/v1/search',
  'https://invidious.no-name-given.de/api/v1/search'
];

let cachedSearchUrls = null;
let lastFetchTime = 0;

async function getSearchUrls() {
  const now = Date.now();
  if (cachedSearchUrls && (now - lastFetchTime < 600000)) { // 10 minutes cache
    return cachedSearchUrls;
  }

  try {
    const response = await fetch('https://api.invidious.io/instances.json', { timeout: 3000 });
    if (response.ok) {
      const data = await response.json();
      const active = data
        .filter(([name, info]) => info.type === 'https' && info.api && info.monitor && !info.monitor.down)
        .map(([name, info]) => `${info.uri}/api/v1/search`);
      
      if (active.length > 0) {
        cachedSearchUrls = active;
        lastFetchTime = now;
        return active;
      }
    }
  } catch (err) {
    // Network error or timeout, will fall back
  }

  return SEARCH_INSTANCES_FALLBACK;
}

router.get('/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) {
    return res.json({ success: true, results: [] });
  }

  const searchUrls = await getSearchUrls();

  // 1. Try Invidious Public API instances for structured video search
  for (const instanceUrl of searchUrls) {
    try {
      const searchUrl = `${instanceUrl}?q=${encodeURIComponent(query)}&type=video`;
      const response = await fetch(searchUrl, { timeout: 4000 });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const results = data.slice(0, 12).map(item => {
            const videoId = item.videoId || item.id;
            const title = item.title || 'Untitled Track';
            const author = item.author || item.uploaderName || 'YouTube Artist';
            const thumbnail = item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            const durationSecs = item.lengthSeconds || 0;
            const mins = Math.floor(durationSecs / 60);
            const secs = durationSecs % 60;
            const durationStr = durationSecs ? `${mins}:${secs < 10 ? '0' : ''}${secs}` : 'Live';

            return {
              id: videoId,
              title,
              artist: author,
              thumbnail,
              duration: durationStr,
              url: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`
            };
          });

          return res.json({ success: true, results, source: 'invidious' });
        }
      }
    } catch (err) {
      // Continue to next instance fallback
    }
  }

  // 2. DuckDuckGo Video Search Fallback
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=site:youtube.com+watch+${encodeURIComponent(query)}`;
    const ddgRes = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36'
      },
      timeout: 5000
    });

    if (ddgRes.ok) {
      const html = await ddgRes.text();
      const matches = [...html.matchAll(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/gi)];
      const uniqueIds = Array.from(new Set(matches.map(m => m[1]))).slice(0, 8);

      if (uniqueIds.length > 0) {
        const results = uniqueIds.map(id => ({
          id,
          title: `${query} (Track #${id.slice(0, 4)})`,
          artist: 'YouTube Music',
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          duration: '3:45',
          url: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`
        }));
        return res.json({ success: true, results, source: 'duckduckgo' });
      }
    }
  } catch (e) {}

  // 3. Fallback mock search response for resilient playback if offline
  return res.json({
    success: true,
    results: [
      {
        id: 'jfKfPfyJRdk',
        title: `${query} - Lofi Relax & Study Stream`,
        artist: 'Lofi Girl',
        thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
        duration: 'Live',
        url: 'https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?autoplay=1'
      }
    ],
    fallback: true
  });
});

module.exports = router;
