const db = require('./db');
const { sendDiscordLog } = require('./discordLogger');
const { checkMessageWithGroqModeration, checkImageWithGroqModeration } = require('./aiModeration');

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

  async function evaluateCustomFilter(text, user, socket) {
    if (!text) return { allowed: true, cleanText: text };
    try {
      const filterWords = await db.getFilterWords();
      let cleanText = text;
      let worstRule = null;

      for (const rule of filterWords) {
        if (!rule.word) continue;
        const targetType = rule.filter_type || 'both';
        if (['chat', 'both'].includes(targetType)) {
          const escaped = rule.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
          if (regex.test(cleanText)) {
            const p = rule.punishment || 'censor';
            if (p === 'censor') {
              cleanText = cleanText.replace(regex, '***');
            } else {
              worstRule = rule;
            }
          }
        }
      }

      // If no punishing rule was matched (only censor rules or clean text), allow through!
      if (!worstRule) {
        return { allowed: true, cleanText };
      }

      const isOwner = user && (user.role === 'owner' || (user.username && user.username.toLowerCase() === 'jordandaniels'));
      if (isOwner) {
        // Owner immunity: zero censoring, zero warnings, zero moderation actions
        return { allowed: true, cleanText: text };
      }

      const punishment = worstRule ? (worstRule.punishment || 'censor') : 'censor';
      let targetId = user ? user.id : null;
      let username = user ? user.username : 'User';
      if (!targetId && user && user.username) {
        try {
          const u = await db.getUserByUsername(user.username);
          if (u) {
            targetId = u.id;
            username = u.username;
          }
        } catch (e) {}
      }

      if (punishment === 'censor') {
        const escaped = worstRule.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        cleanText = cleanText.replace(regex, '***');
        return { allowed: true, cleanText };
      }

      if (punishment === 'warn' || punishment === 'warning' || punishment === 'strike') {
        const escaped = worstRule.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        cleanText = cleanText.replace(regex, '***');
        socket.emit('error_message', `⚠️ [Filter Shield] Warning: Please refrain from using forbidden words ("${worstRule.word}").`);
        return { allowed: true, cleanText };
      }

      if (['mute_5m', 'mute', 'mute_5min', 'mute5'].includes(punishment)) {
        if (targetId) {
          const mutedUntil = await db.muteUser(targetId, 5);
          io.emit('user_muted', { userId: targetId, username, durationMinutes: 5, mutedUntil });
        }
        socket.emit('error_message', `🔇 [Muted] Automatically muted for 5 minutes for restricted word ("${worstRule.word}").`);
        return { allowed: false };
      }

      if (['mute_1h', 'mute_60m', 'mute_hour', 'mute60'].includes(punishment)) {
        if (targetId) {
          const mutedUntil = await db.muteUser(targetId, 60);
          io.emit('user_muted', { userId: targetId, username, durationMinutes: 60, mutedUntil });
        }
        socket.emit('error_message', `🔇 [Muted] Automatically muted for 1 hour for restricted word ("${worstRule.word}").`);
        return { allowed: false };
      }

      if (['ban_1d', 'ban_1day', 'ban_24h'].includes(punishment)) {
        if (targetId) {
          await db.banUser(targetId, `Matched restricted word: ${worstRule.word}`, 1);
          socket.emit('banned', { reason: `Matched restricted word: ${worstRule.word}`, durationDays: 1 });
        }
        socket.emit('error_message', `⛔ [Banned] Account suspended for 1 day for restricted word ("${worstRule.word}").`);
        return { allowed: false };
      }

      if (['ban_3d', 'ban_3day', 'temp_ban', 'ban'].includes(punishment)) {
        if (targetId) {
          await db.banUser(targetId, `Matched restricted word: ${worstRule.word}`, 3);
          socket.emit('banned', { reason: `Matched restricted word: ${worstRule.word}`, durationDays: 3 });
        }
        socket.emit('error_message', `⛔ [Banned] Account suspended for 3 days for restricted word ("${worstRule.word}").`);
        return { allowed: false };
      }

      if (['ban_7d', 'ban_7day', 'ban_1w', 'ban_week'].includes(punishment)) {
        if (targetId) {
          await db.banUser(targetId, `Matched restricted word: ${worstRule.word}`, 7);
          socket.emit('banned', { reason: `Matched restricted word: ${worstRule.word}`, durationDays: 7 });
        }
        socket.emit('error_message', `⛔ [Banned] Account suspended for 7 days for restricted word ("${worstRule.word}").`);
        return { allowed: false };
      }

      if (['ban_10d_review', 'ban_10d', 'ban_10day', 'ban_10', 'review_ban'].includes(punishment)) {
        if (targetId) {
          await db.banUser(targetId, `10-Day Suspension (Under Admin Review): ${worstRule.word}`, 10);
          await db.setAccountDisabledForReview(targetId, true, `Automated 10-Day Review Lock for forbidden word "${worstRule.word}"`);
          socket.emit('banned', { reason: `10-Day Suspension (Pending Admin Review): ${worstRule.word}`, durationDays: 10, isDisabledForReview: true });
        }
        socket.emit('error_message', `🛑 [Account Disabled] Account disabled and suspended for 10 days pending Admin Review ("${worstRule.word}").`);
        return { allowed: false };
      }

      if (['perm_ban', 'ban_perm', 'permanent', 'permban'].includes(punishment)) {
        if (targetId) {
          await db.banUser(targetId, `Matched severe forbidden word: ${worstRule.word}`, 3650);
          socket.emit('banned', { reason: `Matched severe forbidden word: ${worstRule.word}`, durationDays: 3650 });
        }
        socket.emit('error_message', `⛔ [Permanent Ban] Account permanently banned for severe restricted word ("${worstRule.word}").`);
        return { allowed: false };
      }

      // Default fallback: censor word with *** and allow message to send
      const escaped = worstRule.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      cleanText = cleanText.replace(regex, '***');
      return { allowed: true, cleanText };
    } catch (e) {
      console.error('evaluateCustomFilter error:', e);
      return { allowed: true, cleanText: text };
    }
  }

  async function handleAiModerationEnforcement(cleanText, user, socket, context = 'Global Chat') {
    if (!cleanText || !cleanText.trim()) return { allowed: true, cleanText };

    const isOwner = user && (user.role === 'owner' || (user.username && user.username.toLowerCase() === 'jordandaniels'));
    if (isOwner) {
      return { allowed: true, cleanText };
    }

    const aiCheck = await checkMessageWithGroqModeration(cleanText);
    if (!aiCheck || !aiCheck.flagged) {
      return { allowed: true, cleanText };
    }

    let targetId = user ? user.id : null;
    let username = user ? user.username : 'Anonymous';
    if (!targetId && user && user.username) {
      try {
        const u = await db.getUserByUsername(user.username);
        if (u) {
          targetId = u.id;
          username = u.username;
        }
      } catch (e) {}
    }

    const action = aiCheck.recommended_action || 'block';

    // 1. Persist incident in AI Moderation Incident Feed DB
    await db.logAiModerationViolation({
      userId: targetId,
      username,
      message: cleanText,
      category: aiCheck.category,
      severity: aiCheck.severity,
      confidence: aiCheck.confidence,
      action_taken: action,
      reason: aiCheck.reason
    });

    // 2. Send rich Discord notification
    sendDiscordLog({
      category: 'moderation',
      action: 'GROQ_AI_FLAGGED',
      admin: 'AI_SAFETY_ENGINE',
      target: `@${username}`,
      details: `[${context}] Flagged message: "${cleanText}" | Category: ${aiCheck.category} (${aiCheck.severity} severity, ${Math.round((aiCheck.confidence || 0.95) * 100)}% conf) | Action: ${action} | Reason: ${aiCheck.reason}`
    });

    // 3. Emit real-time notification to all connected admins/mods
    io.to('admin_channel').emit('system_notification', {
      title: `🚨 AI Flag: ${aiCheck.reason || aiCheck.category}`,
      message: `@${username} was flagged for ${aiCheck.category.toUpperCase()} (${aiCheck.severity} severity): "${cleanText}"`,
      level: 'error'
    });

    if (action === 'censor' || aiCheck.action_type === 'censor') {
      const censored = aiCheck.censored_text || '***';
      return { allowed: true, cleanText: censored };
    }

    if (action === 'warn' || aiCheck.action_type === 'warn') {
      if (targetId) await db.recordGatewayViolation(targetId);
      socket.emit('error_message', `⚠️ [AI Warning Strike] Strike issued: ${aiCheck.reason} (${aiCheck.category}).`);
      return { allowed: false };
    }

    // Dynamic Ban Enforcement (1 day, 3 days, 7 days, 14 days, 30 days, or Permanent)
    if (aiCheck.action_type === 'ban' || action.startsWith('ban') || action === 'perm_ban') {
      let banDays = typeof aiCheck.duration_days === 'number' ? aiCheck.duration_days : (action === 'perm_ban' ? 0 : action === 'ban_30d' ? 30 : action === 'ban_7d' ? 7 : action === 'ban_3d' ? 3 : 1);
      const isPerm = banDays === 0;
      const banLabel = isPerm ? 'Permanently Banned' : `Suspended for ${banDays} Day(s)`;

      if (targetId) {
        await db.banUser(targetId, `AI Auto-Ban (${banLabel}): ${aiCheck.reason} [${aiCheck.category}]`, banDays);
        io.emit('user_banned', { userId: targetId, username, reason: aiCheck.reason, durationDays: banDays });
      }

      socket.emit('error_message', `⛔ [AI Auto-Ban] Account ${banLabel}: ${aiCheck.reason} (${aiCheck.category}).`);
      if (!isOwner) socket.disconnect(true);
      return { allowed: false };
    }

    // Dynamic Mute Enforcement (5m, 15m, 1h, 24h)
    if (aiCheck.action_type === 'mute' || action.startsWith('mute')) {
      let muteMins = typeof aiCheck.duration_minutes === 'number' ? aiCheck.duration_minutes : (action === 'mute_24h' ? 1440 : action === 'mute_1h' ? 60 : action === 'mute_15m' ? 15 : 5);
      const muteLabel = muteMins >= 60 ? `${Math.round(muteMins / 60)} hour(s)` : `${muteMins} minute(s)`;

      if (targetId) {
        const mutedUntil = await db.muteUser(targetId, muteMins);
        io.emit('user_muted', { userId: targetId, username, durationMinutes: muteMins, mutedUntil });
      }

      socket.emit('error_message', `🔇 [AI Auto-Mute] You were muted for ${muteLabel}: ${aiCheck.reason} (${aiCheck.category}).`);
      return { allowed: false };
    }

    // Default 'block'
    socket.emit('error_message', `🛡️ [Groq AI Moderation] Message blocked: ${aiCheck.reason} (${aiCheck.category}).`);
    return { allowed: false };
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

    socket.on('play_sound_effect', ({ soundKey, audioUrl, username }) => {
      if (soundKey || audioUrl) {
        io.emit('sound_effect_broadcast', { soundKey, audioUrl, username });
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

  async function checkUserMutedOrBanned(user) {
    if (!user) return { isBanned: false, isMuted: false, dbUser: null };
    let dbUser = null;
    if (user.id) {
      try { dbUser = await db.getUserById(user.id); } catch(e) {}
    }
    if (!dbUser && user.username) {
      try { dbUser = await db.getUserByUsername(user.username); } catch(e) {}
    }
    if (!dbUser) return { isBanned: false, isMuted: false, dbUser: null };

    if (dbUser.is_banned) {
      return { isBanned: true, reason: dbUser.ban_reason || 'Account suspended', dbUser };
    }

    if (dbUser.muted_until && new Date(dbUser.muted_until) > new Date()) {
      const remainingMins = Math.ceil((new Date(dbUser.muted_until) - new Date()) / (1000 * 60));
      return { isMuted: true, remainingMins, mutedUntil: dbUser.muted_until, dbUser };
    }

    return { isBanned: false, isMuted: false, dbUser };
  }

  // Global Chat Message with Spam & Raid Shield
  socket.on('send_message', async (data) => {
    const { user, text, gifUrl, imageUrl, audioUrl } = data;
    if (!user || !user.username) return;

    const messageContent = (gifUrl ? `[GIF:${gifUrl}] ` : '') + (text || '').trim();
    const hasImage = Boolean(imageUrl && String(imageUrl).trim());
    const hasAudio = Boolean(audioUrl && String(audioUrl).trim());

    if (!messageContent && !hasImage && !hasAudio) return;

    try {
      const authCheck = await checkUserMutedOrBanned(user);
      if (authCheck.isBanned) {
        return socket.emit('error_message', `⛔ You are banned from sending messages: ${authCheck.reason}`);
      }

      if (authCheck.isMuted) {
        return socket.emit('error_message', `🔇 You are temporarily muted for ${authCheck.remainingMins} more minute(s).`);
      }

      const dbUser = authCheck.dbUser;
      const trackerKey = user.id || clientIp;
      const now = Date.now();

      // Spam & Raid Shield Check (Auto-Mute on Rapid Flooding or 3 Identical Messages)
      if (!dbUser || (dbUser.role !== 'admin' && dbUser.role !== 'owner')) {
        let history = userMessageHistory.get(trackerKey) || [];
        history = history.filter(h => now - h.time < 12000); // retain last 12s

        const duplicateCount = history.filter(h => h.text.toLowerCase() === messageContent.toLowerCase()).length;
        const rapidFloodCount = history.filter(h => now - h.time < 3000).length;

        if (duplicateCount >= 2 || rapidFloodCount >= 4) {
          if (user.id) await db.muteUser(user.id, 5);
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
      if (chatSlowmodeSeconds > 0 && (!dbUser || (dbUser.role !== 'admin' && dbUser.role !== 'owner'))) {
        const lastTime = userLastMessageTime.get(trackerKey) || 0;
        const elapsed = (now - lastTime) / 1000;
        if (elapsed < chatSlowmodeSeconds) {
          const waitTime = Math.ceil(chatSlowmodeSeconds - elapsed);
          return socket.emit('error_message', `⏳ Slowmode active. Please wait ${waitTime}s.`);
        }
      }

      userLastMessageTime.set(trackerKey, now);

      const role = (dbUser && dbUser.role) || user.role || 'member';
      let cleanText = messageContent.slice(0, 400);
      const audioUrl = data.audioUrl || '';
      const imageUrl = data.imageUrl || '';

      // 1. Run Groq AI Vision Image Moderation Engine
      if (imageUrl && imageUrl.trim()) {
        const imgCheck = await checkImageWithGroqModeration(imageUrl);
        if (imgCheck && imgCheck.flagged) {
          let targetId = user ? user.id : null;
          let username = user ? user.username : 'Anonymous';

          const isNsfw = imgCheck.category === 'nsfw' || (imgCheck.reason && imgCheck.reason.toLowerCase().includes('nsfw'));
          
          if (isNsfw && targetId) {
            const banDurationDays = 3;
            const banReason = 'Groq AI Vision: Uploaded NSFW Image (3-day ban)';
            await db.banUser(targetId, banReason, banDurationDays);
            
            await db.logAiModerationViolation({
              userId: targetId,
              username,
              message: `[Image Attachment]: ${imgCheck.reason}`,
              category: 'nsfw',
              severity: 'extreme',
              confidence: imgCheck.confidence || 0.99,
              action_taken: 'banned_3d',
              reason: banReason
            });

            sendDiscordLog({
              category: 'moderation',
              action: 'GROQ_VISION_NSFW_3DAY_BAN',
              admin: 'AI_VISION_ENGINE',
              target: `@${username}`,
              details: `3-Day Account Ban applied for NSFW Image Upload | Reason: ${imgCheck.reason}`
            });

            io.to('admin_channel').emit('system_notification', {
              title: `🚨 AI Vision: NSFW Ban`,
              message: `@${username} was banned for 3 days for NSFW image upload: "${imgCheck.reason}"`,
              level: 'error'
            });

            socket.emit('banned', { reason: banReason, durationDays: banDurationDays });
            return socket.emit('error_message', `⛔ [Groq AI Vision] You have been issued a 3-Day Account Ban for uploading NSFW content.`);
          }

          await db.logAiModerationViolation({
            userId: targetId,
            username,
            message: `[Image Attachment]: ${imgCheck.reason}`,
            category: imgCheck.category || 'nsfw',
            severity: imgCheck.severity || 'high',
            confidence: imgCheck.confidence || 0.95,
            action_taken: 'blocked',
            reason: `Groq AI Vision flagged image: ${imgCheck.reason}`
          });

          sendDiscordLog({
            category: 'moderation',
            action: 'GROQ_VISION_FLAGGED_IMAGE',
            admin: 'AI_VISION_ENGINE',
            target: `@${username}`,
            details: `Flagged Image Attachment | Reason: ${imgCheck.reason} (${imgCheck.category || 'Inappropriate Image'})`
          });

          io.to('admin_channel').emit('system_notification', {
            title: `🚨 AI Vision: Image Blocked`,
            message: `@${username} uploaded flagged content: "${imgCheck.reason}"`,
            level: 'error'
          });

          return socket.emit('error_message', `🛡️ [Groq AI Vision] Image blocked: ${imgCheck.reason} (${imgCheck.category || 'Inappropriate'}).`);
        }
      }

      // 2. Run Manual Database Word & Punishment Filter Rules
      if (cleanText && cleanText.trim()) {
        const customCheck = await evaluateCustomFilter(cleanText, user, socket);
        if (!customCheck.allowed) return;
        cleanText = customCheck.cleanText;
      }

      // 3. Run Groq AI Moderation Engine for Text
      if (cleanText && cleanText.trim()) {
        const aiEnforce = await handleAiModerationEnforcement(cleanText, user, socket, 'Global Chat');
        if (!aiEnforce.allowed) return;
        cleanText = aiEnforce.cleanText;
      }

      const newMsg = await db.createChatMessage(user.id || null, user.username, role, cleanText, audioUrl, imageUrl);
      io.emit('new_message', newMsg);

      sendDiscordLog({
        category: 'chat',
        action: 'COMMUNITY_CHAT_MESSAGE',
        admin: user.username,
        target: 'Global Chat Room',
        details: cleanText || (imageUrl ? '[Image Attachment]' : '[Audio Attachment]')
      });
    } catch (err) {
      console.error('Chat error:', err);
    }
  });

  // Direct Messages (DMs)
  socket.on('send_dm', async (data) => {
    const { sender, recipientUsername, text, imageUrl, audioUrl } = data;
    if (!sender || !recipientUsername) return;
    const hasText = Boolean(text && String(text).trim());
    const hasImg = Boolean(imageUrl && String(imageUrl).trim());
    const hasAudio = Boolean(audioUrl && String(audioUrl).trim());
    if (!hasText && !hasImg && !hasAudio) return;

    try {
      const authCheck = await checkUserMutedOrBanned(sender);
      if (authCheck.isBanned) {
        return socket.emit('error_message', 'Banned users cannot send direct messages.');
      }

      if (authCheck.isMuted) {
        return socket.emit('error_message', `🔇 You are temporarily muted for ${authCheck.remainingMins} more minute(s).`);
      }

      const receiverUser = await db.getUserByUsername(recipientUsername);
      if (!receiverUser) {
        return socket.emit('error_message', `User "${recipientUsername}" not found.`);
      }

      let cleanText = text ? text.trim().slice(0, 300) : '';

      // 1. Run Manual Database Word & Punishment Filter Rules
      const customCheck = await evaluateCustomFilter(cleanText, sender, socket);
      if (!customCheck.allowed) return;
      cleanText = customCheck.cleanText;

      // 2. Run Remade Groq AI Moderation Engine
      const aiEnforce = await handleAiModerationEnforcement(cleanText, sender, socket, `DM to @${recipientUsername}`);
      if (!aiEnforce.allowed) return;
      cleanText = aiEnforce.cleanText;

      const newDm = await db.createDM(sender.id || authCheck.dbUser?.id || null, receiverUser.id, sender.username, receiverUser.username, cleanText, imageUrl, audioUrl);

      const senderId = sender.id || authCheck.dbUser?.id;
      if (senderId) {
        await db.updateQuestProgress(senderId, 'send_messages', 1);
      }

      sendDiscordLog({
        category: 'chat',
        action: 'DIRECT_MESSAGE_SENT',
        admin: sender.username,
        target: `@${receiverUser.username}`,
        details: cleanText || (imageUrl ? '[Image Attachment]' : '[Audio Attachment]')
      });

      for (const [sId, c] of activeConnections.entries()) {
        if (c.username && c.username.toLowerCase() === recipientUsername.toLowerCase()) {
          io.to(sId).emit('new_dm', newDm);
          io.to(sId).emit('new_direct_message', { sender, message: cleanText, imageUrl, audioUrl });
          io.to(sId).emit('open_dms_update');
        }
      }

      socket.emit('new_dm', newDm);
    } catch (err) {
      console.error('DM error:', err);
    }
  });

  // Message Reactions Socket Event
  socket.on('chat_message_reaction', ({ messageId, emoji, user }) => {
    if (!messageId || !emoji) return;
    io.emit('chat_message_reaction', { messageId, emoji, username: user?.username || 'Guest' });
  });

  // Voice Room Invite Event
  socket.on('send_voice_invite', ({ channelId, channelName, targetUsername, sender }) => {
    if (!targetUsername || !channelId) return;
    for (const [sId, c] of activeConnections.entries()) {
      if (c.username && c.username.toLowerCase() === targetUsername.toLowerCase()) {
        io.to(sId).emit('voice_room_invite', { channelId, channelName, sender });
      }
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

  socket.on('send_private_room_msg', async ({ roomCode, user, text, imageUrl }) => {
    if (!roomCode || !user) return;
    const hasText = Boolean(text && String(text).trim());
    const hasImg = Boolean(imageUrl && String(imageUrl).trim());
    if (!hasText && !hasImg) return;

    const authCheck = await checkUserMutedOrBanned(user);
    if (authCheck.isBanned) {
      return socket.emit('error_message', 'Banned users cannot chat in private rooms.');
    }
    if (authCheck.isMuted) {
      return socket.emit('error_message', `🔇 You are temporarily muted for ${authCheck.remainingMins} more minute(s).`);
    }

    let cleanText = text ? text.trim().slice(0, 300) : '';
    const cleanRoom = 'room_' + roomCode.toLowerCase().trim();

    // 1. Run Manual Database Word & Punishment Filter Rules
    const customCheck = await evaluateCustomFilter(cleanText, user, socket);
    if (!customCheck.allowed) return;
    cleanText = customCheck.cleanText;

    // 2. Run Groq AI Moderation Check
    const aiEnforce = await handleAiModerationEnforcement(cleanText, user, socket, `Room #${roomCode}`);
    if (!aiEnforce.allowed) return;
    cleanText = aiEnforce.cleanText;

    // 3. AI Vision Image Moderation (if image is present in private room)
    if (imageUrl && imageUrl.trim()) {
      const imgCheck = await checkImageWithGroqModeration(imageUrl);
      if (imgCheck && imgCheck.flagged) {
        // Block image just like in global chat
        const targetId = user.id;
        const banReason = 'Groq AI Vision: Uploaded NSFW Image in Private Room (3-day ban)';
        const banDurationDays = 3;
        if (targetId) {
          await db.banUser(targetId, banReason, banDurationDays);
          io.emit('user_banned', { userId: targetId, username: user.username, reason: imgCheck.reason, durationDays: banDurationDays });
        }
        await db.logAiModerationViolation({
          userId: targetId || null,
          username: user.username,
          message: `[Image Attachment in Room #${roomCode}]: ${imgCheck.reason || 'NSFW'}`,
          category: imgCheck.category || 'NSFW Content',
          severity: 'HIGH',
          confidence: imgCheck.confidence || 0.99,
          action_taken: 'BAN_3_DAYS',
          reason: imgCheck.reason
        });

        sendDiscordLog({
          category: 'moderation',
          action: 'GROQ_VISION_BAN_3_DAYS',
          admin: 'AI_VISION_ENGINE',
          target: `@${user.username}`,
          details: `3-Day Account Ban applied for NSFW Image in Private Room | Reason: ${imgCheck.reason}`
        });

        io.to('admin_channel').emit('system_notification', {
          title: `🚨 AI Vision: Private NSFW`,
          message: `@${user.username} was banned for 3 days for NSFW image upload in Room #${roomCode}: "${imgCheck.reason}"`,
          level: 'error'
        });

        return socket.emit('error_message', `❌ [Groq AI Vision] You have been issued a 3-Day Account Ban for uploading NSFW content.`);
      }
    }

    io.to(cleanRoom).emit('private_room_message', {
      roomCode,
      username: user.username,
      role: user.role,
      message: cleanText,
      imageUrl: imageUrl || '',
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

        const mins = parseInt(durationMinutes, 10);
        if (mins <= 0) {
          await db.unmuteUser(targetUserId);
          io.emit('user_unmuted', { userId: targetUserId, username: target.username });
          for (const [sId, conn] of activeConnections.entries()) {
            if (conn.userId === targetUserId || (conn.username && conn.username.toLowerCase() === target.username.toLowerCase())) {
              io.to(sId).emit('error_message', '🔊 Your chat mute has been lifted by an administrator.');
            }
          }
        } else {
          const mutedUntil = await db.muteUser(targetUserId, mins);
          io.emit('user_muted', { userId: targetUserId, username: target.username, durationMinutes: mins, mutedUntil });
          for (const [sId, conn] of activeConnections.entries()) {
            if (conn.userId === targetUserId || (conn.username && conn.username.toLowerCase() === target.username.toLowerCase())) {
              io.to(sId).emit('user_muted', { username: target.username, durationMinutes: mins, mutedUntil });
              io.to(sId).emit('error_message', `🔇 You have been muted for ${mins} minutes by an administrator.`);
            }
          }
        }
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
