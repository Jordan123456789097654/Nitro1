const DEFAULT_WEBHOOKS = {
  moderation: 'https://discord.com/api/webhooks/1539011247692058786/8MVCc1xufw1RkG85H4uE0OQNN6MpQwCQSd-Eq2krn9KSZOsFO7R5RPlg5XQ9grarBrUm',
  appeals: 'https://discord.com/api/webhooks/1539011247692058786/8MVCc1xufw1RkG85H4uE0OQNN6MpQwCQSd-Eq2krn9KSZOsFO7R5RPlg5XQ9grarBrUm',
  
  audit: 'https://discord.com/api/webhooks/1539011315157442650/FuiE3vsfvWH2lnbaK1byVH5CjREQoG5Ho3X3HKtNFn-bEGn1ungphyxTeehlBZRXhKd_',
  logins: 'https://discord.com/api/webhooks/1539011315157442650/FuiE3vsfvWH2lnbaK1byVH5CjREQoG5Ho3X3HKtNFn-bEGn1ungphyxTeehlBZRXhKd_',
  gateway: 'https://discord.com/api/webhooks/1539011315157442650/FuiE3vsfvWH2lnbaK1byVH5CjREQoG5Ho3X3HKtNFn-bEGn1ungphyxTeehlBZRXhKd_',
  suggestions: 'https://discord.com/api/webhooks/1539011315157442650/FuiE3vsfvWH2lnbaK1byVH5CjREQoG5Ho3X3HKtNFn-bEGn1ungphyxTeehlBZRXhKd_',
  bugs: 'https://discord.com/api/webhooks/1539011315157442650/FuiE3vsfvWH2lnbaK1byVH5CjREQoG5Ho3X3HKtNFn-bEGn1ungphyxTeehlBZRXhKd_',
  updates: 'https://discord.com/api/webhooks/1539011315157442650/FuiE3vsfvWH2lnbaK1byVH5CjREQoG5Ho3X3HKtNFn-bEGn1ungphyxTeehlBZRXhKd_',

  ai: 'https://discord.com/api/webhooks/1539011374146003064/-_P9_IGGb2m0w2q4rPxbF_c-774zEMnhSj6QYX-H5t79sgxvOCn33l4Zdtuz2Jb4QzFN',
  ai_chat: 'https://discord.com/api/webhooks/1539011374146003064/-_P9_IGGb2m0w2q4rPxbF_c-774zEMnhSj6QYX-H5t79sgxvOCn33l4Zdtuz2Jb4QzFN',

  chat: 'https://discord.com/api/webhooks/1539011464415805591/om_4gQ_SqBPCigg9XD7T82-8ZsbQ3dZzKunl5rjZIzZmv-bTZYrXbde2UDI3LoZYwbKA',
  dm: 'https://discord.com/api/webhooks/1539011464415805591/om_4gQ_SqBPCigg9XD7T82-8ZsbQ3dZzKunl5rjZIzZmv-bTZYrXbde2UDI3LoZYwbKA',
  direct_messages: 'https://discord.com/api/webhooks/1539011464415805591/om_4gQ_SqBPCigg9XD7T82-8ZsbQ3dZzKunl5rjZIzZmv-bTZYrXbde2UDI3LoZYwbKA'
};

const CATEGORY_CONFIG = {
  moderation: {
    botName: 'NITRO Moderation Sentinel',
    avatarUrl: 'https://cdn-icons-png.flaticon.com/512/1006/1006771.png',
    defaultColor: 0xED4245,
    emoji: '🛡️'
  },
  audit: {
    botName: 'NITRO Platform Audit Engine',
    avatarUrl: 'https://cdn-icons-png.flaticon.com/512/1055/1055687.png',
    defaultColor: 0x38BDF8,
    emoji: '📋'
  },
  ai_chat: {
    botName: 'Nitro AI Conversation Monitor',
    avatarUrl: 'https://cdn-icons-png.flaticon.com/512/4712/4712109.png',
    defaultColor: 0x8B5CF6,
    emoji: '🤖'
  },
  chat: {
    botName: 'NITRO Community Chat Relay',
    avatarUrl: 'https://cdn-icons-png.flaticon.com/512/2462/2462719.png',
    defaultColor: 0x57F287,
    emoji: '💬'
  },
  logins: {
    botName: 'NITRO Auth Sentinel',
    avatarUrl: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    defaultColor: 0x57F287,
    emoji: '👤'
  },
  gateway: {
    botName: 'NITRO Gateway Telemetry',
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
  gateway: 1000,
  moderation: 200,
  chat: 100,
  ai_chat: 100,
  audit: 500,
  logins: 500,
  suggestions: 500,
  bugs: 500,
  updates: 500
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
    const minCooldown = CATEGORY_COOLDOWNS[catKey] || 500;
    if (lastSendTime[catKey] && (now - lastSendTime[catKey] < minCooldown)) {
      return false;
    }

    const config = CATEGORY_CONFIG[catKey] || CATEGORY_CONFIG.moderation;

    // 1. Resolve Webhook URL: Database -> Category Default -> Category ENV -> Global ENV
    let webhookUrl = DEFAULT_WEBHOOKS[catKey] || null;
    try {
      const dbWebhooks = await db.getWebhooks();
      if (dbWebhooks && dbWebhooks[catKey] && dbWebhooks[catKey].startsWith('http')) {
        webhookUrl = dbWebhooks[catKey];
      }
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
    if (act.includes('BAN') || act.includes('DELETE') || act.includes('BLOCK') || act.includes('DENY') || act.includes('RAID')) {
      color = 0xED4245; // Crimson Red
    } else if (act.includes('UNBAN') || act.includes('UNMUTE') || act.includes('SUCCESS') || act.includes('REGISTER') || act.includes('UNRESTRICT') || act.includes('APPROVE')) {
      color = 0x57F287; // Emerald Green
    } else if (act.includes('TIMEOUT') || act.includes('WARN') || act.includes('VIOLATION') || act.includes('FILTER')) {
      color = 0xFEE75C; // Gold
    } else if (act.includes('AI') || act.includes('UPDATE') || act.includes('PATCH')) {
      color = 0x8B5CF6; // Royal Purple
    } else if (act.includes('CHAT') || act.includes('DM') || act.includes('GATEWAY')) {
      color = 0x38BDF8; // Vivid Cyan
    }

    const titleText = `${config.emoji} ${action || 'System Telemetry Event'}`;
    const rawDetails = details || reason || 'No additional details specified.';
    
    // Format description cleanly into markdown code block if applicable
    let descriptionText = rawDetails;
    if (rawDetails.length > 60 && !rawDetails.includes('```') && !rawDetails.includes('**')) {
      descriptionText = `\`\`\`text\n${rawDetails.slice(0, 1950)}\n\`\`\``;
    } else if (rawDetails.length > 2000) {
      descriptionText = rawDetails.slice(0, 1997) + '...';
    }

    const fields = [
      { name: '👤 Performer / Origin', value: `\`${admin || 'System'}\``, inline: true },
      { name: '🎯 Target / Scope', value: `\`${target || 'Global'}\``, inline: true },
      { name: '📂 Channel / Category', value: `\`${catKey.toUpperCase()}\``, inline: true }
    ];

    const embed = {
      title: titleText,
      description: descriptionText,
      color: color,
      fields: fields,
      thumbnail: { url: config.avatarUrl },
      footer: {
        text: `NITRO Security & Audit Matrix • ${new Date().toLocaleTimeString()}`,
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
