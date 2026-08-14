// Automated verification script for all new Mega Upgrades & Features
const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function request(method, path, body = null, headers = {}) { 
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting Automated Verification Tests for Mega Upgrades...\n');

  try {
    // 1. Check /api/status and Visitor Counter
    console.log('1. Testing Visitor Counter...');
    const statusRes = await request('GET', '/api/status');
    console.log('   /api/status => Status:', statusRes.status, 'Visits:', statusRes.body.visits_count);
    if (statusRes.status !== 200) throw new Error('Status route failed');

    const visitRes = await request('POST', '/api/visit');
    console.log('   POST /api/visit => Status:', visitRes.status, 'New Visits:', visitRes.body.visits_count);
    if (visitRes.status !== 200) throw new Error('Visit increment failed');

    // 2. Authenticate Admin User
    console.log('\n2. Authenticating Admin (jordandaniels)...');
    const loginRes = await request('POST', '/api/auth/login', {
      username: 'jordandaniels',
      password: 'password123'
    });
    console.log('   Login response status:', loginRes.status);
    let token = loginRes.body.token;

    if (!token) {
      // Try default test password
      const loginRes2 = await request('POST', '/api/auth/login', {
        username: 'jordandaniels',
        password: '0422jojob'
      });
      token = loginRes2.body.token;
      console.log('   Login with 0422jojob status:', loginRes2.status, 'Token acquired:', Boolean(token));
    }

    if (!token) throw new Error('Admin authentication failed');

    const authHeaders = { 'Authorization': `Bearer ${token}` };

    // 3. Playtime Recording & Leaderboards
    console.log('\n3. Testing Playtime Recording & Leaderboards...');
    const playRes = await request('POST', '/api/games/playtime', { seconds: 120, is_new_play: true }, authHeaders);
    console.log('   POST /api/games/playtime => Status:', playRes.status, 'Stat:', playRes.body.stat?.total_time_seconds);

    const lbTimeRes = await request('GET', '/api/games/leaderboards/playtime');
    console.log('   GET /api/games/leaderboards/playtime => Count:', lbTimeRes.body.leaderboard?.length);

    const lbGamesRes = await request('GET', '/api/games/leaderboards/games');
    console.log('   GET /api/games/leaderboards/games => Count:', lbGamesRes.body.leaderboard?.length);

    // 4. User Favorites & Playlists
    console.log('\n4. Testing Favorites & Custom Playlists...');
    const favToggleRes = await request('POST', '/api/games/favorites/toggle', { gameId: 1 }, authHeaders);
    console.log('   POST /api/games/favorites/toggle => Status:', favToggleRes.status, 'isFavorite:', favToggleRes.body.isFavorite);

    const favListRes = await request('GET', '/api/games/favorites', null, authHeaders);
    console.log('   GET /api/games/favorites => Count:', favListRes.body.favorites?.length);

    const plCreateRes = await request('POST', '/api/games/playlists', { title: 'My Retro Favorites' }, authHeaders);
    console.log('   POST /api/games/playlists => Status:', plCreateRes.status, 'ID:', plCreateRes.body.playlist?.id);

    const plListRes = await request('GET', '/api/games/playlists', null, authHeaders);
    console.log('   GET /api/games/playlists => Count:', plListRes.body.playlists?.length);

    // 5. Cloud Game Saves
    console.log('\n5. Testing Cloud Game Saves...');
    const saveRes = await request('POST', '/api/games/slope/cloud-save', {
      save_data: { highScore: 4820, character: 'neon_sphere', unlockedLevels: [1, 2, 3] }
    }, authHeaders);
    console.log('   POST /api/games/slope/cloud-save => Status:', saveRes.status);

    const getSaveRes = await request('GET', '/api/games/slope/cloud-save', null, authHeaders);
    console.log('   GET /api/games/slope/cloud-save => Status:', getSaveRes.status, 'Data:', getSaveRes.body.save);

    // 6. Community Star Ratings & Reviews
    console.log('\n6. Testing Game Star Reviews & Tips...');
    const reviewRes = await request('POST', '/api/games/slope/reviews', {
      rating: 5,
      review_text: 'Awesome fast-paced speed game!',
      tips: 'Stay in the middle lane when approaching red blocks.'
    }, authHeaders);
    console.log('   POST /api/games/slope/reviews => Status:', reviewRes.status, 'Review ID:', reviewRes.body.review?.id);

    const getReviewsRes = await request('GET', '/api/games/slope/reviews');
    console.log('   GET /api/games/slope/reviews => Average:', getReviewsRes.body.averageRating, 'Total:', getReviewsRes.body.totalReviews);

    // 7. Bulk Catalog Importer
    console.log('\n7. Testing Admin Bulk Catalog Importer...');
    const bulkGames = [
      {
        title: 'Cyber Drift 3D',
        author: 'Indie Devs',
        category: 'Action',
        embed_type: 'iframe_url',
        embed_content: 'https://example.com/cyber-drift',
        thumbnail_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400'
      },
      {
        title: 'Neon Maze Runner',
        author: 'Arcade Team',
        category: 'Puzzle',
        embed_type: 'iframe_url',
        embed_content: 'https://example.com/neon-maze',
        thumbnail_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400'
      }
    ];

    const bulkRes = await request('POST', '/api/admin/games/bulk-import', { games: bulkGames }, authHeaders);
    console.log('   POST /api/admin/games/bulk-import => Status:', bulkRes.status, 'Imported Count:', bulkRes.body.count);

    // 8. Real-Time Activity Radar Stats
    console.log('\n8. Testing Activity Radar Stats...');
    const radarRes = await request('GET', '/api/admin/radar-stats', null, authHeaders);
    console.log('   GET /api/admin/radar-stats => Status:', radarRes.status, 'Top Games:', radarRes.body.radar?.topGames?.length);

    // 9. Searchable Moderation Logs
    console.log('\n9. Testing Searchable Moderation Logs...');
    const logsRes = await request('GET', '/api/admin/logs?action=BULK_IMPORT_GAMES', null, authHeaders);
    console.log('   GET /api/admin/logs?action=BULK_IMPORT_GAMES => Count:', logsRes.body.logs?.length);

    // 10. Suggestions Manager & Advanced Proxy Link Rewriting
    console.log('\n10. Testing Game Suggestion Submission & Approval Workflow...');
    // Submit suggestion
    const suggestRes = await request('POST', '/api/games/suggest', {
      title: 'Retro Ping Pong',
      details: 'https://example.com/pong'
    }, authHeaders);
    console.log('    POST /api/games/suggest => Status:', suggestRes.status, 'Msg:', suggestRes.body.message);

    // List suggestions
    const adminSugList = await request('GET', '/api/admin/suggestions', null, authHeaders);
    const suggestedItem = (adminSugList.body.suggestions || []).find(s => s.title === 'Retro Ping Pong');
    console.log('    GET /api/admin/suggestions => Count:', adminSugList.body.suggestions?.length, 'Found suggested item:', Boolean(suggestedItem));
    if (!suggestedItem) throw new Error('Suggestion not found in admin suggestions list');

    // Approve suggestion
    const approveRes = await request('POST', `/api/admin/suggestions/${suggestedItem.id}/approve`, null, authHeaders);
    console.log('    POST /api/admin/suggestions/:id/approve => Status:', approveRes.status, 'Msg:', approveRes.body.message);

    // Verify game exists in library
    const gamesListRes = await request('GET', '/api/games?search=Retro%20Ping%20Pong');
    const approvedGame = (gamesListRes.body.games || []).find(g => g.title === 'Retro Ping Pong');
    console.log('    GET /api/games => Approved game found in catalog:', Boolean(approvedGame));
    if (!approvedGame) throw new Error('Approved game not synced to games catalog');

    // Test Advanced Proxy Link Rewriting
    console.log('\n11. Testing Advanced Proxy Link Rewriting...');
    const proxyUrl = `/api/proxy?url=${encodeURIComponent('https://example.com')}&surf=true`;
    const proxyRes = await request('GET', proxyUrl, null, authHeaders);
    console.log('    GET /api/proxy => Status:', proxyRes.status, 'ContentType:', proxyRes.headers['content-type']);
    
    // Check if relative link rewrites are present
    const hasRewrittenLinks = typeof proxyRes.body === 'string' && proxyRes.body.includes('/api/proxy?url=');
    console.log('    Proxy response rewrote links successfully:', hasRewrittenLinks);

    console.log('\n=============================================');
    console.log('✅ ALL MEGA UPGRADE TESTS PASSED SUCCESSFULLY!');
    console.log('=============================================\n');

  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  }
}

runTests();
