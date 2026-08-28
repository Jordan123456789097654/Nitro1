// scripts/import_petezah_apps.js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const db = require('../server/db');

const targetDir = path.join(__dirname, '..', 'public', 'games');

const PETEZAH_APPS = [
  { label: "PeteZah Movies", url: "https://petezahgames.com/?m=petezah://movies", imageUrl: "/storage/images/pete-movies.png" },
  { label: "PeteZah Music", url: "https://petezahgames.com/?m=petezah://music", imageUrl: "/storage/images/petemusic-removebg-preview.png" },
  { label: "Google", url: "https://www.google.com", imageUrl: "/storage/ag/apps/google/IMG_5324.webp" },
  { label: "YouTube", url: "https://youtube.com", imageUrl: "/storage/ag/apps/youtube/IMG_5338.webp" },
  { label: "Now.gg", url: "https://now.gg", imageUrl: "/storage/ag/apps/nowgg/IMG_5325.png" },
  { label: "Reddit", url: "https://reddit.com", imageUrl: "/storage/ag/apps/reddit/IMG_5326.jpeg" },
  { label: "GeForce", url: "https://play.geforcenow.com", imageUrl: "/storage/images/main/geforce.jpg" },
  { label: "Xbox", url: "https://xbox.com", imageUrl: "/storage/ag/apps/xbox/IMG_5327.png" },
  { label: "ChatGPT", url: "https://chat.openai.com", imageUrl: "/storage/ag/apps/chatgpt/IMG_5328.jpeg" },
  { label: "Github", url: "https://github.com", imageUrl: "/storage/images/main/github.jpg" },
  { label: "Cool Math Games", url: "https://coolmathgames.com", imageUrl: "/storage/ag/apps/coolmathgames/IMG_5329.png" },
  { label: "Crazy Games", url: "https://crazygames.com", imageUrl: "/storage/ag/apps/crazygames/IMG_5330.webp" },
  { label: "Facebook", url: "https://facebook.com", imageUrl: "/storage/ag/apps/facebook/IMG_5332.jpeg" },
  { label: "Discord", url: "https://discord.com/app", imageUrl: "/storage/ag/apps/discord/IMG_5331.jpeg" },
  { label: "Poki", url: "https://poki.com", imageUrl: "/storage/ag/apps/poki/IMG_5333.png" },
  { label: "TikTok", url: "https://tiktok.com", imageUrl: "/storage/ag/apps/tiktok/IMG_5335.png" },
  { label: "Snapchat", url: "https://web.snapchat.com", imageUrl: "/storage/ag/apps/snapchat/IMG_5334.png" },
  { label: "Twitch", url: "https://twitch.tv", imageUrl: "/storage/ag/apps/twitch/IMG_5336.png" },
  { label: "X", url: "https://x.com", imageUrl: "/storage/ag/apps/x/IMG_5337.png" },
  { label: "YouTube Invidious", url: "https://invidious.io", imageUrl: "/storage/images/main/invid.png" },
  { label: "HD Today", url: "https://hdtoday.tv", imageUrl: "/storage/ag/apps/hdtoday/IMG_5342.jpeg" },
  { label: "Aptoid", url: "https://aptoide.com", imageUrl: "/storage/ag/apps/aptoid/IMG_5343.png" },
  { label: "Android Emulator", url: "https://appetize.io", imageUrl: "/storage/ag/apps/android/logo.webp" },
  { label: "EmulatorJS", url: "https://emulatorjs.org", imageUrl: "/storage/ag/apps/emulatorjs/docs/Logo-light.png" },
  { label: "Rumble", url: "https://rumble.com", imageUrl: "/storage/images/main/rumble.jpg" },
  { label: "Yahoo", url: "https://yahoo.com", imageUrl: "/storage/images/main/yahoo.jpg" },
  { label: "Netflix", url: "https://netflix.com", imageUrl: "/storage/images/main/netflix.jpg" },
  { label: "Hulu", url: "https://hulu.com", imageUrl: "/storage/images/main/hulu.jpg" },
  { label: "Pinterest", url: "https://pinterest.com", imageUrl: "/storage/images/main/pinterist.jpg" },
  { label: "Soundcloud", url: "https://soundcloud.com", imageUrl: "/storage/images/main/soundcloud.jpg" },
  { label: "ESPN", url: "https://espn.com", imageUrl: "/storage/images/main/espn.jpg" },
  { label: "Vortex", url: "https://vtx.chat.cdn.cloudflare.net", imageUrl: "/storage/images/main/vortex.png" },
  { label: "Fifa Rosters", url: "https://www.ea.com/fifa", imageUrl: "/storage/images/main/fifarosters.jpg" },
  { label: "Vercel", url: "https://vercel.com", imageUrl: "/storage/images/main/vercel.jpg" },
  { label: "VsCode", url: "https://vscode.dev", imageUrl: "/storage/images/main/vscode.jpg" },
  { label: "Y8Games", url: "https://y8.com", imageUrl: "/storage/images/main/y8games.jpg" },
];

// Helper to slugify titles
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '-')
    .replace(/^-+|-+$/g, '') + '-' + Date.now().toString().slice(-4);
}

// Helper to download app logos with fallback
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
  console.log('⚡ [APPS] Connecting to database and checking existing apps...');
  await db.initPostgres();
  
  const existingRes = await db.pool.query("SELECT title, slug FROM games WHERE category = 'Apps'");
  const existingTitles = new Set(existingRes.rows.map(r => r.title.toLowerCase().trim()));
  const existingSlugs = new Set(existingRes.rows.map(r => r.slug.toLowerCase().trim()));
  
  console.log(`⚡ [APPS] Loaded ${existingTitles.size} existing apps from database.`);
  
  await fs.promises.mkdir(targetDir, { recursive: true });
  
  let importedCount = 0;
  let skippedCount = 0;
  
  for (const app of PETEZAH_APPS) {
    const title = app.label.trim();
    const titleLower = title.toLowerCase();
    
    // Check if we already have it
    if (existingTitles.has(titleLower)) {
      console.log(`⏭️ [SKIP] Already have app: "${title}"`);
      skippedCount++;
      continue;
    }
    
    const baseSlug = title.toLowerCase().replace(/[\s\W-]+/g, '-').replace(/^-+|-+$/g, '');
    let slug = baseSlug;
    if (existingSlugs.has(slug)) {
      slug = slugify(title);
    }
    
    console.log(`📥 [IMPORTING APP] "${title}" (slug: ${slug})...`);
    
    // Resolve logo image extension
    let ext = '.png';
    if (app.imageUrl) {
      const parsedPath = path.parse(app.imageUrl);
      if (parsedPath.ext) {
        ext = parsedPath.ext;
      }
    }
    
    const logoFilename = `${slug}${ext}`;
    const logoLocalPath = path.join(targetDir, logoFilename);
    const logoUrlPath = `/games/${logoFilename}`;
    
    let logoSuccess = false;
    if (app.imageUrl) {
      logoSuccess = await downloadLogo(app.imageUrl, logoLocalPath);
    }
    
    // Fallback if download failed or no imageUrl was provided
    const finalThumbnailUrl = logoSuccess ? logoUrlPath : 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500&auto=format&fit=crop&q=60';
    
    try {
      await db.pool.query(
        `INSERT INTO games (title, slug, author, thumbnail_url, embed_type, embed_content, category, is_vip, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [title, slug, 'PeteZah Games', finalThumbnailUrl, 'iframe_url', app.url, 'Apps', false, 'admin']
      );
      console.log(`  -> Successfully imported App: "${title}"`);
      importedCount++;
    } catch (dbErr) {
      console.error(`  -> Failed to save App "${title}" to database:`, dbErr.message);
    }
  }
  
  console.log('\n=======================================');
  console.log(`✅ [APPS IMPORT COMPLETE]`);
  console.log(`  -> New apps imported: ${importedCount}`);
  console.log(`  -> Apps skipped: ${skippedCount}`);
  console.log('=======================================');
  
  await db.pool.end();
  process.exit(0);
}

run();
