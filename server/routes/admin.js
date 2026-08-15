const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const systemState = require('../systemState');
const { sendDiscordLog } = require('../discordLogger');
const { getActiveConnectionsList } = require('../chatSocket');

const JWT_SECRET = process.env.SESSION_SECRET || 'nitro_jwt_secure_key_2026';

// Middleware to restrict access to Admins only (supports Session and Bearer JWT)
const requireAdmin = async (req, res, next) => {
  let user = req.session && req.session.user;

  if (!user && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const token = req.headers.authorization.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.id) user = await db.getUserById(decoded.id);
      if (!user && decoded.username) user = await db.getUserByUsername(decoded.username);
    } catch (e) {}
  }

  if (!user || !['admin', 'owner'].includes(user.role)) {
    return res.status(403).json({ error: 'Access denied. Administrator or Owner privileges required.' });
  }

  req.adminUser = user;
  if (!req.session) req.session = {};
  req.session.user = user;
  next();
};

const requireOwner = (req, res, next) => {
  const user = req.adminUser;
  if (!user || (user.role !== 'owner' && user.username.toLowerCase() !== 'jordandaniels')) {
    return res.status(403).json({ error: 'Owner privileges required for this action.' });
  }
  next();
};

router.use(requireAdmin);

// ADMIN TOGGLE NITRO AI MAINTENANCE MODE
router.get('/ai-status', (req, res) => {
  res.json({ ai_enabled: systemState.isAiEnabled() });
});

router.post('/toggle-ai', (req, res) => {
  const { enabled } = req.body;
  const newState = enabled !== undefined ? !!enabled : !systemState.isAiEnabled();
  systemState.setAiEnabled(newState);

  sendDiscordLog({
    category: 'admin',
    action: 'AI_MAINTENANCE_TOGGLE',
    admin: req.adminUser.username,
    details: `Nitro AI state toggled to ${newState ? 'ONLINE' : 'UNDER MAINTENANCE'}`
  });

  res.json({
    success: true,
    ai_enabled: newState,
    message: `Nitro AI is now ${newState ? 'ONLINE' : 'UNDER MAINTENANCE'}`
  });
});


// ADMIN/OWNER CREATE USER ACCOUNT
router.post('/users/create', async (req, res) => {
  const { username, display_name, password, role, avatar_url } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and Password are required.' });
  }

  try {
    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(400).json({ error: 'Username is already taken.' });
    }

    const newUser = await db.createUserAdmin({ username, display_name, password, role: role || 'member', avatar_url });
    if (!newUser) {
      return res.status(500).json({ error: 'Failed to create user account.' });
    }

    sendDiscordLog({
      category: 'admin',
      action: 'USER_CREATED_BY_ADMIN',
      admin: req.adminUser.username,
      target: username,
      details: `Created new user account @${username} with role ${role || 'member'}`
    });

    res.json({ success: true, message: `Account @${username} created successfully!`, user: newUser });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error creating account.' });
  }
});

// OWNER-ONLY FEATURE TOGGLES API
router.get('/features', async (req, res) => {
  try {
    const features = await db.getFeatureSettings();
    res.json({ features });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch feature settings.' });
  }
});

router.post('/features', requireOwner, async (req, res) => {
  try {
    const { key, enabled } = req.body;
    if (!key) return res.status(400).json({ error: 'Feature key required.' });

    await db.updateFeatureSetting(key, enabled === true || enabled === 'true');
    await db.createModerationLog('UPDATE_FEATURE_TOGGLE', req.adminUser.username, key, `Set enabled to ${enabled}`);

    res.json({ success: true, key, enabled });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update feature setting.' });
  }
});

// Purge Chat Messages (Owner Only)
router.post('/clear-chat', requireOwner, async (req, res) => {
  try {
    await db.clearAllChatMessages();
    await db.createModerationLog('PURGE_CHAT_HISTORY', req.adminUser.username, 'Global Chat', 'Purged all chat history');
    res.json({ success: true, message: 'Global chat history cleared successfully.' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear chat history.' });
  }
});

// BLOCKED DOMAINS CRUD API
router.get('/blocked-domains', async (req, res) => {
  try {
    const domains = await db.getBlockedDomains();
    res.json({ domains });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch blocked domains.' });
  }
});

router.post('/blocked-domains', async (req, res) => {
  try {
    const { domain, reason } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain required.' });

    const added = await db.addBlockedDomain(domain, reason);
    await db.createModerationLog('ADD_BLOCKED_DOMAIN', req.adminUser.username, domain, reason || 'Restricted');

    res.json({ success: true, domain: added });
  } catch (e) {
    res.status(500).json({ error: 'Failed to add blocked domain.' });
  }
});

router.delete('/blocked-domains/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.deleteBlockedDomain(id);
    await db.createModerationLog('DELETE_BLOCKED_DOMAIN', req.adminUser.username, `ID #${id}`, 'Removed rule');

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete blocked domain.' });
  }
});


// Live Active Connections Monitor (REST Endpoint)
router.get('/connections', (req, res) => {
  const connections = getActiveConnectionsList();
  res.json({
    count: connections.length,
    connections
  });
});

// Update Logs / Patch Notes Publisher
router.post('/updates', async (req, res) => {
  const { version, title, content } = req.body;
  const admin = req.adminUser.username;

  if (!version || !title || !content) {
    return res.status(400).json({ error: 'Version tag, title, and release notes are required.' });
  }

  try {
    const newUpdate = await db.createUpdateLog({
      version: version.trim(),
      title: title.trim(),
      content: content.trim(),
      author: admin
    });

    await db.createModerationLog('PUBLISH_UPDATE', admin, version.trim(), title.trim());

    sendDiscordLog({
      category: 'updates',
      action: 'NEW_UPDATE_RELEASED',
      admin: admin,
      target: `[${version.trim()}] ${title.trim()}`,
      details: content.trim()
    });

    res.status(201).json({ success: true, update: newUpdate });
  } catch (err) {
    console.error('Publish update error:', err);
    res.status(500).json({ error: 'Failed to publish update log.' });
  }
});

// Disable / Clear all update log popups
router.post('/updates/disable', async (req, res) => {
  const admin = req.adminUser.username;
  try {
    await db.pool.query('DELETE FROM update_logs');
    await db.createModerationLog('DISABLE_UPDATES', admin, 'ALL_UPDATES', 'Cleared and disabled all update popups');
    res.json({ success: true, message: 'All update log popups disabled.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disable updates.' });
  }
});

router.delete('/updates/:id', async (req, res) => {
  try {
    await db.deleteUpdateLog(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete update.' });
  }
});

// Multi-Category Webhook Settings
router.get('/webhooks', async (req, res) => {
  try {
    const webhooks = await db.getWebhooks();
    res.json({ webhooks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch webhooks.' });
  }
});

router.post('/webhooks', async (req, res) => {
  const { category, url } = req.body;
  const admin = req.adminUser.username;

  if (!category) {
    return res.status(400).json({ error: 'Category required.' });
  }

  try {
    await db.setWebhook(category.toLowerCase().trim(), (url || '').trim());
    await db.createModerationLog('CONFIG_WEBHOOK', admin, category, url ? 'Updated URL' : 'Cleared URL');

    res.json({ success: true, message: `Webhook for ${category} successfully saved.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update webhook.' });
  }
});

// Toggle Site Maintenance Mode
router.get('/maintenance', async (req, res) => {
  const isMaintenance = await db.getMaintenanceMode();
  res.json({ maintenance_mode: isMaintenance });
});

router.post('/maintenance', async (req, res) => {
  const { enabled } = req.body;
  const admin = req.adminUser.username;

  await db.setMaintenanceMode(enabled);
  await db.createModerationLog('SET_MAINTENANCE', admin, 'SYSTEM', `Maintenance mode set to: ${enabled}`);

  sendDiscordLog({
    category: 'moderation',
    action: 'SET_MAINTENANCE',
    admin: admin,
    target: 'Platform Maintenance Mode',
    details: `Maintenance mode was turned ${enabled ? 'ENABLED (Locked)' : 'OFF (Public)'} by administrator.`
  });

  res.json({ success: true, maintenance_mode: Boolean(enabled) });
});

// Announcements Management
router.get('/announcements', async (req, res) => {
  try {
    const announcements = await db.getAnnouncements();
    res.json({ announcements });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get announcements.' });
  }
});

router.post('/announcements', async (req, res) => {
  const { title, message, alert_type, is_active } = req.body;
  const admin = req.adminUser.username;

  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message required.' });
  }

  try {
    const ann = await db.setAnnouncement({ title, message, alert_type, is_active });
    await db.createModerationLog('SET_ANNOUNCEMENT', admin, title, message);

    sendDiscordLog({
      category: 'moderation',
      action: 'SET_ANNOUNCEMENT',
      admin: admin,
      target: title,
      details: message
    });

    res.json({ success: true, announcement: ann });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set announcement.' });
  }
});

// Disable active announcements
router.post('/announcements/disable', async (req, res) => {
  const admin = req.adminUser.username;
  try {
    await db.pool.query('UPDATE announcements SET is_active = false');
    await db.createModerationLog('DISABLE_ANNOUNCEMENTS', admin, 'SYSTEM', 'Disabled all active site announcements');
    res.json({ success: true, message: 'All announcements disabled.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disable announcements.' });
  }
});

// Manage Blocked Domains
router.get('/domains', async (req, res) => {
  try {
    const domains = await db.getBlockedDomains();
    res.json({ domains });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch domains.' });
  }
});

router.post('/domains/add', async (req, res) => {
  const { domain, reason } = req.body;
  const admin = req.adminUser.username;

  if (!domain) {
    return res.status(400).json({ error: 'Domain is required.' });
  }

  try {
    const newDomain = await db.addBlockedDomain(domain, reason);
    await db.createModerationLog('BLOCK_DOMAIN', admin, domain, reason || 'Restricted');

    sendDiscordLog({
      category: 'moderation',
      action: 'BLOCK_DOMAIN',
      admin: admin,
      target: domain,
      details: `Restricted domain added: ${reason || 'Standard Filter'}`
    });

    res.status(201).json({ success: true, domain: newDomain });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add blocked domain.' });
  }
});

router.delete('/domains/:id', async (req, res) => {
  const admin = req.adminUser.username;
  try {
    await db.deleteBlockedDomain(req.params.id);
    await db.createModerationLog('UNBLOCK_DOMAIN', admin, `Domain ID #${req.params.id}`, 'Removed restriction');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete blocked domain.' });
  }
});

// Get Platform Stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

// Manage Users
router.get('/users', async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load user list.' });
  }
});

const ALLOWED_ROLES = [
  'member',
  'student_plus',
  'pro',
  'vip',
  'premium_vip',
  'elite_patron',
  'moderator',
  'admin',
  'owner'
];

// Update Role (Promote / Demote to any tiered role)
router.post('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  const targetId = req.params.id;
  const admin = req.adminUser.username;

  if (!role || !ALLOWED_ROLES.includes(role.toLowerCase().trim())) {
    return res.status(400).json({ error: `Invalid role selection. Allowed roles: ${ALLOWED_ROLES.join(', ')}` });
  }

  const cleanRole = role.toLowerCase().trim();

  try {
    const targetUser = await db.getUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    await db.updateUserRole(targetId, cleanRole);
    await db.createModerationLog('UPDATE_ROLE', admin, targetUser.username, `Role changed to: ${cleanRole.toUpperCase()}`);

    sendDiscordLog({
      category: 'moderation',
      action: 'UPDATE_ROLE',
      admin: admin,
      target: targetUser.username,
      details: `Role updated to ${cleanRole.toUpperCase()}`
    });

    res.json({ success: true, message: `User role successfully updated to ${cleanRole.toUpperCase()}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user role.' });
  }
});

// Admin Configure User Profile (on behalf of user)
router.post('/users/:id/profile', async (req, res) => {
  const targetId = req.params.id;
  const admin = req.adminUser.username;
  const { display_name, bio, avatar_url, pro_chat_glow, pro_custom_flair, role, new_password } = req.body;

  try {
    const targetUser = await db.getUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    const updated = await db.updateUserProfile(targetId, {
      display_name: display_name ? display_name.trim() : targetUser.username,
      bio: bio !== undefined ? bio.trim() : targetUser.bio,
      avatar_url: avatar_url !== undefined ? avatar_url.trim() : targetUser.avatar_url,
      pro_chat_glow: pro_chat_glow || targetUser.pro_chat_glow,
      pro_custom_flair: pro_custom_flair !== undefined ? pro_custom_flair.trim() : targetUser.pro_custom_flair,
      role: role ? role.trim() : targetUser.role,
      password: new_password
    });

    await db.createModerationLog('ADMIN_EDIT_USER_PROFILE', admin, targetUser.username, `Updated profile/settings for ${targetUser.username}`);

    sendDiscordLog({
      category: 'moderation',
      action: 'ADMIN_EDIT_USER_PROFILE',
      admin,
      target: targetUser.username,
      details: `Profile configured by admin: Name: ${display_name || targetUser.username}, Role: ${role || targetUser.role}`
    });

    res.json({ success: true, message: `Profile for ${targetUser.username} updated successfully.`, user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user profile.' });
  }
});

// Reset User Password (Admin feature)
router.post('/users/:id/password', async (req, res) => {
  const { new_password } = req.body;
  const targetId = req.params.id;
  const admin = req.adminUser.username;

  if (!new_password || new_password.trim().length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
  }

  try {
    const targetUser = await db.getUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    const base64Pass = Buffer.from(new_password.trim()).toString('base64');

    await db.updateUserPassword(targetId, base64Pass);
    await db.createModerationLog('RESET_PASSWORD', admin, targetUser.username, 'Password updated by administrator');

    sendDiscordLog({
      category: 'moderation',
      action: 'RESET_PASSWORD',
      admin: admin,
      target: targetUser.username,
      details: 'User password was reset by administrator.'
    });

    res.json({ success: true, message: `Password for ${targetUser.username} successfully updated!` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// Force User to Reset Password on next login
router.post('/users/:id/force-reset', async (req, res) => {
  const targetId = req.params.id;
  const admin = req.adminUser.username;

  try {
    const targetUser = await db.getUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    await db.setForcePasswordReset(targetId, true);
    await db.createModerationLog('FORCE_PASSWORD_RESET', admin, targetUser.username, 'Flagged for mandatory password reset');

    sendDiscordLog({
      category: 'moderation',
      action: 'FORCE_PASSWORD_RESET_SET',
      admin: admin,
      target: targetUser.username,
      details: 'User will be prompted to reset their password on next sign-in.'
    });

    res.json({ success: true, message: `Forced password reset flag set for ${targetUser.username}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set force password reset flag.' });
  }
});

// Ungateway Ban / Clear Gateway Timeout & Strikes
router.post('/users/:id/ungateway-ban', async (req, res) => {
  const targetId = req.params.id;
  const admin = req.adminUser.username;

  try {
    const targetUser = await db.getUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    await db.ungatewayBanUser(targetId);
    await db.createModerationLog('UNRESTRICT_USER', admin, targetUser.username, 'Gateway timeout and violation strikes cleared');

    sendDiscordLog({
      category: 'moderation',
      action: 'UNRESTRICT_USER',
      admin: admin,
      target: targetUser.username,
      details: 'Gateway ban and violation strikes successfully lifted.'
    });

    res.json({ success: true, message: `Gateway ban lifted for ${targetUser.username}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to lift gateway ban.' });
  }
});

// Delete User Account
router.delete('/users/:id', async (req, res) => {
  const targetId = req.params.id;
  const admin = req.adminUser.username;

  try {
    const targetUser = await db.getUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    if (targetUser.role === 'admin' && targetUser.username.toLowerCase() === 'jordandaniels') {
      return res.status(403).json({ error: 'Cannot delete primary platform administrator account.' });
    }

    await db.deleteUser(targetId);
    await db.createModerationLog('DELETE_USER', admin, targetUser.username, 'Account deleted permanently');

    sendDiscordLog({
      category: 'moderation',
      action: 'DELETE_USER',
      admin: admin,
      target: targetUser.username,
      details: 'Account and associated messages were permanently deleted.'
    });

    res.json({ success: true, message: `Account ${targetUser.username} deleted.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// Ban / Unban User (Full Platform Account Ban with Duration Support)
router.post('/users/:id/ban', async (req, res) => {
  const { is_banned, reason, durationHours } = req.body;
  const targetId = req.params.id;
  const admin = req.adminUser.username;

  try {
    const targetUser = await db.getUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    if (['admin', 'owner'].includes(targetUser.role) && req.adminUser.role !== 'owner') {
      return res.status(403).json({ error: 'Cannot ban an administrator or owner.' });
    }

    const shouldBan = is_banned === true || is_banned === 'true';
    let bannedUntil = null;
    let durationText = 'Permanently';

    if (shouldBan && durationHours && Number(durationHours) > 0) {
      const hours = Number(durationHours);
      bannedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
      durationText = `for ${hours} hour(s) (until ${bannedUntil.toLocaleString()})`;
    }

    const banReason = reason || 'Violation of platform guidelines';
    await db.updateUserBan(targetId, shouldBan, banReason, bannedUntil);
    const actionName = shouldBan ? 'BAN_USER' : 'UNBAN_USER';
    const logDetails = shouldBan ? `${banReason} [Banned ${durationText}]` : 'Ban lifted';

    await db.createModerationLog(actionName, admin, targetUser.username, logDetails);

    sendDiscordLog({
      category: 'moderation',
      action: actionName,
      admin: admin,
      target: targetUser.username,
      details: logDetails
    });

    if (shouldBan) {
      const io = req.app.get('io');
      if (io) {
        io.emit('user_banned_event', { userId: targetId, username: targetUser.username, reason: banReason, bannedUntil });
      }
    }

    res.json({ success: true, is_banned: shouldBan, reason: banReason, bannedUntil });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update ban status.' });
  }
});

// Gateway Ban / Restrict Gateway Access Only (with Duration Support)
router.post('/users/:id/gateway-ban', async (req, res) => {
  const { is_gateway_banned, reason, durationHours } = req.body;
  const targetId = req.params.id;
  const admin = req.adminUser.username;

  try {
    const targetUser = await db.getUserById(targetId);
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    const gatewayReason = reason || 'Gateway browsing restricted by administrator';
    const result = await db.updateUserGatewayBan(targetId, is_gateway_banned, gatewayReason, durationHours);
    const actionName = is_gateway_banned ? 'GATEWAY_RESTRICT_USER' : 'UNRESTRICT_USER_USER';
    const durLabel = (is_gateway_banned && durationHours > 0) ? ` for ${durationHours} hours` : '';
    await db.createModerationLog(actionName, admin, targetUser.username, `${gatewayReason}${durLabel}`);

    sendDiscordLog({
      category: 'moderation',
      action: actionName,
      admin: admin,
      target: targetUser.username,
      details: `${gatewayReason}${durLabel}`
    });

    res.json({ success: true, is_gateway_banned: Boolean(is_gateway_banned), reason: gatewayReason, timeoutUntil: result?.timeoutUntil });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update gateway ban status.' });
  }
});

// Update Game Details
router.post('/games/:id/update', async (req, res) => {
  const gameId = req.params.id;
  const admin = req.adminUser.username;
  const { title, category, author, thumbnail_url, embed_type, embed_content, clicks } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Game title is required.' });
  }

  try {
    const updated = await db.updateGameDetails(gameId, {
      title: title.trim(),
      category: category || 'Action',
      author: author ? author.trim() : 'Studio',
      thumbnail_url: thumbnail_url ? thumbnail_url.trim() : '',
      embed_type: embed_type || 'iframe_url',
      embed_content: embed_content ? embed_content.trim() : '',
      clicks: clicks !== undefined ? parseInt(clicks, 10) : undefined
    });

    await db.createModerationLog('UPDATE_GAME', admin, title.trim(), `Game #${gameId} updated by admin`);
    res.json({ success: true, game: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update game.' });
  }
});

// Delete Game
router.delete('/games/:id', async (req, res) => {
  const admin = req.adminUser.username;
  try {
    await db.deleteGame(req.params.id);
    await db.createModerationLog('DELETE_GAME', admin, `Game ID #${req.params.id}`, 'Removed from catalog');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete game.' });
  }
});

// Clear Gateway Timeout for a user (admin)
router.post('/users/:id/clear-gateway', async (req, res) => {
  const targetId = req.params.id;
  const admin = req.adminUser.username;
  try {
    const success = await db.clearGatewayTimeout(targetId);
    if (success) {
      await db.createModerationLog('CLEAR_GATEWAY_TIMEOUT', admin, targetId, 'Gateway timeout cleared by admin');
      sendDiscordLog({
        category: 'moderation',
        action: 'CLEAR_GATEWAY_TIMEOUT',
        admin,
        target: `User ID ${targetId}`,
        details: 'Gateway timeout removed by administrator.'
      });
      res.json({ success: true, message: 'Gateway timeout cleared.' });
    } else {
      res.status(500).json({ error: 'Failed to clear gateway timeout.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error clearing gateway timeout.' });
  }
});

// Filter Words
router.get('/filters', async (req, res) => {
  try {
    const filters = await db.getFilterWords();
    res.json({ filters });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get filters.' });
  }
});

router.post('/filters/add', async (req, res) => {
  const { word, filter_type } = req.body;
  const admin = req.adminUser.username;

  if (!word) return res.status(400).json({ error: 'Word is required.' });

  try {
    const filter = await db.addFilterWord(word.toLowerCase().trim(), filter_type || 'both');
    await db.createModerationLog('ADD_FILTER', admin, word, `Type: ${filter_type || 'both'}`);
    res.status(201).json({ success: true, filter });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add filter word.' });
  }
});

router.delete('/filters/:id', async (req, res) => {
  const admin = req.adminUser.username;
  try {
    await db.deleteFilterWord(req.params.id);
    await db.createModerationLog('DELETE_FILTER', admin, `Filter ID #${req.params.id}`, 'Removed filter rule');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete filter.' });
  }
});

// Bulk Catalog Importer (JSON / CSV payload)
router.post('/games/bulk-import', async (req, res) => {
  const { games } = req.body;
  const admin = req.adminUser.username;

  if (!games || !Array.isArray(games) || games.length === 0) {
    return res.status(400).json({ error: 'Array of game objects required.' });
  }

  try {
    const importedCount = await db.bulkInsertGames(games, admin);
    await db.createModerationLog('BULK_IMPORT_GAMES', admin, 'Catalog', `Imported ${importedCount} items`);

    sendDiscordLog({
      category: 'updates',
      action: 'BULK_GAMES_IMPORTED',
      admin: admin,
      target: `${importedCount} Games`,
      details: `Bulk catalog importer completed successfully with ${importedCount} items.`
    });

    res.json({ success: true, count: importedCount, message: `Successfully imported ${importedCount} games!` });
  } catch (err) {
    console.error('Bulk import error:', err);
    res.status(500).json({ error: 'Failed to bulk import games.' });
  }
});

// Real-Time Activity Radar Stats
router.get('/radar-stats', async (req, res) => {
  try {
    const radar = await db.getActivityRadarStats();
    res.json({ success: true, radar });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch radar stats.' });
  }
});

// Searchable & Filtered Moderation Audit Logs
router.get('/logs', async (req, res) => {
  try {
    const { username, action, startDate, endDate } = req.query;
    if (username || action || startDate || endDate) {
      const logs = await db.getFilteredModerationLogs({ username, action, startDate, endDate });
      return res.json({ logs });
    }
    const logs = await db.getModerationLogs();
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load moderation logs.' });
  }
});

// Game Suggestions List
router.get('/suggestions', async (req, res) => {
  try {
    const suggestions = await db.getGameSuggestions();
    res.json({ success: true, suggestions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch game suggestions.' });
  }
});

// Approve Game Suggestion
router.post('/suggestions/:id/approve', async (req, res) => {
  const admin = req.adminUser.username;
  const suggestionId = req.params.id;

  try {
    const sug = await db.getGameSuggestionById(suggestionId);
    if (!sug) {
      return res.status(404).json({ error: 'Suggestion not found.' });
    }

    // Determine category: default to 'Action' unless it matches apps or other types
    const category = sug.category || 'Action';
    const slug = sug.title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 80) + '-' + Date.now().toString().slice(-4);
    const embed_type = sug.game_url?.startsWith('http') ? 'iframe_url' : 'html_code';
    const embed_content = sug.game_url || sug.description || '';

    // Insert game
    await db.pool.query(`
      INSERT INTO games (title, slug, author, thumbnail_url, embed_type, embed_content, is_vip, category, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8)
      ON CONFLICT (slug) DO UPDATE SET title = $1, embed_content = $6, category = $7
    `, [
      sug.title,
      slug,
      sug.username || 'Community',
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400',
      embed_type,
      embed_content,
      category,
      admin
    ]);

    await db.deleteGameSuggestion(suggestionId);
    await db.createModerationLog('APPROVE_SUGGESTION', admin, sug.title, `Moved suggestion #${suggestionId} to catalog`);

    sendDiscordLog({
      category: 'updates',
      action: 'SUGGESTION_APPROVED',
      admin,
      target: sug.title,
      details: `Suggestion approved and added to catalog category "${category}"`
    });

    res.json({ success: true, message: 'Suggestion approved and published successfully!' });
  } catch (err) {
    console.error('Approve suggestion error:', err);
    res.status(500).json({ error: 'Failed to approve suggestion.' });
  }
});

// Deny Game Suggestion
router.post('/suggestions/:id/deny', async (req, res) => {
  const admin = req.adminUser.username;
  const suggestionId = req.params.id;

  try {
    const sug = await db.getGameSuggestionById(suggestionId);
    if (!sug) {
      return res.status(404).json({ error: 'Suggestion not found.' });
    }

    await db.deleteGameSuggestion(suggestionId);
    await db.createModerationLog('DENY_SUGGESTION', admin, sug.title, `Removed suggestion #${suggestionId}`);

    sendDiscordLog({
      category: 'moderation',
      action: 'SUGGESTION_DENIED',
      admin,
      target: sug.title,
      details: `Suggestion #${suggestionId} denied and removed from queue`
    });
    
    res.json({ success: true, message: 'Suggestion denied successfully.' });
  } catch (err) {
    console.error('Deny suggestion error:', err);
    res.status(500).json({ error: 'Failed to deny suggestion.' });
  }
});


module.exports = router;
