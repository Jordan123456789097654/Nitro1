const db = require('./db');
const { sendDiscordLog } = require('./discordLogger');

// Active Connection Registry & State
const activeConnections = new Map(); // socket.id -> connection details
const userLastMessageTime = new Map(); // userId/ip -> timestamp
const userMessageHistory = new Map(); // userId/ip -> [{ text, time }]
const whiteboardRooms = new Map(); // roomCode -> [stroke]
let chatSlowmodeSeconds = 0; // 0 = off

function getActiveConnectionsList() {
  const unique = new Map();
  for (const [sId, conn] of activeConnections.entries()) {
    const groupKey = conn.userId ? `user_${conn.userId}` : `guest_${conn.ip}_${conn.username}`;
    unique.set(groupKey, conn);
  }
  return Array.from(unique.values());
}

function initChatSocket(io) {
  async function sanitizeContent(text) {
    if (!text) return '';
    let sanitized = text;
    try {
      const filterWords = await db.getFilterWords();
      for (const item of filterWords) {
        if (!item.word) continue;
        if (['chat', 'both'].includes(item.filter_type)) {
          const regex = new RegExp(`\\b${item.word}\\b`, 'gi');
          sanitized = sanitized.replace(regex, '***');
        }
      }
    } catch (e) {
      console.error('Sanitize error:', e);
    }
    return sanitized;
  }

  function getDeduplicatedConnections() {
    const unique = new Map();
    for (const [sId, conn] of activeConnections.entries()) {
      // Verify socket is actually connected in Socket.IO
      const liveSocket = io.sockets.sockets.get(sId);
      if (!liveSocket || !liveSocket.connected) {
        activeConnections.delete(sId);
        continue;
      }

      // Group key: userId for logged-in accounts, or IP address for guests
      const groupKey = conn.userId ? `user_${conn.userId}` : `guest_${conn.ip}_${conn.username}`;
      
      // If duplicate, keep the newest active connection
      unique.set(groupKey, conn);
    }
    return Array.from(unique.values());
  }

  function broadcastFriendStatuses() {
    const statusMap = {};
    for (const [, conn] of activeConnections.entries()) {
      if (conn.username) {
        statusMap[conn.username.toLowerCase()] = {
          online: true,
          activity: conn.currentActivity || 'Online'
        };
      }
    }
    io.emit('friend_status_broadcast', statusMap);
  }

  function broadcastLiveConnections() {
    const list = getDeduplicatedConnections();
    io.to('admin_channel').emit('active_connections_update', {
      count: list.length,
      connections: list,
      slowmode: chatSlowmodeSeconds
    });
    io.emit('online_count', list.length);
    broadcastFriendStatuses();
  }

  io.on('connection', async (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    
    // Purge any stale disconnected sockets
    for (const [id] of activeConnections.entries()) {
      const sock = io.sockets.sockets.get(id);
      if (!sock || !sock.connected) {
        activeConnections.delete(id);
      }
    }

    activeConnections.set(socket.id, {
      socketId: socket.id,
      userId: null,
      username: 'Guest Visitor',
      role: 'guest',
      currentActivity: 'Browsing Hub',
      connectedAt: new Date().toISOString(),
      ip: clientIp
    });

    broadcastLiveConnections();

    try {
      const recentMessages = await db.getRecentChatMessages();
      socket.emit('initial_messages', recentMessages);
      socket.emit('slowmode_status', { seconds: chatSlowmodeSeconds });
    } catch (e) {
      console.error('Socket init error:', e);
    }

    socket.on('play_sound_effect', ({ soundKey, username }) => {
      if (soundKey) {
        io.emit('sound_effect_broadcast', { soundKey, username });
      }
    });

    // User Identity & Activity
    socket.on('user_connected', (data) => {
      if (!data) return;
      const { user, activity } = data;
      if (user && user.username) {
        // Remove any prior socket records for this exact user ID to avoid duplicates
        for (const [sId, c] of activeConnections.entries()) {
          if (c.userId === user.id && sId !== socket.id) {
            activeConnections.delete(sId);
          }
        }

        activeConnections.set(socket.id, {
          socketId: socket.id,
          userId: user.id,
          username: user.username,
          role: user.role || 'member',
          currentActivity: activity || 'Active in Workspace',
          connectedAt: new Date().toISOString(),
          ip: clientIp
        });

        if (['admin', 'owner', 'moderator'].includes(user.role)) {
          socket.join('admin_channel');
          socket.emit('active_connections_update', {
            count: getDeduplicatedConnections().length,
            connections: getDeduplicatedConnections(),
            slowmode: chatSlowmodeSeconds
          });
        }
      }
      broadcastLiveConnections();
    });

    socket.on('request_live_connections', () => {
      socket.join('admin_channel');
      const list = getDeduplicatedConnections();
      socket.emit('active_connections_update', {
        count: list.length,
        connections: list,
        slowmode: chatSlowmodeSeconds
      });
    });

    socket.on('update_activity', ({ activity }) => {
      const conn = activeConnections.get(socket.id);
      if (conn) {
        conn.currentActivity = activity || 'Exploring';
        broadcastLiveConnections();
      }
    });

    // Real-Time Playtime Tracker Tick
    socket.on('playtime_tick', async ({ userId, username, seconds, is_new_play }) => {
      if (userId && username) {
        await db.recordGamePlaytime(userId, username, seconds || 60, Boolean(is_new_play));
      }
    });

    // Global Chat Message with Spam & Raid Shield
    socket.on('send_message', async (data) => {
      const { user, text, gifUrl } = data;
      if (!user || !user.username) return;

      const messageContent = (gifUrl ? `[GIF:${gifUrl}] ` : '') + (text || '').trim();
      if (!messageContent) return;

      try {
        const dbUser = await db.getUserById(user.id);
        if (dbUser && dbUser.is_banned) {
          return socket.emit('error_message', 'You are banned from sending messages.');
        }

        // Check Mute
        if (dbUser && dbUser.muted_until && new Date(dbUser.muted_until) > new Date()) {
          const remainingMins = Math.ceil((new Date(dbUser.muted_until) - new Date()) / (1000 * 60));
          return socket.emit('error_message', `🔇 You are temporarily muted for ${remainingMins} more minute(s).`);
        }

        const trackerKey = user.id || clientIp;
        const now = Date.now();

        // Spam & Raid Shield Check (Auto-Mute on Rapid Flooding or 3 Identical Messages)
        if (!dbUser || dbUser.role !== 'admin') {
          let history = userMessageHistory.get(trackerKey) || [];
          history = history.filter(h => now - h.time < 12000); // retain last 12s

          const duplicateCount = history.filter(h => h.text.toLowerCase() === messageContent.toLowerCase()).length;
          const rapidFloodCount = history.filter(h => now - h.time < 3000).length;

          if (duplicateCount >= 2 || rapidFloodCount >= 4) {
            await db.muteUser(user.id, 5);
            sendDiscordLog({
              category: 'moderation',
              action: 'AUTO_RAID_SHIELD_MUTED',
              admin: 'SYSTEM_RAID_SHIELD',
              target: user.username,
              details: `User automatically muted for 5 minutes due to chat spam/raid attempt (${duplicateCount >= 2 ? 'Repeated duplicate text' : 'Rapid message flooding'}).`
            });
            return socket.emit('error_message', '🛡️ [Raid Shield] You were automatically muted for 5 minutes for rapid message flooding.');
          }

          history.push({ text: messageContent, time: now });
          userMessageHistory.set(trackerKey, history);
        }

        // Check Slowmode
        if (chatSlowmodeSeconds > 0 && (!dbUser || dbUser.role !== 'admin')) {
          const lastTime = userLastMessageTime.get(trackerKey) || 0;
          const elapsed = (now - lastTime) / 1000;
          if (elapsed < chatSlowmodeSeconds) {
            const waitTime = Math.ceil(chatSlowmodeSeconds - elapsed);
            return socket.emit('error_message', `⏳ Slowmode active. Please wait ${waitTime}s.`);
          }
        }

        userLastMessageTime.set(trackerKey, now);

        const role = (dbUser && dbUser.role) || user.role || 'member';
        const cleanText = await sanitizeContent(messageContent.slice(0, 400));
        const audioUrl = data.audioUrl || '';

        const newMsg = await db.createChatMessage(user.id || null, user.username, role, cleanText, audioUrl);
        io.emit('new_message', newMsg);
      } catch (err) {
        console.error('Chat error:', err);
      }
    });

    // Direct Messages (DMs)
    socket.on('send_dm', async (data) => {
      const { sender, recipientUsername, text } = data;
      if (!sender || !recipientUsername || !text || text.trim() === '') return;

      try {
        const senderUser = await db.getUserById(sender.id);
        if (senderUser && senderUser.is_banned) {
          return socket.emit('error_message', 'Banned users cannot send direct messages.');
        }

        if (senderUser && senderUser.muted_until && new Date(senderUser.muted_until) > new Date()) {
          return socket.emit('error_message', 'You are temporarily muted.');
        }

        const receiverUser = await db.getUserByUsername(recipientUsername);
        if (!receiverUser) {
          return socket.emit('error_message', `User "${recipientUsername}" not found.`);
        }

        const cleanText = await sanitizeContent(text.trim().slice(0, 300));
        const newDm = await db.createDM(sender.id, receiverUser.id, sender.username, receiverUser.username, cleanText);

        for (const [sId, c] of activeConnections.entries()) {
          if (c.username && c.username.toLowerCase() === recipientUsername.toLowerCase()) {
            io.to(sId).emit('new_dm', newDm);
            io.to(sId).emit('open_dms_update');
          }
        }

        socket.emit('new_dm', newDm);
        socket.emit('open_dms_update');
      } catch (e) {
        console.error('DM error:', e);
      }
    });

    socket.on('get_dm_history', async (data) => {
      const { username1, username2 } = data;
      if (!username1 || !username2) return;
      try {
        const history = await db.getDMs(username1, username2);
        socket.emit('dm_history', { otherUser: username2, messages: history });
      } catch (e) {
        console.error('DM history error:', e);
      }
    });

    socket.on('get_open_dms', async ({ username }) => {
      if (!username) return;
      try {
        const convos = await db.getUserConversations(username);
        socket.emit('open_dms_list', convos);
      } catch (e) {
        socket.emit('open_dms_list', []);
      }
    });

    // Private Rooms
    socket.on('join_private_room', ({ roomCode, user }) => {
      if (!roomCode) return;
      const cleanRoom = 'room_' + roomCode.toLowerCase().trim();
      socket.join(cleanRoom);
      socket.emit('joined_private_room', { roomCode });
      io.to(cleanRoom).emit('private_room_system_msg', {
        roomCode,
        message: `👋 ${user ? user.username : 'A student'} joined room #${roomCode}.`
      });
    });

    socket.on('send_private_room_msg', async ({ roomCode, user, text }) => {
      if (!roomCode || !user || !text) return;
      const cleanText = await sanitizeContent(text.trim().slice(0, 300));
      const cleanRoom = 'room_' + roomCode.toLowerCase().trim();

      io.to(cleanRoom).emit('private_room_message', {
        roomCode,
        username: user.username,
        role: user.role,
        message: cleanText,
        created_at: new Date().toISOString()
      });
    });

    // Collaborative Study Whiteboard
    socket.on('join_whiteboard', ({ roomCode }) => {
      const targetRoom = 'wb_' + (roomCode ? roomCode.toLowerCase().trim() : 'global');
      socket.join(targetRoom);
      const strokes = whiteboardRooms.get(targetRoom) || [];
      socket.emit('whiteboard_history', { strokes });
    });

    socket.on('whiteboard_draw', ({ roomCode, stroke }) => {
      if (!stroke) return;
      const targetRoom = 'wb_' + (roomCode ? roomCode.toLowerCase().trim() : 'global');
      
      let strokes = whiteboardRooms.get(targetRoom) || [];
      strokes.push(stroke);
      if (strokes.length > 800) strokes = strokes.slice(-800); // cap memory buffer
      whiteboardRooms.set(targetRoom, strokes);

      socket.to(targetRoom).emit('whiteboard_draw', { stroke });
    });

    socket.on('whiteboard_clear', ({ roomCode }) => {
      const targetRoom = 'wb_' + (roomCode ? roomCode.toLowerCase().trim() : 'global');
      whiteboardRooms.set(targetRoom, []);
      io.to(targetRoom).emit('whiteboard_clear');
    });

    // Admin Controls & Connection Kick Manager
    socket.on('admin_kick_connection', ({ targetSocketId, adminUser }) => {
      if (!adminUser || !['admin', 'owner'].includes(adminUser.role)) return;
      const targetConn = activeConnections.get(targetSocketId);
      if (targetConn) {
        io.to(targetSocketId).emit('force_disconnect', { reason: 'Kicked by administrator.' });
        const targetSock = io.sockets.sockets.get(targetSocketId);
        if (targetSock) {
          targetSock.emit('force_disconnect', { reason: 'Kicked by administrator.' });
          targetSock.disconnect(true);
        }
        activeConnections.delete(targetSocketId);
        broadcastLiveConnections();
      }
    });

    socket.on('admin_toggle_maintenance', async ({ enabled, adminUser }) => {
      if (!adminUser || !['admin', 'owner'].includes(adminUser.role)) return;
      if (enabled) {
        // Kick all non-owner active connections immediately
        for (const [sId, conn] of activeConnections.entries()) {
          const isOwner = conn.role === 'owner' || (conn.username && conn.username.toLowerCase() === 'jordandaniels');
          if (!isOwner) {
            io.to(sId).emit('maintenance_kick', { reason: 'Platform Maintenance Mode Enabled by Owner.' });
            io.sockets.sockets.get(sId)?.disconnect(true);
            activeConnections.delete(sId);
          }
        }
        broadcastLiveConnections();
      }
      io.emit('maintenance_mode_changed', { enabled: Boolean(enabled) });
    });

    socket.on('admin_set_slowmode', ({ seconds, adminUser }) => {
      if (!adminUser || !['admin', 'owner'].includes(adminUser.role)) return;
      chatSlowmodeSeconds = parseInt(seconds, 10) || 0;
      io.emit('slowmode_status', { seconds: chatSlowmodeSeconds });
      broadcastLiveConnections();
    });

    socket.on('admin_mute_user', async ({ targetUserId, durationMinutes, adminUser }) => {
      if (!adminUser || !['admin', 'owner'].includes(adminUser.role)) return;
      try {
        const target = await db.getUserById(targetUserId);
        if (!target) return;

        await db.muteUser(targetUserId, durationMinutes);
        io.emit('user_muted', { userId: targetUserId, username: target.username, durationMinutes });
      } catch (e) {
        console.error('Mute error:', e);
      }
    });

    socket.on('delete_message', async (data) => {
      const { adminUser, messageId } = data;
      if (!adminUser || !['admin', 'owner'].includes(adminUser.role)) {
        return socket.emit('error_message', 'Only admins or platform owner can delete messages.');
      }
      try {
        await db.deleteChatMessage(messageId);
        io.emit('message_deleted', { messageId });
      } catch (err) {
        console.error('Delete message error:', err);
      }
    });

    socket.on('disconnect', () => {
      activeConnections.delete(socket.id);
      broadcastLiveConnections();
    });
  });
}

module.exports = { initChatSocket, getActiveConnectionsList };
