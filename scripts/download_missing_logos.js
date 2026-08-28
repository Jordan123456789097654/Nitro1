// scripts/download_missing_logos.js
const fs = require('fs');
const path = require('path');
const fetch = require('C:/Users/jorda/.gemini/antigravity/scratch/nitro-games/node_modules/node-fetch');
const db = require('C:/Users/jorda/.gemini/antigravity/scratch/nitro-games/server/db');

const targetDir = path.join(__dirname, '..', 'public', 'games');

// Helper to sanitize title for filenames
function getCleanSlug(title) {
  return title.toLowerCase().replace(/[\s\W-]+/g, '-').replace(/^-+|-+$/g, '');
}

// Extract meta tag value robustly
function getMetaTag(html, nameOrProp) {
  const regexes = [
    new RegExp(`<meta[^>]+(?:property|name)="${nameOrProp}"[^>]+content="([^"]+)"`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="${nameOrProp}"`, 'i'),
    new RegExp(`<meta[^>]+(?:property|name)='${nameOrProp}'[^>]+content='([^']+)'`, 'i'),
    new RegExp(`<meta[^>]+content='([^']+)'[^>]+(?:property|name)='${nameOrProp}'`, 'i')
  ];
  for (const r of regexes) {
    const m = html.match(r);
    if (m && m[1]) return m[1];
  }
  return null;
}

// Extract search urls from DDG HTML search page
function getUrlsFromHtml(html) {
  const urls = [];
  const matches = html.matchAll(/uddg=([^&"'>\s]+)/g);
  for (const m of matches) {
    try {
      const decoded = decodeURIComponent(m[1]);
      if (decoded.startsWith('http')) {
        urls.push(decoded);
      }
    } catch {}
  }
  return urls;
}

// Strategy 1: Poki & CrazyGames Scraper
async function scrapeGamePortals(gameTitle) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(gameTitle + ' game crazygames OR poki')}`;
    const res = await fetch(searchUrl, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      } 
    });
    if (!res.ok) return null;
    const html = await res.text();
    const urls = getUrlsFromHtml(html);
    
    // Find first valid game page from poki or crazygames
    const targetUrl = urls.find(u => 
      (u.includes('crazygames.com') && u.includes('/game/')) || 
      (u.includes('poki.com') && (u.includes('/g/') || u.includes('/en/g/')))
    );
    
    if (targetUrl) {
      console.log(`  -> Scraping portal URL: ${targetUrl}`);
      const pageRes = await fetch(targetUrl, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
      });
      if (pageRes.ok) {
        const pageHtml = await pageRes.text();
        const ogImage = getMetaTag(pageHtml, 'og:image') || 
                        getMetaTag(pageHtml, 'twitter:image') ||
                        getMetaTag(pageHtml, 'image_src');
        if (ogImage) {
          // poki images might have resize suffixes, clean them
          return ogImage.split('/revision/')[0];
        }
      }
    }
  } catch (err) {
    console.error(`  [Portal Scrape Error] ${gameTitle}:`, err.message);
  }
  return null;
}

// Strategy 2: Steam Search API
async function getSteamLogo(gameTitle) {
  try {
    const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(gameTitle)}&l=english&cc=US`;
    const res = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    
    if (data.total > 0 && data.items && data.items[0]) {
      const item = data.items[0];
      const clean = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean(item.name).includes(clean(gameTitle)) || clean(gameTitle).includes(clean(item.name))) {
        // Test high quality header first, fallback to tiny_image if header fails
        const headerUrl = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/header.jpg`;
        const testRes = await fetch(headerUrl, { method: 'HEAD' });
        if (testRes.ok) {
          return headerUrl;
        }
        if (item.tiny_image) {
          return item.tiny_image;
        }
      }
    }
  } catch (err) {
    console.error(`  [Steam Error] ${gameTitle}:`, err.message);
  }
  return null;
}

// Strategy 3: Wikipedia Search & Scrape
async function getWikiLogo(gameTitle) {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(gameTitle + ' video game')}&format=json`;
    const searchRes = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    
    const results = searchData.query && searchData.query.search;
    if (!results || results.length === 0) return null;
    
    const wikiTitle = results[0].title;
    
    const imagesUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=images&format=json`;
    const imagesRes = await fetch(imagesUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!imagesRes.ok) return null;
    const imagesData = await imagesRes.json();
    
    const pages = imagesData.query && imagesData.query.pages;
    if (!pages) return null;
    const pageId = Object.keys(pages)[0];
    const pageImages = pages[pageId].images;
    
    if (!pageImages || pageImages.length === 0) return null;
    
    const excludePatterns = [/featured/i, /edit/i, /symbol/i, /flag/i, /radiation/i, /folder/i, /disambig/i, /question/i, /stub/i, /icon/i];
    const candidateImages = pageImages.filter(img => {
      const title = img.title;
      const isImage = title.endsWith('.jpg') || title.endsWith('.png') || title.endsWith('.jpeg') || title.endsWith('.webp');
      const isExcluded = excludePatterns.some(p => p.test(title));
      return isImage && !isExcluded;
    });
    
    if (candidateImages.length === 0) return null;
    
    const cleanTitle = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanGame = cleanTitle(gameTitle);
    
    candidateImages.sort((a, b) => {
      const aClean = cleanTitle(a.title);
      const bClean = cleanTitle(b.title);
      const aHas = aClean.includes(cleanGame);
      const bHas = bClean.includes(cleanGame);
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return a.title.length - b.title.length;
    });
    
    const selectedImageFile = candidateImages[0].title;
    
    const infoUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(selectedImageFile)}&prop=imageinfo&iiprop=url&format=json`;
    const infoRes = await fetch(infoUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!infoRes.ok) return null;
    const infoData = await infoRes.json();
    
    const infoPages = infoData.query && infoData.query.pages;
    if (!infoPages) return null;
    const infoPageId = Object.keys(infoPages)[0];
    const info = infoPages[infoPageId].imageinfo;
    if (info && info[0]) {
      return info[0].url;
    }
  } catch (err) {
    console.error(`  [Wiki Error] ${gameTitle}:`, err.message);
  }
  return null;
}

// Strategy 4: Fandom Scraper Fallback
async function scrapeWebLogo(gameTitle) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(gameTitle + ' game fandom wiki')}`;
    const res = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!res.ok) return null;
    const html = await res.text();
    const urls = getUrlsFromHtml(html);
    
    const fandomUrl = urls.find(u => u.includes('.fandom.com/wiki/'));
    if (fandomUrl) {
      console.log(`  -> Found Fandom page: ${fandomUrl}`);
      const fandomRes = await fetch(fandomUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (fandomRes.ok) {
        const fandomHtml = await fandomRes.text();
        const ogImage = getMetaTag(fandomHtml, 'og:image') || 
                        getMetaTag(fandomHtml, 'twitter:image') ||
                        getMetaTag(fandomHtml, 'image_src');
        if (ogImage) {
          return ogImage.split('/revision/')[0];
        }
      }
    }
  } catch (err) {
    console.error(`  [Scraping Error] ${gameTitle}:`, err.message);
  }
  return null;
}

// Strategy 5: DuckDuckGo Instant Answer API
async function getDDGLogo(gameTitle) {
  try {
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(gameTitle)}&format=json&t=nitro-games`;
    const res = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.Image) {
      return `https://duckduckgo.com${data.Image}`;
    }
  } catch (err) {
    console.error(`  [DDG Error] ${gameTitle}:`, err.message);
  }
  return null;
}

async function run() {
  console.log('⚡ [HEAL LOGOS] Connecting to database...');
  await db.initPostgres();
  
  // Get all games with Unsplash logo
  const dbRes = await db.pool.query(
    "SELECT id, title, slug, thumbnail_url FROM games WHERE thumbnail_url LIKE '%unsplash%' OR thumbnail_url IS NULL OR thumbnail_url = '' ORDER BY id ASC"
  );
  
  console.log(`⚡ [HEAL LOGOS] Found ${dbRes.rows.length} games needing covers.`);
  
  let healedCount = 0;
  
  for (let i = 0; i < dbRes.rows.length; i++) {
    const game = dbRes.rows[i];
    const title = game.title.trim();
    console.log(`\n(${i + 1}/${dbRes.rows.length}) 🔍 Searching logo for: "${title}"...`);
    
    let imageUrl = null;
    let strategyUsed = '';
    
    // Step 1: Try Poki & CrazyGames portal scraping (great for web/flash games)
    imageUrl = await scrapeGamePortals(title);
    if (imageUrl) {
      strategyUsed = 'Poki/CrazyGames Scraper';
    }
    
    // Step 2: Try Steam search
    if (!imageUrl) {
      imageUrl = await getSteamLogo(title);
      if (imageUrl) {
        strategyUsed = 'Steam API';
      }
    }
    
    // Step 3: Try Wikipedia API
    if (!imageUrl) {
      imageUrl = await getWikiLogo(title);
      if (imageUrl) {
        strategyUsed = 'Wikipedia API';
      }
    }
    
    // Step 4: Try Fandom scraper
    if (!imageUrl) {
      imageUrl = await scrapeWebLogo(title);
      if (imageUrl) {
        strategyUsed = 'Fandom scraper';
      }
    }
    
    // Step 5: Try DuckDuckGo Instant Answer
    if (!imageUrl) {
      imageUrl = await getDDGLogo(title);
      if (imageUrl) {
        strategyUsed = 'DDG Instant Answer';
      }
    }
    
    if (imageUrl) {
      console.log(`  -> Found image URL via [${strategyUsed}]: ${imageUrl}`);
      
      // Determine file extension
      let ext = '.png';
      if (imageUrl.toLowerCase().includes('.jpg') || imageUrl.toLowerCase().includes('.jpeg')) {
        ext = '.jpg';
      } else if (imageUrl.toLowerCase().includes('.webp')) {
        ext = '.webp';
      }
      
      const cleanSlug = getCleanSlug(title);
      const filename = `${cleanSlug}${ext}`;
      const localPath = path.join(targetDir, filename);
      const dbPath = `/games/${filename}`;
      
      try {
        const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!imgRes.ok) throw new Error(`Download status ${imgRes.status}`);
        const buffer = await imgRes.buffer();
        
        await fs.promises.writeFile(localPath, buffer);
        
        // Update database
        await db.pool.query('UPDATE games SET thumbnail_url = $1 WHERE id = $2', [dbPath, game.id]);
        console.log(`  ✅ Successfully updated DB with logo: ${dbPath}`);
        healedCount++;
      } catch (err) {
        console.error(`  ❌ Failed to download/save image:`, err.message);
      }
    } else {
      console.log(`  ❌ Could not resolve logo for: "${title}"`);
    }
    
    // 1000ms delay to avoid rate-limiting/blocks from Wikipedia/DuckDuckGo
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n=======================================');
  console.log(`✅ [LOGO HEALING COMPLETE]`);
  console.log(`  -> Logos successfully resolved & downloaded: ${healedCount}/${dbRes.rows.length}`);
  console.log('=======================================');
  
  await db.pool.end();
  process.exit(0);
}

run();
