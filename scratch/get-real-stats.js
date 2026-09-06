const db = require('../server/db');

async function getStats() {
  try {
    const visits = await db.getSiteVisits();
    console.log('REAL VISITS:', visits);
    
    const userRes = await db.query('SELECT COUNT(*) as cnt FROM users');
    console.log('REAL USERS:', userRes.rows ? userRes.rows[0].cnt : 'N/A');

    const gameRes = await db.query('SELECT COUNT(*) as cnt, SUM(clicks) as total_clicks FROM games');
    console.log('REAL GAMES COUNT:', gameRes.rows ? gameRes.rows[0].cnt : 'N/A');
    console.log('REAL GAME CLICKS:', gameRes.rows ? gameRes.rows[0].total_clicks : 'N/A');

    process.exit(0);
  } catch (e) {
    console.error('Error fetching stats:', e.message);
    process.exit(1);
  }
}

getStats();
