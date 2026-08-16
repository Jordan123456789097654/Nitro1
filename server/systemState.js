// Global Nitro Platform System State & Clean AI Configuration Engine
const db = require('./db');

const DEFAULT_AI_CONFIG = {
  // Chat AI Assistant
  chatEnabled: true,
  chatModel: 'gemini-2.5-flash',
  chatPersonality: 'friendly', // 'friendly' | 'professor' | 'concise' | 'socratic'
  chatTemperature: 0.7,
  chatRateLimit: 30,
  chatCustomDirectives: '',

  // AI Moderation & Chat Safety
  enabled: true,
  strictness: 'strict', // 'strict' | 'balanced' | 'lenient'
  actionPolicy: 'auto_punish', // 'auto_punish' | 'block_only' | 'censor_warn'
  model: 'llama-3.3-70b-versatile',
  timeoutMs: 3500,

  // Flashcards & Study Tools
  flashcardCount: 8,
  flashcardDifficulty: 'high_school' // 'high_school' | 'college'
};

let currentAiConfig = { ...DEFAULT_AI_CONFIG };

// Async boot loader to restore persisted configuration from PostgreSQL
async function loadPersistedAiConfig() {
  try {
    const raw = await db.getSetting('nitro_ai_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      currentAiConfig = {
        ...DEFAULT_AI_CONFIG,
        ...parsed,
        enabled: true
      };
      console.log('⚡ [AI] Persisted AI config loaded successfully.');
    }
  } catch (e) {
    console.warn('⚠️ [AI] Could not load persisted AI config:', e.message);
  }
}

// Initial async load
setTimeout(() => { loadPersistedAiConfig(); }, 1000);

module.exports = {
  isAiEnabled: () => Boolean(currentAiConfig.enabled !== false && currentAiConfig.chatEnabled !== false),
  setAiEnabled: async (state) => {
    const isOnline = Boolean(state);
    currentAiConfig.enabled = isOnline;
    currentAiConfig.chatEnabled = isOnline;
    await db.setSetting('nitro_ai_config', JSON.stringify(currentAiConfig));
    return isOnline;
  },
  getAiConfig: () => ({ ...currentAiConfig }),
  resetAiConfigToDefaults: async () => {
    currentAiConfig = { ...DEFAULT_AI_CONFIG };
    await db.setSetting('nitro_ai_config', JSON.stringify(currentAiConfig));
    return { ...currentAiConfig };
  },
  updateAiConfig: async (newConfig) => {
    if (!newConfig || typeof newConfig !== 'object') return { ...currentAiConfig };

    currentAiConfig = {
      ...currentAiConfig,
      ...newConfig
    };

    if (newConfig.enabled !== undefined) currentAiConfig.enabled = Boolean(newConfig.enabled);
    if (newConfig.chatEnabled !== undefined) currentAiConfig.chatEnabled = Boolean(newConfig.chatEnabled);

    if (currentAiConfig.chatRateLimit) {
      currentAiConfig.chatRateLimit = Math.max(5, Math.min(120, parseInt(currentAiConfig.chatRateLimit, 10) || 30));
    }

    await db.setSetting('nitro_ai_config', JSON.stringify(currentAiConfig));
    return { ...currentAiConfig };
  }
};
