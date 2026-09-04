import { getCurrentUser, showBannedScreen } from './auth.js';

// Singleton Shared Socket.io Instance for all views & modules
let sharedSocket = null;

export function getSharedSocket() {
  if (!sharedSocket && typeof io !== 'undefined') {
    sharedSocket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      timeout: 10000
    });

    // Automatically register identity if logged in
    const user = getCurrentUser();
    if (user && user.username) {
      sharedSocket.emit('user_connected', { user, activity: 'Browsing Hub' });
      sharedSocket.on('connect', () => {
        sharedSocket.emit('user_connected', { user, activity: 'Browsing Hub' });
      });
    }

    sharedSocket.on('user_banned_event', (data) => {
      const userObj = getCurrentUser();
      if (userObj && (userObj.id == data.userId || userObj.username === data.username)) {
        showBannedScreen(data.reason || 'Your account has been permanently suspended by an administrator.');
      }
    });

    sharedSocket.on('live_broadcast_announcement', (annData) => {
      if (window.handleLiveBroadcastAnnouncement) {
        window.handleLiveBroadcastAnnouncement(annData);
      }
    });

    sharedSocket.on('live_broadcast_announcement_disable', () => {
      const annBanner = document.getElementById('announcement-banner');
      if (annBanner) annBanner.style.display = 'none';
    });

    sharedSocket.on('global_site_event', (eventData) => {
      if (window.handleGlobalSiteEvent) {
        window.handleGlobalSiteEvent(eventData);
      }
    });
  }
  return sharedSocket;
}
