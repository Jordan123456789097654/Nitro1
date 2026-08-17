// server/voiceManager.js
// In‑memory management of ephemeral voice channels, study rooms & gaming pods

class VoiceManager {
  constructor() {
    this.channels = new Map();
    this.nextId = 1;

    // Seed default permanent channels
    this.createChannel('🎧 General Voice Lounge', 0, true, { category: 'General', limit: 40, bitrate: '96kbps' });
    this.createChannel('🎮 Gaming Squad Arena #1', 0, true, { category: 'Gaming', limit: 12, bitrate: '128kbps' });
    this.createChannel('⚔️ Competitive Esports Room', 0, true, { category: 'Gaming', limit: 10, bitrate: '128kbps' });
    this.createChannel('☕ Lo-Fi Study & Homework Pod', 0, true, { category: 'Study', limit: 25, bitrate: '96kbps' });
    this.createChannel('📐 STEM & Senior Code Mentors', 0, true, { category: 'Study', limit: 15, bitrate: '96kbps' });
    this.createChannel('🎷 Chill Music & Vibe Lounge', 0, true, { category: 'Chill', limit: 30, bitrate: '128kbps' });
  }

  createChannel(name, creatorId, isDefault = false, metadata = {}) {
    const channelId = (this.nextId++).toString();
    this.channels.set(channelId, {
      id: channelId,
      name,
      creatorId,
      isDefault,
      category: metadata.category || 'Study',
      limit: metadata.limit || 20,
      bitrate: metadata.bitrate || '96kbps',
      password: metadata.password || '',
      screenSharer: null,
      participants: new Map()
    });
    return channelId;
  }

  listChannels() {
    const list = [];
    for (const [id, ch] of this.channels.entries()) {
      list.push({
        id,
        name: ch.name,
        category: ch.category || 'Study',
        limit: ch.limit || 20,
        bitrate: ch.bitrate || '96kbps',
        isDefault: Boolean(ch.isDefault),
        hasPassword: Boolean(ch.password),
        screenSharer: ch.screenSharer,
        participantCount: ch.participants.size
      });
    }
    return list;
  }

  addParticipant(channelId, socketId, user = {}) {
    const ch = this.channels.get(channelId);
    if (!ch) return false;
    ch.participants.set(socketId, {
      socketId,
      username: user.username || 'Guest',
      display_name: user.display_name || user.username || 'Student',
      role: user.role || 'member',
      avatar_url: user.avatar_url || user.avatar || '',
      slotIndex: ch.participants.size
    });
    return true;
  }

  removeParticipant(channelId, socketId) {
    const ch = this.channels.get(channelId);
    if (!ch) return false;
    if (ch.screenSharer === socketId) {
      ch.screenSharer = null;
    }
    const deleted = ch.participants.delete(socketId);
    if (ch.participants.size === 0 && !ch.isDefault) {
      this.channels.delete(channelId);
    }
    return deleted;
  }

  getChannel(channelId) {
    return this.channels.get(channelId) || null;
  }

  getParticipants(channelId) {
    const ch = this.channels.get(channelId);
    if (!ch) return [];
    return Array.from(ch.participants.values());
  }

  setScreenSharer(channelId, socketId) {
    const ch = this.channels.get(channelId);
    if (!ch) return;
    ch.screenSharer = socketId;
  }
}

module.exports = new VoiceManager();
