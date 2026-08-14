// server/voiceManager.js
// In‑memory management of ephemeral voice channels

class VoiceManager {
  constructor() {
    this.channels = new Map(); // channelId -> { name, creatorId, isDefault, participants: Map<socketId, userData> }
    this.nextId = 1;

    // Seed default permanent channels
    this.createChannel('🎧 General Voice Lounge', 0, true);
    this.createChannel('🎮 Gaming Voice #1', 0, true);
    this.createChannel('☕ Lo-Fi Study Lounge', 0, true);
  }

  createChannel(name, creatorId, isDefault = false) {
    const channelId = (this.nextId++).toString();
    this.channels.set(channelId, {
      name,
      creatorId,
      isDefault,
      participants: new Map()
    });
    return channelId;
  }

  listChannels() {
    const list = [];
    for (const [id, ch] of this.channels.entries()) {
      list.push({ id, name: ch.name, participantCount: ch.participants.size });
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
      role: user.role || 'member'
    });
    return true;
  }

  removeParticipant(channelId, socketId) {
    const ch = this.channels.get(channelId);
    if (!ch) return false;
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
}

module.exports = new VoiceManager();
