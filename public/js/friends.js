import { getCurrentUser } from './auth.js';

export function initFriends() {
  setupFriendsUI();
  fetchFriends();
}

export async function fetchFriends() {
  const acceptedList = document.getElementById('friends-accepted-list');
  const pendingList = document.getElementById('friends-pending-list');
  const pendingSection = document.getElementById('friends-pending-section');

  if (!acceptedList) return;

  try {
    const token = localStorage.getItem('nitro_jwt_token');
    if (!token) {
      acceptedList.innerHTML = '<div style="color: var(--text-muted); padding: 16px;">Please sign in to view and add friends.</div>';
      return;
    }

    const res = await fetch('/api/friends/list', {
      headers: { 'Authorization': `bearer ${token}`}
    });
    const data = await res.json();
    const friends = data.friends || [];
    const pending = data.pending || [];

    if (pending.length > 0) {
      if (pendingSection) pendingSection.style.display = 'block';
      if (pendingList) {
        pendingList.innerHTML = pending.map(p => `
          <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(251, 191, 36, 0.12); border: 1px solid #fbbf24; padding: 10px 14px; border-radius: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.2rem;">