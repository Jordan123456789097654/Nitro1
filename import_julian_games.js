// import_julian_games.js
// Script to import HTML games from the cloned repository https://github.com/julianlockibarra-cat/games
// It copies .html files (and associated assets) into public/games and creates DB entries.

const fs = require('fs');
const path = require('path');
const db = require('./server/db'); // adjust if location changes

const sourceDir = path.join(__dirname, 'temp_games_repo');
const targetDir = path.join(__dirname, 'public', 'games');

function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/\.html?$/i, '')
    + '-' + Date.now().toString().slice(-4);
}

async function copyFile(file) {
  const src = path.join(sourceDir, file);
  const dest = path.join(targetDir, file);
  await fs.promises.copyFile(src, dest);
}

async function importGames() {
  try {
    await fs.promises.mkdir(targetDir, { recursive: true });
    const entries = await fs.promises.readdir(sourceDir);
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.html')) continue;
      // copy HTML
      await copyFile(entry);
      // copy same‑basename assets
      const base = entry.replace(/\.html?$/i, '');
      const assetExts = ['.jpeg', '.jpg', '.png', '.jfif', '.webp', '.mp3'];
      for (const ext of assetExts) {
        const asset = base + ext;
        if (entries.includes(asset)) {
          await copyFile(asset);
        }
      }
      // DB entry
      const title = entry.replace(/_/g, ' ').replace(/\.html?$/i, '');
      const slug = slugifyTitle(title);
      const embedUrl = `/games/${entry}`;
      await db.pool.query(
        `INSERT INTO games (title, slug, author, thumbnail_url, embed_type, embed_content, category)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (slug) DO NOTHING`,
        [title, slug, 'Nitro Games', '', 'iframe_url', embedUrl, 'Custom']
      );
      console.log(`Imported ${title} as ${slug}`);
    }
    console.log('All games imported.');
    process.exit(0);
  } catch (err) {
    console.error('Import error:', err);
    process.exit(1);
  }
}

importGames();
