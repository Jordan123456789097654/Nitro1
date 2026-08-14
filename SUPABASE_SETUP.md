# NITRO (BETA) - Supabase Cloud Setup Guide

This guide walks you through connecting your **NITRO Platform** to a live **Supabase** PostgreSQL database.

---

## 1. Create a Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and log in.
2. Click **New project**, choose an organization, give it a name (e.g. `nitro-games`), and choose a strong database password.

---

## 2. Initialize the Database Schema & Seed Data
1. In your Supabase project dashboard, open the **SQL Editor** tab from the left sidebar.
2. Open the [`supabase_schema.sql`](file:///C:/Users/jorda/.gemini/antigravity/scratch/nitro-games/supabase_schema.sql) file located in the root of this repository.
3. Copy and paste the entire SQL content into the Supabase SQL editor and click **Run**.
4. This will create all 6 tables (`users`, `games`, `chat_messages`, `moderation_logs`, `filter_words`, `user_profiles`) and pre-populate initial games and word filters.

---

## 3. Retrieve Your API Keys
1. In your Supabase dashboard, navigate to **Project Settings** (gear icon) → **API**.
2. Copy two values:
   - **Project URL**: (e.g. `https://xyzproject.supabase.co`)
   - **service_role secret key**: (found under *Project API keys* → *service_role secret*)

---

## 4. Configure in Railway (or Local `.env`)

### In Railway:
Under your Railway service settings → **Variables**, add:
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_secret_key
SESSION_SECRET=a_random_secure_string_here
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### In Local Development:
Add these to your local `.env` file:
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_secret_key
```

When started, NITRO will automatically detect Supabase and print:
```
⚡ [DB] Connected to Supabase Cloud Database: https://xyz.supabase.co
```
*(If the Supabase variables are absent, NITRO will gracefully fallback to its local persistent JSON storage without crashing).*
