const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xulngyyikaymnmxitzto:ZgrsG1hhXsOuv4ac@aws-0-ca-central-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected Supabase PostgreSQL pool error:', err.message);
});

console.log('⚡ [DB] Supabase Pool configured.');

const db = {
  pool,

  async initPostgres() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          display_name VARCHAR(100),
          bio TEXT DEFAULT '',
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(20) DEFAULT 'member',
          avatar_url TEXT DEFAULT '',
          pro_chat_glow VARCHAR(50) DEFAULT 'gold',
          pro_custom_flair VARCHAR(50) DEFAULT '',
          is_banned BOOLEAN DEFAULT false,
          is_gateway_banned BOOLEAN DEFAULT false,
          ban_reason TEXT DEFAULT '',
          gateway_timeout_until TIMESTAMP,
          gateway_violations_count INT DEFAULT 0,
          banned_until TIMESTAMP,
          muted_until TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_gateway_banned BOOLEAN DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT DEFAULT '';

        CREATE TABLE IF NOT EXISTS games (
          id SERIAL PRIMARY KEY,
          title VARCHAR(100) NOT NULL,
          slug VARCHAR(100) UNIQUE NOT NULL,
          author VARCHAR(100),
          thumbnail_url TEXT,
          embed_type VARCHAR(20) DEFAULT 'html_code',
          embed_content TEXT,
          is_vip BOOLEAN DEFAULT false,
          category VARCHAR(50) DEFAULT 'Action',
          clicks INT DEFAULT 0,
          created_by VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS filter_words (
          id SERIAL PRIMARY KEY,
          word VARCHAR(100) UNIQUE NOT NULL,
          filter_type VARCHAR(20) DEFAULT 'both',
          punishment VARCHAR(50) DEFAULT 'censor',
          reason TEXT DEFAULT '',
          created_by VARCHAR(100) DEFAULT 'admin',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE filter_words ADD COLUMN IF NOT EXISTS punishment VARCHAR(50) DEFAULT 'censor';
        ALTER TABLE filter_words ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT '';
        ALTER TABLE filter_words ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) DEFAULT 'admin';

        CREATE TABLE IF NOT EXISTS chat_messages (
          id SERIAL PRIMARY KEY,
          user_id INT,
          username VARCHAR(50) NOT NULL,
          role VARCHAR(20) DEFAULT 'member',
          message TEXT NOT NULL,
          is_deleted BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS direct_messages (
          id SERIAL PRIMARY KEY,
          sender_id INT,
          receiver_id INT,
          sender_username VARCHAR(50) NOT NULL,
          receiver_username VARCHAR(50) NOT NULL,
          message TEXT NOT NULL,
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
          created_by VARCHAR(50),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS poll_votes (
          id SERIAL PRIMARY KEY,
          poll_id INT REFERENCES community_polls(id) ON DELETE CASCADE,
          user_id INT,
          option_index INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(poll_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS moderation_logs (
          id SERIAL PRIMARY KEY,
          action VARCHAR(50) NOT NULL,
          admin_username VARCHAR(50) NOT NULL,
          target VARCHAR(100),
          reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS site_settings (
          key VARCHAR(50) PRIMARY KEY,
          value TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS announcements (
          id SERIAL PRIMARY KEY,
          title VARCHAR(150) NOT NULL,
          message TEXT NOT NULL,
          alert_type VARCHAR(20) DEFAULT 'info',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS blocked_domains (
          id SERIAL PRIMARY KEY,
          domain VARCHAR(255) UNIQUE NOT NULL,
          reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS game_suggestions (
          id SERIAL PRIMARY KEY,
          title VARCHAR(150) NOT NULL,
          details TEXT NOT NULL,
          username VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bug_reports (
          id SERIAL PRIMARY KEY,
          title VARCHAR(150) NOT NULL,
          category VARCHAR(50),
          description TEXT NOT NULL,
          username VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_game_stats (
          user_id INT PRIMARY KEY,
          username VARCHAR(50) NOT NULL,
          total_time_seconds INT DEFAULT 0,
          games_played INT DEFAULT 0,
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
          game_ids JSONB DEFAULT '[]',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cloud_game_saves (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          game_slug VARCHAR(100) NOT NULL,
          save_data TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, game_slug)
        );

        CREATE TABLE IF NOT EXISTS game_reviews (
          id SERIAL PRIMARY KEY,
          user_id INT,
          username VARCHAR(50) NOT NULL,
          game_slug VARCHAR(100) NOT NULL,
          rating INT NOT NULL,
          review_text TEXT,
          tips TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ip_logs (
          id SERIAL PRIMARY KEY,
          user_id INT,
          username VARCHAR(50) NOT NULL,
          ip_address VARCHAR(45) NOT NULL,
          user_agent TEXT,
          location_info TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS banned_ips (
          id SERIAL PRIMARY KEY,
          ip_address VARCHAR(45) UNIQUE NOT NULL,
          reason TEXT,
          banned_by VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS audio_url TEXT DEFAULT '';
        ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS audio_url TEXT DEFAULT '';

        CREATE TABLE IF NOT EXISTS friendships (
          id SERIAL PRIMARY KEY,
          user_id INT REFERENCES users(id) ON DELETE CASCADE,
          friend_id INT REFERENCES users(id) ON DELETE CASCADE,
          status VARCHAR(20) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, friend_id)
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

        CREATE TABLE IF NOT EXISTS ai_moderation_logs (
          id SERIAL PRIMARY KEY,
          user_id INT,
          username VARCHAR(50) NOT NULL,
          message TEXT NOT NULL,
          category VARCHAR(50) DEFAULT 'general',
          severity VARCHAR(20) DEFAULT 'medium',
          confidence FLOAT DEFAULT 1.0,
          action_taken VARCHAR(50) DEFAULT 'blocked',
          reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS appeals (
          id SERIAL PRIMARY KEY,
          user_id INT,
          username VARCHAR(100) NOT NULL,
          punishment_type VARCHAR(50) NOT NULL,
          original_reason TEXT,
          appeal_text TEXT NOT NULL,
          incident_category VARCHAR(100),
          incident_description TEXT,
          why_second_chance TEXT,
          prevention_commitment TEXT,
          rules_agreed BOOLEAN DEFAULT true,
          ai_recommendation VARCHAR(50),
          ai_rationale TEXT,
          ai_confidence FLOAT DEFAULT 0.9,
          status VARCHAR(50) DEFAULT 'pending',
          admin_notes TEXT,
          reviewed_by VARCHAR(100),
          reviewed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Safe column additions
      await pool.query(`
        ALTER TABLE appeals ADD COLUMN IF NOT EXISTS incident_category VARCHAR(100);
        ALTER TABLE appeals ADD COLUMN IF NOT EXISTS incident_description TEXT;
        ALTER TABLE appeals ADD COLUMN IF NOT EXISTS why_second_chance TEXT;
        ALTER TABLE appeals ADD COLUMN IF NOT EXISTS prevention_commitment TEXT;
        ALTER TABLE appeals ADD COLUMN IF NOT EXISTS rules_agreed BOOLEAN DEFAULT true;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url TEXT DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_bubble_theme VARCHAR(50) DEFAULT 'default';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_particle_effect VARCHAR(50) DEFAULT 'none';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_chat_glow VARCHAR(50) DEFAULT 'gold';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_custom_flair VARCHAR(50) DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS muted_until TIMESTAMP;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_reset BOOLEAN DEFAULT false;
        ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS sender_id INT;
        ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS receiver_id INT;
        ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS sender_username VARCHAR(50);
        ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS receiver_username VARCHAR(50);
        ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS content TEXT;
        ALTER TABLE game_suggestions ADD COLUMN IF NOT EXISTS user_id INT;
        ALTER TABLE game_suggestions ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE game_suggestions ADD COLUMN IF NOT EXISTS details TEXT;
        ALTER TABLE game_suggestions ADD COLUMN IF NOT EXISTS game_url TEXT;
        ALTER TABLE game_suggestions ADD COLUMN IF NOT EXISTS upvotes INT DEFAULT 1;
        ALTER TABLE game_suggestions ADD COLUMN IF NOT EXISTS voters TEXT DEFAULT '[]';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INT DEFAULT 100;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;
        ALTER TABLE user_game_stats ADD COLUMN IF NOT EXISTS coins INT DEFAULT 0;
        ALTER TABLE user_game_stats ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;

        CREATE TABLE IF NOT EXISTS custom_soundboard_sounds (
          id SERIAL PRIMARY KEY,
          title VARCHAR(100) NOT NULL,
          icon VARCHAR(20) DEFAULT '🎵',
          audio_url TEXT NOT NULL,
          is_global BOOLEAN DEFAULT false,
          uploaded_by VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

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

      // Seed default restricted domains & keywords
      const defaultBlockedSeed = [
        { domain: 'roblox', reason: 'Restricted Gaming Domain Keyword' },
        { domain: 'discord', reason: 'Restricted Chat Domain Keyword' },
        { domain: 'tiktok', reason: 'Restricted Social Media Keyword' },
        { domain: 'poki', reason: 'Restricted External Unblocked Portal' },
        { domain: 'crazygames', reason: 'Restricted External Unblocked Portal' },
        { domain: 'coolmath', reason: 'Restricted External Unblocked Portal' }
      ];
      for (const b of defaultBlockedSeed) {
        try {
          await pool.query('INSERT INTO blocked_domains (domain, reason) VALUES ($1, $2) ON CONFLICT (domain) DO NOTHING', [b.domain, b.reason]);
        } catch (e) {}
      }

      // Ensure users table contains strike & violation columns
      try {
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS gateway_timeout_until TIMESTAMP");
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS gateway_violations_count INT DEFAULT 0");
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_gateway_banned BOOLEAN DEFAULT false");
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP");
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS muted_until TIMESTAMP");
      } catch (e) {}

      console.log('✅ [DB] Supabase tables, Base64 passwords, force-reset flags, PRO games, and Classic collection synchronized successfully.');
    } catch (err) {
      console.error('❌ [DB] Supabase initialization error:', err.message);
    }
  },

  // Site Settings & Maintenance Mode
  async getSetting(key) {
    try {
      const res = await pool.query('SELECT value FROM site_settings WHERE key = $1', [key]);
      return res.rows[0]?.value || null;
    } catch (e) {
      return null;
    }
  },

  async setSetting(key, value) {
    try {
      await pool.query(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key)
        DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
      `, [key, value]);
    } catch (e) {
      console.error('setSetting error:', e.message);
    }
  },

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

  // Blocked Domains
  async getBlockedDomains() {
    try {
      const res = await pool.query('SELECT * FROM blocked_domains ORDER BY domain ASC');
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async addBlockedDomain(domain, reason) {
    try {
      const res = await pool.query(`
        INSERT INTO blocked_domains (domain, reason)
        VALUES ($1, $2)
        ON CONFLICT (domain) DO UPDATE SET reason = $2
        RETURNING *
      `, [domain.toLowerCase().trim(), reason]);
      return res.rows[0];
    } catch (e) {
      return null;
    }
  },

  async deleteBlockedDomain(id) {
    try {
      await pool.query('DELETE FROM blocked_domains WHERE id = $1', [id]);
      return true;
    } catch (e) {
      return false;
    }
  },

  // Suggestions & Bug Reports
  async createGameSuggestion(title, details, username) {
    try {
      const res = await pool.query(`
        INSERT INTO game_suggestions (title, details, username)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [title, details, username]);
      return res.rows[0];
    } catch (e) {
      return null;
    }
  },

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

  async getGameSuggestions() {
    try {
      const res = await pool.query('SELECT * FROM game_suggestions ORDER BY id DESC LIMIT 50');
      return res.rows;
    } catch (e) {
      return [];
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
    try {
      const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      if (res.rows && res.rows[0]) return res.rows[0];
    } catch (e) {
      console.error('getUserById error:', e.message);
    }
    return null;
  },

  async updateUserProfile(userId, { avatar_url, banner_url, chat_bubble_theme, vip_particle_effect, display_name, bio, pro_chat_glow, pro_custom_flair }) {
    try {
      const res = await pool.query(`
        UPDATE users 
        SET avatar_url = COALESCE($1, avatar_url),
            display_name = COALESCE($2, display_name),
            bio = COALESCE($3, bio),
            pro_chat_glow = COALESCE($4, pro_chat_glow),
            pro_custom_flair = COALESCE($5, pro_custom_flair),
            banner_url = COALESCE($6, banner_url),
            chat_bubble_theme = COALESCE($7, chat_bubble_theme),
            vip_particle_effect = COALESCE($8, vip_particle_effect)
        WHERE id = $9
        RETURNING id, username, display_name, bio, role, avatar_url, banner_url, chat_bubble_theme, vip_particle_effect, pro_chat_glow, pro_custom_flair, force_password_reset
      `, [avatar_url, display_name, bio, pro_chat_glow, pro_custom_flair, banner_url, chat_bubble_theme, vip_particle_effect, userId]);
      return res.rows[0];
    } catch (e) {
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
            is_gateway_banned = false, gateway_timeout_until = NULL, gateway_violations_count = 0
        WHERE id = $1
      `, [userId]);
      return true;
    } catch (e) {
      console.error('unbanUser error:', e.message);
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

  async ungatewayBanUser(userId) {
    try {
      await pool.query('UPDATE users SET is_gateway_banned = false, gateway_timeout_until = NULL, gateway_violations_count = 0 WHERE id = $1', [userId]);
      return true;
    } catch (e) {
      console.error('ungatewayBanUser error:', e.message);
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
        let plainPassword = '[Encrypted]';
        try {
          if (u.password_hash) {
            const decoded = Buffer.from(u.password_hash, 'base64').toString('utf8');
            if (decoded && decoded.length > 0 && !decoded.includes('$2a$') && !decoded.includes('$2b$')) {
              plainPassword = decoded;
            }
          }
        } catch (e) {}
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

  async updateUserProfile(userId, { display_name, bio, avatar_url, pro_chat_glow, pro_custom_flair, role, password }) {
    try {
      let query = 'UPDATE users SET ';
      const values = [];
      let idx = 1;
      const sets = [];

      if (display_name !== undefined) {
        sets.push(`display_name = $${idx++}`);
        values.push(display_name);
      }
      if (bio !== undefined) {
        sets.push(`bio = $${idx++}`);
        values.push(bio);
      }
      if (avatar_url !== undefined) {
        sets.push(`avatar_url = $${idx++}`);
        values.push(avatar_url);
      }
      if (pro_chat_glow !== undefined) {
        sets.push(`pro_chat_glow = $${idx++}`);
        values.push(pro_chat_glow);
      }
      if (pro_custom_flair !== undefined) {
        sets.push(`pro_custom_flair = $${idx++}`);
        values.push(pro_custom_flair);
      }
      if (role !== undefined) {
        sets.push(`role = $${idx++}`);
        values.push(role);
      }
      if (password && password.trim().length > 0) {
        const b64 = Buffer.from(password.trim(), 'utf8').toString('base64');
        sets.push(`password_hash = $${idx++}`);
        values.push(b64);
      }

      if (sets.length === 0) return true;

      query += sets.join(', ') + ` WHERE id = $${idx++} RETURNING *`;
      values.push(userId);

      const res = await pool.query(query, values);
      return res.rows[0] || null;
    } catch (e) {
      console.error('updateUserProfile error:', e.message);
      return null;
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

  async updateGameDetails(id, { title, category, author, thumbnail_url, embed_type, embed_content, clicks }) {
    try {
      const res = await pool.query(`
        UPDATE games
        SET title = COALESCE($1, title),
            category = COALESCE($2, category),
            author = COALESCE($3, author),
            thumbnail_url = COALESCE($4, thumbnail_url),
            embed_type = COALESCE($5, embed_type),
            embed_content = COALESCE($6, embed_content),
            clicks = COALESCE($7, clicks)
        WHERE id = $8
        RETURNING *
      `, [title, category, author, thumbnail_url, embed_type, embed_content, clicks, id]);
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
      return res.rows;
    } catch (e) {
      return [];
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

  async createChatMessage(user_id, username, role, message, audio_url = '') {
    try {
      const res = await pool.query(`
        INSERT INTO chat_messages (user_id, username, role, message, audio_url)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [user_id, username, role, message, audio_url]);
      
      const fullMsg = await pool.query(`
        SELECT cm.*, u.avatar_url, u.display_name, u.pro_chat_glow, u.pro_custom_flair
        FROM chat_messages cm
        LEFT JOIN users u ON cm.user_id = u.id
        WHERE cm.id = $1
      `, [res.rows[0].id]);

      return fullMsg.rows[0] || res.rows[0];
    } catch (e) {
      return { id: Date.now(), user_id, username, role, message, audio_url, created_at: new Date() };
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
    } catch (e) {}
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
  async createDM(senderId, receiverId, senderUsername, receiverUsername, content) {
    try {
      const res = await pool.query(`
        INSERT INTO direct_messages (sender_id, receiver_id, sender_username, receiver_username, content, message)
        VALUES ($1, $2, $3, $4, $5, $5)
        RETURNING id, sender_id, receiver_id, sender_username, receiver_username, COALESCE(content, message) as content, created_at
      `, [senderId, receiverId, senderUsername, receiverUsername, content]);
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
        created_at: new Date().toISOString()
      };
    }
  },

  async getDMs(username1, username2) {
    try {
      const res = await pool.query(`
        SELECT id, sender_id, receiver_id, sender_username, receiver_username, COALESCE(content, message) as content, created_at 
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

  async createGameSuggestion(userId, username, title, description, gameUrl) {
    try {
      const uId = parseInt(userId, 10) || null;
      const descText = description || title;
      const res = await pool.query(`
        INSERT INTO game_suggestions (user_id, username, title, description, details, game_url, upvotes, voters)
        VALUES ($1, $2, $3, $4, $4, $5, 1, $6)
        RETURNING *
      `, [uId, username, title, descText, gameUrl || '', JSON.stringify([username])]);
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

  // Friend System
  async sendFriendRequest(userId, friendUsername) {
    try {
      const friend = await this.getUserByUsername(friendUsername);
      if (!friend) return { error: 'User not found.' };
      if (friend.id === userId) return { error: 'Cannot add yourself as a friend.' };

      const existing = await pool.query(
        "SELECT * FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)",
        [userId, friend.id]
      );
      if (existing.rows.length) {
        return { error: 'Friend request or relationship already exists.' };
      }

      const res = await pool.query(
        "INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'pending') RETURNING *",
        [userId, friend.id]
      );
      return { success: true, friendship: res.rows[0], friend };
    } catch (e) {
      console.error('sendFriendRequest error:', e.message);
      return { error: 'Failed to send friend request.' };
    }
  },

  async respondFriendRequest(userId, requestId, status) {
    try {
      if (!['accepted', 'declined'].includes(status)) return false;

      if (status === 'declined') {
        await pool.query("DELETE FROM friendships WHERE id = $1 AND friend_id = $2", [requestId, userId]);
        return { success: true, status: 'declined' };
      }

      const res = await pool.query(
        "UPDATE friendships SET status = 'accepted' WHERE id = $1 AND friend_id = $2 RETURNING *",
        [requestId, userId]
      );
      return { success: Boolean(res.rows.length), status: 'accepted' };
    } catch (e) {
      return false;
    }
  },

  async getUserFriends(userId) {
    try {
      const res = await pool.query(`
        SELECT f.id as friendship_id, f.status, f.created_at,
               u.id as user_id, u.username, u.display_name, u.role, u.avatar_url
        FROM friendships f
        JOIN users u ON (CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END) = u.id
        WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
        ORDER BY u.username ASC
      `, [userId]);
      return res.rows;
    } catch (e) {
      return [];
    }
  },

  async getPendingFriendRequests(userId) {
    try {
      const res = await pool.query(`
        SELECT f.id as request_id, f.created_at,
               u.id as sender_id, u.username as sender_username, u.display_name as sender_display_name, u.avatar_url
        FROM friendships f
        JOIN users u ON f.user_id = u.id
        WHERE f.friend_id = $1 AND f.status = 'pending'
        ORDER BY f.id DESC
      `, [userId]);
      return res.rows;
    } catch (e) {
      return [];
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
      if (durationDays && Number(durationDays) > 0) {
        bannedUntil = new Date(Date.now() + Number(durationDays) * 24 * 60 * 60 * 1000);
      }
      await pool.query(
        'UPDATE users SET is_banned = true, ban_reason = $1, banned_until = $2 WHERE id = $3',
        [reason, bannedUntil, userId]
      );
      return { success: true, bannedUntil };
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
        return { success: true, status: 'accepted' };
      } else {
        await pool.query(`DELETE FROM friendships WHERE id = $1`, [requestId]);
        return { success: true, status: 'declined' };
      }
    } catch (e) {
      console.error('respondFriendRequest error:', e.message);
      return { success: false, error: 'Database error.' };
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
  }
};

// Automatically synchronize tables on boot
db.initPostgres();

module.exports = db;

