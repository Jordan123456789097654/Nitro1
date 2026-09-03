const fs = require('fs');
const path = require('path');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

try {
  copyRecursive('dist/music.html', 'public/games/music.html');
  copyRecursive('dist/assets', 'public/assets');
  console.log('坕 Build assets copied successfully to public/');
} catch (e) {
  console.error('Copy build assets warning;', e.message);
}
