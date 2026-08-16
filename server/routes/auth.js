const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { sendDiscordLog } = require('../discordLogger');

const JWT_SECRET = process.env.SESSION_SECRET || 'nitro_jwt_secure_key_2026';

function generateAccountToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '14d' }
  );
}

function encodePassword(password) {
  if (!password) return '';
  return bcrypt.hashSync(password.trim(), 10);
}

function verifyPassword(plainPassword, storedPassword) {
  if (!storedPassword || !plainPassword) return false;

  const trimmed = plainPassword.trim();

  // 1. Bcrypt hash check
  try {
    if (bcrypt.compareSync(trimmed, storedPassword)) return true;
  } catch (e) {}

  // 2. Base64 decoded check (backwards compatibility for legacy users)
  try {
    const decoded = Buffer.from(storedPassword, 'base64').toString('utf8');
    if (decoded === trimmed) return true;
  } catch (e) {}

  // 3. Direct match check (backwards compatibility for seed users)
  return trimmed === storedPassword;
}

// Check active session & profile
router.get('/me', async (req, res) => {
  let user = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.id) user = await db.getUserById(decoded.id);
      if (!user && decoded.username) user = await db.getUserByUsername(decoded.username);
    } catch (e) {}
  } else if (req.cookies && req.cookies.nitro_jwt_token) {
    try {
      const decoded = jwt.verify(req.cookies.nitro_jwt_token, JWT_SECRET);
      if (decoded.id) user = await db.getUserById(decoded.id);
      if (!user && decoded.username) user = await db.getUserByUsername(decoded.username);
    } catch (e) {}
  }

  if (!user && req.session && req.session.user) {
    user = req.session.user;
  }

  if (!user) {
    return res.json({ loggedIn: false, user: null });
  }

  try {
    if (user.is_banned) {
      return res.status(403).json({
        loggedIn: false,
        is_banned: true,
        userId: user.id,
        username: user.username,
        reason: user.ban_reason || 'Account suspended by administrator.',
        error: 'Account suspended.'
      });
    }

    res.json({
      loggedIn: true,
      user,
      must_reset_password: Boolean(user.force_password_reset)
    });
  } catch (err) {
    res.status(500).json({ loggedIn: false, error: 'Session verification failed.' });
  }
});

// Force Password Reset Endpoint (User triggered after admin flag)
router.post('/force-reset-password', async (req, res) => {
  let userId = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
    } catch (e) {}
  }

  if (!userId && req.session && req.session.user) {
    userId = req.session.user.id;
  }

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const { new_password } = req.body;
  if (!new_password || new_password.trim().length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
  }

  try {
    const user = await db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const encoded = encodePassword(new_password);
    await db.updateUserPassword(userId, encoded);

    sendDiscordLog({
      category: 'logins',
      action: 'FORCE_PASSWORD_RESET_COMPLETED',
      admin: user.username,
      target: user.username,
      details: 'User successfully completed mandatory password reset.'
    });

    res.json({ success: true, message: 'Password successfully reset!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

// Update Profile (Avatar PFP, Display Name, Bio, PRO Perks, Password)
router.post('/profile', async (req, res) => {
  let userId = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
    } catch (e) {}
  }

  if (!userId && req.session && req.session.user) {
    userId = req.session.user.id;
  }

  if (!userId) {
    return res.status(401).json({ error: 'You must be logged in to update your profile.' });
  }

  const { avatar_url, banner_url, chat_bubble_theme, vip_particle_effect, display_name, bio, pro_chat_glow, pro_custom_flair, current_password, new_password } = req.body;

  try {
    const user = await db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Handle Password Change
    if (new_password && new_password.trim().length > 0) {
      if (!current_password) {
        return res.status(400).json({ error: 'Current password is required to set a new password.' });
      }
      const fullUser = await db.getUserByUsername(user.username);
      const isMatch = verifyPassword(current_password, fullUser.password_hash);
      if (!isMatch) {
        return res.status(400).json({ error: 'Incorrect current password.' });
      }
      if (new_password.trim().length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters.' });
      }
      const encoded = encodePassword(new_password);
      await db.updateUserPassword(userId, encoded);
    }

    const isPro = ['pro', 'vip', 'admin'].includes(user.role);

    const updated = await db.updateUserProfile(userId, {
      avatar_url: avatar_url !== undefined ? avatar_url.trim() : user.avatar_url,
      banner_url: isPro && banner_url !== undefined ? banner_url.trim() : user.banner_url,
      chat_bubble_theme: isPro && chat_bubble_theme !== undefined ? chat_bubble_theme.trim() : user.chat_bubble_theme,
      vip_particle_effect: isPro && vip_particle_effect !== undefined ? vip_particle_effect.trim() : user.vip_particle_effect,
      display_name: display_name !== undefined ? display_name.trim().slice(0, 50) : user.display_name,
      bio: bio !== undefined ? bio.trim().slice(0, 200) : user.bio,
      pro_chat_glow: isPro && pro_chat_glow !== undefined ? pro_chat_glow.trim() : user.pro_chat_glow,
      pro_custom_flair: isPro && pro_custom_flair !== undefined ? pro_custom_flair.trim().slice(0, 30) : user.pro_custom_flair
    });

    sendDiscordLog({
      category: 'logins',
      action: 'USER_PROFILE_UPDATED',
      admin: user.username,
      target: user.username,
      details: `Profile updated: "${updated.display_name}", Avatar: "${updated.avatar_url || 'Preset'}"`
    });

    res.json({ success: true, user: updated, message: 'Profile updated successfully!' });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// Register new user
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const cleanName = username.trim();
  if (cleanName.length < 3 || cleanName.length > 20) {
    return res.status(400).json({ error: 'Username must be between 3 and 20 characters.' });
  }

  try {
    const filterWords = await db.getFilterWords();
    for (const item of filterWords) {
      if (['username', 'both'].includes(item.filter_type)) {
        if (cleanName.toLowerCase().includes(item.word.toLowerCase())) {
          return res.status(400).json({ error: 'Username contains prohibited words or terms.' });
        }
      }
    }

    const existing = await db.getUserByUsername(cleanName);
    if (existing) {
      return res.status(409).json({ error: 'Username is already taken.' });
    }

    const encodedPassword = encodePassword(password);
    const newUser = await db.createUser(cleanName, encodedPassword, 'member');
    const token = generateAccountToken(newUser);

    const sessionUser = {
      id: newUser.id,
      username: newUser.username,
      display_name: newUser.username,
      role: newUser.role,
      avatar_url: '',
      pro_chat_glow: 'gold',
      pro_custom_flair: '',
      force_password_reset: false,
      token
    };
    req.session.user = sessionUser;

    await db.createModerationLog('USER_REGISTER', cleanName, cleanName, 'New account registered');
    sendDiscordLog({
      category: 'logins',
      action: 'USER_REGISTER',
      admin: cleanName,
      target: cleanName,
      details: 'New user account created successfully.'
    });
// IP logging removed (previously logged registration IP)

    res.cookie('nitro_jwt_token', token, { maxAge: 14 * 86400000, path: '/', sameSite: 'lax' });
    res.cookie('nitro_remembered_username', cleanName, { maxAge: 14 * 86400000, path: '/', sameSite: 'lax' });

    res.status(201).json({ success: true, user: sessionUser, token, must_reset_password: false });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Please provide both username and password.' });
  }

// IP ban check removed per privacy policy

  try {
    const user = await db.getUserByUsername(username.trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    if (user.is_banned) {
      if (user.banned_until && new Date() > new Date(user.banned_until)) {
        // Timed ban expired! Lift ban automatically
        await db.updateUserBan(user.id, false, 'Temporary ban expired');
        user.is_banned = false;
      } else {
        await db.createModerationLog('LOGIN_BLOCKED', user.username, user.username, 'Banned user attempted login');
        sendDiscordLog({
          category: 'moderation',
          action: 'BANNED_USER_LOGIN_ATTEMPT',
          admin: user.username,
          target: user.username,
          details: 'Banned user attempted to access platform.'
        });
        const timeUntilStr = user.banned_until ? ` until ${new Date(user.banned_until).toLocaleString()}` : '';
        return res.status(403).json({
          error: `🚫 ACCOUNT SUSPENDED: Your account is suspended${timeUntilStr}.\nReason: ${user.ban_reason || 'Violation of terms of service'}`,
          is_banned: true,
          username: user.username,
          reason: user.ban_reason || 'Violation of terms of service'
        });
      }
    }

    const match = verifyPassword(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = generateAccountToken(user);
    const userSession = {
      id: user.id,
      username: user.username,
      display_name: user.display_name || user.username,
      bio: user.bio || '',
      avatar_url: user.avatar_url || '',
      pro_chat_glow: user.pro_chat_glow || 'gold',
      pro_custom_flair: user.pro_custom_flair || '',
      role: user.role,
      force_password_reset: Boolean(user.force_password_reset),
      token
    };
    req.session.user = userSession;

    res.cookie('nitro_jwt_token', token, { maxAge: 14 * 86400000, path: '/', sameSite: 'lax' });
    res.cookie('nitro_remembered_username', user.username, { maxAge: 14 * 86400000, path: '/', sameSite: 'lax' });

    await db.createModerationLog('USER_LOGIN', user.username, user.username, `Role: ${user.role.toUpperCase()}`);
    sendDiscordLog({
      category: 'logins',
      action: 'USER_LOGIN',
      admin: user.username,
      target: user.username,
      details: `User signed in with role: ${user.role.toUpperCase()}`
    });
    // Log successful login IP
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    await db.logUserIp(user.id, user.username, clientIp, req.headers['user-agent'] || '');

    res.json({
      success: true,
      user: userSession,
      token,
      must_reset_password: Boolean(user.force_password_reset)
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// Submit a punishment appeal (for muted or suspended users)
router.post('/submit-appeal', async (req, res) => {
  try {
    const { evaluateAppealWithGroq } = require('../aiModeration');
    const { username, appealText, incidentCategory, incidentDescription, whySecondChance, preventionCommitment, rulesAgreed } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username is required to submit an appeal.' });
    }

    const effectiveDesc = (incidentDescription && incidentDescription.trim()) || (appealText && appealText.trim()) || '';
    if (!effectiveDesc || effectiveDesc.length < 10) {
      return res.status(400).json({ error: 'Please provide a meaningful explanation of what occurred (minimum 10 characters).' });
    }

    const cleanUsername = username.trim();
    const user = await db.getUserByUsername(cleanUsername);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const isBanned = Boolean(user.is_banned);
    const isMuted = Boolean(user.muted_until && new Date(user.muted_until) > new Date());

    if (!isBanned && !isMuted) {
      return res.status(400).json({ error: 'This account does not currently have an active ban or mute punishment.' });
    }

    // Check if user already has a pending appeal
    const alreadyPending = await db.hasPendingAppeal(user.id, cleanUsername);
    if (alreadyPending) {
      return res.status(400).json({ error: 'You already have a pending appeal under administrative review. Please wait for staff review.' });
    }

    const punishmentType = isBanned ? 'ban' : 'mute';
    const originalReason = user.ban_reason || 'Automated safety policy violation';

    const compiledAppealText = appealText || [
      incidentCategory ? `[Category: ${incidentCategory}]` : '',
      `Incident Description: ${effectiveDesc}`,
      whySecondChance ? `Second Chance Justification: ${whySecondChance.trim()}` : '',
      preventionCommitment ? `Future Prevention Plan: ${preventionCommitment.trim()}` : ''
    ].filter(Boolean).join('\n\n');

    // Run Groq AI Pre-Review
    const aiEvaluation = await evaluateAppealWithGroq({
      username: cleanUsername,
      punishmentType,
      originalReason,
      appealText: compiledAppealText,
      incidentCategory: incidentCategory || 'General Infraction',
      incidentDescription: effectiveDesc,
      whySecondChance: (whySecondChance && whySecondChance.trim()) || 'Requested second chance',
      preventionCommitment: (preventionCommitment && preventionCommitment.trim()) || 'Committed to follow rules',
      rulesAgreed: rulesAgreed !== false
    });

    const appeal = await db.createAppeal({
      userId: user.id,
      username: cleanUsername,
      punishmentType,
      originalReason,
      appealText: compiledAppealText,
      incidentCategory: incidentCategory || 'General Infraction',
      incidentDescription: effectiveDesc,
      whySecondChance: (whySecondChance && whySecondChance.trim()) || '',
      preventionCommitment: (preventionCommitment && preventionCommitment.trim()) || '',
      rulesAgreed: rulesAgreed !== false,
      aiRecommendation: aiEvaluation.recommendation,
      aiRationale: aiEvaluation.rationale,
      aiConfidence: aiEvaluation.confidence
    });

    sendDiscordLog({
      category: 'moderation',
      action: 'PUNISHMENT_APPEAL_SUBMITTED',
      admin: 'STUDENT_APPEAL_SYSTEM',
      target: `@${cleanUsername}`,
      details: `[${punishmentType.toUpperCase()} APPEAL] User submitted detailed appeal (${incidentCategory || 'General'}). AI Pre-Review: ${aiEvaluation.recommendation?.toUpperCase()} (${Math.round((aiEvaluation.confidence || 0.9) * 100)}% conf). Rationale: "${aiEvaluation.rationale}"`
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('new_appeal_submitted', appeal);
    }

    res.json({
      success: true,
      message: 'Your appeal has been submitted successfully and forwarded to staff for review.',
      appeal
    });
  } catch (err) {
    console.error('Submit appeal error:', err);
    res.status(500).json({ error: 'Internal server error submitting appeal.' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('nitro_jwt_token', { path: '/' });
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

module.exports = router;
