// server/voiceManager.js
// In‑memory management of ephemeral voice channels and study rooms

class VoiceManager {
  constructor() {
    this.channels = new Map(); // channelId -> { name, creatorId, isDefault, category, limit, screenSharer, participants: Map<socketId, userData> }
    this.nextId = 1;

    // Seed default permanent channels
    this.createChannel('🎧 General Voice Lounge', 0, true, { category: 'General', limit: 30 });
    this.createChannel('🎮 Gaming Voice #1', 0, true, { category: 'Gaming', limit: 20 });
    this.createChannel('☕ Lo-Fi Study Lounge', 0, true, { category: 'Study', limit: 25 });
    this.createChannel('📐 Math & STEM Study Pod', 0, true, { category: 'Study', limit: 15 });
  }

  createChannel(name, creatorId, isDefault = false, metadata = {}) {
    const channelId = (this.nextId++).toString();
    this.channels.set(channelId, {
      id: channelId,
      name,
      creatorId,
      isDefault,
      category: metadata.category || 'Study',
      limit: metadata.limit || 15,
      screenSharer: null, // socketId of currently screen-sharing user
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
        limit: ch.limit || 15,
        isDefault: Boolean(ch.isDefault),
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
      avatar: user.avatar || '',
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
    // Cleanup empty custom channels (do not delete default permanent channels)
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
