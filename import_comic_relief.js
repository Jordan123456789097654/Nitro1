// import_comic_relief.js
// Script to import HTML games from the cloned TheComicReliefCorner repo into Nitro Games.
// It copies HTML files (and associated assets) into the public/games folder
// and creates DB entries with author "Nitro Games" and embed_type "iframe_url".

const fs = require('fs');
const path = require('path');
const db = require('./server/db'); // Adjust relative path as needed

const sourceDir = path.join(__dirname, 'temp_comic_relief');
const targetDir = path.join(__dirname, 'public', 'games');

function slugifyTitle(title) {
  // simple slug: lower, replace spaces and underscores with '-', remove extension
  return title.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-').replace(/\.html?$/i, '') + '-' + Date.now().toString().slice(-4);
}

async function copyFile(file) {
  const src = path.join(sourceDir, file);
  const dest = path.join(targetDir, file);
  await fs.promises.copyFile(src, dest);
}

async function importGames() {
  try {
    // Ensure target directory exists
    await fs.promises.mkdir(targetDir, { recursive: true });
    const entries = await fs.promises.readdir(sourceDir);
    for (const entry of entries) {
      if (entry.toLowerCase().endsWith('.html')) {
        // copy HTML file
        await copyFile(entry);
        // also copy associated assets (same basename with .jpeg, .png, .jfif, .webp, .mp3)
        const base = entry.replace(/\.html?$/i, '');
        const assetExts = ['.jpeg', '.jpg', '.png', '.jfif', '.webp', '.mp3'];
        for (const ext of assetExts) {
          const assetName = base + ext;
          if (entries.includes(assetName)) {
            await copyFile(assetName);
          }
        }
        // Insert into DB
        const title = entry.replace(/_/g, ' ').replace(/\.html?$/i, '');
        const slug = slugifyTitle(title);
        const embedUrl = `/games/${entry}`; // served statically
        await db.pool.query(`INSERT INTO games (title, slug, author, thumbnail_url, embed_type, embed_content, category) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (slug) DO NOTHING`, [
          title,
          slug,
          'Nitro Games',
          '', // thumbnail will be auto-generated or you can set later
          'iframe_url',
          embedUrl,
          'Custom'
        ]);
        console.log(`Imported ${title} as ${slug}`);
      }
    }
    console.log('All games imported.');
    process.exit(0);
  } catch (err) {
    console.error('Import error:', err);
    process.exit(1);
  }
}

importGames();
