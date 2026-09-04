# 🛠️ Nitro Standalone Website Shutdown & Maintenance Template

This folder contains a pre-built, responsive, standalone **Website Offline & Maintenance Page** (`index.html`).

When you want to temporarily pause or shut down the main website, you can use this folder to display a clean status notice to visitors without needing backend servers or databases.

---

## 🚀 How to Activate / Publish the Shutdown Page

### Option A: Publish to GitHub Pages (Recommended)
1. Go to your repository settings on GitHub.
2. Under **Pages**, select your branch (`main`).
3. Set the directory source to `/shutdown-notice`.
4. Click **Save**. Your shutdown notice is now live on GitHub Pages!

### Option B: Replace `public/index.html` (Local Repo Method)
To quickly put your Render / Vercel host in offline mode:
1. Copy `shutdown-notice/index.html` over to `public/index.html`.
2. Commit and push to Git:
   ```bash
   git add public/index.html
   git commit -m "chore: activate maintenance mode page"
   git push origin main
   ```

---

## 🎨 Customizing the Notice

Open `shutdown-notice/index.html` in any text editor to customize:
* **Headline**: Change `<h1 id="headline">` text.
* **Reason Description**: Update `#reason-desc` with your shutdown reason.
* **Countdown Timer**: Modify `targetReturnTime` in the `<script>` tag.
* **Discord / Support Link**: Update the `href` in `#discord-link`.
