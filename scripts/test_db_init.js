const db = require('../server/db');

async function test() {
  console.log('🧪 Testing db.initPostgres()...');
  try {
    await db.initPostgres();
    console.log('✅ DB initialized successfully with clean schema!');
    const usersCount = await db.pool.query('SELECT COUNT(*) FROM users');
    const gamesCount = await db.pool.query('SELECT COUNT(*) FROM games');
    const playlistsCount = await db.pool.query('SELECT COUNT(*) FROM user_playlists');
    console.log(`  -> Live users: ${usersCount.rows[0].count}`);
    console.log(`  -> Live games: ${gamesCount.rows[0].count}`);
    console.log(`  -> Live playlists: ${playlistsCount.rows[0].count}`);
  } catch (err) {
    console.error('❌ DB init error:', err);
  }
  await db.pool.end();
  process.exit(0);
}

test();
