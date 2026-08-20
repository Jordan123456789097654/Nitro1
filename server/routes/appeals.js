const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendDiscordLog } = require('../discordLogger');
const { evaluateAppealWithGroq } = require('../aiModeration');

// POST /api/appeals/submit or /api/auth/submit-appeal - Submit Detailed Appeal
router.post('/submit', async (req, res) => {
  await handleAppealSubmission(req, res);
});

async function handleAppealSubmission(req, res) {
  try {
    const {
      username,
      punishmentType,
      incidentCategory,
      incidentDescription,
      whySecondChance,
      preventionCommitment,
      rulesAgreed
    } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username is required.' });
    }

    const cleanUsername = username.trim();
    const user = await db.getUserByUsername(cleanUsername);
    const userId = user ? user.id : null;

    // Check if user is currently muted or banned
    let punishment = punishmentType || 'punishment';
    let originalReason = 'Rule Violation';

    if (user) {
      if (user.muted_until && new Date(user.muted_until) > new Date()) {
        punishment = 'mute';
        originalReason = 'Chat Mute Violation';
      } else if (user.is_banned) {
        punishment = user.banned_until ? 'temp_ban' : 'perm_ban';
        originalReason = user.ban_reason || 'Account Suspension';
      } else if (user.is_gateway_banned) {
        punishment = 'gateway_ban';
        originalReason = 'Gateway Proxy Violation';
      }
    }

    // Check if pending appeal already exists
    const hasPending = await db.hasPendingAppeal(userId, cleanUsername);
    if (hasPending) {
      return res.status(400).json({ error: 'You already have an active pending appeal under review by staff.' });
    }

    const appealText = `Category: ${incidentCategory || 'General'}\nWhat Happened: ${incidentDescription || ''}\nWhy Second Chance: ${whySecondChance || ''}\nPrevention Plan: ${preventionCommitment || ''}`;

    let aiRecommendation = 'review';
    let aiRationale = 'Pending manual review - Student submitted an appeal requesting access restoration.';
    let aiConfidence = 0.95;

    try {
      const aiResult = await evaluateAppealWithGroq({
        username: cleanUsername,
        punishmentType: punishment,
        originalReason,
        appealText,
        incidentCategory,
        incidentDescription,
        whySecondChance,
        preventionCommitment,
        rulesAgreed
      });
      if (aiResult) {
        aiRecommendation = aiResult.recommendation || 'review';
        aiRationale = aiResult.rationale || 'AI evaluation complete.';
        aiConfidence = typeof aiResult.confidence === 'number' ? aiResult.confidence : 0.95;
      }
    } catch (e) {
      console.error('AI appeal evaluation failed:', e.message);
    }

    const appeal = await db.createAppeal({
      userId,
      username: cleanUsername,
      punishmentType: punishment,
      originalReason,
      appealText,
      incidentCategory: incidentCategory || 'General Violation',
      incidentDescription: incidentDescription || '',
      whySecondChance: whySecondChance || '',
      preventionCommitment: preventionCommitment || '',
      rulesAgreed: Boolean(rulesAgreed),
      aiRecommendation,
      aiRationale,
      aiConfidence
    });

    sendDiscordLog({
      category: 'appeals',
      action: 'APPEAL_SUBMITTED',
      admin: cleanUsername,
      target: `@${cleanUsername}`,
      details: `Submitted appeal for [${punishment.toUpperCase()}]: ${incidentDescription}`
    });

    res.json({
      success: true,
      appeal,
      message: 'Your appeal has been submitted successfully to administrators and is pending review!'
    });
  } catch (err) {
    console.error('Submit appeal error:', err);
    res.status(500).json({ error: 'Failed to submit appeal.' });
  }
}

// GET /api/appeals/status - Get current appeal status for user
router.get('/status', async (req, res) => {
  try {
    const username = req.query.username;
    if (!username) return res.status(400).json({ error: 'Username required.' });

    const user = await db.getUserByUsername(username);
    const hasPending = await db.hasPendingAppeal(user?.id, username);

    res.json({
      isMuted: user ? Boolean(user.muted_until && new Date(user.muted_until) > new Date()) : false,
      isBanned: user ? Boolean(user.is_banned) : false,
      isGatewayBanned: user ? Boolean(user.is_gateway_banned) : false,
      hasPendingAppeal: hasPending
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch appeal status.' });
  }
});

module.exports = router;
module.exports.handleAppealSubmission = handleAppealSubmission;
