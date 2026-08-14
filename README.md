# NITRO (BETA) - Full-Stack Game Hub & Themed Platform

A production-ready full-stack gaming web application designed for fast, one-click deployment on **Railway** (or any Node.js hosting platform).

---

## 🌟 Features

- **Sleek Themed UI**: Built with a glowing nebula particle background, top floating pill navigation, and rounded game cards matching the modern arcade aesthetic.
- **16-Preset Theme Studio**: Switch seamlessly between *Cherry*, *Obsidian*, *Midnight Blue*, *Neon Night*, *Deep Forest*, *Inferno*, and more.
- **Custom HTML / Iframe Game Embedder**: Add community or custom games by pasting raw HTML5 Canvas code or iframe embed URLs.
- **User Authentication & VIP Access**: Tiered access system (`Member`, `VIP`, `Admin`) with VIP-exclusive game locks.
- **Admin Dashboard**: Full control panel to manage user accounts, promote/demote VIP status, ban offenders, delete games, and view live audit logs.
- **Real-Time Global Chat**: Powered by `Socket.io` with automated bad word & prohibited username filters and 1-click admin message deletion.
- **Discord Moderation Audit Webhooks**: Automatically broadcasts administrative actions (bans, message deletions, VIP changes) to your configured Discord channel.
- **In-App Sandboxed Browser**: Chrome-style tab interface for testing web assets and browsing safely through a backend proxy relay.
- **Cloaked Mode**: Masquerade tab title and favicon to Google Drive / Classroom for discreet tab management.

---

## 🚀 Local Quickstart

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Server**:
   ```bash
   npm start
   ```

3. **Access the Web App**:
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Default Administrator Account**:
   - **Username**: `admin`
   - **Password**: `admin123` *(configurable via `ADMIN_DEFAULT_PASSWORD` in `.env`)*

---

## 🚂 Deploying to Railway

1. **Push to GitHub**:
   Initialize a git repository and push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of NITRO platform"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Deploy on Railway**:
   - Go to [Railway.app](https://railway.app) and create a **New Project**.
   - Select **Deploy from GitHub repo** and choose your repository.
   - Railway will automatically detect Node.js and run `npm start`.

3. **Configure Environment Variables in Railway**:
   Under your Railway service settings, add the following variables:
   | Variable | Description |
   |---|---|
   | `PORT` | `3000` (or Railway default) |
   | `NODE_ENV` | `production` |
   | `SESSION_SECRET` | A secure random string for session cookies |
   | `DATABASE_PATH` | `./data/nitro.db` (or mount a volume for persistent storage) |
   | `DISCORD_WEBHOOK_URL` | Your Discord Webhook URL for live moderation logs |
   | `ADMIN_DEFAULT_PASSWORD` | Password for the default `admin` account |

---

## 📁 Repository Structure

```
├── package.json              # Express, Socket.io, better-sqlite3, bcryptjs
├── .env.example              # Environment variables template
├── server/
│   ├── index.js              # Express & Socket.io server entry point
│   ├── db.js                 # SQLite database & initial seed data
│   ├── chatSocket.js         # Real-time WebSocket chat & profanity filter
│   ├── discordLogger.js      # Discord Webhook audit dispatcher
│   └── routes/
│       ├── auth.js           # Auth & session API
│       ├── games.js          # Game library & HTML embedder API
│       ├── admin.js          # Admin dashboard & VIP elevation API
│       └── proxy.js          # Sandboxed web proxy relay API
└── public/
    ├── index.html            # Main SPA interface
    ├── css/                  # Theme, layout, game grid, chat, admin styling
    └── js/                   # Theme switcher, auth, socket, games controller
```
