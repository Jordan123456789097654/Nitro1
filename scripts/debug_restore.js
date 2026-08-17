const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xulngyyikaymnmxitzto:ZgrsG1hhXsOuv4ac@aws-0-ca-central-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const backup = JSON.parse(fs.readFileSync('pre_remake_full_db_backup.json', 'utf8'));
  console.log('Users in backup:', backup.users.map(u => ({ id: u.id, username: u.username })));
  console.log('User playlists count in backup:', backup.user_playlists ? backup.user_playlists.length : 0);
  if (backup.user_playlists && backup.user_playlists.length > 0) {
    console.log('Sample user playlist:', backup.user_playlists[0]);
    for (const p of backup.user_playlists.slice(0, 5)) {
      try {
        const res = await pool.query(
          'INSERT INTO user_playlists (user_id, title, game_ids) VALUES ($1, $2, $3) RETURNING *',
          [p.user_id, p.title, JSON.stringify(p.game_ids || [])]
        );
        console.log('Successfully inserted playlist:', res.rows[0]);
      } catch (err) {
        console.error(`Error inserting playlist (user_id: ${p.user_id}):`, err.message);
      }
    }
  }
  await pool.end();
}

check();
