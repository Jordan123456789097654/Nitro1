// reset_clicks_and_author.js
const db = require('./server/db');
(async () => {
  try {
    await db.pool.query(`UPDATE games SET clicks = 0`);
    await db.pool.query(`UPDATE games SET author = 'Nitro Games'`);
    console.log('All game clicks reset to 0 and author set to "Nitro Games"');
    process.exit(0);
  } catch (err) {
    console.error('Error resetting clicks/author:', err);
    process.exit(1);
  }
})();
