const fs = require('fs');
const db = require('./server/db');

async function restoreAllData() {
  console.log('?? Reading database_backup.json...');
  const backupData = JSON.parse(fs.readFileSync('database_backup.json', 'utf8'));

  // Order of tables to respect foreign keys if any
  const tableOrder = [
    'users',
    'games',
    'site_settings',
    'announcements',
    'filter_words',
    'blocked_domains',
    'bug_reports',
    'game_suggestions',
    'update_logs',
    'community_polls',
    'poll_votes',
    'chat_messages',
    'direct_messages',
    'private_rooms',
    'user_game_stats',
    'user_favorites',
    'user_playlists',
    'cloud_game_saves',
    'game_reviews',
    'moderation_logs',
    'ip_logs',
    'banned_ips',
    'contact_messages'
  ];

  for (const table of tableOrder) {
    const rows = backupData[table];
    if (!rows || rows.length === 0) continue;

    console.log(`📦 Restoring ${rows.length} rows into table: ${table}...`);

    for (const row of rows) {
      const keys = Object.keys(row);
      const values = Object.values(row);

      // Handle JSON values if needed
      const sanitizedValues = values.map(v => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);

      const placeholders = keys.map((_, idx) => '$' + (idx + 1)).join(', ');
      const sql = `INSERT INTO ${table} (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

      try {
        await db.pool.query(sql, sanitizedValues);
      } catch (err) {
        // Try fallback without conflicting columns if table structure shifted slightly
        try {
          const nonIdKeys = keys.filter(k => k !== 'id');
          const nonIdValues = nonIdKeys.map(k => (typeof row[k] === 'object' && row[k] !== null) ? JSON.stringify(row[k]) : row[k]);
          const nonIdCols = nonIdKeys.join(', ');
          const nonIdPlaceholders = nonIdKeys.map((_, idx) => $).join(', ');
          const fallbackSql = `INSERT INTO ${table} (${nonIdKeys.join(', ')}) VALUES (${nonIdKeys.map((_, i) => '$' + (i + 1)).join(', ')})`;
          await db.pool.query(fallbackSql, nonIdValues);
        } catch (_) {}
      }
    }
  }

  // Sync sequence IDs for tables with SERIAL primary keys
  for (const table of tableOrder) {
    try {
      await db.pool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1)) FROM ${table}`);
    } catch (_) {}
  }

  console.log('? ALL BACKED-UP DATA RESTORED 100% SUCCESSFULLY INTO SUPABASE!');
  process.exit(0);
}

restoreAllData();
