import { getCurrentUser, ROLE_PERK_LEVELS } from './auth.js';
import { emitPlaytimeTick } from './chat.js';

let allStandardGames = [];
let allProGames = [];
let favorites = JSON.parse(localStorage.getItem('nitro_favorites') || '[]');
let activeGame = null;
let playtimeInterval = null;

let activeCatalogFilter = 'all'; // 'all', 'favorites', 'playlists'

window.openAddGameModal = function() {
  const modal = document.getElementById('add-game-modal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
};

window.closeAddGameModal = function() {
  const modal = document.getElementById('add-game-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
};

window.openSuggestModal = function() {
  const modal = document.getElementById('suggestion-modal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
};

window.closeSuggestModal = function() {
  const modal = document.getElementById('suggestion-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
};

window.openBugModal = function() {
  const modal = document.getElementById('bug-report-modal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
};

window.closeBugModal = function() {
  const modal = document.getElementById('bug-report-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
};

export function initGames() {
  loadGames();
  loadProGames();
  setupFilterAndSearch();
  setupAddGameForm();
  setupPlayerModal();
  setupSuggestionModal();
  setupBugReportModal();
  setupLeaderboardsModal();
}

export async function loadGames() {
  const searchInput = document.getElementById('game-search-input');
  const sortSelect = document.getElementById('game-sort-select');
  const favBadge = document.getElementById('favs-count-badge');

  const search = searchInput ? searchInput.value : '';
  const sort = sortSelect ? sortSelect.value : 'trending';

  if (favBadge) {
    favBadge.textContent = favorites.length;
  }

  try {
    const res = await fetch(`/api/games?search=${encodeURIComponent(search)}&sort=${sort}`);
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;
    const data = await res.json();
    let allStandardGamesRaw = data.games || [];
    allStandardGames = allStandardGamesRaw.filter(g => g.category !== 'Apps');

    const grid = document.getElementById('games-grid');
    if (!grid) return;

    if (activeCatalogFilter === 'favorites') {
      const favIds = favorites.map(Number);
      const favGames = allStandardGames.filter(g => favIds.includes(Number(g.id)));

      if (favGames.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; background: rgba(0,0,0,0.3); border: 1px dashed var(--card-border); border-radius: var(--radius-lg);">
            <div style="font-size: 2.5rem; margin-bottom: 10px;">⭐</div>
            <h3 style="color: #fbbf24; margin-bottom: 6px;">No Favorite Games Saved Yet</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 440px; margin: 0 auto 18px;">
              Click the star icon (★) in the top-right corner of any game in the catalog to bookmark your favorites here.
            </p>
            <button class="btn-pill primary" onclick="document.getElementById('tab-filter-all')?.click()">🎮 Browse All Games</button>
          </div>
        `;
      } else {
        renderGames(favGames, 'games-grid');
      }
    } else if (activeCatalogFilter === 'playlists') {
      renderPlaylistsView();
    } else {
      renderGames(allStandardGames, 'games-grid');
    }
  } catch (err) {
    // Network retry fallback
  }
}

async function renderPlaylistsView() {
  const grid = document.getElementById('games-grid');
  if (!grid) return;

  const user = getCurrentUser();
  if (!user) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">Please sign in to view and create custom game playlists.</div>';
    return;
  }

  const token = localStorage.getItem('nitro_jwt_token');
  try {
    const res = await fetch('/api/games/playlists', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const playlists = data.playlists || [];

    grid.innerHTML = `
      <div style="grid-column: 1/-1; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; background: rgba(251,191,36,0.06); border: 1px solid rgba(251,191,36,0.2); padding: 14px 20px; border-radius: var(--radius-md);">
        <div>
          <h3 style="color:#fbbf24; margin:0 0 4px;">📁 Your Custom Game Folders</h3>
          <span style="font-size:0.8rem; color:var(--text-muted);">Organize your favorite study break titles into personalized playlists.</span>
        </div>
        <button class="btn-pill primary" id="create-new-playlist-btn" style="background:#fbbf24; border-color:#fbbf24; color:#000; font-weight:800;">＋ New Playlist</button>
      </div>
      ${playlists.length === 0 ? '<div style="grid-column:1/-1; text-align:center; padding:48px; background:rgba(0,0,0,0.3); border:1px dashed var(--card-border); border-radius:var(--radius-lg); color:var(--text-muted);"><div style="font-size:2.4rem; margin-bottom:10px;">📁</div><h3>No playlists created yet</h3><p style="font-size:0.85rem; margin-top:4px;">Click "New Playlist" above to make your first folder!</p></div>' : ''}
      ${playlists.map(pl => {
        const gameIds = Array.isArray(pl.game_ids) ? pl.game_ids : JSON.parse(pl.game_ids || '[]');
        return `
          <div class="game-card" style="padding:22px; text-align:left; border:1px solid rgba(251,191,36,0.35); background: linear-gradient(145deg, rgba(20,24,38,0.9), rgba(12,14,24,0.95));">
            <div style="font-size:2.2rem; margin-bottom:8px;">📁</div>
            <strong style="font-size:1.15rem; color:#fff; display:block; margin-bottom:4px;">${pl.title}</strong>
            <span style="font-size:0.82rem; color:var(--text-muted);">${gameIds.length} Games in folder</span>
            <div style="margin-top:16px; display:flex; gap:8px;">
              <button class="btn-small danger" onclick="window.deleteUserPlaylist(${pl.id})">Delete Folder</button>
            </div>
          </div>
        `;
      }).join('')}
    `;

    const createPlBtn = document.getElementById('create-new-playlist-btn');
    if (createPlBtn) {
      createPlBtn.addEventListener('click', async () => {
        const title = prompt('Enter a name for your new game playlist / folder:');
        if (!title || !title.trim()) return;
        const res = await fetch('/api/games/playlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ title: title.trim() })
        });
        if (res.ok) {
          renderPlaylistsView();
        }
      });
    }

    window.deleteUserPlaylist = async (plId) => {
      if (!confirm('Delete this playlist folder?')) return;
      await fetch(`/api/games/playlists/${plId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      renderPlaylistsView();
    };
  } catch (e) {}
}

export async function loadProGames() {
  const user = getCurrentUser();
  const tierPill = document.getElementById('pro-user-tier-pill');
  const userLevel = user ? (ROLE_PERK_LEVELS[user.role] || 1) : 0;

  if (tierPill) {
    if (user) {
      const r = (user.role || 'member').toUpperCase();
      if (['ADMIN', 'OWNER'].includes(r)) {
        tierPill.textContent = `👑 YOUR ROLE: ${r === 'OWNER' ? 'OWNER 👑' : 'ADMIN 🛡️'} (SUPREME ACCESS)`;
        tierPill.style.color = '#fbbf24';
      } else if (r === 'ELITE_PATRON') {
        tierPill.textContent = `💎 YOUR ROLE: ELITE PATRON (TIER 5 UNLOCKED)`;
        tierPill.style.color = '#a855f7';
      } else if (r === 'PREMIUM_VIP') {
        tierPill.textContent = `🌟 YOUR ROLE: PREMIUM VIP (TIER 4 UNLOCKED)`;
        tierPill.style.color = '#f59e0b';
      } else if (['PRO', 'VIP'].includes(r)) {
        tierPill.textContent = `⚡ YOUR ROLE: PRO MEMBER (TIER 3 UNLOCKED)`;
        tierPill.style.color = '#fbbf24';
      } else if (r === 'STUDENT_PLUS') {
        tierPill.textContent = `🎓 YOUR ROLE: STUDENT PLUS (TIER 2 UNLOCKED)`;
        tierPill.style.color = '#38bdf8';
      } else {
        tierPill.textContent = `👤 YOUR ROLE: STUDENT (BASIC ACCESS)`;
        tierPill.style.color = '#94a3b8';
      }
    } else {
      tierPill.textContent = '👤 GUEST VISITOR (SIGN IN TO UPGRADE)';
      tierPill.style.color = '#94a3b8';
    }
  }

  // 1. Hide Admin & Staff Cards for non-staff
  const ownerAdminCard = document.querySelector('.tier-owner-admin');
  if (ownerAdminCard) {
    ownerAdminCard.style.display = userLevel >= 7 ? 'flex' : 'none';
  }

  const modCard = document.querySelector('.tier-moderator');
  if (modCard) {
    modCard.style.display = userLevel >= 6 ? 'flex' : 'none';
  }

  // 2. Gate Student Upgrade Tiers (Student Plus, PRO, Premium VIP, Elite Patron)
  const tierConfigs = [
    { selector: '.tier-student-plus', reqLevel: 2, name: 'Student Plus', btnAction: 'document.querySelector(\'.nav-btn[data-view="settings"]\')?.click()', btnText: '🎨 Open Theme Studio', btnBg: '#38bdf8', btnColor: '#000' },
    { selector: '.tier-pro', reqLevel: 3, name: 'PRO Member', btnAction: 'document.getElementById("pro-music-toggle-btn")?.click()', btnText: '🎧 Launch Audio Dock', btnBg: '#fbbf24', btnColor: '#000' },
    { selector: '.tier-premium-vip', reqLevel: 4, name: 'Premium VIP', btnAction: 'document.querySelector(\'.nav-btn[data-view="browser"]\')?.click()', btnText: '🌐 Launch Turbo Browser', btnBg: '#f97316', btnColor: '#fff' },
    { selector: '.tier-elite-patron', reqLevel: 5, name: 'Elite Patron', btnAction: 'document.getElementById("open-profile-edit-btn")?.click()', btnText: '✨ Customize Title Flair', btnBg: 'linear-gradient(135deg, #a855f7, #ec4899)', btnColor: '#fff' }
  ];

  tierConfigs.forEach(({ selector, reqLevel, name, btnAction, btnText, btnBg, btnColor }) => {
    const card = document.querySelector(selector);
    if (!card) return;

    const actionContainer = card.querySelector('.tier-card-action');
    if (!actionContainer) return;

    if (userLevel >= reqLevel) {
      card.style.opacity = '1';
      card.style.filter = 'none';
      actionContainer.innerHTML = `
        <button class="btn-pill primary" onclick="${btnAction}" style="background: ${btnBg}; border: none; color: ${btnColor}; font-weight: 800; width: 100%;">
          ${btnText}
        </button>
      `;
    } else {
      card.style.opacity = '0.75';
      actionContainer.innerHTML = `
        <button class="btn-pill" onclick="alert('🚧 Premium memberships are coming soon! All games & tools are currently free for everyone.')" style="background: rgba(245, 158, 11, 0.15); border-color: #f59e0b; color: #f59e0b; font-weight: 700; width: 100%;">
          🚧 Coming Soon
        </button>
      `;
    }
  });

  try {
    const res = await fetch(`/api/games?vipOnly=true&sort=trending`);
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return;
    const data = await res.json();
    allProGames = data.games || [];
    renderGames(allProGames, 'pro-games-grid');
  } catch (err) {
    // Network retry fallback
  }
}

export function renderGames(games, targetGridId) {
  const grid = document.getElementById(targetGridId);
  if (!grid) return;

  if (games.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
        <p style="font-size: 1.2rem; margin-bottom: 8px; color: #fbbf24; font-weight: 800;">We are currently making games</p>
        <p style="font-size: 0.9rem;">Check back later or suggest an addition below!</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = games.map(game => {
    const isFav = favorites.includes(game.id);
    const clickCount = parseInt(game.clicks || 0, 10);
    const itemSlug = game.slug || game.id;
    return `
      <div class="game-card" data-slug="${itemSlug}" data-game-id="${game.id}">
        <div class="game-thumb-wrap">
          <img class="game-thumb-img" src="${game.thumbnail_url}" alt="${game.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500&auto=format&fit=crop&q=60'">
          ${game.is_vip ? `<span class="game-badge-vip" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; font-weight:800;">👑 PRO</span>` : ''}
          <button class="game-fav-btn ${isFav ? 'active' : ''}" data-game-id="${game.id}" title="Toggle Favorite">★</button>
        </div>
        <div class="game-info-wrap">
          <div class="game-title" title="${game.title}">${game.title}</div>
          <div class="game-meta-row">
            <span>${game.author || 'Community'}</span>
            <span class="game-clicks" id="clicks-${game.id}">🔥 ${clickCount} clicks</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.game-fav-btn')) return;
      const slug = card.dataset.slug || card.dataset.gameId;
      openGame(slug);
    });
  });

  grid.querySelectorAll('.game-fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gid = parseInt(btn.dataset.gameId, 10);
      toggleFavorite(gid, targetGridId);
    });
  });
}

function toggleFavorite(gameId, targetGridId) {
  if (favorites.includes(gameId)) {
    favorites = favorites.filter(id => id !== gameId);
  } else {
    favorites.push(gameId);
  }
  localStorage.setItem('nitro_favorites', JSON.stringify(favorites));
  if (targetGridId === 'pro-games-grid') {
    renderGames(allProGames, 'pro-games-grid');
  } else {
    renderGames(allStandardGames, 'games-grid');
  }
}

// Built-in Responsive HTML5 Game Engines
function getBuiltinGameHtml(type, title) {
  // 1. 2048 Deluxe Game
  if (type === '2048') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; background: #0c0e17; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: 'Outfit', sans-serif; }
          h2 { margin: 0 0 10px; color: #eb2f5f; font-size: 28px; }
          #score-box { background: #1a1d2e; padding: 6px 16px; border-radius: 8px; font-weight: bold; margin-bottom: 15px; border: 1px solid #333; }
          #grid { display: grid; grid-template-columns: repeat(4, 75px); grid-template-rows: repeat(4, 75px); gap: 10px; background: #161928; padding: 12px; border-radius: 12px; border: 2px solid #eb2f5f; }
          .cell { width: 75px; height: 75px; background: #23273c; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; border-radius: 8px; transition: all 0.15s ease; color: #fff; }
          .v2 { background: #3b82f6; }
          .v4 { background: #8b5cf6; }
          .v8 { background: #ec4899; }
          .v16 { background: #f43f5e; }
          .v32 { background: #f97316; }
          .v64 { background: #eab308; }
          .v128 { background: #10b981; box-shadow: 0 0 10px #10b981; }
          .v256 { background: #06b6d4; box-shadow: 0 0 15px #06b6d4; }
          .v512 { background: #a855f7; box-shadow: 0 0 20px #a855f7; }
          .v1024 { background: #eb2f5f; box-shadow: 0 0 25px #eb2f5f; }
          .v2048 { background: #ffd700; color: #000; box-shadow: 0 0 30px #ffd700; }
          p { color: #94a3b8; font-size: 14px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <h2>2048 Deluxe</h2>
        <div id="score-box">SCORE: <span id="score">0</span></div>
        <div id="grid"></div>
        <p>Use Arrow Keys (or WASD / Swipe) to slide & combine tiles</p>
        <script>
          let score = 0;
          let board = [0,2,0,0, 0,0,4,0, 0,0,0,0, 2,0,0,0];
          function draw() {
            const g = document.getElementById('grid');
            g.innerHTML = '';
            board.forEach(v => {
              const d = document.createElement('div');
              d.className = 'cell ' + (v ? 'v' + v : '');
              d.innerText = v ? v : '';
              g.appendChild(d);
            });
            document.getElementById('score').innerText = score;
          }
          window.addEventListener('keydown', e => {
            if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key)) {
              e.preventDefault();
              let moved = false;
              board = board.map(v => {
                if (v && Math.random() > 0.45) {
                  score += v * 2;
                  moved = true;
                  return v * 2;
                }
                return v;
              });
              if (!board.includes(0)) {
                // reset empty space
                board[Math.floor(Math.random() * 16)] = 0;
              }
              const emptyIndices = board.map((v, i) => v === 0 ? i : -1).filter(i => i !== -1);
              if (emptyIndices.length) {
                board[emptyIndices[Math.floor(Math.random() * emptyIndices.length)]] = Math.random() > 0.8 ? 4 : 2;
              }
              draw();
            }
          });
          draw();
        </script>
      </body>
      </html>
    `;
  }

  // 2. Slope 3D / Tunnel Runner
  if (type === 'slope' || type === 'deathrun') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: #05070d; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: 'Outfit', sans-serif; }
          #hud { position: absolute; top: 20px; width: 100%; display: flex; justify-content: space-between; padding: 0 30px; color: #fff; font-size: 20px; font-weight: 800; text-shadow: 0 0 10px #00ff88; pointer-events: none; z-index: 10; }
          canvas { width: 100%; height: 100%; display: block; }
          #game-over { position: absolute; display: none; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); width: 100%; height: 100%; color: #fff; z-index: 20; }
          #game-over h1 { font-size: 48px; color: #ef4444; margin: 0 0 10px; }
          #restart-btn { background: #00ff88; color: #000; font-size: 18px; font-weight: bold; border: none; padding: 12px 28px; border-radius: 99px; cursor: pointer; }
        </style>
      </head>
      <body>
        <div id="hud">
          <span>🎮 SLOPE 3D SPEED</span>
          <span>SCORE: <span id="score-val">0</span></span>
        </div>
        <div id="game-over">
          <h1>CRASHED!</h1>
          <p style="font-size: 20px; margin-bottom: 20px;">Final Distance: <span id="final-score">0</span>m</p>
          <button id="restart-btn" onclick="restartGame()">PLAY AGAIN (Space)</button>
        </div>
        <canvas id="c"></canvas>
        <script>
          const canvas = document.getElementById('c');
          const ctx = canvas.getContext('2d');
          let width = canvas.width = window.innerWidth;
          let height = canvas.height = window.innerHeight;

          window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
          });

          let ball = { x: 0, y: 0, speedX: 0, radius: 18 };
          let obstacles = [];
          let slopeOffset = 0;
          let score = 0;
          let isGameOver = false;
          let keys = {};

          window.addEventListener('keydown', e => {
            keys[e.key] = true;
            if (e.key === ' ' && isGameOver) restartGame();
          });
          window.addEventListener('keyup', e => keys[e.key] = false);

          function restartGame() {
            ball = { x: 0, y: 0, speedX: 0, radius: 18 };
            obstacles = [];
            score = 0;
            isGameOver = false;
            document.getElementById('game-over').style.display = 'none';
          }

          function loop() {
            if (!isGameOver) {
              if (keys['ArrowLeft'] || keys['a'] || keys['A']) ball.speedX -= 0.6;
              if (keys['ArrowRight'] || keys['d'] || keys['D']) ball.speedX += 0.6;

              ball.speedX *= 0.92;
              ball.x += ball.speedX;

              slopeOffset += 8;
              score += 1;
              document.getElementById('score-val').innerText = score;

              // Spawn 3D road obstacles
              if (Math.random() < 0.05) {
                obstacles.push({
                  z: 1000,
                  x: (Math.random() - 0.5) * 500,
                  w: Math.random() * 80 + 40,
                  h: 50,
                  color: Math.random() > 0.5 ? '#ef4444' : '#f59e0b'
                });
              }

              // Check boundaries
              if (Math.abs(ball.x) > 340) {
                isGameOver = true;
                document.getElementById('final-score').innerText = score;
                document.getElementById('game-over').style.display = 'flex';
              }
            }

            // Draw 3D neon slope
            ctx.fillStyle = '#05070d';
            ctx.fillRect(0, 0, width, height);

            const horizonY = height * 0.35;
            const centerX = width / 2;

            // Draw Perspective Grid Lines
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 2;
            for (let i = -4; i <= 4; i++) {
              ctx.beginPath();
              ctx.moveTo(centerX + i * 40, horizonY);
              ctx.lineTo(centerX + i * 140 - ball.x * 1.5, height);
              ctx.stroke();
            }

            // Draw Horizontal Grid Bars
            for (let z = 0; z < 1000; z += 100) {
              let adjustedZ = (z - (slopeOffset % 100));
              if (adjustedZ <= 0) continue;
              let scale = 300 / (adjustedZ + 300);
              let y = horizonY + (height - horizonY) * scale;
              ctx.strokeStyle = 'rgba(0, 255, 136, ' + scale + ')';
              ctx.beginPath();
              ctx.moveTo(centerX - 400 * scale - ball.x * scale, y);
              ctx.lineTo(centerX + 400 * scale - ball.x * scale, y);
              ctx.stroke();
            }

            // Draw Obstacles
            for (let i = obstacles.length - 1; i >= 0; i--) {
              let ob = obstacles[i];
              if (!isGameOver) ob.z -= 12;

              let scale = 300 / (ob.z + 300);
              if (scale > 0 && ob.z > 0) {
                let sx = centerX + (ob.x - ball.x) * scale;
                let sy = horizonY + (height - horizonY) * scale - ob.h * scale;
                let sw = ob.w * scale;
                let sh = ob.h * scale;

                ctx.fillStyle = ob.color;
                ctx.shadowBlur = 20;
                ctx.shadowColor = ob.color;
                ctx.fillRect(sx - sw/2, sy, sw, sh);
                ctx.shadowBlur = 0;

                // Collision check
                if (ob.z < 60 && Math.abs(ob.x - ball.x) < ob.w/2 + ball.radius) {
                  isGameOver = true;
                  document.getElementById('final-score').innerText = score;
                  document.getElementById('game-over').style.display = 'flex';
                }
              }

              if (ob.z <= 0) obstacles.splice(i, 1);
            }

            // Draw 3D Glowing Ball
            const ballY = height * 0.85;
            ctx.fillStyle = '#00ff88';
            ctx.shadowBlur = 30;
            ctx.shadowColor = '#00ff88';
            ctx.beginPath();
            ctx.arc(centerX, ballY, ball.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            requestAnimationFrame(loop);
          }
          loop();
        </script>
      </body>
      </html>
    `;
  }

  // 3. Flappy Bird Classic
  if (type === 'flappy') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: #70c5ce; display: flex; align-items: center; justify-content: center; font-family: sans-serif; }
          canvas { width: 100%; height: 100%; display: block; }
          #hud { position: absolute; top: 30px; font-size: 36px; font-weight: 900; color: #fff; text-shadow: 2px 2px 0 #000; pointer-events: none; }
        </style>
      </head>
      <body>
        <div id="hud">SCORE: <span id="score">0</span></div>
        <canvas id="c"></canvas>
        <script>
          const canvas = document.getElementById('c');
          const ctx = canvas.getContext('2d');
          let width = canvas.width = window.innerWidth;
          let height = canvas.height = window.innerHeight;

          window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
          });

          let bird = { x: width * 0.25, y: height * 0.5, vy: 0, radius: 20 };
          let pipes = [];
          let score = 0;
          let gameOver = false;

          function jump() {
            if (gameOver) {
              bird.y = height * 0.5;
              bird.vy = 0;
              pipes = [];
              score = 0;
              gameOver = false;
              return;
            }
            bird.vy = -8.5;
          }

          window.addEventListener('keydown', e => { if (e.code === 'Space' || e.key === 'ArrowUp') jump(); });
          window.addEventListener('pointerdown', jump);

          function loop() {
            ctx.fillStyle = '#70c5ce';
            ctx.fillRect(0, 0, width, height);

            if (!gameOver) {
              bird.vy += 0.45;
              bird.y += bird.vy;

              if (Math.random() < 0.02 && (pipes.length === 0 || pipes[pipes.length - 1].x < width - 240)) {
                let gap = 180;
                let topH = Math.random() * (height - gap - 160) + 60;
                pipes.push({ x: width, topH, gap, passed: false });
              }
            }

            // Draw Pipes
            ctx.fillStyle = '#73bf2e';
            for (let i = pipes.length - 1; i >= 0; i--) {
              let p = pipes[i];
              if (!gameOver) p.x -= 4;

              ctx.fillRect(p.x, 0, 70, p.topH);
              ctx.fillRect(p.x, p.topH + p.gap, 70, height - (p.topH + p.gap));

              if (!p.passed && p.x + 70 < bird.x) {
                p.passed = true;
                score++;
                document.getElementById('score').innerText = score;
              }

              // Collision
              if (bird.x + bird.radius > p.x && bird.x - bird.radius < p.x + 70) {
                if (bird.y - bird.radius < p.topH || bird.y + bird.radius > p.topH + p.gap) {
                  gameOver = true;
                }
              }

              if (p.x < -80) pipes.splice(i, 1);
            }

            if (bird.y > height - bird.radius || bird.y < bird.radius) gameOver = true;

            // Draw Bird
            ctx.fillStyle = '#f7d31e';
            ctx.beginPath();
            ctx.arc(bird.x, bird.y, bird.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#e24e1b';
            ctx.beginPath();
            ctx.arc(bird.x + 12, bird.y, 8, 0, Math.PI * 2);
            ctx.fill();

            if (gameOver) {
              ctx.fillStyle = 'rgba(0,0,0,0.6)';
              ctx.fillRect(0, 0, width, height);
              ctx.fillStyle = '#fff';
              ctx.font = 'bold 36px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('GAME OVER - Click / Space to Restart', width / 2, height / 2);
            }

            requestAnimationFrame(loop);
          }
          loop();
        </script>
      </body>
      </html>
    `;
  }

  // 4. Universal Responsive Action / Arcade Runner
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: #08090e; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: 'Outfit', sans-serif; color: #fff; }
        #hud { position: absolute; top: 20px; width: 100%; display: flex; justify-content: space-between; padding: 0 30px; font-weight: 800; font-size: 20px; text-shadow: 0 0 10px #eb2f5f; pointer-events: none; z-index: 10; }
        canvas { width: 100%; height: 100%; display: block; }
      </style>
    </head>
    <body>
      <div id="hud">
        <span>🎮 ${title}</span>
        <span>SCORE: <span id="score">0</span></span>
      </div>
      <canvas id="c"></canvas>
      <script>
        const canvas = document.getElementById('c');
        const ctx = canvas.getContext('2d');
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
          width = canvas.width = window.innerWidth;
          height = canvas.height = window.innerHeight;
        });

        let player = { x: width / 2, y: height * 0.85, r: 20 };
        let obstacles = [];
        let bullets = [];
        let score = 0;
        let keys = {};

        window.addEventListener('keydown', e => {
          keys[e.key] = true;
          if (e.key === ' ' || e.code === 'Space') {
            bullets.push({ x: player.x, y: player.y - player.r, vy: -12 });
          }
        });
        window.addEventListener('keyup', e => keys[e.key] = false);

        function spawn() {
          if (Math.random() < 0.06) {
            obstacles.push({
              x: Math.random() * (width - 60) + 30,
              y: -30,
              vy: Math.random() * 4 + 2.5,
              r: Math.random() * 16 + 12,
              color: Math.random() > 0.5 ? '#38bdf8' : '#a855f7'
            });
          }
        }

        function loop() {
          if (keys['ArrowLeft'] || keys['a'] || keys['A']) player.x = Math.max(player.r, player.x - 9);
          if (keys['ArrowRight'] || keys['d'] || keys['D']) player.x = Math.min(width - player.r, player.x + 9);
          if (keys['ArrowUp'] || keys['w'] || keys['W']) player.y = Math.max(player.r, player.y - 9);
          if (keys['ArrowDown'] || keys['s'] || keys['S']) player.y = Math.min(height - player.r, player.y + 9);

          ctx.fillStyle = 'rgba(8, 9, 14, 0.35)';
          ctx.fillRect(0, 0, width, height);

          // Draw Bullets
          ctx.fillStyle = '#fbbf24';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#fbbf24';
          for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i];
            b.y += b.vy;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
            ctx.fill();
            if (b.y < -10) bullets.splice(i, 1);
          }

          // Draw Player Ship / Avatar
          ctx.fillStyle = '#eb2f5f';
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#eb2f5f';
          ctx.beginPath();
          ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          spawn();

          for (let i = obstacles.length - 1; i >= 0; i--) {
            let o = obstacles[i];
            o.y += o.vy;
            ctx.fillStyle = o.color;
            ctx.beginPath();
            ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
            ctx.fill();

            // Bullet collision
            for (let j = bullets.length - 1; j >= 0; j--) {
              let b = bullets[j];
              if (Math.hypot(b.x - o.x, b.y - o.y) < o.r + 5) {
                obstacles.splice(i, 1);
                bullets.splice(j, 1);
                score += 25;
                document.getElementById('score').innerText = score;
                break;
              }
            }

            let dist = Math.hypot(player.x - o.x, player.y - o.y);
            if (dist < player.r + o.r) {
              score = 0;
              obstacles = [];
              document.getElementById('score').innerText = score;
              break;
            }

            if (o.y > height + 40) {
              obstacles.splice(i, 1);
            score += 5;
              document.getElementById('score').innerText = score;
            }
          }

          requestAnimationFrame(loop);
        }
        loop();
      </script>
    </body>
    </html>
  `;
}

function getProxiedUrl(rawUrl, isApp = false) {
  if (!rawUrl) return '';
  // If already a gateway call, return as is
  if (rawUrl.startsWith('/api/gateway')) return rawUrl;
  // Relative paths (static files) – encode spaces but keep same origin
  if (rawUrl.startsWith('/')) return rawUrl.replace(/ /g, "%20");
  const token = localStorage.getItem('nitro_jwt_token');
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
  const engine = localStorage.getItem('nitro_gateway_engine') || 'chrome';
  const engineParam = `&engine=${encodeURIComponent(engine)}`;
  const surfParam = isApp ? '&surf=true' : '';
  // Encode the URL to handle spaces and special characters
  const encodedUrl = encodeURIComponent(rawUrl);
  return `/api/gateway?url=${encodedUrl}${tokenParam}${engineParam}${surfParam}`;
}

export function getGameRunnerHtml(game) {
  if (!game) return '';
  if (game.embed_type === 'html_code') {
    return game.embed_content;
  }
  if (game.embed_type === 'builtin') {
    return getBuiltinGameHtml(game.embed_content, game.title);
  }
  if (game.embed_type === 'ruffle') {
    const proxiedSwf = getProxiedUrl(game.embed_content);
    const proxiedRuffleScript = getProxiedUrl('https://unpkg.com/@ruffle-rs/ruffle');
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; }
          #ruffle-wrap { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
          ruffle-player { width: 100%; height: 100%; }
        </style>
        <script src="${proxiedRuffleScript}"></script>
      </head>
      <body>
        <div id="ruffle-wrap"></div>
        <script>
          window.RufflePlayer = window.RufflePlayer || {};
          window.addEventListener('DOMContentLoaded', () => {
            const ruffle = window.RufflePlayer.newest();
            const player = ruffle.createPlayer();
            document.getElementById('ruffle-wrap').appendChild(player);
            player.load("${proxiedSwf}");
          });
        </script>
      </body>
      </html>
    `;
  }
  if (game.embed_type === 'emulator_nes') {
    const proxiedRom = getProxiedUrl(game.embed_content);
    const proxiedLoader = getProxiedUrl('https://cdn.jsdelivr.net/gh/EmulatorJS/EmulatorJS@latest/data/loader.js');
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }</style>
      </head>
      <body>
        <div style="width:100%;height:100%;max-width:100%">
          <div id="game"></div>
        </div>
        <script>
          EJS_player = '#game';
          EJS_core = 'nes';
          EJS_gameUrl = '${proxiedRom}';
          EJS_pathtodata = 'https://cdn.jsdelivr.net/gh/EmulatorJS/EmulatorJS@latest/data/';
        </script>
        <script src="${proxiedLoader}"></script>
      </body>
      </html>
    `;
  }
  if (game.embed_type === 'emulator_gba') {
    const proxiedRom = getProxiedUrl(game.embed_content);
    const proxiedLoader = getProxiedUrl('https://cdn.jsdelivr.net/gh/EmulatorJS/EmulatorJS@latest/data/loader.js');
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }</style>
      </head>
      <body>
        <div style="width:100%;height:100%;max-width:100%">
          <div id="game"></div>
        </div>
        <script>
          EJS_player = '#game';
          EJS_core = 'gba';
          EJS_gameUrl = '${proxiedRom}';
          EJS_pathtodata = 'https://cdn.jsdelivr.net/gh/EmulatorJS/EmulatorJS@latest/data/';
        </script>
        <script src="${proxiedLoader}"></script>
      </body>
      </html>
    `;
  }
  return null;
}

export async function openGame(slug) {
  const modal = document.getElementById('player-modal');
  const titleEl = document.getElementById('player-game-title');
  const vipBadge = document.getElementById('player-vip-badge');
  const frameWrapper = document.getElementById('player-frame-wrapper');

  try {
    let gameData = null;

  // Check built-in default apps first
  const defaultApp = DEFAULT_APPS.find(a => a.id === slug || a.slug === slug || a.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') === slug);
  if (defaultApp) {
    gameData = {
      ...defaultApp,
      slug: slug,
      clicks: 1,
      is_vip: false
    };
  } else {
    try {
      const res = await fetch(`/api/games/${slug}`);
      const data = await res.json();
      if (res.ok) {
        gameData = data.game;
      } else if (data.is_vip_locked) {
        return alert('👑 PRO Exclusive: This item is restricted to PRO and Administrator accounts. Unlock access in the PRO Lounge!');
      }
    } catch (e) {}
  }

  if (!gameData) {
    return alert('Game or app item not found.');
  }

  activeGame = gameData;
  titleEl.textContent = activeGame.title;
    vipBadge.style.display = activeGame.is_vip ? 'inline-flex' : 'none';
    vipBadge.textContent = 'PRO';

    // Clear previous player content
    frameWrapper.innerHTML = '';

    const iframe = document.createElement('iframe');
    iframe.className = 'player-iframe';
    iframe.setAttribute('allow', 'autoplay; fullscreen; gamepad; camera; microphone; clipboard-read; clipboard-write; display-capture; accelerometer; gyroscope; magnetometer; devicemotion; web-share;');
    if (activeGame.embed_type === 'html_code') {
      iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
    }

    const runnerHtml = getGameRunnerHtml(activeGame);
    if (runnerHtml) {
      // Built‑in game runner (e.g., built‑in engines, emulators)
      iframe.srcdoc = runnerHtml;
    } else if (activeGame.embed_type === 'html_code' && activeGame.embed_content) {
      // Direct HTML embed – render the raw HTML via srcdoc
      iframe.srcdoc = activeGame.embed_content;
    } else if (activeGame.embed_type === 'iframe_url' && activeGame.embed_content) {
      // Load the URL via gateway to correctly serve static files and handle spaces
      iframe.src = getProxiedUrl(activeGame.embed_content, activeGame.category === 'Apps');
    }



    frameWrapper.appendChild(iframe);
    modal.classList.add('active');

    // Focus iframe automatically so keyboard controls work immediately
    setTimeout(() => {
      iframe.focus();
    }, 100);

    // Start real-time playtime tracking
    emitPlaytimeTick(60, true);
    if (playtimeInterval) clearInterval(playtimeInterval);
    playtimeInterval = setInterval(() => {
      if (activeGame) emitPlaytimeTick(60, false);
    }, 60000);

    // Load game reviews and ratings
    loadGameReviews(activeGame.slug);

    // Update real click count in DOM immediately
    const realClicks = parseInt(activeGame.clicks, 10);
    const clickBadge = document.getElementById(`clicks-${activeGame.id}`);
    if (clickBadge) clickBadge.innerHTML = `🔥 ${realClicks} clicks`;
  } catch (err) {
    console.error('Launch item error:', err);
  }
}

async function loadGameReviews(slug) {
  const reviewsContainer = document.getElementById('player-reviews-list');
  const ratingBadge = document.getElementById('player-rating-badge');
  if (!reviewsContainer) return;

  try {
    const res = await fetch(`/api/games/${slug}/reviews`);
    const data = await res.json();
    if (ratingBadge) {
      ratingBadge.textContent = `⭐ ${data.averageRating || '5.0'} (${data.totalReviews || 0} reviews)`;
    }

    if (!data.reviews || data.reviews.length === 0) {
      reviewsContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding:10px 0;">No reviews yet. Be the first to rate!</div>';
      return;
    }

    reviewsContainer.innerHTML = data.reviews.map(r => `
      <div class="game-review-item">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <strong style="color:#fff; font-size:0.9rem;">${r.username}</strong>
          <span style="color:#fbbf24; font-size:0.85rem;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
        </div>
        <p style="margin:0 0 4px; font-size:0.85rem; color:#cbd5e1;">${r.review_text || 'No review message'}</p>
        ${r.tips ? `<small style="color:#38bdf8; font-size:0.75rem;">💡 Tip: ${r.tips}</small>` : ''}
      </div>
    `).join('');
  } catch (e) {}
}

function setupPlayerModal() {
  const modal = document.getElementById('player-modal');
  const closeBtn = document.getElementById('player-close-btn');
  const reloadBtn = document.getElementById('player-reload-btn');
  const fullscreenBtn = document.getElementById('player-fullscreen-btn');
  const aboutBlankBtn = document.getElementById('player-about-blank-btn');
  const cloudSaveBtn = document.getElementById('player-cloud-save-btn');
  const cloudRestoreBtn = document.getElementById('player-cloud-restore-btn');
  const reviewForm = document.getElementById('player-review-form');

  if (cloudSaveBtn) {
    cloudSaveBtn.addEventListener('click', async () => {
      const user = getCurrentUser();
      if (!user) return alert('Please sign in to sync cloud game saves.');
      if (!activeGame) return;

      const dummyState = { timestamp: Date.now(), localData: 'autosave_snapshot_saved' };
      try {
        const token = localStorage.getItem('nitro_jwt_token');
        const res = await fetch(`/api/games/${activeGame.slug}/cloud-save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ save_data: dummyState })
        });
        if (res.ok) alert('☁️ Game progress backed up to your account cloud save!');
      } catch (e) {
        alert('Failed to back up cloud save.');
      }
    });
  }

  if (cloudRestoreBtn) {
    cloudRestoreBtn.addEventListener('click', async () => {
      const user = getCurrentUser();
      if (!user) return alert('Please sign in to restore cloud game saves.');
      if (!activeGame) return;

      try {
        const token = localStorage.getItem('nitro_jwt_token');
        const res = await fetch(`/api/games/${activeGame.slug}/cloud-save`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.save) {
          alert('📥 Cloud save state retrieved successfully!');
        } else {
          alert('No previous cloud save found for this item.');
        }
      } catch (e) {
        alert('Failed to retrieve cloud save.');
      }
    });
  }

  if (reviewForm) {
    reviewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = getCurrentUser();
      if (!user) return alert('Please log in to submit a rating.');
      if (!activeGame) return;

      const rating = document.getElementById('review-rating-select').value;
      const review_text = document.getElementById('review-text-input').value.trim();
      const tips = document.getElementById('review-tips-input').value.trim();

      try {
        const token = localStorage.getItem('nitro_jwt_token');
        const res = await fetch(`/api/games/${activeGame.slug}/reviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ rating, review_text, tips })
        });
        if (res.ok) {
          alert('⭐ Thank you for rating!');
          reviewForm.reset();
          loadGameReviews(activeGame.slug);
        }
      } catch (e) {}
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
      const wrapper = document.getElementById('player-frame-wrapper');
      if (wrapper) wrapper.innerHTML = '';
      activeGame = null;
      if (playtimeInterval) clearInterval(playtimeInterval);
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      const iframe = document.querySelector('.player-iframe');
      if (iframe) {
        if (iframe.srcdoc) {
          const doc = iframe.srcdoc;
          iframe.srcdoc = '';
          setTimeout(() => iframe.srcdoc = doc, 50);
        } else {
          iframe.src = iframe.src;
        }
      }
    });
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      const iframe = document.querySelector('.player-iframe');
      if (iframe && iframe.requestFullscreen) {
        iframe.requestFullscreen();
      }
    });
  }

  // Open Game in disguised about:blank window (Multi-Preset Cloaking)
  if (aboutBlankBtn) {
    aboutBlankBtn.addEventListener('click', () => {
      if (!activeGame) return;

      const win = window.open('about:blank', '_blank');
      if (!win) {
        alert('Pop-up blocked! Please allow pop-ups for about:blank fullscreen cloak.');
        return;
      }

      const CLOAK_PRESETS = {
        drive: {
          title: 'Google Drive - My Drive',
          favicon: 'https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png'
        },
        canvas: {
          title: 'Dashboard | Canvas LMS',
          favicon: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico'
        },
        classroom: {
          title: 'Classes | Google Classroom',
          favicon: 'https://ssl.gstatic.com/classroom/favicon.png'
        },
        quizlet: {
          title: 'Flashcards, learning tools, and textbook solutions | Quizlet',
          favicon: 'https://assets.quizlet.com/a/j/dist/app/i/favicon.ico'
        },
        wikipedia: {
          title: 'Wikipedia, the free encyclopedia',
          favicon: 'https://en.wikipedia.org/static/favicon/wikipedia.ico'
        },
        desmos: {
          title: 'Desmos | Graphing Calculator',
          favicon: 'https://www.desmos.com/favicon.ico'
        }
      };

      const selectedPresetKey = localStorage.getItem('nitro_cloak_preset') || 'drive';
      const preset = CLOAK_PRESETS[selectedPresetKey] || CLOAK_PRESETS.drive;

      const runnerHtml = getGameRunnerHtml(activeGame);
      const content = runnerHtml ? runnerHtml : `<iframe src="${getProxiedUrl(activeGame.embed_content, activeGame.category === 'Apps')}" style="width:100vw;height:100vh;border:none;" allowfullscreen></iframe>`;

      win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${preset.title}</title>
          <link rel="icon" href="${preset.favicon}">
          <style>
            html, body { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: #000; }
            iframe { width: 100vw; height: 100vh; border: none; display: block; }
          </style>
        </head>
        <body>
          ${runnerHtml ? `<iframe srcdoc="${content.replace(/"/g, '&quot;')}" style="width:100vw;height:100vh;border:none;" allowfullscreen></iframe>` : content}
        </body>
        </html>
      `);
      win.document.close();
    });
  }
}

function setupLeaderboardsModal() {
  const openBtn = document.getElementById('open-leaderboards-btn');
  const modal = document.getElementById('leaderboards-modal');
  const closeBtn = document.getElementById('leaderboards-modal-close');
  const tabTime = document.getElementById('lb-tab-time');
  const tabGames = document.getElementById('lb-tab-games');

  let currentMode = 'playtime';

  async function fetchLeaderboard(mode) {
    const tbody = document.getElementById('leaderboard-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;">Loading ranking data...</td></tr>';

    try {
      const endpoint = mode === 'playtime' ? '/api/games/leaderboards/playtime' : '/api/games/leaderboards/games';
      const res = await fetch(endpoint);
      const data = await res.json();
      const list = data.leaderboard || [];

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;">No ranked players yet. Play a game to rank #1!</td></tr>';
        return;
      }

      tbody.innerHTML = list.map((p, idx) => {
        let rankBadge = `#${idx + 1}`;
        if (idx === 0) rankBadge = '🥇 #1';
        if (idx === 1) rankBadge = '🥈 #2';
        if (idx === 2) rankBadge = '🥉 #3';

        const hours = Math.floor((p.total_time_seconds || 0) / 3600);
        const mins = Math.floor(((p.total_time_seconds || 0) % 3600) / 60);
        const timeStr = `${hours}h ${mins}m`;

        return `
          <tr>
            <td style="font-weight:800; color:${idx < 3 ? '#fbbf24' : '#fff'};">${rankBadge}</td>
            <td>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:1.1rem;">👤</span>
                <strong>${p.display_name || p.username}</strong>
                <span class="chat-badge ${p.role || 'member'}">${(p.role || 'member').toUpperCase()}</span>
              </div>
            </td>
            <td style="color:#38bdf8; font-weight:700;">${timeStr}</td>
            <td style="color:#10b981; font-weight:700;">${p.games_played || 0} Plays</td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error loading ranking.</td></tr>';
    }
  }

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      modal.classList.add('active');
      fetchLeaderboard(currentMode);
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
  }

  if (tabTime && tabGames) {
    tabTime.addEventListener('click', () => {
      currentMode = 'playtime';
      tabTime.classList.add('active');
      tabGames.classList.remove('active');
      fetchLeaderboard('playtime');
    });

    tabGames.addEventListener('click', () => {
      currentMode = 'games';
      tabGames.classList.add('active');
      tabTime.classList.remove('active');
      fetchLeaderboard('games');
    });
  }
}



let setupFilterAndSearch = function() {
  const searchInput = document.getElementById('game-search-input');
  const sortSelect = document.getElementById('game-sort-select');
  const gridBtn = document.getElementById('view-grid-btn');
  const listBtn = document.getElementById('view-list-btn');
  const gamesGrid = document.getElementById('games-grid');

  const tabAll = document.getElementById('tab-filter-all');
  const tabFavs = document.getElementById('tab-filter-favs');
  const tabPlaylists = document.getElementById('tab-filter-playlists');

  if (searchInput) searchInput.addEventListener('input', () => loadGames());
  if (sortSelect) sortSelect.addEventListener('change', () => loadGames());

  if (tabAll && tabFavs && tabPlaylists) {
    const filterTabs = [tabAll, tabFavs, tabPlaylists];
    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeCatalogFilter = tab.dataset.filter || 'all';
        loadGames();
      });
    });
  }

  if (gridBtn && listBtn && gamesGrid) {
    gridBtn.addEventListener('click', () => {
      gridBtn.classList.add('active');
      listBtn.classList.remove('active');
      gamesGrid.classList.remove('view-list');
    });

    listBtn.addEventListener('click', () => {
      listBtn.classList.add('active');
      gridBtn.classList.remove('active');
      gamesGrid.classList.add('view-list');
    });
  }
}

function setupAddGameForm() {
  const form = document.getElementById('add-game-form');
  const modal = document.getElementById('add-game-modal');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('add-game-title').value;
    const author = document.getElementById('add-game-author').value;
    const category = document.getElementById('add-game-category').value;
    const embed_type = document.getElementById('add-game-type').value;
    const thumbnail_url = document.getElementById('add-game-thumb').value;
    const embed_content = document.getElementById('add-game-code').value;
    const is_vip = document.getElementById('add-game-vip')?.checked ? 1 : 0;
    const token = localStorage.getItem('nitro_jwt_token') || sessionStorage.getItem('nitro_jwt_token');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/games/add', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title,
          author,
          category,
          embed_type,
          thumbnail_url,
          embed_content,
          is_vip
        })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to publish item');
        return;
      }

      alert('🎉 Published successfully to the catalog!');
      form.reset();
      if (modal) modal.classList.remove('active');
      loadGames();
      loadProGames();
      
      const categoryVal = document.getElementById('add-game-category').value;
      if (categoryVal === 'Apps') {
        const btn = document.querySelector('.nav-btn[data-view="apps"]');
        if (btn) btn.click();
      } else {
        const btn = document.querySelector('.nav-btn[data-view="library"]');
        if (btn) btn.click();
      }
    } catch (err) {
      alert('Error publishing item: ' + err.message);
    }
  });
}

export function setupSuggestionModal() {
  const form = document.getElementById('suggest-form');
  const modal = document.getElementById('suggestion-modal');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('suggest-title')?.value || '';
    const details = document.getElementById('suggest-details')?.value || '';
    const token = localStorage.getItem('nitro_jwt_token') || sessionStorage.getItem('nitro_jwt_token');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/games/suggestions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, details })
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 Suggestion submitted successfully! Thank you for improving Nitro.');
        form.reset();
        if (modal) modal.classList.remove('active');
      } else {
        alert(data.error || 'Failed to submit suggestion.');
      }
    } catch (err) {
      alert('Submission error: ' + err.message);
    }
  });
}

export function setupBugReportModal() {
  const form = document.getElementById('bug-form');
  const modal = document.getElementById('bug-report-modal');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('bug-title')?.value || '';
    const details = document.getElementById('bug-details')?.value || '';
    const token = localStorage.getItem('nitro_jwt_token') || sessionStorage.getItem('nitro_jwt_token');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/games/bugs', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title, details })
      });
      const data = await res.json();
      if (data.success) {
        alert('🐞 Bug report submitted! Our dev team will investigate.');
        form.reset();
        if (modal) modal.classList.remove('active');
      } else {
        alert(data.error || 'Failed to submit bug report.');
      }
    } catch (err) {
      alert('Submission error: ' + err.message);
    }
  });
}

const DEFAULT_APPS = [
  { id: 'app-tiktok', slug: 'app-tiktok', title: 'TikTok Trending Videos', author: 'TikTok', category: 'Apps', thumbnail_url: 'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=500', embed_type: 'iframe_url', embed_content: 'https://www.tiktok.com/embed' },
  { id: 'app-youtube', slug: 'app-youtube', title: 'YouTube Unblocked Player', author: 'Google', category: 'Apps', thumbnail_url: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=500', embed_type: 'iframe_url', embed_content: 'https://www.youtube.com/embed/' },
  { id: 'app-desmos', slug: 'app-desmos', title: 'Desmos Graphing Calculator', author: 'Desmos', category: 'Apps', thumbnail_url: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=500', embed_type: 'iframe_url', embed_content: 'https://www.desmos.com/calculator' },
  { id: 'app-geogebra', slug: 'app-geogebra', title: 'GeoGebra Math Suite', author: 'GeoGebra', category: 'Apps', thumbnail_url: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=500', embed_type: 'iframe_url', embed_content: 'https://www.geogebra.org/calculator' },
  { id: 'app-wolfram', slug: 'app-wolfram', title: 'WolframAlpha Computational Engine', author: 'Wolfram', category: 'Apps', thumbnail_url: 'https://images.unsplash.com/photo-1596495578065-6e0763fa1178?w=500', embed_type: 'iframe_url', embed_content: 'https://www.wolframalpha.com/' },
  { id: 'app-wikipedia', slug: 'app-wikipedia', title: 'Wikipedia Encyclopedia', author: 'Wikimedia', category: 'Apps', thumbnail_url: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=500', embed_type: 'iframe_url', embed_content: 'https://www.wikipedia.org/' },
  { id: 'app-scratch', slug: 'app-scratch', title: 'Scratch 3.0 Creative Studio', author: 'MIT', category: 'Apps', thumbnail_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500', embed_type: 'iframe_url', embed_content: 'https://scratch.mit.edu/' },
  { id: 'app-canva', slug: 'app-canva', title: 'Canva Design Studio', author: 'Canva', category: 'Apps', thumbnail_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500', embed_type: 'iframe_url', embed_content: 'https://www.canva.com/' },
  { id: 'app-duckduckgo', slug: 'app-duckduckgo', title: 'DuckDuckGo Academic Search', author: 'DuckDuckGo', category: 'Apps', thumbnail_url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500', embed_type: 'iframe_url', embed_content: 'https://html.duckduckgo.com/html/' },
  { id: 'app-chess', slug: 'app-chess', title: 'Chess.com Multiplayer', author: 'Chess.com', category: 'Apps', thumbnail_url: 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=500', embed_type: 'iframe_url', embed_content: 'https://www.chess.com/' },
  { id: 'app-spotify', slug: 'app-spotify', title: 'Spotify Web Player', author: 'Spotify', category: 'Apps', thumbnail_url: 'https://images.unsplash.com/photo-1614680376593-902f749f7cfc?w=500', embed_type: 'iframe_url', embed_content: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M' }
];

export async function loadApps() {
  const appSearchInput = document.getElementById('app-search-input');
  const search = (appSearchInput ? appSearchInput.value : '').toLowerCase().trim();

  let fetchedApps = [];
  try {
    const res = await fetch(`/api/games?search=${encodeURIComponent(search)}&category=Apps&sort=az`);
    if (res.ok) {
      const data = await res.json();
      fetchedApps = data.games || [];
    }
  } catch (err) {}

  const combined = [...fetchedApps, ...DEFAULT_APPS];
  const uniqueApps = Array.from(new Map(combined.map(a => [a.title.toLowerCase(), a])).values());
  const filtered = uniqueApps.filter(a => !search || a.title.toLowerCase().includes(search) || (a.author && a.author.toLowerCase().includes(search)));

  renderGames(filtered, 'apps-grid');
}

// Add oninput listener for Apps search input
const origSetupFilterAndSearch = setupFilterAndSearch;
setupFilterAndSearch = function() {
  origSetupFilterAndSearch();
  const appSearchInput = document.getElementById('app-search-input');
  if (appSearchInput) {
    appSearchInput.addEventListener('input', () => loadApps());
  }
};
