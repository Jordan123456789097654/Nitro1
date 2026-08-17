-- NITRO (BETA) Consolidated Database Schema for Supabase PostgreSQL
-- Run this script directly in your Supabase Project's SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- ==========================================
-- 1. AUTH & IDENTITY DOMAIN
-- ==========================================
CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(100) DEFAULT '',
  bio TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  role VARCHAR(50) DEFAULT 'member', -- 'owner', 'admin', 'vip', 'member'
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES public.users(id) ON DELETE CASCADE,
  profile_name VARCHAR(100) NOT NULL,
  favorites JSONB DEFAULT '[]'::jsonb,
  theme_settings JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.ip_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES public.users(id) ON DELETE SET NULL,
  username VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT DEFAULT '',
  location_info TEXT DEFAULT 'Unknown',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.banned_ips (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) UNIQUE NOT NULL,
  reason TEXT DEFAULT '',
  banned_by VARCHAR(100) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. GAMING SYSTEM DOMAIN
-- ==========================================
CREATE TABLE IF NOT EXISTS public.games (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(200) UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  author VARCHAR(100) DEFAULT 'Community',
  thumbnail_url TEXT NOT NULL,
  embed_type VARCHAR(50) DEFAULT 'html_code', -- 'iframe_url', 'html_code', 'builtin'
  embed_content TEXT NOT NULL,
  is_vip BOOLEAN DEFAULT false,
  category VARCHAR(50) DEFAULT 'Action',
  clicks INT DEFAULT 0,
  created_by VARCHAR(100) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_favorites (
  user_id INT REFERENCES public.users(id) ON DELETE CASCADE,
  game_id INT REFERENCES public.games(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, game_id)
);

CREATE TABLE IF NOT EXISTS public.game_favorites (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES public.users(id) ON DELETE CASCADE,
  game_id INT REFERENCES public.games(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, game_id)
);

CREATE TABLE IF NOT EXISTS public.user_playlists (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  game_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.cloud_game_saves (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES public.users(id) ON DELETE CASCADE,
  game_slug VARCHAR(100) NOT NULL,
  save_data TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, game_slug)
);

CREATE TABLE IF NOT EXISTS public.game_reviews (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES public.users(id) ON DELETE SET NULL,
  username VARCHAR(100) NOT NULL,
  game_slug VARCHAR(100) NOT NULL,
  rating INT NOT NULL,
  review_text TEXT DEFAULT '',
  tips TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.game_suggestions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES public.users(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  details TEXT DEFAULT '',
  description TEXT DEFAULT '',
  username VARCHAR(100) DEFAULT 'Guest',
  game_url TEXT DEFAULT '',
  upvotes INT DEFAULT 1,
  voters TEXT DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.game_play_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES public.users(id) ON DELETE CASCADE,
  username VARCHAR(100) NOT NULL,
  playtime_seconds INT DEFAULT 60,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_game_stats (
  user_id INT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  username VARCHAR(100) NOT NULL,
  total_time_seconds INT DEFAULT 0,
  games_played INT DEFAULT 0,
  coins INT DEFAULT 0,
  xp INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 3. REAL-TIME COMMUNICATION DOMAIN
-- ==========================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES public.users(id) ON DELETE SET NULL,
  username VARCHAR(100) NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  message TEXT NOT NULL,
  audio_url TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id SERIAL PRIMARY KEY,
  sender_id INT REFERENCES public.users(id) ON DELETE SET NULL,
  receiver_id INT REFERENCES public.users(id) ON DELETE SET NULL,
  sender_username VARCHAR(100) NOT NULL,
  receiver_username VARCHAR(100) NOT NULL,
  message TEXT DEFAULT '',
  content TEXT DEFAULT '',
  audio_url TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.private_rooms (
  id SERIAL PRIMARY KEY,
  room_code VARCHAR(50) UNIQUE NOT NULL,
  created_by INT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.filter_words (
  id SERIAL PRIMARY KEY,
  word VARCHAR(100) UNIQUE NOT NULL,
  filter_type VARCHAR(50) DEFAULT 'both',
  punishment VARCHAR(50) DEFAULT 'censor',
  reason TEXT DEFAULT '',
  created_by VARCHAR(100) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.custom_soundboard_sounds (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  icon VARCHAR(20) DEFAULT '🎵',
  audio_url TEXT NOT NULL,
  is_global BOOLEAN DEFAULT false,
  uploaded_by VARCHAR(100) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 4. GOVERNANCE & MODERATION DOMAIN
-- ==========================================
CREATE TABLE IF NOT EXISTS public.moderation_logs (
  id SERIAL PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  admin_username VARCHAR(100) NOT NULL,
  target VARCHAR(100),
  reason TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.ai_moderation_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES public.users(id) ON DELETE SET NULL,
  username VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'general',
  severity VARCHAR(50) DEFAULT 'medium',
  confidence FLOAT DEFAULT 1.0,
  action_taken VARCHAR(50) DEFAULT 'blocked',
  reason TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.appeals (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES public.users(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS public.blocked_domains (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) UNIQUE NOT NULL,
  reason TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 5. SYSTEM & ENGAGEMENT DOMAIN
-- ==========================================
CREATE TABLE IF NOT EXISTS public.site_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  alert_type VARCHAR(50) DEFAULT 'info',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.community_polls (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  created_by VARCHAR(100) DEFAULT 'admin',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id SERIAL PRIMARY KEY,
  poll_id INT REFERENCES public.community_polls(id) ON DELETE CASCADE,
  user_id INT REFERENCES public.users(id) ON DELETE CASCADE,
  option_index INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(100) DEFAULT 'general',
  description TEXT NOT NULL,
  username VARCHAR(100) DEFAULT 'Guest',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.friendships (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES public.users(id) ON DELETE CASCADE,
  friend_id INT REFERENCES public.users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  department VARCHAR(50) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.update_logs (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  author VARCHAR(100) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- PERFORMANCE INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_games_category ON public.games(category);
CREATE INDEX IF NOT EXISTS idx_games_slug ON public.games(slug);
CREATE INDEX IF NOT EXISTS idx_ip_logs_ip ON public.ip_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_logs_username ON public.ip_logs(username);
CREATE INDEX IF NOT EXISTS idx_chat_created_at ON public.chat_messages(created_at);
