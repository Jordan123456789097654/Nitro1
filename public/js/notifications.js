// Centralized Real-Time Notification & Interactive Toast Engine
import { getSharedSocket } from './socket.js';
import { getCurrentUser } from './auth.js';

let notifications = [];
let unreadCount = 0;
let soundEnabled = true;

export function initNotifications() {
  setupNotificationBellUI();
  setupSocketNotificationListeners();
}

function setupSocketNotificationListeners() {
  const socket = getSharedSocket();
  if (!socket) return;

  // 1. Direct Message Notification
  socket.on('new_direct_message', ({ sender, message }) => {
    const user = getCurrentUser();
    if (user && sender && sender.username !== user.username) {
      showNotificationToast({
        title: `💬 New DM from @${sender.username}`,
        body: message.slice(0, 75),
        icon: '💬',
        type: 'dm',
        actionLabel: 'Open Chat',
        onAction: () => {
          if (window.openDirectMessageWithUser) {
            window.openDirectMessageWithUser(sender.username);
          }
        }
      });
    }
  });

  // 2. Friend Request Notification
  socket.on('friend_request_received', ({ sender }) => {
    showNotificationToast({
      title: `👥 Friend Request from @${sender.username}`,
      body: 'Wants to connect on the platform.',
      icon: '👥',
      type: 'friend',
      actionLabel: 'View Request',
      onAction: () => {
        document.querySelector('.nav-btn[data-view="chat"]')?.click();
        const tab = document.querySelector('.chat-mode-tab[data-mode="friends"]');
        if (tab) tab.click();
      }
    });
  });

  // 3. Voice Room Invite Notification
  socket.on('voice_room_invite', ({ channelId, channelName, sender }) => {
    showNotificationToast({
      title: `🎤 Voice Invite from @${sender.username}`,
      body: `Invited you to join room: ${channelName}`,
      icon: '🎤',
      type: 'voice',
      actionLabel: 'Join Room',
      onAction: () => {
        if (window.joinVoiceChannel) {
          window.joinVoiceChannel(channelId, channelName);
        }
      }
    });
  });

  // 4. System Announcement / Moderation Alert
  socket.on('system_notification', ({ title, message, level }) => {
    showNotificationToast({
      title: title || '📢 Platform Notice',
      body: message,
      icon: level === 'error' ? '⚠️' : '📢',
      type: level || 'info'
    });
  });
}

export function showNotificationToast({ title, body, icon = '🔔', type = 'info', actionLabel = null, onAction = null }) {
  const notifObj = {
    id: 'notif-' + Date.now(),
    title,
    body,
    icon,
    type,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isRead: false
  };

  notifications.unshift(notifObj);
  unreadCount++;
  updateBellBadgeUI();
  playNotificationChime();

  // Render Corner Floating Toast
  const container = document.getElementById('toast-notifications-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-notification-card toast-${type}`;
  toast.style.cssText = `
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: linear-gradient(145deg, rgba(20, 26, 42, 0.95), rgba(12, 16, 26, 0.98));
    border: 1px solid ${type === 'dm' ? '#38bdf8' : type === 'voice' ? '#10b981' : type === 'friend' ? '#fbbf24' : 'rgba(255,255,255,0.15)'};
    padding: 14px 16px;
    border-radius: 14px;
    color: #fff;
    box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    backdrop-filter: blur(16px);
    width: 320px;
    margin-top: 10px;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    animation: toastSlideIn 0.35s ease forwards;
  `;

  toast.innerHTML = `
    <span style="font-size: 1.4rem; flex-shrink: 0;">${icon}</span>
    <div style="flex: 1;">
      <strong style="display: block; font-size: 0.88rem; font-weight: 800; color: #fff; margin-bottom: 2px;">${escapeHtml(title)}</strong>
      <p style="margin: 0; font-size: 0.78rem; color: #cbd5e1; line-height: 1.4;">${escapeHtml(body)}</p>
      ${actionLabel ? `
        <button class="toast-action-btn" style="margin-top: 8px; padding: 4px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #38bdf8; cursor: pointer;">
          ${escapeHtml(actionLabel)}
        </button>
      ` : ''}
    </div>
    <button class="toast-close-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 0.9rem; cursor: pointer;">✕</button>
  `;

  const closeBtn = toast.querySelector('.toast-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 300);
    });
  }

  const actionBtn = toast.querySelector('.toast-action-btn');
  if (actionBtn && onAction) {
    actionBtn.addEventListener('click', () => {
      onAction();
      toast.remove();
    });
  }

  container.appendChild(toast);

  // Auto-dismiss after 7 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 300);
    }
  }, 7000);
}

function playNotificationChime() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch (e) {}
}

function setupNotificationBellUI() {
  const bellBtn = document.getElementById('nav-notification-bell-btn');
  const drawer = document.getElementById('notification-drawer-popup');

  if (bellBtn && drawer) {
    bellBtn.addEventListener('click', () => {
      const isVisible = drawer.style.display === 'flex';
      drawer.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        unreadCount = 0;
        updateBellBadgeUI();
        renderDrawerNotifications();
      }
    });
  }
}

function updateBellBadgeUI() {
  const badge = document.getElementById('nav-notification-badge');
  if (badge) {
    if (unreadCount > 0) {
      badge.style.display = 'inline-flex';
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    } else {
      badge.style.display = 'none';
    }
  }
}

function renderDrawerNotifications() {
  const list = document.getElementById('notification-drawer-list');
  if (!list) return;

  if (notifications.length === 0) {
    list.innerHTML = '<div style="padding: 24px; text-align: center; color: #94a3b8; font-size: 0.82rem;">No recent notifications.</div>';
    return;
  }

  list.innerHTML = notifications.slice(0, 15).map(n => `
    <div style="display: flex; gap: 10px; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02);">
      <span style="font-size: 1.2rem;">${n.icon}</span>
      <div style="flex: 1;">
        <strong style="color: #fff; font-size: 0.85rem; display: block;">${escapeHtml(n.title)}</strong>
        <p style="margin: 2px 0 0; color: #94a3b8; font-size: 0.78rem;">${escapeHtml(n.body)}</p>
        <span style="font-size: 0.7rem; color: #64748b; margin-top: 4px; display: block;">${n.time}</span>
      </div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
