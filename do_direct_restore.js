const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.xulngyyikaymnmxitzto:ZgrsG1hhXsOuv4ac@aws-0-ca-central-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function runRestoration() {
  console.log('?? Loading database_backup.json...');
  const backup = JSON.parse(fs.readFileSync('database_backup.json', 'utf8'));

  const tables = Object.keys(backup);

  for (const table of tables) {
    const rows = backup[table];
    if (!rows || rows.length === 0) continue;

    console.log(?? Inserting  records into []...);

    for (const row of rows) {
      const keys = Object.keys(row);
      const values = Object.values(row).map(v => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);

      const cols = keys.join(', ');
      const placeholders = keys.map((_, i) => '$' + (i + 1)).join(', ');

      const query = INSERT INTO  () VALUES () ON CONFLICT DO NOTHING;;

      try {
        await pool.query(query, values);
      } catch (err) {
        // Try fallback omitting ID if conflict on serial
        try {
          const nonIdKeys = keys.filter(k => k !== 'id');
          const nonIdValues = nonIdKeys.map(k => (typeof row[k] === 'object' && row[k] !== null) ? JSON.stringify(row[k]) : row[k]);
          const nonIdCols = nonIdKeys.join(', ');
          const nonIdPlaceholders = nonIdKeys.map((_, i) => '$' + (i + 1)).join(', ');
          const fallbackQuery = INSERT INTO  () VALUES ();;
          await pool.query(fallbackQuery, nonIdValues);
        } catch (_) {}
      }
    }
  }

  // Update serial sequences for all tables
  for (const table of tables) {
    try {
      await pool.query(SELECT setval(pg_get_serial_sequence('', 'id'), COALESCE(MAX(id), 1)) FROM ;);
    } catch (_) {}
  }

  console.log('?? RESTORATION COMPLETE! Checking row counts...');

  for (const table of ['users', 'games', 'user_playlists', 'moderation_logs', 'ip_logs', 'game_reviews', 'chat_messages', 'announcements']) {
    try {
      const res = await pool.query(SELECT COUNT(*) FROM ;);
      console.log(  -> Table []:  rows);
    } catch (e) {
      console.log(  -> Table []: Error ());
    }
  }

  process.exit(0);
}

runRestoration();
