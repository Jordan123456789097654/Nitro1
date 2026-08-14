const fetch = require('node-fetch');
const db = require('./db');

const CATEGORY_CONFIG = {
  moderation: {
    botName: 'NITRO Moderation Sentinel',
    avatarUrl: 'https://cdn-icons-png.flaticon.com/512/1006/1006771.png',
    defaultColor: 0xED4245,
    emoji: '🛡️'
  },
  logins: {
    botName: 'NITRO Auth Sentinel',
    avatarUrl: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    defaultColor: 0x57F287,
    emoji: '👤'
  },
  proxy: {
    botName: 'NITRO Proxy Telemetry',
    avatarUrl: 'https://cdn-icons-png.flaticon.com/512/2088/2088617.png',
    defaultColor: 0x38BDF8,
    emoji: '🌐'
  },
  suggestions: {
    botName: 'NITRO Suggestion Box',
    avatarUrl: 'https://cdn-icons-png.flaticon.com/512/1484/1484838.png',
    defaultColor: 0xF59E0B,
    emoji: '💡'
  },
  bugs: {
    botName: 'NITRO Bug Tracker',
    avatarUrl: 'https://cdn-icons-png.flaticon.com/512/2620/2620608.png',
    defaultColor: 0xF43F5E,
    emoji: '🐛'
  },
  updates: {
    botName: 'NITRO Release Engine',
    avatarUrl: 'https://cdn-icons-png.flaticon.com/512/1055/1055687.png',
    defaultColor: 0x8B5CF6,
    emoji: '🚀'
  }
};

const CATEGORY_COOLDOWNS = {
  proxy: 3000,       // 3 seconds minimum between proxy telemetry embeds
  moderation: 500,
  logins: 1000,
  suggestions: 1000,
  bugs: 1000,
  updates: 1000
};

const lastSendTime = {};
const rateLimitedUntil = {};

/**
 * Dispatch a structured Discord Embed log to the appropriate channel webhook.
 */
async function sendDiscordLog({ category = 'moderation', action, admin, target, reason, details }) {
  try {
    const catKey = (category || 'moderation').toLowerCase();
    const now = Date.now();

    // Check if Discord actively rate-limited this category
    if (rateLimitedUntil[catKey] && now < rateLimitedUntil[catKey]) {
      return false;
    }

    // Check minimum throttle cooldown per category
    const minCooldown = CATEGORY_COOLDOWNS[catKey] || 1000;
    if (lastSendTime[catKey] && (now - lastSendTime[catKey] < minCooldown)) {
      return false;
    }

    const config = CATEGORY_CONFIG[catKey] || CATEGORY_CONFIG.moderation;

    // 1. Resolve Webhook URL: Database -> Category ENV -> Global ENV
    let webhookUrl = null;
    try {
      const dbWebhooks = await db.getWebhooks();
      webhookUrl = dbWebhooks[catKey];
    } catch (e) {}

    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      const envKey = `DISCORD_WEBHOOK_${catKey.toUpperCase()}`;
      webhookUrl = process.env[envKey] || process.env.DISCORD_WEBHOOK_URL;
    }

    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      return false;
    }

    lastSendTime[catKey] = now;

    // 2. Determine Action Color & Title
    let color = config.defaultColor;
    const act = (action || '').toUpperCase();
    if (act.includes('BAN') || act.includes('DELETE') || act.includes('BLOCK')) {
      color = 0xED4245; // Red
    } else if (act.includes('UNBAN') || act.includes('SUCCESS') || act.includes('REGISTER') || act.includes('UNPROXY')) {
      color = 0x57F287; // Green
    } else if (act.includes('TIMEOUT') || act.includes('WARN') || act.includes('VIOLATION')) {
      color = 0xFEE75C; // Yellow
    } else if (act.includes('RESET') || act.includes('ROLE') || act.includes('UPDATE')) {
      color = 0x38BDF8; // Cyan
    }

    const titleText = `${config.emoji} [${catKey.toUpperCase()}] ${action || 'Event Notification'}`;
    const descriptionText = details || reason || 'No additional details specified.';

    const fields = [
      { name: '👤 Performer / User', value: `\`${admin || 'System'}\``, inline: true },
      { name: '🎯 Target', value: `\`${target || 'N/A'}\``, inline: true },
      { name: '📋 Category', value: catKey.toUpperCase(), inline: true }
    ];

    const embed = {
      title: titleText,
      description: descriptionText.length > 2000 ? descriptionText.slice(0, 1997) + '...' : descriptionText,
      color: color,
      fields: fields,
      footer: {
        text: 'NITRO Audit & Security Telemetry',
        icon_url: 'https://cdn-icons-png.flaticon.com/512/686/686589.png'
      },
      timestamp: new Date().toISOString()
    };

    const payload = {
      username: config.botName,
      avatar_url: config.avatarUrl,
      embeds: [embed]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status === 429) {
      let retryAfterMs = 10000;
      try {
        const body = await response.json();
        if (body.retry_after) {
          retryAfterMs = Math.ceil(body.retry_after * 1000) + 500;
        }
      } catch (e) {}
      rateLimitedUntil[catKey] = Date.now() + retryAfterMs;
      return false;
    }

    return response.ok;
  } catch (err) {
    return false;
  }
}

module.exports = { sendDiscordLog, CATEGORY_CONFIG };
