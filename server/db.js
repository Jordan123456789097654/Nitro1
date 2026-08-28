const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xulngyyikaymnmxitzto:ZgrsG1hhXsOuv4ac@aws-0-ca-central-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
  max: 6,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

const userCache = new Map();

function clearUserCache(userId) {
  if (userId) {
    userCache.delete(Number(userId));
    userCache.delete(String(userId));
  }
}

// Periodically evict expired userCache entries (TTL = 3s, sweep every 60s)
setInterval(() => {
  const now = Date.now();
  for (const [key, cached] of userCache.entries()) {
    if (cached.expires <= now) {
      userCache.delete(key);
    }
  }
}, 60 * 1000).unref();


const originalQuery = pool.query;
pool.query = function(text, params) {
  const sql = (typeof text === 'string') ? text : (text && text.text) || '';
  if (sql.toUpperCase().includes('UPDATE USERS') || sql.toUpperCase().includes('DELETE FROM USERS') || sql.toUpperCase().includes('INSERT INTO USERS')) {
    userCache.clear();
  }
  return originalQuery.apply(pool, arguments);
};

pool.on('error', (err) => {
  console.error('Unexpected Supabase PostgreSQL pool error:', err.message);
});

console.log('⚡ [DB] Supabase Pool configured.');

const db = {
  pool,

  async initPostgres() {    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          display_name VARCHAR(100) DEFAULT '',
          bio TEXT DEFAULT '',
          password_hash TEXT NOT NULL,
          role VARCHAR(50) DEFAULT 'member',
          avatar_url TEXT DEFAULT '',
          banner_url TEXT DEFAULT '',
          chat_bubble_theme VARCHAR(50) DEFAULT 'default',
          vip_particle_effect VARCHAR(50) DEFAULT 'none',
          pro_chat_glow VARCHAR(50) DEFAULT 'gold',
          pro_custom_flair VARCHAR(50) DEFAULT '',
          coins INT DEFAULT 100,
          xp INT DEFAULT 0,
          is_banned BOOLEAN DEFAULT false,
          is_gateway_banned BOOLEAN DEFAULT false,
          is_proxy_banned BOOLEAN DEFAULT false,
          ban_reason TEXT DEFAULT '',
          proxy_timeout_until TIMESTAMP,
          proxy_violations_count INT DEFAULT 0,
          gateway_timeout_until TIMESTAMP,
          gateway_violations_count INT DEFAULT 0,
          banned_until TIMESTAMP,
          muted_until TIMESTAMP,
          require_profile_update BOOLEAN DEFAULT false,
          profile_lock_reason TEXT DEFAULT '',
          is_disabled_for_review BOOLEAN DEFAULT false,
          review_disable_reason TEXT DEFAULT '',
          force_password_reset BOOLEAN DEFAULT false,
          is_flair_locked BOOLEAN DEFAULT false,
          is_shop_banned BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_profiles (
          id SERIAL PRIMARY KEY,
          user_id INT,
          profile_name VARCHAR(100) NOT NULL,
          favorites JSONB DEFAULT '[]'::jsonb,
          theme_settings JSONB DEFAULT '{}'::jsonb,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS games (
          id SERIAL PRIMARY KEY,
          title VARCHAR(200) NOT NULL,
          slug VARCHAR(200) UNIQUE NOT NULL,
          description TEXT DEFAULT '',
          author VARCHAR(100) DEFAULT 'Community',
          thumbnail_url TEXT NOT NULL,
          embed_type VARCHAR(50) DEFAULT 'html_code',
          embed_content TEXT NOT NULL,
          is_vip BOOLEAN DEFAULT false,
          category VARCHAR(50) DEFAULT 'Action',
          clicks INT DEFAULT 0,
          is_taken_down BOOLEAN DEFAULT false,
          takedown_reason TEXT DEFAULT '',
          created_by VARCHAR(100) DEFAULT 'admin',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS filter_words (
          id SERIAL PRIMARY KEY,
          word VARCHAR(100) UNIQUE NOT NULL,
          filter_type VARCHAR(50) DEFAULT 'both',
          punishment VARCHAR(50) DEFAULT 'censor',
          reason TEXT DEFAULT '',
          created_by VARCHAR(100) DEFAULT 'admin',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
          id SERIAL PRIMARY KEY,
          user_id INT,
          username VARCHAR(100) NOT NULL,
          role VARCHAR(50) DEFAULT 'member',
          message TEXT NOT NULL,
          audio_url TEXT DEFAULT '',
          image_url TEXT DEFAULT '',
          is_deleted BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS direct_messages (
          id SERIAL PRIMARY KEY,
          sender_id INT,
          receiver_id INT,
          sender_username VARCHAR(100) NOT NULL,
          receiver_username VARCHAR(100) NOT NULL,
          message TEXT DEFAULT '',
          content TEXT DEFAULT '',
          audio_url TEXT DEFAULT '',
          image_url TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS private_rooms (
          id SERIAL PRIMARY KEY,
          room_code VARCHAR(50) UNIQUE NOT NULL,
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS community_polls (
          id SERIAL PRIMARY KEY,
          question TEXT NOT NULL,
          options JSONB NOT NULL,
          created_by VARCHAR(100) DEFAULT 'admin',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS poll_votes (
          id SERIAL PRIMARY KEY,
          poll_id INT,
          user_id INT,
          option_index INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS moderation_logs (
          id SERIAL PRIMARY KEY,
          action VARCHAR(100) NOT NULL,
          admin_username VARCHAR(100) NOT NULL,
          target VARCHAR(100),
          reason TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ai_moderation_logs (
          id SERIAL PRIMARY KEY,
          user_id INT,
          username VARCHAR(100) NOT NULL,
          message TEXT NOT NULL,
          category VARCHAR(50) DEFAULT 'general',
          severity VARCHAR(50) DEFAULT 'medium',
          confidence FLOAT DEFAULT 1.0,
          action_taken VARCHAR(50) DEFAULT 'blocked',
          reason TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ai_admin_audits (
          id SERIAL PRIMARY KEY,
          action VARCHAR(100) NOT NULL,
          admin_username VARCHAR(100) NOT NULL,
          target VARCHAR(100),
          reason TEXT,
          ai_evaluation VARCHAR(50) DEFAULT 'approved',
          ai_score FLOAT DEFAULT 1.0,
          ai_feedback TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS site_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS announcements (
          id SERIAL PRIMARY KEY,
          title VARCHAR(200) NOT NULL,
          message TEXT NOT NULL,
          alert_type VARCHAR(50) DEFAULT 'info',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS blocked_domains (
          id SERIAL PRIMARY KEY,
          domain VARCHAR(255) UNIQUE NOT NULL,
          reason TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_suggestions (
          id SERIAL PRIMARY KEY,
          user_id INT,
          title VARCHAR(200) NOT NULL,
          details TEXT DEFAULT '',
          description TEXT DEFAULT '',
          username VARCHAR(100) DEFAULT 'Guest',
          game_url TEXT DEFAULT '',
          upvotes INT DEFAULT 1,
          voters TEXT DEFAULT '[]',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bug_reports (
          id SERIAL PRIMARY KEY,
          title VARCHAR(200) NOT NULL,
          category VARCHAR(100) DEFAULT 'general',
          description TEXT NOT NULL,
          username VARCHAR(100) DEFAULT 'Guest',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_game_stats (
          user_id INT PRIMARY KEY,
          username VARCHAR(100) NOT NULL,
          total_time_seconds INT DEFAULT 0,
          games_played INT DEFAULT 0,
          coins INT DEFAULT 0,
          xp INT DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_favorites (
          user_id INT NOT NULL,
          game_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(user_id, game_id)
        );

        CREATE TABLE IF NOT EXISTS user_playlists (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          title VARCHAR(100) NOT NULL,
          game_ids JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cloud_game_saves (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          game_slug VARCHAR(100) NOT NULL,
          save_data TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_reviews (
          id SERIAL PRIMARY KEY,
          user_id INT,
          username VARCHAR(100) NOT NULL,
          game_slug VARCHAR(100) NOT NULL,
          rating INT NOT NULL,
          review_text TEXT DEFAULT '',
          tips TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ip_logs (
          id SERIAL PRIMARY KEY,
          user_id INT,
          username VARCHAR(100) NOT NULL,
          ip_address VARCHAR(45) NOT NULL,
          user_agent TEXT DEFAULT '',
          location_info TEXT DEFAULT 'Unknown',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS banned_ips (
          id SERIAL PRIMARY KEY,
          ip_address VARCHAR(45) UNIQUE NOT NULL,
          reason TEXT DEFAULT '',
          banned_by VARCHAR(100) DEFAULT 'admin',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS friendships (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          friend_id INT NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS contact_messages (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(150) NOT NULL,
          department VARCHAR(50) NOT NULL,
          subject VARCHAR(200) NOT NULL,
          message TEXT NOT NULL,
          is_resolved BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS appeals (
          id SERIAL PRIMARY KEY,
          user_id INT,
          username VARCHAR(100) NOT NULL,
          punishment_type VARCHAR(50) NOT NULL,
          original_reason TEXT DEFAULT '',
          appeal_text TEXT NOT NULL,
          incident_category VARCHAR(100) DEFAULT '',
          incident_description TEXT DEFAULT '',
          why_second_chance TEXT DEFAULT '',
          prevention_commitment TEXT DEFAULT '',
          rules_agreed BOOLEAN DEFAULT true,
          ai_recommendation VARCHAR(50) DEFAULT '',
          ai_rationale TEXT DEFAULT '',
          ai_confidence FLOAT DEFAULT 0.9,
          status VARCHAR(50) DEFAULT 'pending',
          admin_notes TEXT DEFAULT '',
          reviewed_by VARCHAR(100) DEFAULT '',
          reviewed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS custom_soundboard_sounds (
          id SERIAL PRIMARY KEY,
          title VARCHAR(100) NOT NULL,
          icon VARCHAR(20) DEFAULT '🎵',
          audio_url TEXT NOT NULL,
          is_global BOOLEAN DEFAULT false,
          uploaded_by VARCHAR(100) DEFAULT 'admin',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_play_logs (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          username VARCHAR(100) NOT NULL,
          playtime_seconds INT DEFAULT 60,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS update_logs (
          id SERIAL PRIMARY KEY,
          version VARCHAR(50) NOT NULL,
          title VARCHAR(200) NOT NULL,
          content TEXT NOT NULL,
          author VARCHAR(100) DEFAULT 'admin',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS shop_items (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          description TEXT NOT NULL,
          price INT DEFAULT 100,
          category VARCHAR(50) NOT NULL,
          perk_value VARCHAR(100) DEFAULT '',
          image_url VARCHAR(255) DEFAULT '',
          is_active BOOLEAN DEFAULT true
        );

        CREATE TABLE IF NOT EXISTS stores (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          description TEXT DEFAULT '',
          image_url VARCHAR(255) DEFAULT '',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_inventory (
          user_id INT REFERENCES users(id) ON DELETE CASCADE,
          item_id INT REFERENCES shop_items(id) ON DELETE CASCADE,
          purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_equipped BOOLEAN DEFAULT false,
          PRIMARY KEY (user_id, item_id)
        );

        CREATE TABLE IF NOT EXISTS quests (
          id SERIAL PRIMARY KEY,
          title VARCHAR(100) NOT NULL,
          description TEXT NOT NULL,
          type VARCHAR(50) NOT NULL,
          target_value INT DEFAULT 1,
          reward_coins INT DEFAULT 50,
          reward_xp INT DEFAULT 100,
          is_active BOOLEAN DEFAULT true
        );

        CREATE TABLE IF NOT EXISTS user_quests (
          user_id INT REFERENCES users(id) ON DELETE CASCADE,
          quest_id INT REFERENCES quests(id) ON DELETE CASCADE,
          current_value INT DEFAULT 0,
          is_completed BOOLEAN DEFAULT false,
          is_claimed BOOLEAN DEFAULT false,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, quest_id)
        );

        CREATE TABLE IF NOT EXISTS public_themes (
          id VARCHAR(100) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          bg VARCHAR(20) NOT NULL,
          accent VARCHAR(20) NOT NULL,
          text VARCHAR(20) NOT NULL,
          cardbg VARCHAR(20) NOT NULL,
          muted VARCHAR(20) NOT NULL,
          author VARCHAR(100) DEFAULT 'Community',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tournaments (
          id SERIAL PRIMARY KEY,
          game_id INT REFERENCES games(id) ON DELETE CASCADE,
          title VARCHAR(200) NOT NULL,
          description TEXT DEFAULT '',
          reward_coins INT DEFAULT 0,
          reward_xp INT DEFAULT 0,
          reward_flair VARCHAR(100) DEFAULT '',
          reward_custom VARCHAR(255) DEFAULT '',
          start_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          end_at TIMESTAMP NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tournament_submissions (
          id SERIAL PRIMARY KEY,
          tournament_id INT REFERENCES tournaments(id) ON DELETE CASCADE,
          user_id INT REFERENCES users(id) ON DELETE CASCADE,
          username VARCHAR(100) NOT NULL,
          score INT NOT NULL,
          proof_image_url TEXT NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          admin_notes TEXT DEFAULT '',
          reviewed_by VARCHAR(100) DEFAULT '',
          reviewed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS raffles (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT DEFAULT '',
          ticket_cost INT DEFAULT 50,
          max_tickets_per_user INT DEFAULT -1,
          ends_at TIMESTAMPTZ NOT NULL,
          winner_id INT REFERENCES users(id) ON DELETE SET NULL,
          is_drawn BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS raffle_tickets (
          id SERIAL PRIMARY KEY,
          raffle_id INT REFERENCES raffles(id) ON DELETE CASCADE,
          user_id INT REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS raffle_win_notifications (
          id SERIAL PRIMARY KEY,
          user_id INT REFERENCES users(id) ON DELETE CASCADE,
          raffle_id INT REFERENCES raffles(id) ON DELETE CASCADE,
          raffle_title VARCHAR(255) NOT NULL,
          seen BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await pool.query("ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS delivery_note TEXT DEFAULT '';");
      await pool.query("ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS image_url VARCHAR(255) DEFAULT '';");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url TEXT DEFAULT '';");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_flair_locked BOOLEAN DEFAULT false;");
      await pool.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS is_taken_down BOOLEAN DEFAULT false;");
      await pool.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS takedown_reason TEXT DEFAULT '';");
      await pool.query("ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS reward_custom VARCHAR(255) DEFAULT '';");
      await pool.query("ALTER TABLE ai_admin_audits ADD COLUMN IF NOT EXISTS action VARCHAR(100);");
      await pool.query("ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS stock_count INT DEFAULT -1;");
      await pool.query("ALTER TABLE user_quests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_spin_at TIMESTAMP;");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_shop_banned BOOLEAN DEFAULT false;");
      // Allow items to be purchased more than once
      await pool.query("ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS is_repeatable BOOLEAN DEFAULT false;");
      // Track exact claim time separately from last-progress time so daily reset is accurate
      await pool.query("ALTER TABLE user_quests ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP;");

      // Sub-shops: a shop item can either live inside a store (store_id) or,
      // if it's a "store front" card, open a store instead of being bought directly.
      await pool.query("ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS store_id INT REFERENCES stores(id) ON DELETE SET NULL;");
      await pool.query("ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS is_store_front BOOLEAN DEFAULT false;");
      await pool.query("ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS opens_store_id INT REFERENCES stores(id) ON DELETE SET NULL;");

      // Per-store page customization: banner image + full color scheme + button wording
      await pool.query("ALTER TABLE stores ADD COLUMN IF NOT EXISTS banner_url VARCHAR(255) DEFAULT '';");
      await pool.query("ALTER TABLE stores ADD COLUMN IF NOT EXISTS bg_color VARCHAR(20) DEFAULT '';");
      await pool.query("ALTER TABLE stores ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20) DEFAULT '';");
      await pool.query("ALTER TABLE stores ADD COLUMN IF NOT EXISTS text_color VARCHAR(20) DEFAULT '';");
      await pool.query("ALTER TABLE stores ADD COLUMN IF NOT EXISTS card_bg_color VARCHAR(20) DEFAULT '';");
      await pool.query("ALTER TABLE stores ADD COLUMN IF NOT EXISTS button_label VARCHAR(50) DEFAULT '';");
      await pool.query("ALTER TABLE stores ADD COLUMN IF NOT EXISTS bg_image_url VARCHAR(255) DEFAULT '';");
      await pool.query("ALTER TABLE stores ADD COLUMN IF NOT EXISTS border_color VARCHAR(20) DEFAULT '';");
      await pool.query("ALTER TABLE stores ADD COLUMN IF NOT EXISTS heading_color VARCHAR(20) DEFAULT '';");

      // Spin wheel admin-configurable segments
      await pool.query(`
        CREATE TABLE IF NOT EXISTS spin_wheel_segments (
          id SERIAL PRIMARY KEY,
          label VARCHAR(100) NOT NULL,
          coins INT NOT NULL DEFAULT 0,
          xp INT NOT NULL DEFAULT 0,
          color VARCHAR(20) NOT NULL DEFAULT '#6d28d9',
          probability FLOAT NOT NULL DEFAULT 0.1,
          sort_order INT NOT NULL DEFAULT 0
        );
      `);
      // Seed default 16 segments if none exist
      const segCount = await pool.query('SELECT COUNT(*) FROM spin_wheel_segments');
      if (parseInt(segCount.rows[0].count, 10) === 0) {
        await pool.query(`
          INSERT INTO spin_wheel_segments (label, coins, xp, color, probability, sort_order) VALUES
          ('50 🪙', 50, 0, '#1d4ed8', 0.18, 0),
          ('75 🪙', 75, 0, '#0369a1', 0.14, 1),
          ('100 🪙', 100, 0, '#047857', 0.13, 2),
          ('150 🪙', 150, 0, '#6d28d9', 0.10, 3),
          ('200 🪙', 200, 0, '#be123c', 0.08, 4),
          ('250 🪙', 250, 0, '#b45309', 0.07, 5),
          ('350 🪙', 350, 0, '#0f766e', 0.06, 6),
          ('500 🪙', 500, 0, '#7c3aed', 0.05, 7),
          ('100 XP', 0, 100, '#d97706', 0.06, 8),
          ('250 XP', 0, 250, '#0891b2', 0.05, 9),
          ('500 XP', 0, 500, '#059669', 0.04, 10),
          ('750 XP', 0, 750, '#dc2626', 0.03, 11),
          ('750 🪙', 750, 0, '#92400e', 0.025, 12),
          ('1000 🪙', 1000, 0, '#1e40af', 0.02, 13),
          ('2000 🪙', 2000, 0, '#7f1d1d', 0.01, 14),
          ('🎰 JACKPOT 5000 🪙', 5000, 0, '#fbbf24', 0.005, 15)
        `);
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS promo_codes (
          code VARCHAR(50) PRIMARY KEY,
          reward_type VARCHAR(20) NOT NULL,
          reward_value INT NOT NULL,
          max_uses INT,
          uses INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS promo_code_redemptions (
          id SERIAL PRIMARY KEY,
          user_id INT REFERENCES users(id) ON DELETE CASCADE,
          code VARCHAR(50) REFERENCES promo_codes(code) ON DELETE CASCADE,
          redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, code)
        );
      `);

      await pool.query("CREATE INDEX IF NOT EXISTS idx_games_category ON games (category);");
      await pool.query("CREATE INDEX IF NOT EXISTS idx_games_clicks ON games (clicks);");
      await pool.query("CREATE INDEX IF NOT EXISTS idx_games_title ON games (title);");


      // Seed default shop items
      const shopItemsCount = await pool.query('SELECT COUNT(*) FROM shop_items');
      if (parseInt(shopItemsCount.rows[0].count, 10) === 0) {
        await pool.query(`
          INSERT INTO shop_items (name, description, price, category, perk_value) VALUES
          ('🌱 Early Supporter Flair', 'Add "🌱 OG" flair prefix in global chat', 150, 'custom_flair', '🌱 OG'),
          ('⚡ VIP Spark Glow', 'Gold glowing name animated effect in chat', 300, 'chat_glow', 'gold'),
          ('🔥 Firebrand Chat Glow', 'Orangey-red glowing animated effect in chat', 300, 'chat_glow', 'fire'),
          ('🎓 Honor Roll Diploma', 'A shiny academic medal next to your username', 100, 'custom_flair', '🎓 HONOR'),
          ('☕ Cafe Lo-Fi Badge', 'Claim a study break badge on your profile', 80, 'custom_flair', '☕ COFFEE'),
          ('🎁 Amazon $5 Gift Card', 'Claim a real-life $5 Amazon Gift Card code!', 1000, 'irl_reward', 'AMZN5'),
          ('🎁 Amazon $10 Gift Card', 'Claim a real-life $10 Amazon Gift Card code!', 1800, 'irl_reward', 'AMZN10'),
          ('🕹️ Classic Gamer Mug', 'Physical Nitro platform retro coffee mug sent to you!', 2500, 'irl_reward', 'MUG')
        `);
      }

      // Seed default quests
      const questsCount = await pool.query('SELECT COUNT(*) FROM quests');
      if (parseInt(questsCount.rows[0].count, 10) === 0) {
        await pool.query(`
          INSERT INTO quests (title, description, type, target_value, reward_coins, reward_xp) VALUES
          ('🕹️ Arcade Explorer', 'Play any game in the unblocked library 3 times', 'play_games', 3, 100, 150),
          ('💬 Active Communicator', 'Send 5 direct messages to classmates', 'send_messages', 5, 80, 100),
          ('🦉 Night Study Session', 'Record 5 minutes of study or gaming playtime', 'playtime', 300, 150, 200),
          ('🎨 Paint Masterpiece', 'Load Paint Studio Deluxe to unlock', 'load_paint', 1, 50, 80),
          ('🔊 Sound Mixer DJ', 'Load Soundboard Deluxe to unlock', 'load_soundboard', 1, 50, 80),
          ('🎮 Game Enthusiast', 'Play any game in the unblocked library 10 times', 'play_games', 10, 250, 400),
          ('🎮 Arcade Champion', 'Play any game in the unblocked library 25 times', 'play_games', 25, 600, 1000),
          ('💬 Chat Room Regular', 'Send 30 messages in community chat or direct messages', 'send_messages', 30, 300, 500),
          ('📚 Diligent Scholar', 'Record 15 minutes of study or gaming playtime', 'playtime', 900, 300, 500),
          ('📚 Ultimate Grind', 'Record 1 hour of study or gaming playtime', 'playtime', 3600, 1000, 1500),
          ('🏆 Quiz Master', 'Ask the AI Homework Helper tutor 5 questions', 'ai_chat', 5, 200, 300),
          ('👥 Networking Star', 'Add 3 friends to your classmates list', 'add_friends', 3, 150, 250),
          ('🎤 Voice Chatter', 'Join a class study voice notes channel', 'join_voice', 1, 100, 150),
          ('⭐ Quality Critic', 'Write 3 detailed ratings/reviews for games you play', 'write_reviews', 3, 200, 300),
          ('🛒 Smart Spender', 'Buy 2 items from the custom profile shop', 'buy_shop', 2, 250, 400)
        `);
      } else {
        const newQuests = [
          ['🏆 Quiz Master', 'Ask the AI Homework Helper tutor 5 questions', 'ai_chat', 5, 200, 300],
          ['👥 Networking Star', 'Add 3 friends to your classmates list', 'add_friends', 3, 150, 250],
          ['🎤 Voice Chatter', 'Join a class study voice notes channel', 'join_voice', 1, 100, 150],
          ['⭐ Quality Critic', 'Write 3 detailed ratings/reviews for games you play', 'write_reviews', 3, 200, 300],
          ['🛒 Smart Spender', 'Buy 2 items from the custom profile shop', 'buy_shop', 2, 250, 400]
        ];
        for (const [title, desc, type, target, coins, xp] of newQuests) {
          await pool.query(`
            INSERT INTO quests (title, description, type, target_value, reward_coins, reward_xp)
            SELECT $1::VARCHAR, $2::TEXT, $3::VARCHAR, $4::INTEGER, $5::INTEGER, $6::INTEGER
            WHERE NOT EXISTS (SELECT 1 FROM quests WHERE title = $1::VARCHAR)
          `, [title, desc, type, target, coins, xp]);
        }
      }

      // Seed default public themes
      const themesCount = await pool.query('SELECT COUNT(*) FROM public_themes');
      if (parseInt(themesCount.rows[0].count, 10) === 0) {
        await pool.query(`
          INSERT INTO public_themes (id, name, bg, accent, text, cardbg, muted, author) VALUES
          ('cherry', 'Cherry Red', '#090a0f', '#eb2f5f', '#ffffff', '#12141d', '#94a3b8', 'System'),
          ('cyberpunk', 'Cyberpunk Neon', '#0b0c10', '#66fcf1', '#ffffff', '#1f2833', '#c5c6c7', 'System'),
          ('emerald', 'Matrix Emerald', '#020d04', '#00ff41', '#e0ffe0', '#0a1a0f', '#558855', 'System'),
          ('synthwave', 'Synthwave Purple', '#140526', '#ff007f', '#ffffff', '#220b3b', '#8b5cf6', 'System'),
          ('classic-dark', 'Retro Classic', '#181818', '#38bdf8', '#ffffff', '#242424', '#a3a3a3', 'System')
        `);
      }

      // Seed / Update owner and default admin accounts
      const b64AdminPass = Buffer.from('admin123').toString('base64');
      const adminExists = await pool.query("SELECT * FROM users WHERE LOWER(username) = 'jordandaniels'");
      if (!adminExists.rows.length) {
        await pool.query(
          "INSERT INTO users (username, display_name, password_hash, role, bio, force_password_reset) VALUES ('jordandaniels', 'Jordan ⚡', $1, 'owner', 'Platform Creator & Owner 👑', false), ('admin', 'System Admin 🛡️', $1, 'admin', 'Platform Administrator', false), ('student1', 'Alex Smith', $1, 'member', 'Honor Roll Student', false)",
          [b64AdminPass]
        );
      } else {
        await pool.query("UPDATE users SET role = 'owner' WHERE LOWER(username) = 'jordandaniels'");
      }

      // Ensure all users have force_password_reset set to false by default on startup
      await pool.query("UPDATE users SET force_password_reset = false WHERE force_password_reset = true");

      // Ensure ALL catalog games have is_vip = false while premium is paused
      await pool.query("UPDATE games SET is_vip = false");

      // Clean up / remove Apps category items
      await pool.query("DELETE FROM games WHERE category = 'Apps' OR slug LIKE 'app-%'");

      // Purge requested unblocked domains
      try {
        await pool.query("DELETE FROM blocked_domains WHERE LOWER(domain) IN ('coolmath', 'crazygames', 'poki', 'tiktok', 'discord', 'roblox')");
      } catch (e) {}

      // Auto-categorize & assign proportional punishments to all filter_words
      try {
        await this.autoCategorizeFilterWordPunishments();
      } catch (e) {}

      // Ensure cloud_game_saves has unique constraint on (user_id, game_slug)
      try {
        await pool.query('DELETE FROM cloud_game_saves a USING cloud_game_saves b WHERE a.id < b.id AND a.user_id = b.user_id AND a.game_slug = b.game_slug;');
        await pool.query('ALTER TABLE cloud_game_saves ADD CONSTRAINT unique_user_game_slug UNIQUE (user_id, game_slug);');
      } catch (e) {
        // Constraint might already exist
      }

      console.log('✅ [DB] Supabase tables, Base64 passwords, force-reset flags, PRO games, and Classic collection synchronized successfully.');
    } catch (err) {
      console.error('❌ [DB] Supabase initialization error:', err.message);
    }
  },

  // Settings methods defined below near line 997

  async getMaintenanceMode() {
    const val = await this.getSetting('maintenance_mode');
    return val === 'true';
  },

  async setMaintenanceMode(enabled) {
    await this.setSetting('maintenance_mode', enabled ? 'true' : 'false');
    return Boolean(enabled);
  },

  // Announcements
  async getActiveAnnouncement() {
    try {
      const res = await pool.query('SELECT * FROM announcements WHERE is_active = true ORDER BY id DESC LIMIT 1');
      return res.rows[0] || null;
    } catch (e) {
      return null;
    }
  },

  async getAnnouncements() {
    try {
      const res = await pool.query('SELECT * FROM announcements ORDER BY id DESC LIMIT 20');
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async setAnnouncement({ title, message, alert_type = 'info', is_active = true }) {
    try {
      await pool.query('UPDATE announcements SET is_active = false');
      const res = await pool.query(`
        INSERT INTO announcements (title, message, alert_type, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [title, message, alert_type, is_active]);
      return res.rows[0];
    } catch (e) {
      console.error('setAnnouncement error:', e.message);
      return null;
    }
  },

  // Webhook Settings with in-memory TTL caching (60s)
  _cachedWebhooks: null,
  _cachedWebhooksTime: 0,

  async getWebhooks() {
    const now = Date.now();
    if (this._cachedWebhooks && (now - this._cachedWebhooksTime < 60000)) {
      return this._cachedWebhooks;
    }
    try {
      const res = await pool.query("SELECT key, value FROM site_settings WHERE key LIKE 'webhook_%'");
      const webhooks = {};
      res.rows.forEach(r => {
        const cat = r.key.replace('webhook_', '');
        webhooks[cat] = r.value;
      });
      this._cachedWebhooks = webhooks;
      this._cachedWebhooksTime = now;
      return webhooks;
    } catch (e) {
      return this._cachedWebhooks || {};
    }
  },

  async setWebhook(category, url) {
    try {
      await this.setSetting(`webhook_${category.toLowerCase()}`, url);
      this._cachedWebhooks = null;
      return true;
    } catch (e) {
      console.error('[WEBHOOK] Error setting webhook:', e.message);
      return false;
    }
  },

  // Update Logs
  async getLatestUpdateLog() {
    try {
      const res = await pool.query('SELECT * FROM update_logs ORDER BY id DESC LIMIT 1');
      return res.rows[0] || null;
    } catch (e) {
      return null;
    }
  },

  async getAllUpdateLogs() {
    try {
      const res = await pool.query('SELECT * FROM update_logs ORDER BY id DESC LIMIT 50');
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async createUpdateLog(dataOrVersion, title, content) {
    try {
      let version, t, c, author;
      if (typeof dataOrVersion === 'object') {
        version = dataOrVersion.version;
        t = dataOrVersion.title;
        c = dataOrVersion.content;
        author = dataOrVersion.author || 'Admin';
      } else {
        version = dataOrVersion;
        t = title;
        c = content;
        author = 'Admin';
      }
      const res = await pool.query(`
        INSERT INTO update_logs (version, title, content, author)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [version, t, c, author]);
      return res.rows[0];
    } catch (e) {
      console.error('createUpdateLog error:', e.message);
      return null;
    }
  },

  async deleteUpdateLog(id) {
    try {
      await pool.query('DELETE FROM update_logs WHERE id = $1', [id]);
      return true;
    } catch (e) {
      return false;
    }
  },

  // Direct Messages (DMs)
  async getDirectMessages(username1, username2) {
    try {
      const res = await pool.query(`
        SELECT * FROM direct_messages
        WHERE (LOWER(sender_username) = LOWER($1) AND LOWER(receiver_username) = LOWER($2))
           OR (LOWER(sender_username) = LOWER($2) AND LOWER(receiver_username) = LOWER($1))
        ORDER BY id ASC
        LIMIT 100
      `, [username1, username2]);
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async saveDirectMessage(sender_id, receiver_id, sender_username, receiver_username, message) {
    try {
      const res = await pool.query(`
        INSERT INTO direct_messages (sender_id, receiver_id, sender_username, receiver_username, message)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [sender_id, receiver_id, sender_username, receiver_username, message]);
      return res.rows[0];
    } catch (e) {
      return null;
    }
  },

  // Community Polls
  async getPolls(userId = null) {
    try {
      const pollsRes = await pool.query('SELECT * FROM community_polls WHERE is_active = true ORDER BY id DESC LIMIT 20');
      const polls = [];

      for (const poll of pollsRes.rows) {
        const results = await this.getPollResults(poll.id);
        let userVotedOption = null;
        if (userId) {
          const voteRes = await pool.query('SELECT option_index FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [poll.id, userId]);
          if (voteRes.rows.length) {
            userVotedOption = voteRes.rows[0].option_index;
          }
        }
        polls.push({
          id: poll.id,
          question: poll.question,
          options: results ? results.options : [],
          totalVotes: results ? results.totalVotes : 0,
          created_by: poll.created_by,
          userVotedOption
        });
      }
      return polls;
    } catch (e) {
      console.error('getPolls error:', e.message);
      return [];
    }
  },

  async createPoll(question, options, created_by) {
    try {
      const formattedOptions = options.map(opt => ({ text: opt, votes: 0 }));
      const res = await pool.query(`
        INSERT INTO community_polls (question, options, created_by)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [question, JSON.stringify(formattedOptions), created_by]);
      return res.rows[0];
    } catch (e) {
      console.error('createPoll error:', e.message);
      return null;
    }
  },

  async getPollResults(pollId) {
    try {
      const pollRes = await pool.query('SELECT * FROM community_polls WHERE id = $1', [pollId]);
      if (!pollRes.rows.length) return null;
      const poll = pollRes.rows[0];

      const votesRes = await pool.query(`
        SELECT option_index, COUNT(*) as count 
        FROM poll_votes 
        WHERE poll_id = $1 
        GROUP BY option_index
      `, [pollId]);

      const voteCounts = {};
      let totalVotes = 0;
      votesRes.rows.forEach(r => {
        const idx = parseInt(r.option_index, 10);
        const cnt = parseInt(r.count, 10);
        voteCounts[idx] = cnt;
        totalVotes += cnt;
      });

      const options = typeof poll.options === 'string' ? JSON.parse(poll.options) : poll.options;
      const results = options.map((opt, index) => {
        const votes = voteCounts[index] || 0;
        const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        return {
          text: opt.text || opt,
          votes,
          percentage
        };
      });

      return {
        id: poll.id,
        question: poll.question,
        options: results,
        totalVotes,
        created_by: poll.created_by
      };
    } catch (e) {
      return null;
    }
  },

  async votePoll(pollId, userId, optionIndex) {
    try {
      await pool.query(`
        INSERT INTO poll_votes (poll_id, user_id, option_index)
        VALUES ($1, $2, $3)
        ON CONFLICT (poll_id, user_id)
        DO UPDATE SET option_index = $3, created_at = CURRENT_TIMESTAMP
      `, [pollId, userId, optionIndex]);
      return this.getPollResults(pollId);
    } catch (e) {
      console.error('votePoll error:', e.message);
      return null;
    }
  },

  // Suggestions & Bug Reports
  async createBugReport(title, category, description, username) {
    try {
      const res = await pool.query(`
        INSERT INTO bug_reports (title, category, description, username)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [title, category || 'General', description, username]);
      return res.rows[0];
    } catch (e) {
      return null;
    }
  },

  async getBugReports() {
    try {
      const res = await pool.query('SELECT * FROM bug_reports ORDER BY id DESC LIMIT 50');
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async deleteBugReport(id) {
    try {
      await pool.query('DELETE FROM bug_reports WHERE id = $1', [id]);
      return true;
    } catch (e) {
      return false;
    }
  },

  // Users, Profile Customization & Violations
  async getUserByUsername(username) {
    try {
      const res = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
      return res.rows[0] || null;
    } catch (e) {
      return null;
    }
  },

  async getUserById(id) {
    if (!id) return null;
    const now = Date.now();
    const cached = userCache.get(id);
    if (cached && cached.expires > now) {
      return cached.user;
    }
    try {
      const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      if (res.rows && res.rows[0]) {
        const user = res.rows[0];
        userCache.set(id, { user, expires: now + 3000 }); // cache for 3 seconds
        return user;
      }
    } catch (e) {
      console.error('getUserById error:', e.message);
    }
    return null;
  },

  async setUserCoinsXp(userId, { coins, xp }) {
    try {
      const sets = [];
      const values = [];
      let idx = 1;
      if (coins !== undefined && coins !== null) { sets.push(`coins = $${idx++}`); values.push(Math.max(0, parseInt(coins, 10) || 0)); }
      if (xp !== undefined && xp !== null)       { sets.push(`xp = $${idx++}`);    values.push(Math.max(0, parseInt(xp, 10)    || 0)); }
      if (!sets.length) return null;
      values.push(userId);
      const res = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, username, coins, xp`, values);
      return res.rows[0] || null;
    } catch (e) {
      console.error('setUserCoinsXp error:', e.message);
      return null;
    }
  },

  async updateUserProfile(userId, { avatar_url, banner_url, chat_bubble_theme, vip_particle_effect, display_name, bio, pro_chat_glow, pro_custom_flair, role, password, is_flair_locked, coins, xp }) {
    try {
      const sets = [];
      const values = [];
      let idx = 1;

      if (avatar_url !== undefined) { sets.push(`avatar_url = $${idx++}`); values.push(avatar_url); }
      if (display_name !== undefined) { sets.push(`display_name = $${idx++}`); values.push(display_name); }
      if (bio !== undefined) { sets.push(`bio = $${idx++}`); values.push(bio); }
      if (pro_chat_glow !== undefined) { sets.push(`pro_chat_glow = $${idx++}`); values.push(pro_chat_glow); }
      if (pro_custom_flair !== undefined) { sets.push(`pro_custom_flair = $${idx++}`); values.push(pro_custom_flair); }
      if (banner_url !== undefined) { sets.push(`banner_url = $${idx++}`); values.push(banner_url); }
      if (chat_bubble_theme !== undefined) { sets.push(`chat_bubble_theme = $${idx++}`); values.push(chat_bubble_theme); }
      if (vip_particle_effect !== undefined) { sets.push(`vip_particle_effect = $${idx++}`); values.push(vip_particle_effect); }
      if (role !== undefined) { sets.push(`role = $${idx++}`); values.push(role); }
      if (is_flair_locked !== undefined) { sets.push(`is_flair_locked = $${idx++}`); values.push(is_flair_locked); }
      if (coins !== undefined && coins !== null) { sets.push(`coins = $${idx++}`); values.push(Math.max(0, parseInt(coins, 10) || 0)); }
      if (xp !== undefined && xp !== null)       { sets.push(`xp = $${idx++}`);    values.push(Math.max(0, parseInt(xp, 10)    || 0)); }
      if (password && password.trim().length > 0) {
        const bcrypt = require('bcryptjs');
        const hashed = bcrypt.hashSync(password.trim(), 10);
        sets.push(`password_hash = $${idx++}`); values.push(hashed);
        sets.push(`force_password_reset = true`);
      }
      sets.push(`require_profile_update = false`);
      sets.push(`profile_lock_reason = ''`);

      if (sets.filter(s => s.includes('$')).length === 0) return true;

      values.push(userId);
      const query = `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, username, display_name, bio, role, avatar_url, banner_url, chat_bubble_theme, vip_particle_effect, pro_chat_glow, pro_custom_flair, force_password_reset, is_flair_locked, coins, xp`;
      const res = await pool.query(query, values);
      return res.rows[0] || null;
    } catch (e) {
      console.error('updateUserProfile error:', e.message);
      return null;
    }
  },


  async muteUser(userId, durationMinutes) {
    try {
      const mutedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
      await pool.query('UPDATE users SET muted_until = $1 WHERE id = $2', [mutedUntil, userId]);
      return mutedUntil;
    } catch (e) {
      return null;
    }
  },

  async unbanUser(userId) {
    try {
      await pool.query(`
        UPDATE users 
        SET is_banned = false, ban_reason = NULL, banned_until = NULL,
            is_disabled_for_review = false, review_disable_reason = '',
            is_gateway_banned = false, gateway_timeout_until = NULL, gateway_violations_count = 0
        WHERE id = $1
      `, [userId]);
      return true;
    } catch (e) {
      console.error('unbanUser error:', e.message);
      return false;
    }
  },

  async banGatewayUser(userId, reason = 'Proxy banned by administrator') {
    try {
      await pool.query(`
        UPDATE users 
        SET is_gateway_banned = true
        WHERE id = $1
      `, [userId]);
      return true;
    } catch (e) {
      console.error('banGatewayUser error:', e.message);
      return false;
    }
  },

  async ungatewayBanUser(userId) {
    try {
      await pool.query(`
        UPDATE users 
        SET is_gateway_banned = false, gateway_timeout_until = NULL, gateway_violations_count = 0
        WHERE id = $1
      `, [userId]);
      return true;
    } catch (e) {
      console.error('ungatewayBanUser error:', e.message);
      return false;
    }
  },

  async unmuteUser(userId) {
    try {
      await pool.query('UPDATE users SET muted_until = NULL WHERE id = $1', [userId]);
      return true;
    } catch (e) {
      return false;
    }
  },

  async recordGatewayViolation(userId) {
    try {
      const res = await pool.query(`
        UPDATE users 
        SET gateway_violations_count = COALESCE(gateway_violations_count, 0) + 1
        WHERE id = $1
        RETURNING gateway_violations_count
      `, [userId]);
      const count = res.rows[0]?.gateway_violations_count || 1;

      if (count >= 3) {
        // Strike 3: 3 Day Website Ban across entire platform
        const bannedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        await pool.query(`
          UPDATE users 
          SET banned_until = $1, is_banned = true, ban_reason = '3 Strikes: Repeated blocked domain violations', gateway_timeout_until = NULL, is_gateway_banned = true
          WHERE id = $2
        `, [bannedUntil, userId]);
        return { count, action: 'WEBSITE_BAN_3_DAYS', bannedUntil };
      } else if (count === 2) {
        // Strike 2: 30 Minute Proxy Ban
        const timeoutUntil = new Date(Date.now() + 30 * 60 * 1000);
        await pool.query(`
          UPDATE users 
          SET gateway_timeout_until = $1, is_gateway_banned = true
          WHERE id = $2
        `, [timeoutUntil, userId]);
        return { count, action: 'PROXY_BAN_30_MIN', timeoutUntil };
      } else {
        // Strike 1: Warning Strike Only (1/3 Strikes)
        return { count: 1, action: 'STRIKE_1_WARNING' };
      }
    } catch (e) {
      return { count: 1, action: 'STRIKE_1_WARNING' };
    }
  },

  // Clear gateway timeout & ungateway ban for a user (admin action)
  async clearGatewayTimeout(userId) {
    try {
      await pool.query('UPDATE users SET gateway_timeout_until = NULL, gateway_violations_count = 0 WHERE id = $1', [userId]);
      return true;
    } catch (e) {
      console.error('clearGatewayTimeout error:', e.message);
      return false;
    }
  },


  async setForcePasswordReset(userId, status = true) {
    try {
      await pool.query('UPDATE users SET force_password_reset = $1 WHERE id = $2', [Boolean(status), userId]);
      return true;
    } catch (e) {
      console.error('setForcePasswordReset error:', e.message);
      return false;
    }
  },

  async setProfileUpdateRequired(userId, status = true, reason = 'Profile compliance update required') {
    try {
      await pool.query('UPDATE users SET require_profile_update = $1, profile_lock_reason = $2 WHERE id = $3', [Boolean(status), reason, userId]);
      return true;
    } catch (e) {
      console.error('setProfileUpdateRequired error:', e.message);
      return false;
    }
  },

  async setAccountDisabledForReview(userId, status = true, reason = '10-Day Account Suspension (Pending Admin Review)') {
    try {
      await pool.query('UPDATE users SET is_disabled_for_review = $1, review_disable_reason = $2 WHERE id = $3', [Boolean(status), reason, userId]);
      return true;
    } catch (e) {
      console.error('setAccountDisabledForReview error:', e.message);
      return false;
    }
  },

  async getAdminReviewHoldThreshold() {
    try {
      const res = await pool.query("SELECT value FROM site_settings WHERE key = 'admin_review_hold_threshold'");
      if (res.rows && res.rows[0]) return res.rows[0].value;
      return '10d';
    } catch (e) {
      return '10d';
    }
  },

  async setAdminReviewHoldThreshold(threshold) {
    try {
      await pool.query(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('admin_review_hold_threshold', $1, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP
      `, [threshold]);
      return true;
    } catch (e) {
      console.error('setAdminReviewHoldThreshold error:', e.message);
      return false;
    }
  },

  async getSetting(key) {
    try {
      const res = await pool.query('SELECT value FROM site_settings WHERE key = $1', [key]);
      if (res.rows && res.rows[0]) return res.rows[0].value;
      return null;
    } catch (e) {
      return null;
    }
  },

  async setSetting(key, value) {
    try {
      await pool.query(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
      `, [key, String(value)]);
      return true;
    } catch (e) {
      console.error('setSetting error:', e.message);
      return false;
    }
  },

  async isSignupsEnabled() {
    try {
      const val = await this.getSetting('signups_enabled');
      if (val === null || val === undefined) return true;
      return val === 'true' || val === '1';
    } catch (e) {
      return true;
    }
  },

  async setSignupsEnabled(enabled) {
    return await this.setSetting('signups_enabled', Boolean(enabled) ? 'true' : 'false');
  },



  async deleteUser(userId) {
    try {
      const user = await this.getUserById(userId);
      if (!user) return false;

      // Clean up user-related data
      await pool.query('DELETE FROM chat_messages WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM direct_messages WHERE sender_id = $1 OR receiver_id = $1', [userId]);
      await pool.query('DELETE FROM poll_votes WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      return true;
    } catch (e) {
      console.error('deleteUser error:', e.message);
      return false;
    }
  },

  async createUser(username, password_hash, role = 'member') {
    try {
      const res = await pool.query(
        'INSERT INTO users (username, display_name, password_hash, role, force_password_reset) VALUES ($1, $1, $2, $3, false) RETURNING *',
        [username, password_hash, role]
      );
      return res.rows[0];
    } catch (e) {
      throw e;
    }
  },

  async getAllUsers() {
    try {
      const res = await pool.query('SELECT * FROM users ORDER BY id DESC');
      return res.rows.map(u => {
        let plainPassword = '[Encrypted Hash]';
        if (u.password_hash) {
          const looksLikeBcrypt = /^\$2[aby]\$\d{2}\$/.test(u.password_hash) || u.password_hash.startsWith('$');
          if (looksLikeBcrypt) {
            plainPassword = `[Bcrypt Hash] ${u.password_hash}`;
          } else {
            try {
              const decoded = Buffer.from(u.password_hash, 'base64').toString('utf8');
              const isPrintable = /^[\x20-\x7E\s]*$/.test(decoded);
              if (decoded && decoded.length > 0 && isPrintable) {
                plainPassword = decoded;
              } else {
                plainPassword = `[Base64 Encoded] ${u.password_hash}`;
              }
            } catch (e) {
              plainPassword = `[Raw Hash] ${u.password_hash}`;
            }
          }
        }
        return {
          ...u,
          coins: u.coins || 0,
          xp: u.xp || 0,
          plain_password: plainPassword
        };
      });
    } catch (e) {
      console.error('getAllUsers error:', e.message);
      return [];
    }
  },


  async updateUserRole(id, role) {
    try {
      await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
      return true;
    } catch (e) {
      return false;
    }
  },

  async updateUserBan(id, is_banned, reason = '', banned_until = null) {
    try {
      await pool.query('UPDATE users SET is_banned = $1, ban_reason = $2, banned_until = $3 WHERE id = $4', [Boolean(is_banned), reason, banned_until, id]);
      return true;
    } catch (e) {
      return false;
    }
  },

  async updateUserGatewayBan(id, is_gateway_banned, reason = '', durationHours = 0) {
    try {
      let timeoutUntil = null;
      if (is_gateway_banned) {
        if (durationHours && Number(durationHours) > 0) {
          timeoutUntil = new Date(Date.now() + Number(durationHours) * 60 * 60 * 1000);
        } else {
          timeoutUntil = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000);
        }
      }
      await pool.query('UPDATE users SET is_gateway_banned = $1, gateway_timeout_until = $2 WHERE id = $3', [Boolean(is_gateway_banned), timeoutUntil, id]);
      return { success: true, timeoutUntil };
    } catch (e) {
      console.error('updateUserGatewayBan error:', e.message);
      return false;
    }
  },

  async updateUserPassword(id, password_hash) {
    try {
      await pool.query('UPDATE users SET password_hash = $1, force_password_reset = false WHERE id = $2', [password_hash, id]);
      return true;
    } catch (e) {
      return false;
    }
  },

  // Games
  async getGames({ search, category, vipOnly, sort }) {
    try {
      let sql = 'SELECT * FROM games WHERE 1=1';
      const params = [];

      if (search && search.trim() !== '') {
        params.push(`%${search.trim()}%`);
        sql += ` AND (title ILIKE $${params.length} OR category ILIKE $${params.length} OR author ILIKE $${params.length})`;
      }

      if (category && category !== 'All') {
        params.push(category);
        sql += ` AND category = $${params.length}`;
      }

      if (vipOnly === 'true') {
        // All games currently unlocked for everyone
      }

      if (sort === 'alpha') {
        sql += ' ORDER BY title ASC';
      } else if (sort === 'recent') {
        sql += ' ORDER BY id DESC';
      } else {
        sql += ' ORDER BY clicks DESC';
      }

      const res = await pool.query(sql, params);
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async getGameBySlug(slug) {
    try {
      const res = await pool.query('SELECT * FROM games WHERE slug = $1', [slug]);
      return res.rows[0] || null;
    } catch (e) {
      return null;
    }
  },

  async incrementGameClicks(id) {
    try {
      const res = await pool.query('UPDATE games SET clicks = COALESCE(clicks, 0) + 1 WHERE id = $1 RETURNING clicks', [id]);
      return res.rows[0]?.clicks || 1;
    } catch (e) {
      return 1;
    }
  },

  async createGame(g) {
    try {
      const res = await pool.query(`
        INSERT INTO games (title, slug, author, thumbnail_url, embed_type, embed_content, is_vip, category, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [g.title, g.slug, g.author, g.thumbnail_url, g.embed_type, g.embed_content, g.is_vip, g.category, g.created_by]);
      return res.rows[0];
    } catch (e) {
      throw e;
    }
  },

  async updateGameDetails(id, { title, category, author, thumbnail_url, embed_type, embed_content, clicks, is_taken_down, takedown_reason }) {
    try {
      const res = await pool.query(`
        UPDATE games
        SET title = COALESCE($1, title),
            category = COALESCE($2, category),
            author = COALESCE($3, author),
            thumbnail_url = COALESCE($4, thumbnail_url),
            embed_type = COALESCE($5, embed_type),
            embed_content = COALESCE($6, embed_content),
            clicks = COALESCE($7, clicks),
            is_taken_down = COALESCE($8, is_taken_down),
            takedown_reason = COALESCE($9, takedown_reason)
        WHERE id = $10
        RETURNING *
      `, [title, category, author, thumbnail_url, embed_type, embed_content, clicks, is_taken_down, takedown_reason, id]);
      return res.rows[0];
    } catch (e) {
      console.error('updateGameDetails error:', e.message);
      return null;
    }
  },

  async deleteGame(id) {
    try {
      await pool.query('DELETE FROM games WHERE id = $1', [id]);
      return true;
    } catch (e) {
      return false;
    }
  },

  // Filters
  async getFilterWords() {
    try {
      const res = await pool.query('SELECT * FROM filter_words ORDER BY id DESC');
      return (res.rows || []).map(r => ({
        ...r,
        word: (r.word || '').trim().toLowerCase(),
        punishment: (r.punishment || 'censor').trim().toLowerCase(),
        filter_type: (r.filter_type || 'both').trim().toLowerCase()
      }));
    } catch (e) {
      return [];
    }
  },

  async autoCategorizeFilterWordPunishments() {
    try {
      const res = await pool.query('SELECT * FROM filter_words');
      if (!res.rows || res.rows.length === 0) return { updatedCount: 0 };

      let updatedCount = 0;

      // Groq AI API details
      const GROQ_ENDPOINT = process.env.GROQ_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions';
      const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';
      const GROQ_MODEL = process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b';

      const batchSize = 35;
      const allRows = res.rows;

      for (let i = 0; i < allRows.length; i += batchSize) {
        const chunk = allRows.slice(i, i + batchSize);
        const wordList = chunk.map(r => r.word);

        let groqSuccess = false;
        try {
          const response = await fetch(GROQ_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
              model: GROQ_MODEL,
              messages: [
                {
                  role: 'system',
                  content: `You are an expert Content Moderation AI classifier for a web gaming & study platform.
Categorize EVERY word/phrase in the provided list into EXACTLY one of these 5 punishment tiers:
- "perm_ban": Extreme hate speech, racial/homophobic slurs, pedophilia, bestiality/zoophilia, illegal content, self-harm/suicide promotion.
- "ban_3d": Explicit pornography, severe NSFW/sexual terms (yiffy, worldsex, yellow showers, whore, cunt, porn, xxx, etc.), severe swear words.
- "mute_5m": Insults, harassment, toxic gaming slang (stfu, dumbass, idiot, trash, loser, etc.).
- "warn": Mild vulgarities, bypass slang, mild words (damn, hell, crap, wtf, etc.).
- "censor": Standard filter words that should only be replaced with *** without extra penalty.

OUTPUT REQUIREMENT:
Respond ONLY with a raw JSON array of objects. Do NOT use markdown code blocks (\`\`\`json).
JSON Format Example:
[{"word": "word1", "punishment": "ban_3d"}]`
                },
                {
                  role: 'user',
                  content: JSON.stringify(wordList)
                }
              ],
              temperature: 0.1
            })
          });

          if (response.ok) {
            const data = await response.json();
            const rawContent = data.choices?.[0]?.message?.content || '';
            const cleanedJson = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
            const classified = JSON.parse(cleanedJson);

            if (Array.isArray(classified)) {
              groqSuccess = true;
              for (const item of classified) {
                if (!item.word || !item.punishment) continue;
                const matchRow = chunk.find(r => r.word.toLowerCase().trim() === item.word.toLowerCase().trim());
                if (matchRow) {
                  const validPunishments = ['perm_ban', 'ban_3d', 'mute_5m', 'warn', 'censor'];
                  const p = validPunishments.includes(item.punishment) ? item.punishment : 'censor';
                  if (matchRow.punishment !== p) {
                    await pool.query('UPDATE filter_words SET punishment = $1 WHERE id = $2', [p, matchRow.id]);
                    updatedCount++;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('Groq AI filter categorization batch notice:', e.message);
        }

        // Local severity fallback if Groq API call fails
        if (!groqSuccess) {
          const permBanKeywords = ['nigger', 'nigga', 'faggot', 'kike', 'chink', 'spic', 'retard', 'kys', 'kill yourself', 'pedophile', 'zoophilia', 'bestiality', 'swastika', 'nazi', 'hitler', 'terrorist', 'rape', 'rapist'];
          const ban3dKeywords = ['fuck', 'shit', 'bitch', 'whore', 'slut', 'cunt', 'dick', 'pussy', 'cock', 'asshole', 'motherfucker', 'hentai', 'yaoi', 'yiffy', 'porno', 'porn', 'xxx', 'xvideo', 'worldsex', 'yellow showers', 'wrinkled starfish', 'wrapping men', 'orgasm', 'ejaculat', 'masturbat', 'strip', 'boob', 'tits', 'penis', 'vagina', 'blowjob', 'handjob', 'cum', 'semen', 'erotic', 'nsfw', 'sex'];
          const mute5mKeywords = ['stfu', 'fuk', 'idiot', 'dumbass', 'loser', 'trash', 'garbage', 'noob', 'shut up', 'hoe', 'skank', 'dipshit', 'jackass', 'bastard', 'douche', 'wanker'];
          const warnKeywords = ['damn', 'hell', 'crap', 'ass', 'piss', 'wtf', 'lmao', 'omg', 'bs', 'suck', 'sucks', 'freaking', 'frick', 'biatch'];

          for (const row of chunk) {
            const w = (row.word || '').toLowerCase().trim();
            if (!w) continue;
            let newPunishment = 'censor';
            if (permBanKeywords.some(k => w.includes(k) || k.includes(w))) newPunishment = 'perm_ban';
            else if (ban3dKeywords.some(k => w.includes(k) || k.includes(w))) newPunishment = 'ban_3d';
            else if (mute5mKeywords.some(k => w.includes(k) || k.includes(w))) newPunishment = 'mute_5m';
            else if (warnKeywords.some(k => w.includes(k) || k.includes(w))) newPunishment = 'warn';

            if (newPunishment !== row.punishment) {
              await pool.query('UPDATE filter_words SET punishment = $1 WHERE id = $2', [newPunishment, row.id]);
              updatedCount++;
            }
          }
        }
      }
      return { updatedCount };
    } catch (e) {
      console.error('autoCategorizeFilterWordPunishments error:', e.message);
      return { updatedCount: 0 };
    }
  },

  async addFilterWord(word, filter_type = 'both', punishment = 'censor', reason = '', created_by = 'admin') {
    try {
      const cleanWord = String(word).trim().toLowerCase();
      const res = await pool.query(`
        INSERT INTO filter_words (word, filter_type, punishment, reason, created_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (word) DO UPDATE SET filter_type = $2, punishment = $3, reason = $4, created_by = $5
        RETURNING *
      `, [cleanWord, filter_type, punishment, reason, created_by]);
      return res.rows[0];
    } catch (e) {
      console.error('addFilterWord error:', e.message);
      return null;
    }
  },
  async addFilterWordsBulk(wordsArray, filter_type = 'both', punishment = 'censor', reason = '', created_by = 'admin') {
    try {
      if (!Array.isArray(wordsArray) || wordsArray.length === 0) return { count: 0 };

      const cleanWords = [...new Set(wordsArray.map(w => String(w).trim().toLowerCase()).filter(w => w.length > 0))];
      if (cleanWords.length === 0) return { count: 0 };

      let addedCount = 0;
      for (const w of cleanWords) {
        await pool.query(`
          INSERT INTO filter_words (word, filter_type, punishment, reason, created_by)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (word) DO UPDATE SET filter_type = $2, punishment = $3, reason = $4, created_by = $5
        `, [w, filter_type, punishment, reason, created_by]);
        addedCount++;
      }
      return { success: true, count: addedCount };
    } catch (e) {
      console.error('addFilterWordsBulk error:', e.message);
      return { success: false, count: 0 };
    }
  },

  async deleteFilterWord(id) {
    try {
      await pool.query('DELETE FROM filter_words WHERE id = $1', [id]);
      return true;
    } catch (e) {
      return false;
    }
  },

  async updateFilterWord(id, { word, filter_type, punishment, reason }) {
    try {
      const res = await pool.query(`
        UPDATE filter_words
        SET word = COALESCE($1, word),
            filter_type = COALESCE($2, filter_type),
            punishment = COALESCE($3, punishment),
            reason = COALESCE($4, reason)
        WHERE id = $5
        RETURNING *
      `, [word ? String(word).trim().toLowerCase() : null, filter_type, punishment, reason, id]);
      return res.rows[0];
    } catch (e) {
      console.error('updateFilterWord error:', e.message);
      return null;
    }
  },

  // Chat
  async getRecentChatMessages() {
    try {
      const res = await pool.query(`
        SELECT cm.*, u.avatar_url, u.display_name, u.pro_chat_glow, u.pro_custom_flair
        FROM chat_messages cm
        LEFT JOIN users u ON cm.user_id = u.id
        WHERE cm.is_deleted = false 
        ORDER BY cm.id DESC 
        LIMIT 50
      `);
      return res.rows.reverse();
    } catch (e) {
      return [];
    }
  },

  async createChatMessage(user_id, username, role, message, audio_url = '', image_url = '') {
    try {
      const res = await pool.query(`
        INSERT INTO chat_messages (user_id, username, role, message, audio_url, image_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [user_id, username, role, message, audio_url, image_url]);
      
      const fullMsg = await pool.query(`
        SELECT cm.*, u.avatar_url, u.display_name, u.pro_chat_glow, u.pro_custom_flair
        FROM chat_messages cm
        LEFT JOIN users u ON cm.user_id = u.id
        WHERE cm.id = $1
      `, [res.rows[0].id]);

      return fullMsg.rows[0] || res.rows[0];
    } catch (e) {
      return { id: Date.now(), user_id, username, role, message, audio_url, image_url, created_at: new Date() };
    }
  },

  async deleteChatMessage(id) {
    try {
      await pool.query('UPDATE chat_messages SET is_deleted = true WHERE id = $1', [id]);
      return true;
    } catch (e) {
      return false;
    }
  },

  // Logs
  async createModerationLog(action, admin_username, target, reason) {
    try {
      await pool.query(`
        INSERT INTO moderation_logs (action, admin_username, target, reason)
        VALUES ($1, $2, $3, $4)
      `, [action, admin_username, target, reason]);

      // Trigger asynchronous AI Admin Audit in background (non-blocking)
      setTimeout(async () => {
        let auditEvaluation = 'pending_review';
        let auditScore = 0.5;
        let auditFeedback = 'AI audit could not be completed — awaiting manual review.';

        try {
          const GROQ_ENDPOINT = process.env.GROQ_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions';
          const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';
          const GROQ_AUDIT_MODEL = process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b';

          const prompt = `You are an AI Platform Security Auditor for "Nitro Games", a student academic gaming platform.
Evaluate this administrator moderation action for appropriateness, professionalism, and potential abuse of power.

Admin Action Details:
- Admin Username: ${admin_username}
- Action Performed: ${action}
- Target: ${target || 'N/A'}
- Reason Provided: ${reason || 'No reason given'}

Evaluation Criteria:
1. ABUSE OF POWER: Does this action show self-rewarding behavior, unjustified targeting of other staff, banning/punishing without cause, extremely harsh punishment disproportionate to a school context, or malicious/discriminatory language in the reason?
2. PROFESSIONALISM: Is the reason provided coherent, neutral, and school-appropriate? Is the action type legitimate for an admin role?
3. SEVERITY PROPORTIONALITY: Does the punishment severity match what would be reasonable for a student platform?

Evaluation Levels:
- "approved": Action is professional, proportionate, and appropriate.
- "flagged_inappropriate": Action is slightly unprofessional, reason is vague or borderline, or punishment is mildly excessive. Does not warrant immediate punishment — a warning is appropriate.
- "flagged_abuse": Clear abuse of power — e.g. banning another owner/admin without cause, self-rewarding coins/roles, using slurs/insults in reason fields, mass-banning without justification, or acting with obvious malicious intent. Immediate demotion + suspension warranted.

Respond ONLY with valid JSON matching this exact schema:
{
  "evaluation": "approved" | "flagged_inappropriate" | "flagged_abuse",
  "score": <float 0.0 to 1.0 — 1.0 = fully appropriate, 0.0 = severe abuse>,
  "feedback": "<2-3 clear sentences explaining your audit finding and what was or was not appropriate about this action>"
}`;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const response = await fetch(GROQ_ENDPOINT, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
              model: GROQ_AUDIT_MODEL,
              temperature: 0.1,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: 'You are an AI Platform Security Auditor. Always respond with valid JSON only.' },
                { role: 'user', content: prompt }
              ]
            })
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            const rawContent = data?.choices?.[0]?.message?.content;
            if (rawContent) {
              let cleanJson = rawContent.trim();
              if (cleanJson.startsWith('```')) {
                cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
              }
              const parsed = JSON.parse(cleanJson);
              if (parsed && parsed.evaluation) {
                auditEvaluation = parsed.evaluation;
                auditScore = typeof parsed.score === 'number' ? parsed.score : 0.5;
                auditFeedback = parsed.feedback || 'No feedback provided.';
              }
            }
          }
        } catch (err) {
          console.error('[AI Admin Audit] Groq call error:', err.message);
          // auditEvaluation stays 'pending_review' — honest fallback
        }

        // 1. Write audit result to DB
        try {
          await pool.query(`
            INSERT INTO ai_admin_audits (action, admin_username, target, reason, ai_evaluation, ai_score, ai_feedback)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [action, admin_username, target || 'N/A', reason || '', auditEvaluation, auditScore, auditFeedback]);
        } catch (e) {
          console.error('[AI Admin Audit] DB insert error:', e.message);
        }

        // 2. Enforce punishments based on audit result
        if (auditEvaluation === 'flagged_abuse') {
          // Demote admin to member + suspend for 1 day
          try {
            const adminUser = await pool.query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [admin_username]);
            if (adminUser.rows[0]) {
              const adminId = adminUser.rows[0].id;
              const isOwner = adminUser.rows[0].role === 'owner' || admin_username.toLowerCase() === 'jordandaniels';

              if (!isOwner) {
                // Demote to member
                await pool.query("UPDATE users SET role = 'member' WHERE id = $1", [adminId]);
                // Suspend for 24 hours
                const suspendUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
                await pool.query("UPDATE users SET banned_until = $1, ban_reason = $2 WHERE id = $3", [
                  suspendUntil,
                  `AI Admin Audit: Flagged for admin abuse of power. Action: ${action}. Suspended 24 hours, demoted to Member pending Owner review.`,
                  adminId
                ]);

                // Log the auto-punishment
                await pool.query(`
                  INSERT INTO moderation_logs (action, admin_username, target, reason)
                  VALUES ('AI_AUDIT_AUTO_DEMOTION', 'AI_SECURITY_ENGINE', $1, $2)
                `, [admin_username, `AI Admin Audit flagged abuse of power. Original action: ${action}. Admin demoted to Member and suspended 24h. Feedback: ${auditFeedback}`]);

                console.warn(`[AI Admin Audit] 🚨 ABUSE DETECTED — @${admin_username} demoted and suspended for: ${action}`);
              }
            }
          } catch (e) {
            console.error('[AI Admin Audit] Punishment enforcement error:', e.message);
          }

          // Broadcast real-time alert to all connected owners
          try {
            const { io } = require('../index') || {};
            // io may not be importable from db.js — use global if set
            const appIo = global.__nitro_io__;
            if (appIo) {
              appIo.emit('system_notification', {
                title: `🚨 AI Audit: Admin Abuse Detected`,
                message: `@${admin_username} was automatically demoted for abuse of power: "${action}" on @${target}. Feedback: ${auditFeedback}`,
                level: 'error'
              });
            }
          } catch (e) {}

        } else if (auditEvaluation === 'flagged_inappropriate') {
          // Send a real-time warning to connected admins — no demotion
          try {
            const appIo = global.__nitro_io__;
            if (appIo) {
              appIo.to('admin_channel').emit('system_notification', {
                title: `⚠️ AI Audit: Action Flagged`,
                message: `@${admin_username}'s action "${action}" on @${target} was flagged as unprofessional (score: ${auditScore.toFixed(2)}). Feedback: ${auditFeedback}`,
                level: 'warning'
              });
            }
          } catch (e) {}
        }

      }, 100);

    } catch (e) {}
  },

  async getAiAdminAudits() {
    try {
      const res = await pool.query('SELECT * FROM ai_admin_audits ORDER BY created_at DESC LIMIT 100');
      return res.rows;
    } catch (e) {
      console.error('getAiAdminAudits error:', e.message);
      return [];
    }
  },

  // Visitor Counter
  async incrementSiteVisits() {
    try {
      const current = await this.getSetting('site_visits_count');
      const count = (parseInt(current, 10) || 0) + 1;
      await this.setSetting('site_visits_count', count.toString());
      return count;
    } catch (e) {
      return 1;
    }
  },

  async getSiteVisits() {
    try {
      const current = await this.getSetting('site_visits_count');
      return parseInt(current, 10) || 128;
    } catch (e) {
      return 128;
    }
  },

  // Leaderboards & Playtime Tracking
  async recordGamePlaytime(userId, username, seconds = 60, gamePlayed = false) {
    if (!userId) return null;
    try {
      const earnedXp = Math.max(10, Math.floor(seconds / 6));
      const earnedCoins = Math.max(5, Math.floor(seconds / 12));

      await pool.query(`
        UPDATE users 
        SET xp = COALESCE(xp, 0) + $1, coins = COALESCE(coins, 0) + $2 
        WHERE id = $3
      `, [earnedXp, earnedCoins, userId]);

      const res = await pool.query(`
        INSERT INTO user_game_stats (user_id, username, total_time_seconds, games_played, xp, coins, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id)
        DO UPDATE SET 
          total_time_seconds = user_game_stats.total_time_seconds + $3,
          games_played = user_game_stats.games_played + $4,
          xp = COALESCE(user_game_stats.xp, 0) + $5,
          coins = COALESCE(user_game_stats.coins, 0) + $6,
          username = $2,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [userId, username, seconds, gamePlayed ? 1 : 0, earnedXp, earnedCoins]);
      // Update quests progress
      await this.updateQuestProgress(userId, 'playtime', seconds);
      if (gamePlayed) {
        await this.updateQuestProgress(userId, 'play_games', 1);
      }

      return res.rows[0];
    } catch (e) {
      console.error('recordGamePlaytime error:', e.message);
      return null;
    }
  },

  async getTopPlaytimeLeaderboard() {
    try {
      const res = await pool.query(`
        SELECT ugs.*, u.avatar_url, u.display_name, u.role, u.pro_chat_glow
        FROM user_game_stats ugs
        LEFT JOIN users u ON ugs.user_id = u.id
        ORDER BY ugs.total_time_seconds DESC
        LIMIT 25
      `);
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async getTopGamesLeaderboard() {
    try {
      const res = await pool.query(`
        SELECT ugs.*, u.avatar_url, u.display_name, u.role, u.pro_chat_glow
        FROM user_game_stats ugs
        LEFT JOIN users u ON ugs.user_id = u.id
        ORDER BY ugs.games_played DESC
        LIMIT 25
      `);
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async getTopChattersLeaderboard() {
    try {
      const res = await pool.query(`
        SELECT count(cm.id) as message_count, u.id as user_id, u.username, u.display_name, u.role, u.avatar_url, u.pro_chat_glow,
               COALESCE(ugs.total_time_seconds, 0) as total_time_seconds, COALESCE(ugs.games_played, 0) as games_played
        FROM chat_messages cm
        JOIN users u ON cm.user_id = u.id
        LEFT JOIN user_game_stats ugs ON u.id = ugs.user_id
        GROUP BY u.id, u.username, u.display_name, u.role, u.avatar_url, u.pro_chat_glow, ugs.total_time_seconds, ugs.games_played
        ORDER BY message_count DESC
        LIMIT 25
      `);
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  // Favorites & Playlists
  async getUserFavorites(userId) {
    if (!userId) return [];
    try {
      const res = await pool.query(`
        SELECT g.* 
        FROM user_favorites uf
        JOIN games g ON uf.game_id = g.id
        WHERE uf.user_id = $1
        ORDER BY uf.created_at DESC
      `, [userId]);
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async toggleUserFavorite(userId, gameId) {
    if (!userId || !gameId) return false;
    try {
      const exists = await pool.query('SELECT 1 FROM user_favorites WHERE user_id = $1 AND game_id = $2', [userId, gameId]);
      if (exists.rows.length) {
        await pool.query('DELETE FROM user_favorites WHERE user_id = $1 AND game_id = $2', [userId, gameId]);
        return { isFavorite: false };
      } else {
        await pool.query('INSERT INTO user_favorites (user_id, game_id) VALUES ($1, $2)', [userId, gameId]);
        return { isFavorite: true };
      }
    } catch (e) {
      return { isFavorite: false };
    }
  },

  async getUserPlaylists(userId) {
    if (!userId) return [];
    try {
      const res = await pool.query('SELECT * FROM user_playlists WHERE user_id = $1 ORDER BY id DESC', [userId]);
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async createPlaylist(userId, title) {
    try {
      const res = await pool.query('INSERT INTO user_playlists (user_id, title, game_ids) VALUES ($1, $2, $3) RETURNING *', [userId, title.trim(), JSON.stringify([])]);
      return res.rows[0];
    } catch (e) {
      return null;
    }
  },

  async addGameToPlaylist(userId, playlistId, gameId) {
    try {
      const pl = await pool.query('SELECT game_ids FROM user_playlists WHERE id = $1 AND user_id = $2', [playlistId, userId]);
      if (!pl.rows.length) return null;
      let ids = Array.isArray(pl.rows[0].game_ids) ? pl.rows[0].game_ids : JSON.parse(pl.rows[0].game_ids || '[]');
      if (!ids.includes(gameId)) ids.push(gameId);
      await pool.query('UPDATE user_playlists SET game_ids = $1 WHERE id = $2', [JSON.stringify(ids), playlistId]);
      return true;
    } catch (e) {
      return false;
    }
  },

  async deletePlaylist(userId, playlistId) {
    try {
      await pool.query('DELETE FROM user_playlists WHERE id = $1 AND user_id = $2', [playlistId, userId]);
      return true;
    } catch (e) {
      return false;
    }
  },

  // Cloud Game Saves
  async getCloudGameSave(userId, gameSlug) {
    if (!userId || !gameSlug) return null;
    try {
      const res = await pool.query('SELECT save_data, updated_at FROM cloud_game_saves WHERE user_id = $1 AND game_slug = $2', [userId, gameSlug.toLowerCase()]);
      return res.rows[0] || null;
    } catch (e) {
      return null;
    }
  },

  async saveCloudGameSave(userId, gameSlug, saveData) {
    if (!userId || !gameSlug) return null;
    try {
      const res = await pool.query(`
        INSERT INTO cloud_game_saves (user_id, game_slug, save_data, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, game_slug)
        DO UPDATE SET save_data = $3, updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [userId, gameSlug.toLowerCase(), typeof saveData === 'object' ? JSON.stringify(saveData) : saveData]);
      return res.rows[0];
    } catch (e) {
      return null;
    }
  },

  // Game Ratings & Reviews
  async getGameReviews(gameSlug) {
    try {
      const res = await pool.query(`
        SELECT gr.*, u.avatar_url, u.display_name, u.role 
        FROM game_reviews gr
        LEFT JOIN users u ON gr.user_id = u.id
        WHERE gr.game_slug = $1
        ORDER BY gr.id DESC
        LIMIT 30
      `, [gameSlug.toLowerCase()]);

      const avgRes = await pool.query('SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM game_reviews WHERE game_slug = $1', [gameSlug.toLowerCase()]);
      const avg = parseFloat(avgRes.rows[0]?.avg_rating || 0).toFixed(1);
      const total = parseInt(avgRes.rows[0]?.count || 0, 10);

      return {
        reviews: res.rows,
        averageRating: parseFloat(avg),
        totalReviews: total
      };
    } catch (e) {
      return { reviews: [], averageRating: 5.0, totalReviews: 0 };
    }
  },

  async addGameReview(userId, username, gameSlug, rating, reviewText, tips) {
    try {
      const res = await pool.query(`
        INSERT INTO game_reviews (user_id, username, game_slug, rating, review_text, tips)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [userId, username, gameSlug.toLowerCase(), Math.min(5, Math.max(1, parseInt(rating, 10) || 5)), reviewText || '', tips || '']);
      return res.rows[0];
    } catch (e) {
      return null;
    }
  },

  // Catalog Bulk Importer
  async bulkInsertGames(gamesArray, adminUsername = 'Admin') {
    let imported = 0;
    for (const g of gamesArray) {
      if (!g.title) continue;
      const slug = g.slug || g.title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 80);
      try {
        await pool.query(`
          INSERT INTO games (title, slug, author, thumbnail_url, embed_type, embed_content, is_vip, category, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (slug) DO UPDATE SET 
            title = $1, thumbnail_url = $4, embed_content = $6, category = $8
        `, [
          g.title,
          slug,
          g.author || 'Catalog Lab',
          g.thumbnail_url || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400',
          g.embed_type || (g.embed_content?.startsWith('http') ? 'iframe_url' : 'html_code'),
          g.embed_content || '',
          Boolean(g.is_vip),
          g.category || 'Action',
          adminUsername
        ]);
        imported++;
      } catch (err) {
        console.error('Bulk game insert error for', g.title, err.message);
      }
    }
    return imported;
  },

  // Searchable & Filtered Moderation Logs
  async getFilteredModerationLogs({ username, action, startDate, endDate }) {
    try {
      let sql = 'SELECT * FROM moderation_logs WHERE 1=1';
      const params = [];

      if (username && username.trim() !== '') {
        params.push(`%${username.trim()}%`);
        sql += ` AND (admin_username ILIKE $${params.length} OR target ILIKE $${params.length})`;
      }

      if (action && action.trim() !== '' && action !== 'ALL') {
        params.push(action.trim());
        sql += ` AND action = $${params.length}`;
      }

      if (startDate) {
        params.push(startDate);
        sql += ` AND created_at >= $${params.length}`;
      }

      if (endDate) {
        params.push(endDate);
        sql += ` AND created_at <= $${params.length}`;
      }

      sql += ' ORDER BY id DESC LIMIT 100';
      const res = await pool.query(sql, params);
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  // Retrieve all moderation logs (no filter)
  async getModerationLogs() {
    try {
      const res = await pool.query('SELECT * FROM moderation_logs ORDER BY id DESC LIMIT 100');
      return res.rows;
    } catch (e) {
      console.error('getModerationLogs error:', e.message);
      return [];
    }
  },

  // Real-Time Activity Radar Stats
  async getActivityRadarStats() {
    try {
      const topGames = await pool.query('SELECT title, clicks, category FROM games ORDER BY clicks DESC LIMIT 5');
      const recentLogs = await pool.query('SELECT action, COUNT(*) as count FROM moderation_logs GROUP BY action ORDER BY count DESC LIMIT 6');
      const activeUsers = await pool.query("SELECT role, COUNT(*) as count FROM users GROUP BY role");
      const visits = await this.getSiteVisits();

      return {
        totalVisits: visits,
        topGames: topGames.rows,
        actionsDistribution: recentLogs.rows,
        userRolesDistribution: activeUsers.rows
      };
    } catch (e) {
      return { totalVisits: 100, topGames: [], actionsDistribution: [], userRolesDistribution: [] };
    }
  },

  // Stats
  async getStats() {
    try {
      const [u, g, p, c, v] = await Promise.all([
        pool.query('SELECT COUNT(*) as count FROM users'),
        pool.query('SELECT COUNT(*) as count FROM games'),
        pool.query("SELECT COUNT(*) as count FROM users WHERE role IN ('pro', 'vip')"),
        pool.query('SELECT COUNT(*) as count FROM chat_messages WHERE is_deleted = false'),
        this.getSiteVisits()
      ]);
      return {
        totalUsers: parseInt(u.rows[0].count, 10),
        totalGames: parseInt(g.rows[0].count, 10),
        vipUsers: parseInt(p.rows[0].count, 10),
        totalChats: parseInt(c.rows[0].count, 10),
        totalVisits: v
      };
    } catch (e) {
      return { totalUsers: 1, totalGames: 4, vipUsers: 1, totalChats: 0, totalVisits: 100 };
    }
  },

  // Direct Messages (DMs)
  async createDM(senderId, receiverId, senderUsername, receiverUsername, content, imageUrl = '', audioUrl = '') {
    try {
      const res = await pool.query(`
        INSERT INTO direct_messages (sender_id, receiver_id, sender_username, receiver_username, content, message, image_url, audio_url)
        VALUES ($1, $2, $3, $4, $5, $5, $6, $7)
        RETURNING id, sender_id, receiver_id, sender_username, receiver_username, COALESCE(content, message) as content, image_url, audio_url, created_at
      `, [senderId, receiverId, senderUsername, receiverUsername, content, imageUrl || '', audioUrl || '']);
      return res.rows[0];
    } catch (e) {
      console.error('createDM error:', e.message);
      return {
        id: Date.now(),
        sender_id: senderId,
        receiver_id: receiverId,
        sender_username: senderUsername,
        receiver_username: receiverUsername,
        content,
        image_url: imageUrl || '',
        audio_url: audioUrl || '',
        created_at: new Date().toISOString()
      };
    }
  },

  async getDMs(username1, username2) {
    try {
      const res = await pool.query(`
        SELECT id, sender_id, receiver_id, sender_username, receiver_username, COALESCE(content, message) as content, image_url, audio_url, created_at 
        FROM direct_messages
        WHERE (LOWER(sender_username) = LOWER($1) AND LOWER(receiver_username) = LOWER($2))
           OR (LOWER(sender_username) = LOWER($2) AND LOWER(receiver_username) = LOWER($1))
        ORDER BY id ASC LIMIT 100
      `, [username1, username2]);
      return res.rows;
    } catch (e) {
      console.error('getDMs error:', e.message);
      return [];
    }
  },

  async getUserConversations(username) {
    try {
      const res = await pool.query(`
        SELECT DISTINCT ON (other_user) 
          other_user, message, created_at
        FROM (
          SELECT 
            CASE 
              WHEN LOWER(sender_username) = LOWER($1) THEN receiver_username 
              ELSE sender_username 
            END AS other_user,
            COALESCE(content, message) as message,
            created_at
          FROM direct_messages
          WHERE LOWER(sender_username) = LOWER($1) OR LOWER(receiver_username) = LOWER($1)
        ) sub
        ORDER BY other_user, created_at DESC
      `, [username]);
      return res.rows;
    } catch (e) {
      console.error('getUserConversations error:', e.message);
      return [];
    }
  },

  async getSoundboardSounds(username) {
    try {
      const res = await pool.query(`
        SELECT * FROM custom_soundboard_sounds
        WHERE is_global = true OR LOWER(uploaded_by) = LOWER($1)
        ORDER BY is_global DESC, id DESC
      `, [username || '']);
      return res.rows;
    } catch (e) {
      console.error('getSoundboardSounds error:', e.message);
      return [];
    }
  },

  async createSoundboardSound({ title, icon, audioUrl, isGlobal, uploadedBy }) {
    try {
      const res = await pool.query(`
        INSERT INTO custom_soundboard_sounds (title, icon, audio_url, is_global, uploaded_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [title, icon || '🎵', audioUrl, isGlobal || false, uploadedBy]);
      return res.rows[0];
    } catch (e) {
      console.error('createSoundboardSound error:', e.message);
      throw e;
    }
  },

  async deleteSoundboardSound(id, username, isOwnerOrAdmin) {
    try {
      if (isOwnerOrAdmin) {
        await pool.query('DELETE FROM custom_soundboard_sounds WHERE id = $1', [id]);
      } else {
        await pool.query('DELETE FROM custom_soundboard_sounds WHERE id = $1 AND LOWER(uploaded_by) = LOWER($2)', [id, username]);
      }
      return true;
    } catch (e) {
      console.error('deleteSoundboardSound error:', e.message);
      return false;
    }
  },

  // Game Suggestions & Upvoting
  async getGameSuggestions() {
    try {
      const res = await pool.query('SELECT * FROM game_suggestions ORDER BY upvotes DESC, id DESC LIMIT 50');
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async createGameSuggestion(...args) {
    let userId = null;
    let username = 'Guest';
    let title = '';
    let description = '';
    let gameUrl = '';

    if (args.length === 3) {
      // 3-argument signature: (title, details, username)
      title = args[0];
      description = args[1];
      username = args[2] || 'Guest';
    } else {
      // 5-argument signature: (userId, username, title, description, gameUrl)
      userId = parseInt(args[0], 10) || null;
      username = args[1] || 'Guest';
      title = args[2];
      description = args[3] || args[2];
      gameUrl = args[4] || '';
    }

    try {
      const uId = userId;
      const descText = description || title;
      const res = await pool.query(`
        INSERT INTO game_suggestions (user_id, username, title, description, details, game_url, upvotes, voters)
        VALUES ($1, $2, $3, $4, $4, $5, 1, $6)
        RETURNING *
      `, [uId, username, title, descText, gameUrl, JSON.stringify([username])]);
      return res.rows[0];
    } catch (e) {
      console.error('createGameSuggestion error:', e.message);
      return null;
    }
  },

  async upvoteGameSuggestion(id, username) {
    try {
      const currentRes = await pool.query('SELECT * FROM game_suggestions WHERE id = $1', [id]);
      if (!currentRes.rows[0]) return null;

      const sug = currentRes.rows[0];
      let voters = [];
      try { voters = JSON.parse(sug.voters || '[]'); } catch (e) {}

      if (voters.includes(username)) {
        return sug;
      }

      voters.push(username);
      const newCount = sug.upvotes + 1;

      const res = await pool.query(`
        UPDATE game_suggestions SET upvotes = $1, voters = $2 WHERE id = $3 RETURNING *
      `, [newCount, JSON.stringify(voters), id]);
      return res.rows[0];
    } catch (e) {
      return null;
    }
  },

  async getGameSuggestionById(id) {
    try {
      const res = await pool.query('SELECT * FROM game_suggestions WHERE id = $1', [id]);
      return res.rows[0] || null;
    } catch (e) {
      return null;
    }
  },

  async deleteGameSuggestion(id) {
    try {
      await pool.query('DELETE FROM game_suggestions WHERE id = $1', [id]);
      return true;
    } catch (e) {
      return false;
    }
  },

  // IP Tracker & Ban Management
  async logUserIp(userId, username, ipAddress, userAgent) {
    if (!ipAddress) return;
    try {
      // Optional location / ISP lookup (ignore failures)
      let locationInfo = null;
      try {
        const resp = await fetch(`https://ipapi.co/${ipAddress}/json/`);
        const data = await resp.json();
        if (data && (data.city || data.region || data.country_name || data.org)) {
          const parts = [data.city, data.region, data.country_name].filter(Boolean);
          locationInfo = parts.join(', ') + (data.org ? ` (${data.org})` : '');
        } else if (ipAddress.startsWith('127.') || ipAddress === '::1') {
          locationInfo = 'Localhost';
        }
      } catch (_) {}
      // Update existing log for this user (or IP for guests) or insert new
      let existing;
      if (userId) {
        existing = await pool.query('SELECT id FROM ip_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]);
      } else {
        existing = await pool.query('SELECT id FROM ip_logs WHERE ip_address = $1 ORDER BY created_at DESC LIMIT 1', [ipAddress]);
      }
      if (existing.rows.length) {
        await pool.query(
          `UPDATE ip_logs SET ip_address=$1, user_agent=$2, location_info=$3, created_at=CURRENT_TIMESTAMP WHERE id=$4`,
          [ipAddress, userAgent || '', locationInfo, existing.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO ip_logs (user_id, username, ip_address, user_agent, location_info, created_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [userId || null, username || 'Guest', ipAddress, userAgent || '', locationInfo]
        );
      }
    } catch (e) {
      // ignore logging errors
    }
  },

  async getIpLogs() {
    try {
      const res = await pool.query(`
        SELECT l.id, l.user_id, l.username, l.ip_address, l.user_agent, l.location_info, l.created_at,
               COALESCE(b.id IS NOT NULL, false) as is_banned
        FROM ip_logs l
        LEFT JOIN banned_ips b ON l.ip_address = b.ip_address
        ORDER BY l.id DESC LIMIT 200
      `);
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async banIp(ipAddress, reason, adminUsername) {
    try {
      const res = await pool.query(`
        INSERT INTO banned_ips (ip_address, reason, banned_by, created_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (ip_address) DO UPDATE SET reason = $2, banned_by = $3
        RETURNING *
      `, [ipAddress, reason || 'Banned by admin', adminUsername || 'admin']);
      return res.rows[0];
    } catch (e) {
      return null;
    }
  },

  async unbanIp(ipAddress) {
    try {
      await pool.query('DELETE FROM banned_ips WHERE ip_address = $1', [ipAddress]);
      return true;
    } catch (e) {
      return false;
    }
  },

  async isIpBanned(ipAddress) {
    if (!ipAddress) return false;
    try {
      const res = await pool.query('SELECT 1 FROM banned_ips WHERE ip_address = $1', [ipAddress]);
      return res.rows.length > 0;
    } catch (e) {
      return false;
    }
  },

  // Owner Feature Toggles Management
  async getFeatureSettings() {
    try {
      const res = await pool.query("SELECT key, value FROM site_settings WHERE key LIKE 'feature_%'");
      const features = {
        feature_gateway_enabled: 'true',
        feature_chat_enabled: 'true',
        feature_games_enabled: 'true',
        feature_ai_enabled: 'true',
        feature_soundboard_enabled: 'true',
        feature_polls_enabled: 'true',
        feature_voice_enabled: 'true'
      };
      res.rows.forEach(r => {
        features[r.key] = r.value;
      });
      return features;
    } catch (e) {
      return {
        feature_gateway_enabled: 'true',
        feature_chat_enabled: 'true',
        feature_games_enabled: 'true',
        feature_ai_enabled: 'true',
        feature_soundboard_enabled: 'true',
        feature_polls_enabled: 'true',
        feature_voice_enabled: 'true'
      };
    }
  },

  async updateFeatureSetting(key, enabled) {
    try {
      const valStr = enabled ? 'true' : 'false';
      await pool.query(
        "INSERT INTO site_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP",
        [key, valStr]
      );
      return true;
    } catch (e) {
      console.error('updateFeatureSetting error:', e.message);
      return false;
    }
  },

  // Blocked Domains CRUD
  async getBlockedDomains() {
    try {
      const res = await pool.query("SELECT * FROM blocked_domains ORDER BY id DESC");
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async addBlockedDomain(domain, reason) {
    try {
      const cleanDomain = domain.toLowerCase().trim();
      const res = await pool.query(
        "INSERT INTO blocked_domains (domain, reason) VALUES ($1, $2) ON CONFLICT (domain) DO UPDATE SET reason = $2 RETURNING *",
        [cleanDomain, reason || 'Restricted domain']
      );
      return res.rows[0];
    } catch (e) {
      return null;
    }
  },

  async deleteBlockedDomain(id) {
    try {
      await pool.query("DELETE FROM blocked_domains WHERE id = $1", [id]);
      return true;
    } catch (e) {
      return false;
    }
  },

  async clearAllChatMessages() {
    try {
      await pool.query("DELETE FROM chat_messages");
      return true;
    } catch (e) {
      console.error('clearAllChatMessages error:', e.message);
      return false;
    }
  },



  async createUserAdmin({ username, display_name, password, role = 'member', avatar_url = '' }) {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const b64Password = Buffer.from(password, 'utf8').toString('base64');
      const res = await pool.query(
        'INSERT INTO users (username, display_name, password_hash, role, avatar_url, force_password_reset) VALUES ($1, $2, $3, $4, $5, false) RETURNING *',
        [cleanUsername, display_name || cleanUsername, b64Password, role, avatar_url]
      );
      return res.rows[0];
    } catch (e) {
      console.error('createUserAdmin error:', e.message);
      return null;
    }
  },

  async createContactMessage(name, email, department, subject, message) {
    try {
      const res = await pool.query(
        'INSERT INTO contact_messages (name, email, department, subject, message) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [name, email, department, subject, message]
      );
      return res.rows[0];
    } catch (e) {
      console.error('createContactMessage error:', e.message);
      return null;
    }
  },

  async getContactMessages() {
    try {
      const res = await pool.query('SELECT * FROM contact_messages ORDER BY id DESC LIMIT 50');
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async banUser(userId, reason = 'Account suspended', durationDays = 0) {
    try {
      let bannedUntil = null;
      const days = Number(durationDays) || 0;
      if (days > 0) {
        bannedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      }

      const threshold = await this.getAdminReviewHoldThreshold();
      let isDisabledForReview = false;
      if (threshold === 'all_bans' && (days > 0 || days === 0)) isDisabledForReview = true;
      else if (threshold === '1d' && (days >= 1 || days === 0)) isDisabledForReview = true;
      else if (threshold === '3d' && (days >= 3 || days === 0)) isDisabledForReview = true;
      else if (threshold === '7d' && (days >= 7 || days === 0)) isDisabledForReview = true;
      else if (threshold === '10d' && (days >= 10 || days === 0)) isDisabledForReview = true;
      else if (threshold === 'disabled') isDisabledForReview = false;

      const reviewReason = isDisabledForReview ? `${days > 0 ? days + '-Day' : 'Permanent'} Suspension pending Admin Review. Reason: ${reason}` : '';

      await pool.query(
        'UPDATE users SET is_banned = true, ban_reason = $1, banned_until = $2, is_disabled_for_review = $3, review_disable_reason = $4 WHERE id = $5',
        [reason, bannedUntil, isDisabledForReview, reviewReason, userId]
      );
      return { success: true, bannedUntil, isDisabledForReview };
    } catch (e) {
      console.error('banUser error:', e.message);
      return false;
    }
  },

  async logAiModerationViolation({ userId, username, message, category, severity, confidence, action_taken, reason }) {
    try {
      const res = await pool.query(`
        INSERT INTO ai_moderation_logs (user_id, username, message, category, severity, confidence, action_taken, reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [userId || null, username || 'Anonymous', message, category || 'general', severity || 'medium', confidence || 1.0, action_taken || 'blocked', reason || '']);
      return res.rows[0];
    } catch (e) {
      console.error('logAiModerationViolation error:', e.message);
      return null;
    }
  },

  async getAiModerationLogs(limit = 100) {
    try {
      const res = await pool.query('SELECT * FROM ai_moderation_logs ORDER BY id DESC LIMIT $1', [limit]);
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async clearAiModerationLogs() {
    try {
      await pool.query('DELETE FROM ai_moderation_logs');
      return true;
    } catch (e) {
      return false;
    }
  },

  async createAppeal({ userId, username, punishmentType, originalReason, appealText, incidentCategory, incidentDescription, whySecondChance, preventionCommitment, rulesAgreed, aiRecommendation, aiRationale, aiConfidence }) {
    try {
      const res = await pool.query(`
        INSERT INTO appeals (user_id, username, punishment_type, original_reason, appeal_text, incident_category, incident_description, why_second_chance, prevention_commitment, rules_agreed, ai_recommendation, ai_rationale, ai_confidence, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
        RETURNING *
      `, [
        userId || null,
        username,
        punishmentType || 'punishment',
        originalReason || 'Policy violation',
        appealText || '',
        incidentCategory || 'General Rule Violation',
        incidentDescription || '',
        whySecondChance || '',
        preventionCommitment || '',
        rulesAgreed !== false,
        aiRecommendation || 'review',
        aiRationale || '',
        aiConfidence || 0.9
      ]);
      return res.rows[0];
    } catch (e) {
      console.error('createAppeal error:', e.message);
      return null;
    }
  },

  async getAppeals(statusFilter = null) {
    try {
      let query = 'SELECT * FROM appeals';
      const params = [];
      if (statusFilter && statusFilter !== 'all') {
        query += ' WHERE status = $1';
        params.push(statusFilter);
      }
      query += ' ORDER BY id DESC';
      const res = await pool.query(query, params);
      return res.rows;
    } catch (e) {
      console.error('getAppeals error:', e.message);
      return [];
    }
  },

  async getAppealById(id) {
    try {
      const res = await pool.query('SELECT * FROM appeals WHERE id = $1', [id]);
      return res.rows[0] || null;
    } catch (e) {
      return null;
    }
  },

  async hasPendingAppeal(userId, username) {
    try {
      const res = await pool.query(
        'SELECT id FROM appeals WHERE (user_id = $1 OR LOWER(username) = LOWER($2)) AND status = $3 LIMIT 1',
        [userId || 0, username || '', 'pending']
      );
      return res.rows.length > 0;
    } catch (e) {
      return false;
    }
  },

  async reviewAppeal(id, { status, adminNotes, reviewedBy }) {
    try {
      const res = await pool.query(`
        UPDATE appeals 
        SET status = $1, admin_notes = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `, [status, adminNotes || '', reviewedBy || 'Admin', id]);
      return res.rows[0] || null;
    } catch (e) {
      console.error('reviewAppeal error:', e.message);
      return null;
    }
  },

  // Social & Friendships
  async getUserFriends(userId) {
    try {
      const res = await pool.query(`
        SELECT 
          f.id as friendship_id,
          u.id as friend_id,
          u.username,
          u.display_name,
          u.role,
          u.avatar_url,
          f.created_at as became_friends_at
        FROM friendships f
        JOIN users u ON (CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END) = u.id
        WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
        ORDER BY u.username ASC
      `, [userId]);
      return res.rows;
    } catch (e) {
      console.error('getUserFriends error:', e.message);
      return [];
    }
  },

  async getPendingFriendRequests(userId) {
    try {
      const incoming = await pool.query(`
        SELECT 
          f.id as request_id,
          u.id as sender_id,
          u.username as sender_username,
          u.display_name as sender_display_name,
          u.role as sender_role,
          u.avatar_url as sender_avatar,
          f.created_at
        FROM friendships f
        JOIN users u ON f.user_id = u.id
        WHERE f.friend_id = $1 AND f.status = 'pending'
        ORDER BY f.id DESC
      `, [userId]);

      const outgoing = await pool.query(`
        SELECT 
          f.id as request_id,
          u.id as receiver_id,
          u.username as receiver_username,
          u.display_name as receiver_display_name,
          u.role as receiver_role,
          u.avatar_url as receiver_avatar,
          f.created_at
        FROM friendships f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = $1 AND f.status = 'pending'
        ORDER BY f.id DESC
      `, [userId]);

      return {
        incoming: incoming.rows,
        outgoing: outgoing.rows
      };
    } catch (e) {
      console.error('getPendingFriendRequests error:', e.message);
      return { incoming: [], outgoing: [] };
    }
  },

  async sendFriendRequest(userId, friendUsername) {
    try {
      const targetUser = await this.getUserByUsername(friendUsername);
      if (!targetUser) {
        return { error: 'User not found.' };
      }
      if (targetUser.id === userId) {
        return { error: 'You cannot send a friend request to yourself.' };
      }

      // Check existing friendship/request
      const existing = await pool.query(`
        SELECT * FROM friendships 
        WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
      `, [userId, targetUser.id]);

      if (existing.rows.length > 0) {
        const status = existing.rows[0].status;
        if (status === 'accepted') return { error: `You are already friends with @${targetUser.username}.` };
        if (existing.rows[0].user_id === userId) return { error: `Pending request already sent to @${targetUser.username}.` };
        // If the other user already sent a request to this user, auto-accept it!
        await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = $1`, [existing.rows[0].id]);
        return { success: true, autoAccepted: true, friend: targetUser };
      }

      const res = await pool.query(`
        INSERT INTO friendships (user_id, friend_id, status)
        VALUES ($1, $2, 'pending')
        RETURNING *
      `, [userId, targetUser.id]);

      return { success: true, request: res.rows[0], targetUser };
    } catch (e) {
      console.error('sendFriendRequest error:', e.message);
      return { error: 'Failed to send friend request.' };
    }
  },

  async respondFriendRequest(userId, requestId, status) {
    try {
      const req = await pool.query(`SELECT * FROM friendships WHERE id = $1 AND friend_id = $2`, [requestId, userId]);
      if (!req.rows.length) {
        return { success: false, error: 'Request not found.' };
      }
      if (status === 'accepted') {
        await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = $1`, [requestId]);
        return { success: true, status: 'accepted', senderId: req.rows[0].user_id };
      } else {
        await pool.query(`DELETE FROM friendships WHERE id = $1`, [requestId]);
        return { success: true, status: 'declined' };
      }
    } catch (e) {
      console.error('respondFriendRequest error:', e.message);
      return { success: false, error: 'Database error.' };
    }
  },

  async getShopItems() {
    try {
      // Only top-level items: items stashed inside a sub-store (store_id set)
      // are fetched separately via getStoreItems() when that store is opened.
      const res = await pool.query('SELECT * FROM shop_items WHERE is_active = true AND store_id IS NULL ORDER BY price ASC');
      return res.rows;
    } catch (e) {
      console.error('getShopItems error:', e.message);
      return [];
    }
  },

  async getAllShopItemsAdmin() {
    try {
      // Unlike getShopItems(), this includes items tucked inside sub-stores
      // so admins can still find/edit/delete them from the main items table.
      const res = await pool.query(`
        SELECT s.*, st.name AS store_name
        FROM shop_items s
        LEFT JOIN stores st ON s.store_id = st.id
        ORDER BY s.price ASC
      `);
      return res.rows;
    } catch (e) {
      console.error('getAllShopItemsAdmin error:', e.message);
      return [];
    }
  },

  async getStores() {
    try {
      const res = await pool.query('SELECT * FROM stores WHERE is_active = true ORDER BY name ASC');
      return res.rows;
    } catch (e) {
      console.error('getStores error:', e.message);
      return [];
    }
  },

  async getStoreById(id) {
    try {
      const res = await pool.query('SELECT * FROM stores WHERE id = $1', [id]);
      return res.rows[0] || null;
    } catch (e) {
      console.error('getStoreById error:', e.message);
      return null;
    }
  },

  async getStoreItems(storeId) {
    try {
      const res = await pool.query('SELECT * FROM shop_items WHERE is_active = true AND store_id = $1 ORDER BY price ASC', [storeId]);
      return res.rows;
    } catch (e) {
      console.error('getStoreItems error:', e.message);
      return [];
    }
  },

  async createStore({ name, description, image_url, banner_url, bg_color, accent_color, text_color, card_bg_color, button_label, bg_image_url, border_color, heading_color }) {
    try {
      const res = await pool.query(`
        INSERT INTO stores (name, description, image_url, banner_url, bg_color, accent_color, text_color, card_bg_color, button_label, bg_image_url, border_color, heading_color)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *
      `, [name, description || '', image_url || '', banner_url || '', bg_color || '', accent_color || '', text_color || '', card_bg_color || '', button_label || '', bg_image_url || '', border_color || '', heading_color || '']);
      return res.rows[0];
    } catch (e) {
      console.error('createStore error:', e.message);
      return null;
    }
  },

  async updateStore(id, { name, description, image_url, is_active, banner_url, bg_color, accent_color, text_color, card_bg_color, button_label, bg_image_url, border_color, heading_color }) {
    try {
      const res = await pool.query(`
        UPDATE stores
        SET name = $1, description = $2, image_url = $3, is_active = $4,
            banner_url = $5, bg_color = $6, accent_color = $7, text_color = $8, card_bg_color = $9, button_label = $10,
            bg_image_url = $11, border_color = $12, heading_color = $13
        WHERE id = $14 RETURNING *
      `, [name, description || '', image_url || '', is_active !== undefined ? Boolean(is_active) : true, banner_url || '', bg_color || '', accent_color || '', text_color || '', card_bg_color || '', button_label || '', bg_image_url || '', border_color || '', heading_color || '', id]);
      return res.rows[0];
    } catch (e) {
      console.error('updateStore error:', e.message);
      return null;
    }
  },

  async deleteStore(id) {
    try {
      // Items that lived inside this store fall back to the main shop rather
      // than vanishing (ON DELETE SET NULL on store_id handles this at the DB level).
      await pool.query('DELETE FROM stores WHERE id = $1', [id]);
      return true;
    } catch (e) {
      console.error('deleteStore error:', e.message);
      return false;
    }
  },

  async createRaffle({ title, description, ticket_cost, max_tickets_per_user, ends_at }) {
    try {
      const res = await pool.query(`
        INSERT INTO raffles (title, description, ticket_cost, max_tickets_per_user, ends_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [title, description, ticket_cost, max_tickets_per_user, ends_at]);
      return res.rows[0];
    } catch (e) {
      console.error('createRaffle error:', e.message);
      return null;
    }
  },

  async getRaffles(userId) {
    try {
      // Lazy evaluation of expired, undrawn raffles (auto-draw them!)
      const now = new Date();
      const expiredRes = await pool.query('SELECT id FROM raffles WHERE ends_at <= $1 AND is_drawn = false', [now]);
      for (const row of expiredRes.rows) {
        await this.drawRaffleWinner(row.id);
      }

      // Fetch all raffles
      const res = await pool.query(`
        SELECT r.*, 
               u.username as winner_username, 
               u.display_name as winner_display_name,
               (SELECT COUNT(*) FROM raffle_tickets t WHERE t.raffle_id = r.id) as total_tickets_sold,
               (SELECT COUNT(*) FROM raffle_tickets t WHERE t.raffle_id = r.id AND t.user_id = $1) as user_tickets_count
        FROM raffles r
        LEFT JOIN users u ON r.winner_id = u.id
        ORDER BY r.is_drawn ASC, r.ends_at ASC, r.id DESC
      `, [userId || 0]);
      return res.rows;
    } catch (e) {
      console.error('getRaffles error:', e.message);
      return [];
    }
  },

  async buyRaffleTickets(userId, raffleId, count) {
    try {
      const userRes = await pool.query('SELECT coins FROM users WHERE id = $1', [userId]);
      if (!userRes.rows.length) return { error: 'User not found.' };
      const userCoins = userRes.rows[0].coins || 0;

      const raffleRes = await pool.query('SELECT * FROM raffles WHERE id = $1', [raffleId]);
      if (!raffleRes.rows.length) return { error: 'Raffle not found.' };
      const raffle = raffleRes.rows[0];

      if (raffle.is_drawn || new Date(raffle.ends_at).getTime() <= Date.now()) {
        return { error: 'This raffle has already closed.' };
      }

      const totalCost = raffle.ticket_cost * count;
      if (userCoins < totalCost) {
        return { error: `Insufficient coins. Tickets cost 🪙 ${totalCost} but you only have 🪙 ${userCoins}.` };
      }

      // Limit check
      if (raffle.max_tickets_per_user > 0) {
        const userTicketsRes = await pool.query('SELECT COUNT(*) FROM raffle_tickets WHERE raffle_id = $1 AND user_id = $2', [raffleId, userId]);
        const userTicketsCount = parseInt(userTicketsRes.rows[0].count, 10);
        if (userTicketsCount + count > raffle.max_tickets_per_user) {
          return { error: `Purchase limit exceeded. You can only buy up to ${raffle.max_tickets_per_user} tickets (you already own ${userTicketsCount}).` };
        }
      }

      // Deduct coins & insert tickets
      await pool.query('BEGIN');
      await pool.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [totalCost, userId]);
      for (let i = 0; i < count; i++) {
        await pool.query('INSERT INTO raffle_tickets (raffle_id, user_id) VALUES ($1, $2)', [raffleId, userId]);
      }
      await pool.query('COMMIT');

      return { success: true, count, totalCost };
    } catch (e) {
      await pool.query('ROLLBACK');
      console.error('buyRaffleTickets error:', e.message);
      return { error: 'Failed to purchase raffle tickets.' };
    }
  },

  async drawRaffleWinner(raffleId) {
    try {
      const raffleRes = await pool.query('SELECT * FROM raffles WHERE id = $1', [raffleId]);
      if (!raffleRes.rows.length) return { error: 'Raffle not found.' };
      const raffle = raffleRes.rows[0];

      if (raffle.is_drawn) {
        return { error: 'Raffle winner has already been drawn.' };
      }

      // Fetch all tickets for this raffle
      const ticketsRes = await pool.query('SELECT * FROM raffle_tickets WHERE raffle_id = $1', [raffleId]);
      if (!ticketsRes.rows.length) {
        // No tickets sold - mark as drawn with no winner
        await pool.query('UPDATE raffles SET is_drawn = true WHERE id = $1', [raffleId]);
        return { success: true, winner: null };
      }

      // Pick a random ticket
      const randomIndex = Math.floor(Math.random() * ticketsRes.rows.length);
      const winningTicket = ticketsRes.rows[randomIndex];
      const winnerId = winningTicket.user_id;

      const winnerUser = await this.getUserById(winnerId);

      // Set winner
      await pool.query('UPDATE raffles SET winner_id = $1, is_drawn = true WHERE id = $2', [winnerId, raffleId]);

      // Create a login-popup notification for the winner
      await pool.query(
        'INSERT INTO raffle_win_notifications (user_id, raffle_id, raffle_title) VALUES ($1, $2, $3)',
        [winnerId, raffleId, raffle.title]
      );

      return {
        success: true,
        winner: {
          id: winnerId,
          username: winnerUser.username,
          display_name: winnerUser.display_name
        }
      };
    } catch (e) {
      console.error('drawRaffleWinner error:', e.message);
      return { error: 'Failed to draw raffle winner.' };
    }
  },

  async deleteRaffle(raffleId) {
    try {
      await pool.query('DELETE FROM raffles WHERE id = $1', [raffleId]);
      return true;
    } catch (e) {
      console.error('deleteRaffle error:', e.message);
      return false;
    }
  },

  async getUnseenRaffleWins(userId) {
    try {
      const res = await pool.query(
        `SELECT id, raffle_id, raffle_title, created_at
         FROM raffle_win_notifications
         WHERE user_id = $1 AND seen = false
         ORDER BY created_at DESC`,
        [userId]
      );
      if (res.rows.length > 0) {
        // Mark all as seen so the popup only shows once
        await pool.query(
          'UPDATE raffle_win_notifications SET seen = true WHERE user_id = $1 AND seen = false',
          [userId]
        );
      }
      return res.rows;
    } catch (e) {
      console.error('getUnseenRaffleWins error:', e.message);
      return [];
    }
  },

  async getSpinWheelSegments() {
    try {
      const res = await pool.query('SELECT * FROM spin_wheel_segments ORDER BY sort_order ASC, id ASC');
      return res.rows;
    } catch (e) {
      console.error('getSpinWheelSegments error:', e.message);
      return [];
    }
  },

  async createSpinWheelSegment({ label, coins, xp, color, probability, sort_order }) {
    try {
      const res = await pool.query(
        'INSERT INTO spin_wheel_segments (label, coins, xp, color, probability, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [label, coins || 0, xp || 0, color || '#6d28d9', probability || 0.1, sort_order || 0]
      );
      return res.rows[0];
    } catch (e) {
      console.error('createSpinWheelSegment error:', e.message);
      return null;
    }
  },

  async updateSpinWheelSegment(id, { label, coins, xp, color, probability, sort_order }) {
    try {
      const res = await pool.query(
        'UPDATE spin_wheel_segments SET label=$1, coins=$2, xp=$3, color=$4, probability=$5, sort_order=$6 WHERE id=$7 RETURNING *',
        [label, coins || 0, xp || 0, color || '#6d28d9', probability || 0.1, sort_order || 0, id]
      );
      return res.rows[0];
    } catch (e) {
      console.error('updateSpinWheelSegment error:', e.message);
      return null;
    }
  },

  async deleteSpinWheelSegment(id) {
    try {
      await pool.query('DELETE FROM spin_wheel_segments WHERE id=$1', [id]);
      return true;
    } catch (e) {
      console.error('deleteSpinWheelSegment error:', e.message);
      return false;
    }
  },

  async claimDailySpin(userId) {
    try {
      const userRes = await pool.query('SELECT last_spin_at, coins, xp FROM users WHERE id = $1', [userId]);
      if (!userRes.rows.length) return { error: 'User not found.' };
      const user = userRes.rows[0];

      const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
      if (user.last_spin_at) {
        const lastSpin = new Date(user.last_spin_at).getTime();
        const diff = Date.now() - lastSpin;
        if (diff < COOLDOWN_MS) {
          const totalMinsLeft = Math.ceil((COOLDOWN_MS - diff) / (60 * 1000));
          const hoursLeft = Math.floor(totalMinsLeft / 60);
          const minsLeft = totalMinsLeft % 60;
          const timeStr = hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft}m`;
          return { error: `Wheel is on cooldown. Try again in ${timeStr}.` };
        }
      }

      // Load segments from DB
      let segments = await this.getSpinWheelSegments();
      if (!segments.length) {
        // Fallback default
        segments = [
          { id: 0, label: '50 🪙', coins: 50, xp: 0, color: '#1d4ed8', probability: 0.5 },
          { id: 1, label: '100 🪙', coins: 100, xp: 0, color: '#047857', probability: 0.3 },
          { id: 2, label: '250 🪙', coins: 250, xp: 0, color: '#6d28d9', probability: 0.15 },
          { id: 3, label: '🎰 JACKPOT 1000 🪙', coins: 1000, xp: 0, color: '#fbbf24', probability: 0.05 }
        ];
      }

      // Normalize probabilities and pick a segment using weighted random
      const totalProb = segments.reduce((sum, s) => sum + (s.probability || 0), 0);
      let roll = Math.random() * totalProb;
      let wonSegment = segments[segments.length - 1]; // fallback last
      for (const seg of segments) {
        roll -= (seg.probability || 0);
        if (roll <= 0) {
          wonSegment = seg;
          break;
        }
      }

      const wonIndex = segments.indexOf(wonSegment);
      const reward = {
        coins: wonSegment.coins || 0,
        xp: wonSegment.xp || 0,
        text: wonSegment.label
      };

      // Update user coins, XP and spin time
      const newCoins = (user.coins || 0) + reward.coins;
      const newXp = (user.xp || 0) + reward.xp;
      const now = new Date();
      await pool.query(
        'UPDATE users SET coins = $1, xp = $2, last_spin_at = $3 WHERE id = $4',
        [newCoins, newXp, now, userId]
      );

      return {
        success: true,
        index: wonIndex,
        reward,
        newCoins,
        newXp,
        segments // send segments to client so wheel matches server state
      };
    } catch (e) {
      console.error('claimDailySpin error:', e.message);
      return { error: 'Failed to process daily spin reward.' };
    }
  },

  async purchaseShopItem(userId, itemId) {
    try {
      const itemRes = await pool.query('SELECT * FROM shop_items WHERE id = $1 AND is_active = true', [itemId]);
      if (!itemRes.rows.length) return { error: 'Item not found.' };
      const item = itemRes.rows[0];

      if (item.is_store_front) {
        return { error: 'This opens a shop and cannot be purchased directly.' };
      }

      const userRes = await pool.query('SELECT coins FROM users WHERE id = $1', [userId]);
      if (!userRes.rows.length) return { error: 'User not found.' };
      const coins = userRes.rows[0].coins || 0;

      if (coins < item.price) {
        return { error: `Insufficient coins. You need ${item.price - coins} more coins.` };
      }

      // Check if already purchased (skip for repeatable items)
      if (!item.is_repeatable) {
        const invCheck = await pool.query('SELECT * FROM user_inventory WHERE user_id = $1 AND item_id = $2', [userId, itemId]);
        if (invCheck.rows.length) {
          return { error: 'You already own this item.' };
        }
      }

      // Check stock count
      if (item.stock_count !== null && item.stock_count >= 0 && item.stock_count === 0) {
        return { error: 'This item is sold out.' };
      }

      // Deduct coins
      await pool.query('UPDATE users SET coins = COALESCE(coins, 0) - $1 WHERE id = $2', [item.price, userId]);

      // Add to inventory (upsert for non-repeatable, insert for repeatable)
      if (item.is_repeatable) {
        // For repeatable items, log each purchase in shop_purchases table
        await pool.query(`
          CREATE TABLE IF NOT EXISTS shop_purchases (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            item_id INT REFERENCES shop_items(id) ON DELETE CASCADE,
            purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await pool.query('INSERT INTO shop_purchases (user_id, item_id) VALUES ($1, $2)', [userId, itemId]);
        // Also upsert into inventory so the perk is equipped
        await pool.query(`
          INSERT INTO user_inventory (user_id, item_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, item_id) DO UPDATE SET purchased_at = CURRENT_TIMESTAMP
        `, [userId, itemId]);
      } else {
        await pool.query('INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2)', [userId, itemId]);
      }

      // Decrement stock if limited
      if (item.stock_count !== null && item.stock_count > 0) {
        await pool.query('UPDATE shop_items SET stock_count = stock_count - 1 WHERE id = $1', [itemId]);
        item.stock_count -= 1;
      }

      return { success: true, item };
    } catch (e) {
      console.error('purchaseShopItem error:', e.message);
      return { error: 'Database transaction error.' };
    }
  },


  async getUserInventory(userId) {
    try {
      const res = await pool.query(`
        SELECT i.*, s.name, s.description, s.category, s.perk_value, s.image_url 
        FROM user_inventory i
        JOIN shop_items s ON i.item_id = s.id
        WHERE i.user_id = $1
      `, [userId]);
      return res.rows;
    } catch (e) {
      console.error('getUserInventory error:', e.message);
      return [];
    }
  },

  async getQuests(userId) {
    try {
      const questsRes = await pool.query('SELECT * FROM quests WHERE is_active = true ORDER BY id ASC');
      const userQuestsRes = await pool.query('SELECT * FROM user_quests WHERE user_id = $1', [userId]);

      const now = new Date();
      const processedUqs = [];
      for (const row of userQuestsRes.rows) {
        if (row.is_claimed && row.updated_at) {
          const claimedTime = new Date(row.updated_at);
          const diffMs = now - claimedTime;
          const diffHours = diffMs / (1000 * 60 * 60);
          if (diffHours >= 24) {
            // Reset the quest progress
            await pool.query(`
              UPDATE user_quests
              SET current_value = 0, is_completed = false, is_claimed = false, updated_at = CURRENT_TIMESTAMP
              WHERE user_id = $1 AND quest_id = $2
            `, [userId, row.quest_id]);
            row.current_value = 0;
            row.is_completed = false;
            row.is_claimed = false;
          }
        }
        processedUqs.push(row);
      }

      const uqMap = new Map(processedUqs.map(q => [q.quest_id, q]));

      return questsRes.rows.map(q => {
        const uq = uqMap.get(q.id) || { current_value: 0, is_completed: false, is_claimed: false };
        return {
          id: q.id,
          title: q.title,
          description: q.description,
          type: q.type,
          target_value: q.target_value,
          reward_coins: q.reward_coins,
          reward_xp: q.reward_xp,
          current_value: uq.current_value,
          is_completed: uq.is_completed,
          is_claimed: uq.is_claimed
        };
      });
    } catch (e) {
      console.error('getQuests error:', e.message);
      return [];
    }
  },

  async updateQuestProgress(userId, questType, incrementBy = 1) {
    try {
      const activeQuests = await pool.query('SELECT * FROM quests WHERE type = $1 AND is_active = true', [questType]);
      for (const q of activeQuests.rows) {
        const uqRes = await pool.query('SELECT * FROM user_quests WHERE user_id = $1 AND quest_id = $2', [userId, q.id]);
        if (!uqRes.rows.length) {
          const isCompleted = incrementBy >= q.target_value;
          await pool.query(`
            INSERT INTO user_quests (user_id, quest_id, current_value, is_completed)
            VALUES ($1, $2, $3, $4)
          `, [userId, q.id, Math.min(q.target_value, incrementBy), isCompleted]);
        } else {
          const uq = uqRes.rows[0];

          // Check and reset if claimed >= 24 hours ago (use claimed_at, not updated_at)
          if (uq.is_claimed && uq.claimed_at) {
            const claimedTime = new Date(uq.claimed_at);
            if ((new Date() - claimedTime) / (1000 * 60 * 60) >= 24) {
              const isCompleted = incrementBy >= q.target_value;
              await pool.query(`
                UPDATE user_quests 
                SET current_value = $1, is_completed = $2, is_claimed = false, claimed_at = null, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $3 AND quest_id = $4
              `, [Math.min(q.target_value, incrementBy), isCompleted, userId, q.id]);
              continue;
            }
          }

          if (uq.is_completed) continue;

          const newValue = Math.min(q.target_value, uq.current_value + incrementBy);
          const isCompleted = newValue >= q.target_value;
          await pool.query(`
            UPDATE user_quests 
            SET current_value = $1, is_completed = $2, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $3 AND quest_id = $4
          `, [newValue, isCompleted, userId, q.id]);
        }
      }
      return true;
    } catch (e) {
      console.error('updateQuestProgress error:', e.message);
      return false;
    }
  },

  async claimQuestReward(userId, questId) {
    try {
      const uqRes = await pool.query(`
        SELECT uq.*, q.reward_coins, q.reward_xp 
        FROM user_quests uq
        JOIN quests q ON uq.quest_id = q.id
        WHERE uq.user_id = $1 AND uq.quest_id = $2
      `, [userId, questId]);

      if (!uqRes.rows.length) return { error: 'Quest progress not found.' };
      const uq = uqRes.rows[0];

      if (!uq.is_completed) return { error: 'Quest is not completed yet.' };
      if (uq.is_claimed) return { error: 'Reward has already been claimed.' };

      await pool.query(
        'UPDATE user_quests SET is_claimed = true, claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND quest_id = $2',
        [userId, questId]
      );
      await pool.query('UPDATE users SET coins = COALESCE(coins, 0) + $1, xp = COALESCE(xp, 0) + $2 WHERE id = $3', [uq.reward_coins, uq.reward_xp, userId]);

      return { success: true, reward_coins: uq.reward_coins, reward_xp: uq.reward_xp };
    } catch (e) {
      console.error('claimQuestReward error:', e.message);
      return { error: 'Database transaction error.' };
    }
  },


  async createShopItem({ name, description, price, category, perk_value, delivery_note, stock_count, image_url, is_repeatable, store_id, is_store_front, opens_store_id }) {
    try {
      const res = await pool.query(`
        INSERT INTO shop_items (name, description, price, category, perk_value, delivery_note, stock_count, image_url, is_repeatable, store_id, is_store_front, opens_store_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [name, description, price, category, perk_value, delivery_note || '', stock_count !== undefined ? stock_count : -1, image_url || '', is_repeatable ? true : false, store_id || null, is_store_front ? true : false, opens_store_id || null]);
      return res.rows[0];
    } catch (e) {
      console.error('createShopItem error:', e.message);
      return null;
    }
  },

  async deleteShopItem(id) {
    try {
      await pool.query('DELETE FROM shop_items WHERE id = $1', [id]);
      return true;
    } catch (e) {
      console.error('deleteShopItem error:', e.message);
      return false;
    }
  },

  async updateShopItem(id, { name, description, price, category, perk_value, delivery_note, stock_count, image_url, is_repeatable, store_id, is_store_front, opens_store_id }) {
    try {
      const res = await pool.query(`
        UPDATE shop_items
        SET name = $1, description = $2, price = $3, category = $4, perk_value = $5, delivery_note = $6, stock_count = $7, image_url = $8, is_repeatable = $9, store_id = $10, is_store_front = $11, opens_store_id = $12
        WHERE id = $13
        RETURNING *
      `, [name, description, price, category, perk_value, delivery_note || '', stock_count !== undefined ? stock_count : -1, image_url || '', is_repeatable ? true : false, store_id || null, is_store_front ? true : false, opens_store_id || null, id]);
      return res.rows[0];
    } catch (e) {
      console.error('updateShopItem error:', e.message);
      return null;
    }
  },


  async createQuest({ title, description, type, target_value, reward_coins, reward_xp }) {
    try {
      const res = await pool.query(`
        INSERT INTO quests (title, description, type, target_value, reward_coins, reward_xp)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [title, description, type, target_value, reward_coins, reward_xp]);
      return res.rows[0];
    } catch (e) {
      console.error('createQuest error:', e.message);
      return null;
    }
  },

  async deleteQuest(id) {
    try {
      await pool.query('DELETE FROM quests WHERE id = $1', [id]);
      return true;
    } catch (e) {
      console.error('deleteQuest error:', e.message);
      return false;
    }
  },

  async removeFriend(userId, friendId) {
    try {
      await pool.query(`
        DELETE FROM friendships 
        WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
      `, [userId, friendId]);
      return { success: true };
    } catch (e) {
      console.error('removeFriend error:', e.message);
      return { success: false };
    }
  },

  async getShopPurchases() {
    try {
      const res = await pool.query(`
        SELECT ui.purchased_at, u.username, s.name as item_name, s.category, s.price
        FROM user_inventory ui
        JOIN users u ON ui.user_id = u.id
        JOIN shop_items s ON ui.item_id = s.id
        ORDER BY ui.purchased_at DESC
      `);
      return res.rows;
    } catch (e) {
      console.error('getShopPurchases error:', e.message);
      return [];
    }
  },

  async getAiFlaggedViolations() {
    try {
      const res = await pool.query(`
        SELECT * FROM ai_moderation_logs 
        WHERE action_taken = 'ban' OR action_taken LIKE 'ban%' OR action_taken = 'mute' OR action_taken LIKE 'mute%' OR action_taken = 'BAN_3_DAYS' OR action_taken = 'banned_3d'
        ORDER BY id DESC
      `);
      return res.rows;
    } catch (e) {
      console.error('getAiFlaggedViolations error:', e.message);
      return [];
    }
  },

  async getPublicThemes() {
    try {
      const res = await pool.query('SELECT * FROM public_themes ORDER BY created_at DESC');
      return res.rows;
    } catch (e) {
      console.error('getPublicThemes error:', e.message);
      return [];
    }
  },

  async getUserModHistory(username) {
    try {
      const modLogsRes = await pool.query(`
        SELECT 'manual' as source, action, admin_username, reason, created_at, NULL::jsonb as extra
        FROM moderation_logs
        WHERE LOWER(target) = LOWER($1)
        ORDER BY created_at DESC
      `, [username]);

      const aiLogsRes = await pool.query(`
        SELECT 'ai' as source, action_taken as action, 'System (AI)' as admin_username, message as reason, created_at, 
               json_build_object('category', category, 'severity', severity, 'confidence', confidence)::jsonb as extra
        FROM ai_moderation_logs
        WHERE LOWER(username) = LOWER($1)
        ORDER BY created_at DESC
      `, [username]);

      const appealsRes = await pool.query(`
        SELECT 'appeal' as source, status as action, COALESCE(reviewed_by, 'System') as admin_username, 
               appeal_text as reason, created_at,
               json_build_object('punishment_type', punishment_type, 'ai_recommendation', ai_recommendation, 'ai_rationale', ai_rationale, 'admin_notes', admin_notes)::jsonb as extra
        FROM appeals
        WHERE LOWER(username) = LOWER($1)
        ORDER BY created_at DESC
      `, [username]);

      const combined = [
        ...modLogsRes.rows,
        ...aiLogsRes.rows,
        ...appealsRes.rows
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      return combined;
    } catch (e) {
      console.error('getUserModHistory error:', e.message);
      return [];
    }
  },

  async sharePublicTheme({ id, name, bg, accent, text, cardbg, muted, author }) {
    try {
      const res = await pool.query(`
        INSERT INTO public_themes (id, name, bg, accent, text, cardbg, muted, author)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE 
        SET name = EXCLUDED.name, bg = EXCLUDED.bg, accent = EXCLUDED.accent, 
            text = EXCLUDED.text, cardbg = EXCLUDED.cardbg, muted = EXCLUDED.muted, author = EXCLUDED.author
        RETURNING *
      `, [id, name, bg, accent, text, cardbg, muted, author || 'Community']);
      return res.rows[0];
    } catch (e) {
      console.error('sharePublicTheme error:', e.message);
      return null;
    }
  },

  async createTournament({ gameId, title, description, rewardCoins, rewardXp, rewardFlair, rewardCustom, endAt }) {
    try {
      const res = await pool.query(`
        INSERT INTO tournaments (game_id, title, description, reward_coins, reward_xp, reward_flair, reward_custom, end_at, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
        RETURNING *
      `, [gameId, title, description || '', rewardCoins || 0, rewardXp || 0, rewardFlair || '', rewardCustom || '', endAt]);
      return res.rows[0];
    } catch (e) {
      console.error('createTournament error:', e.message);
      return null;
    }
  },

  async getActiveTournaments() {
    try {
      const res = await pool.query(`
        SELECT t.*, g.title as game_title, g.thumbnail_url as game_thumbnail
        FROM tournaments t
        LEFT JOIN games g ON t.game_id = g.id
        WHERE t.is_active = true AND t.end_at > CURRENT_TIMESTAMP
        ORDER BY t.end_at ASC
      `);
      return res.rows;
    } catch (e) {
      console.error('getActiveTournaments error:', e.message);
      return [];
    }
  },

  async getTournamentLeaderboard(tournamentId) {
    try {
      const res = await pool.query(`
        SELECT ts.id, ts.user_id, ts.username, ts.score, ts.created_at, u.display_name, u.avatar_url, u.role
        FROM tournament_submissions ts
        LEFT JOIN users u ON ts.user_id = u.id
        WHERE ts.tournament_id = $1 AND ts.status = 'approved'
        ORDER BY ts.score DESC, ts.created_at ASC
        LIMIT 50
      `, [tournamentId]);
      return res.rows;
    } catch (e) {
      console.error('getTournamentLeaderboard error:', e.message);
      return [];
    }
  },

  async createTournamentSubmission(userId, username, tournamentId, score, proofImageUrl) {
    try {
      const res = await pool.query(`
        INSERT INTO tournament_submissions (user_id, username, tournament_id, score, proof_image_url, status)
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING *
      `, [userId, username, tournamentId, parseInt(score, 10), proofImageUrl]);
      return res.rows[0];
    } catch (e) {
      console.error('createTournamentSubmission error:', e.message);
      return null;
    }
  },

  async getPendingSubmissions() {
    try {
      const res = await pool.query(`
        SELECT ts.*, t.title as tournament_title, g.title as game_title
        FROM tournament_submissions ts
        JOIN tournaments t ON ts.tournament_id = t.id
        LEFT JOIN games g ON t.game_id = g.id
        WHERE ts.status = 'pending'
        ORDER BY ts.created_at ASC
      `);
      return res.rows;
    } catch (e) {
      console.error('getPendingSubmissions error:', e.message);
      return [];
    }
  },

  async reviewSubmission(submissionId, status, adminUsername, adminNotes) {
    try {
      const res = await pool.query(`
        UPDATE tournament_submissions
        SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, admin_notes = $3
        WHERE id = $4
        RETURNING *
      `, [status, adminUsername, adminNotes || '', submissionId]);
      
      const sub = res.rows[0];
      if (!sub) return null;

      if (status === 'approved') {
        const tRes = await pool.query('SELECT reward_coins, reward_xp, reward_flair FROM tournaments WHERE id = $1', [sub.tournament_id]);
        const tour = tRes.rows[0];
        if (tour) {
          await pool.query(`
            UPDATE users 
            SET coins = COALESCE(coins, 0) + $1, xp = COALESCE(xp, 0) + $2 
            WHERE id = $3
          `, [tour.reward_coins || 0, tour.reward_xp || 0, sub.user_id]);
        }
      }

      return sub;
    } catch (e) {
      console.error('reviewSubmission error:', e.message);
      return null;
    }
  },

  async closeTournament(tournamentId) {
    try {
      const res = await pool.query(`
        UPDATE tournaments
        SET is_active = false
        WHERE id = $1
        RETURNING *
      `, [tournamentId]);
      return res.rows[0];
    } catch (e) {
      console.error('closeTournament error:', e.message);
      return null;
    }
  },

  async getPromoCodes() {
    try {
      const res = await pool.query('SELECT * FROM promo_codes ORDER BY created_at DESC');
      return res.rows;
    } catch (e) {
      console.error('getPromoCodes error:', e.message);
      return [];
    }
  },

  async getPromoCodeRedemptions() {
    try {
      const query = `
        SELECT r.id, r.user_id, u.username, r.code, r.redeemed_at, c.reward_type, c.reward_value
        FROM promo_code_redemptions r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN promo_codes c ON r.code = c.code
        ORDER BY r.redeemed_at DESC
        LIMIT 100
      `;
      const res = await pool.query(query);
      return res.rows;
    } catch (e) {
      console.error('getPromoCodeRedemptions error:', e.message);
      return [];
    }
  },

  async createPromoCode(code, reward_type, reward_value, max_uses = null, expires_at = null) {
    const cleanCode = String(code).trim().toUpperCase();
    const res = await pool.query(
      'INSERT INTO promo_codes (code, reward_type, reward_value, max_uses, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [cleanCode, reward_type, parseInt(reward_value, 10), max_uses ? parseInt(max_uses, 10) : null, expires_at || null]
    );
    return res.rows[0];
  },

  async deletePromoCode(code) {
    const cleanCode = String(code).trim().toUpperCase();
    await pool.query('DELETE FROM promo_codes WHERE code = $1', [cleanCode]);
    return true;
  },

  async redeemPromoCode(userId, codeStr) {
    const cleanCode = String(codeStr).trim().toUpperCase();
    
    const codeRes = await pool.query('SELECT * FROM promo_codes WHERE code = $1', [cleanCode]);
    if (codeRes.rows.length === 0) {
      throw new Error('Invalid promo code.');
    }
    const code = codeRes.rows[0];

    if (code.expires_at && new Date() > new Date(code.expires_at)) {
      throw new Error('This promo code has expired.');
    }

    if (code.max_uses !== null && code.uses >= code.max_uses) {
      throw new Error('This promo code has reached its maximum usage limit.');
    }

    const redRes = await pool.query(
      'SELECT id FROM promo_code_redemptions WHERE user_id = $1 AND code = $2',
      [userId, cleanCode]
    );
    if (redRes.rows.length > 0) {
      throw new Error('You have already redeemed this promo code.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'INSERT INTO promo_code_redemptions (user_id, code) VALUES ($1, $2)',
        [userId, cleanCode]
      );

      await client.query(
        'UPDATE promo_codes SET uses = uses + 1 WHERE code = $1',
        [cleanCode]
      );

      let details = '';
      if (code.reward_type === 'coins') {
        await client.query('UPDATE users SET coins = COALESCE(coins, 0) + $1 WHERE id = $2', [code.reward_value, userId]);
        details = `Redeemed code "${cleanCode}" for +${code.reward_value} coins`;
      } else if (code.reward_type === 'xp') {
        await client.query('UPDATE users SET xp = COALESCE(xp, 0) + $1 WHERE id = $2', [code.reward_value, userId]);
        details = `Redeemed code "${cleanCode}" for +${code.reward_value} XP`;
      } else if (code.reward_type === 'premium') {
        await client.query("UPDATE users SET role = 'pro' WHERE id = $1", [userId]);
        details = `Redeemed code "${cleanCode}" for Premium PRO Status Upgrade`;
      }

      await client.query('COMMIT');
      client.release();
      
      clearUserCache(userId);

      return { success: true, reward_type: code.reward_type, reward_value: code.reward_value, details };
    } catch (err) {
      await client.query('ROLLBACK');
      client.release();
      throw err;
    }
  }
};

// Automatically synchronize tables on boot
db.initPostgres();

module.exports = db;

