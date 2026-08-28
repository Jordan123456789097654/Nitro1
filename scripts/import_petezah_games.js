// scripts/import_petezah_games.js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const db = require('../server/db');

const collectionPath = path.join(process.env.USERPROFILE, '.gemini', 'antigravity', 'brain', '8e43c7fb-ee99-4837-9e9d-3f9891a96cb9', 'scratch', 'collection.json');
const targetDir = path.join(__dirname, '..', 'public', 'games');

// Clean and resolve the embed url
function cleanTargetUrl(url) {
  let target = url;
  if (url.includes('/iframe.html?url=')) {
    const parts = url.split('/iframe.html?url=');
    target = decodeURIComponent(parts[1]);
  }
  if (target.includes('/embed.html#')) {
    target = target.split('/embed.html#')[1];
  }
  
  // Extract absolute url from proxy prefixes like /!!/https://...
  const httpMatch = target.match(/https?:\/\/.*$/);
  if (httpMatch) {
    return httpMatch[0];
  }
  
  if (target.startsWith('/')) {
    return 'https://petezahgames.com' + target;
  }
  return 'https://petezahgames.com/' + target;
}

// Map categories to capitalized catalog categories
function mapCategory(categories) {
  if (!categories || categories.length === 0) return 'Custom';
  const cat = categories[0].toLowerCase().trim();
  if (cat === '2 player') return '2 Player';
  if (cat === 'io') return 'Io';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

// Helper to slugify titles
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '-')
    .replace(/^-+|-+$/g, '') + '-' + Date.now().toString().slice(-4);
}

// Helper to download game logos with fallback
async function downloadLogo(imageUrl, targetPath) {
  let downloadUrl = `https://petezahgames.com${imageUrl}`;
  if (imageUrl.startsWith('/storage/images/')) {
    downloadUrl = `https://raw.githubusercontent.com/PeteZah-Games/PeteZahGames/main/public${imageUrl}`;
  }
  
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`failed to download image: status ${res.status}`);
    }
    const buffer = await res.buffer();
    
    // Check if we accidentally downloaded a 404 HTML page (usually size 17378 or starts with "<!DOCTYPE")
    if (buffer.length === 17378 || buffer.toString('utf8', 0, 10).startsWith('<!DOCTYPE')) {
      if (!downloadUrl.includes('raw.githubusercontent.com')) {
        const fallbackUrl = `https://raw.githubusercontent.com/PeteZah-Games/PeteZahGames/main/public${imageUrl}`;
        const fallbackRes = await fetch(fallbackUrl);
        if (fallbackRes.ok) {
          const fallbackBuffer = await fallbackRes.buffer();
          if (fallbackBuffer.length !== 17378 && !fallbackBuffer.toString('utf8', 0, 10).startsWith('<!DOCTYPE')) {
            await fs.promises.writeFile(targetPath, fallbackBuffer);
            return true;
          }
        }
      }
      throw new Error('downloaded content is a 404 HTML page');
    }
    
    await fs.promises.writeFile(targetPath, buffer);
    return true;
  } catch (err) {
    console.error(`  -> Failed to download logo from ${downloadUrl}:`, err.message);
    return false;
  }
}

async function run() {
  console.log('⚡ [IMPORT] Connecting to database and checking existing games...');
  await db.initPostgres();
  
  const existingRes = await db.pool.query('SELECT title, slug FROM games');
  const existingTitles = new Set(existingRes.rows.map(r => r.title.toLowerCase().trim()));
  const existingSlugs = new Set(existingRes.rows.map(r => r.slug.toLowerCase().trim()));
  
  console.log(`⚡ [IMPORT] Loaded ${existingTitles.size} existing games from database.`);
  
  if (!fs.existsSync(collectionPath)) {
    console.error('❌ [IMPORT] collection.json not found at:', collectionPath);
    process.exit(1);
  }
  
  const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
  const gamesToImport = collection.games || [];
  console.log(`⚡ [IMPORT] Found ${gamesToImport.length} games in collection.json.`);
  
  await fs.promises.mkdir(targetDir, { recursive: true });
  
  let importedCount = 0;
  let skippedCount = 0;
  let correctedLogosCount = 0;
  
  for (const game of gamesToImport) {
    const title = game.label.trim();
    const titleLower = title.toLowerCase();
    
    // Skip placeholder or form links
    if (titleLower === 'request games' || game.url.includes('google.com/forms')) {
      skippedCount++;
      continue;
    }
    
    const baseSlug = title.toLowerCase().replace(/[\s\W-]+/g, '-').replace(/^-+|-+$/g, '');
    let slug = baseSlug;
    
    // Resolve logo image extension
    let ext = '.jpg';
    if (game.imageUrl) {
      const parsedPath = path.parse(game.imageUrl);
      if (parsedPath.ext) {
        ext = parsedPath.ext;
      }
    }
    
    const logoFilename = `${slug}${ext}`;
    const logoLocalPath = path.join(targetDir, logoFilename);
    const logoUrlPath = `/games/${logoFilename}`;
    
    // Check if we already have it in DB
    if (existingTitles.has(titleLower)) {
      // Check if local logo file needs correction (size is 17378 or doesn't exist)
      let needsImage = false;
      try {
        const stats = await fs.promises.stat(logoLocalPath);
        if (stats.size === 17378) {
          needsImage = true;
        }
      } catch (e) {
        needsImage = true; // file does not exist
      }
      
      if (needsImage && game.imageUrl) {
        console.log(`♻️ [CORRECTING LOGO] "${title}"`);
        const success = await downloadLogo(game.imageUrl, logoLocalPath);
        if (success) correctedLogosCount++;
      } else {
        skippedCount++;
      }
      continue;
    }
    
    if (existingSlugs.has(slug)) {
      slug = slugify(title);
    }
    
    console.log(`📥 [IMPORTING] "${title}" (slug: ${slug})...`);
    
    let logoSuccess = false;
    if (game.imageUrl) {
      logoSuccess = await downloadLogo(game.imageUrl, logoLocalPath);
    }
    
    // Fallback if download failed or no imageUrl was provided
    const finalThumbnailUrl = logoSuccess ? logoUrlPath : 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500&auto=format&fit=crop&q=60';
    
    const embedUrl = cleanTargetUrl(game.url);
    const category = mapCategory(game.categories);
    
    try {
      await db.pool.query(
        `INSERT INTO games (title, slug, author, thumbnail_url, embed_type, embed_content, category, is_vip, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [title, slug, 'PeteZah Games', finalThumbnailUrl, 'iframe_url', embedUrl, category, false, 'admin']
      );
      console.log(`  -> Successfully imported: "${title}"`);
      importedCount++;
    } catch (dbErr) {
      console.error(`  -> Failed to save "${title}" to database:`, dbErr.message);
    }
  }
  
  console.log('\n=======================================');
  console.log(`✅ [IMPORT COMPLETE]`);
  console.log(`  -> New games imported: ${importedCount}`);
  console.log(`  -> Logos corrected: ${correctedLogosCount}`);
  console.log(`  -> Games skipped (duplicates/filtered): ${skippedCount}`);
  console.log('=======================================');
  
  await db.pool.end();
  process.exit(0);
}

run();
