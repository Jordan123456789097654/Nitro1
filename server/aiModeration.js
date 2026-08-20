const fetch = require('node-fetch');
const systemState = require('./systemState');
const { sendDiscordLog } = require('./discordLogger');

const GROQ_ENDPOINT = process.env.GROQ_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';
const DEFAULT_PRIMARY_MODEL = 'openai/gpt-oss-safeguard-20b';
const DEFAULT_FALLBACK_MODEL = 'llama-3.1-8b-instant';

// In-memory LRU-style decision cache (15-minute TTL, max 2000 entries)
const aiDecisionCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_SIZE = 2000;

function getCachedDecision(text, strictness) {
  const key = `${strictness}::${text.toLowerCase().trim()}`;
  const cached = aiDecisionCache.get(key);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.result;
  }
  return null;
}

function setCachedDecision(text, strictness, result) {
  if (aiDecisionCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = aiDecisionCache.keys().next().value;
    aiDecisionCache.delete(oldestKey);
  }
  const key = `${strictness}::${text.toLowerCase().trim()}`;
  aiDecisionCache.set(key, { timestamp: Date.now(), result });
}

// Normalize text & detect common obfuscation bypass attempts
function normalizeObfuscatedText(text) {
  if (!text) return '';
  let normalized = text;

  // 1. Remove zero-width spaces & control characters
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');

  // 2. Unicode normalization (combining diacritics / homoglyphs)
  normalized = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  // 3. Simple leetspeak substitution map for safety parsing
  const leetMap = {
    '@': 'a', '4': 'a',
    '3': 'e', '€': 'e',
    '1': 'i', '!': 'i', '|': 'i',
    '0': 'o',
    '5': 's', '$': 's',
    '7': 't', '+': 't',
    '8': 'b',
    '9': 'g',
    'v': 'u',
  };

  const deLeeted = normalized.toLowerCase().replace(/[@43€1!|05$7+89]/g, char => leetMap[char] || char);

  // 4. Squash spaced-out letters like "f u c k" or "k . y . s"
  const squashed = deLeeted.replace(/([a-z0-9])\s*([.\-_*~])\s*([a-z0-9])/gi, '$1$3');

  return {
    original: text.trim(),
    normalized: normalized.trim(),
    deLeeted: deLeeted.trim(),
    squashed: squashed.trim()
  };
}

// Fast whitelist for standard safe chatter (0ms local resolution)
const SAFE_COMMON_PATTERNS = /^(hi|hello|hey|yo|sup|gg|good game|lol|lmao|nice|cool|play|ready|join|room|ok|okay|yes|no|ty|thanks|pls|please|brb|afk|bye|gn|gm|glhf|w|l|who's online|what's up|how are you|i'm bored|what game|let's play|lets play|ggs|wp|nice shot|good job)\b/i;

function isHighConfidenceSafeText(text) {
  const clean = text.trim();
  if (clean.length <= 1) return true;
  if (clean.length < 35 && SAFE_COMMON_PATTERNS.test(clean)) {
    // Ensure it doesn't also contain explicit slurs or violence triggers
    if (!/(nigg|fagg|kill|die|suicide|rape|whore|slut|cunt|doxx|nazi|hitler)/i.test(clean)) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluates a user text message with Groq AI Moderation.
 * @param {string} text - Message text to evaluate
 * @param {object} [options] - Optional overrides (strictness, model, actionPolicy)
 * @returns {Promise<object>} - Moderation evaluation object
 */
async function checkMessageWithGroqModeration(text, options = {}) {
  const startTime = Date.now();
  if (!text || typeof text !== 'string') {
    return { flagged: false, latencyMs: 0 };
  }

  const clean = text.trim();
  if (!clean) return { flagged: false, latencyMs: 0 };

  const currentConfig = systemState.getAiConfig();
  if (!currentConfig.enabled && !options.force) {
    return { flagged: false, bypassed: true, reason: 'AI Moderation Offline' };
  }

  const strictness = options.strictness || currentConfig.strictness || 'balanced';
  const actionPolicy = options.actionPolicy || currentConfig.actionPolicy || 'auto_punish';
  const requestedModel = options.model || currentConfig.model || DEFAULT_PRIMARY_MODEL;
  const timeoutMs = options.timeoutMs || currentConfig.timeoutMs || 3500;

  // 1. Check local fast-safe cache
  if (isHighConfidenceSafeText(clean)) {
    return {
      flagged: false,
      category: 'none',
      severity: 'none',
      confidence: 1.0,
      reason: 'Safe conversational text',
      recommended_action: 'allow',
      latencyMs: Date.now() - startTime,
      modelUsed: 'local_whitelist'
    };
  }

  // 2. Check in-memory decision cache
  const cached = getCachedDecision(clean, strictness);
  if (cached) {
    return {
      ...cached,
      latencyMs: Date.now() - startTime,
      cached: true
    };
  }

  const textVariants = normalizeObfuscatedText(clean);

  // 3. Build Strictness Prompt Directive
  let strictnessInstructions = '';
  if (strictness === 'lenient') {
    strictnessInstructions = `STRICTNESS: LENIENT. Flag severe threats, slurs, sexual content, and doxxing.`;
  } else {
    strictnessInstructions = `STRICTNESS: STRICT & UNCOMPROMISING (School Gaming Community). Zero tolerance safety policy.
Any vulgarity, cursing, profanity, swearing, insults, toxicity, bullying, sexual content, slurs, threats, self-harm, depression, or suicide mentions MUST BE FLAGGED IMMEDIATELY.
DO NOT downplay threats of violence, self-harm, or profanity. Flag immediately.`;
  }

  const systemPrompt = `You are an advanced, uncompromising AI safety moderation engine for "Nitro Games", a student gaming and chat community.
Analyze the user's message for safety, toxicity, profanity, predatory behavior, threats, self-harm, suicide, and appropriateness.
You have FULL AUTONOMOUS AUTHORITY to determine the exact punishment and duration (ranging from 1 day to permanent ban, or temporary mute) based on context and severity.

${strictnessInstructions}

MANDATORY SEVERITY & AUTONOMOUS PUNISHMENT RULES:
1. "sexual_content" / PREDATORY HARASSMENT:
   - ANY sexually aggressive, predatory, non-consensual, or explicit sexual remarks (e.g. "turn around and let me fuck you", "suck my dick", "show me your body", unsolicited sexual advances, grooming) MUST BE CLASSIFIED as "sexual_content" or "harassment_bullying" with severity "high" or "extreme".
   - Punishment MUST BE an immediate ACCOUNT BAN (action_type: "ban", duration_days: 7 to 30 days, or 0 for permanent ban). DO NOT just mute for sexual predation or harassment!
2. "violence_selfharm":
   - ANY direct/indirect threats of physical violence, death wishes ("im going to kill you", "die", "kys", "shoot", "stab", "beat you up") MUST BE RATED "extreme" severity.
   - ANY mentions, expressions, jokes, or suggestions of suicide, wanting to die, wanting to self-harm, wanting to end life, or self-harm actions (e.g. "im going to kill myself", "i want to cut", "i want to die") MUST BE RATED "extreme" severity and categorized as "violence_selfharm".
   - Punishment MUST BE an ACCOUNT BAN (action_type: "ban", duration_days: 3, 7, 14, 30, or 0 for permanent ban).
3. "hate_speech":
   - Dehumanizing hate speech, racial slurs, homophobic slurs MUST BE RATED "extreme" severity.
   - Punishment: PERMANENT BAN (action_type: "ban", duration_days: 0, recommended_action: "perm_ban").
4. "severe_toxicity" & TARGETED BULLYING:
   - Heavy targeted harassment, doxxing, or malicious attacks: action_type: "ban" (1 to 7 days) or "mute" (1 to 24 hours).
   - Non-targeted general cursing/swearing ("fuck", "bitch", "shit"): action_type: "mute" (duration_minutes: 15 to 60) or "censor".
5. "obfuscation_bypass":
   - Leetspeak/spacing bypasses concealing restricted words: action_type: "mute" or "block".

Return a valid JSON object matching EXACTLY this schema:
{
  "flagged": true | false,
  "category": "hate_speech" | "harassment_bullying" | "sexual_content" | "violence_selfharm" | "severe_toxicity" | "obfuscation_bypass" | "none",
  "severity": "low" | "medium" | "high" | "extreme" | "none",
  "confidence": 0.0 to 1.0,
  "reason": "Short 2 to 4 word summary (e.g. 'Sexual Harassment', 'Death Threat', 'Hate Speech', 'Severe Toxicity')",
  "action_type": "ban" | "mute" | "warn" | "censor" | "block" | "allow",
  "duration_days": <number: 0 for permanent, 1 for 1d, 3 for 3d, 7 for 7d, 14 for 14d, 30 for 30d, or null if mute/censor>,
  "duration_minutes": <number: 5, 15, 60, 1440 if action_type is mute, or null if ban/censor>,
  "recommended_action": "perm_ban" | "ban_30d" | "ban_7d" | "ban_3d" | "ban_1d" | "mute_24h" | "mute_1h" | "mute_15m" | "mute_5m" | "warn" | "censor" | "allow",
  "censored_text": "Text with offending prohibited words replaced by ***, keeping rest intact"
}

If the message is completely friendly and safe, return:
{"flagged": false, "category": "none", "severity": "none", "confidence": 1.0, "reason": "Safe", "action_type": "allow", "duration_days": null, "duration_minutes": null, "recommended_action": "allow", "censored_text": "${clean.replace(/"/g, '\\"')}"}

Respond ONLY with valid JSON.`;

  const userPayloadText = clean === textVariants.squashed
    ? clean
    : `Raw: "${clean}" | Normalized: "${textVariants.squashed}"`;

  // 4. Attempt Groq call with primary model, fallback to instant 8b model on failure/timeout
  const modelsToTry = [requestedModel, DEFAULT_FALLBACK_MODEL].filter((v, i, a) => a.indexOf(v) === i);

  for (const modelName of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: modelName,
          temperature: 0.0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPayloadText }
          ]
        })
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const rawContent = data?.choices?.[0]?.message?.content;
        if (rawContent) {
          const parsed = JSON.parse(rawContent);
          const isFlagged = Boolean(parsed.flagged);

          // Apply action policy adaptation
          let effectiveAction = parsed.recommended_action || (isFlagged ? (parsed.action_type === 'ban' ? (parsed.duration_days === 0 ? 'perm_ban' : `ban_${parsed.duration_days || 1}d`) : 'mute_1h') : 'allow');
          if (actionPolicy === 'block_only' && isFlagged) {
            effectiveAction = 'block';
          } else if (actionPolicy === 'censor_warn' && isFlagged) {
            effectiveAction = 'censor';
          }

          const result = {
            flagged: isFlagged,
            category: parsed.category || 'general',
            severity: parsed.severity || (isFlagged ? 'medium' : 'none'),
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
            reason: parsed.reason || (isFlagged ? 'Community Standards Violation' : 'Safe'),
            action_type: parsed.action_type || (isFlagged ? (effectiveAction.startsWith('ban') ? 'ban' : effectiveAction.startsWith('mute') ? 'mute' : 'block') : 'allow'),
            duration_days: typeof parsed.duration_days === 'number' ? parsed.duration_days : (effectiveAction === 'perm_ban' ? 0 : effectiveAction.startsWith('ban_') ? parseInt(effectiveAction.replace('ban_', '').replace('d', ''), 10) || 1 : null),
            duration_minutes: typeof parsed.duration_minutes === 'number' ? parsed.duration_minutes : (effectiveAction.startsWith('mute_') ? (effectiveAction.includes('h') ? parseInt(effectiveAction.replace('mute_', '').replace('h', ''), 10) * 60 : parseInt(effectiveAction.replace('mute_', '').replace('m', ''), 10)) : null),
            recommended_action: effectiveAction,
            censored_text: parsed.censored_text || clean,
            modelUsed: modelName,
            latencyMs: Date.now() - startTime
          };

          // Cache result
          setCachedDecision(clean, strictness, result);
          return result;
        }
      }
    } catch (err) {
      console.warn(`[AI Moderation] Model ${modelName} attempt error:`, err.message);
    }
  }

  // Graceful fallback if Groq API is completely unreachable: allow with warning
  return {
    flagged: false,
    bypassed: true,
    reason: 'Groq API unreachable / fallback',
    latencyMs: Date.now() - startTime
  };
}

/**
 * Advanced Groq AI Moderation Appeal Arbitrator
 * Analyzes detailed student answers across sincerity, ownership, contextual justification, and prevention commitment.
 * Returns recommended decision ('approve' | 'reject'), sincerity rating, repeat offense risk, and rationale.
 */
async function evaluateAppealWithGroq({ username, punishmentType, originalReason, appealText, incidentCategory, incidentDescription, whySecondChance, preventionCommitment, rulesAgreed }) {
  const startTime = Date.now();
  const fullText = appealText || [
    incidentCategory ? `[Category: ${incidentCategory}]` : '',
    incidentDescription ? `Context: ${incidentDescription}` : '',
    whySecondChance ? `Second Chance Justification: ${whySecondChance}` : '',
    preventionCommitment ? `Prevention Commitment: ${preventionCommitment}` : ''
  ].filter(Boolean).join('\n\n');

  if (!fullText || !fullText.trim()) {
    return {
      recommendation: 'reject',
      sincerity_rating: 'none',
      repeat_offense_risk: 'high',
      rationale: 'No explanation or detailed answers provided in appeal.',
      confidence: 1.0,
      latencyMs: 0
    };
  }

  const prompt = `You are an empathetic, impartial, and highly perceptive AI Safety Arbitrator for "Nitro Games", an academic student workspace and gaming platform.
A student is appealing an automated moderation punishment (${(punishmentType || 'Punishment').toUpperCase()}).

STUDENT INFRACTION PROFILE:
- Username: @${username || 'User'}
- Active Punishment: ${(punishmentType || 'Punishment').toUpperCase()}
- Platform Infraction Reason: "${originalReason || 'Safety filter or community guidelines violation'}"

DETAILED APPEAL QUESTIONNAIRE RESPONSES:
1. Infraction Category Claimed: "${incidentCategory || 'Uncategorized'}"
2. What happened & context: "${incidentDescription || fullText}"
3. Why student requests another chance: "${whySecondChance || 'Requested second chance'}"
4. Preventative plan to avoid repeat violations: "${preventionCommitment || 'Committed to follow rules'}"
5. Signed Community Pledge Agreement: ${rulesAgreed !== false ? 'YES (Acknowledged rules & no-repeat pledge)' : 'NO'}

ARBITRATION STANDARDS:
1. Sincerity & Accountability: Does the student acknowledge what happened, demonstrate genuine remorse, and take ownership without making aggressive excuses or mocking the system?
2. Prevention Viability: Did they provide a realistic, constructive plan to avoid repeat infractions (e.g. keeping chat academic, muting when upset, disabling caps)?
3. Risk Assessment: 
   - First-time heat-of-moment frustration, minor profanity, or honest misunderstandings with clear accountability -> APPROVE.
   - Blatant unapologetic toxicity, severe sexual/predatory threats, doxxing, trolling staff, or sarcastic dismissals -> REJECT.

Return a valid JSON object matching EXACTLY this schema:
{
  "recommendation": "approve" | "reject",
  "sincerity_rating": "high" | "medium" | "low" | "none",
  "repeat_offense_risk": "low" | "medium" | "high",
  "confidence": 0.0 to 1.0,
  "rationale": "Clear, concise 2 to 3 sentence reasoning for platform administrators explaining why this appeal should be approved or rejected based on the student's questionnaire."
}

Respond ONLY with valid JSON.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEFAULT_PRIMARY_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are an AI Safety Arbitrator evaluating moderation appeals.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const rawContent = data?.choices?.[0]?.message?.content;
      if (rawContent) {
        const parsed = JSON.parse(rawContent);
        return {
          recommendation: parsed.recommendation || 'review',
          sincerity_rating: parsed.sincerity_rating || 'medium',
          repeat_offense_risk: parsed.repeat_offense_risk || 'medium',
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
          rationale: parsed.rationale || 'Appeal evaluated by Groq AI Safety Arbitrator.',
          latencyMs: Date.now() - startTime
        };
      }
    }
  } catch (err) {
    console.warn('[AI Appeal Evaluation] Groq call error:', err.message);
  }

  // Graceful fallback
  return {
    recommendation: 'review',
    sincerity_rating: 'medium',
    repeat_offense_risk: 'medium',
    confidence: 0.7,
    rationale: 'Pending manual review - Automated safety evaluation bypassed or timed out. Requires human staff decision.',
    latencyMs: Date.now() - startTime
  };
}

/**
 * Evaluates an image with Groq AI Vision model (llama-3.2-11b-vision-preview).
 * Scans image for NSFW/nudity, gore, violence, hate speech text inside image, or doxxing.
 */
async function checkImageWithGroqModeration(imageUrlOrBase64, options = {}) {
  const startTime = Date.now();
  if (!imageUrlOrBase64 || typeof imageUrlOrBase64 !== 'string') {
    return { flagged: false, latencyMs: 0 };
  }

  const currentConfig = systemState.getAiConfig();
  if (!currentConfig.enabled && !options.force) {
    return { flagged: false, bypassed: true, reason: 'AI Moderation Offline' };
  }

  const visionModel = options.model || 'llama-3.2-11b-vision-preview';
  const timeoutMs = options.timeoutMs || 7000;

  const systemPrompt = `You are an uncompromising AI Safety Image Moderation Engine for "Nitro Games", a student gaming and chat community.
Analyze the provided image carefully for inappropriate or unsafe content:
1. NSFW / Nudity / Explicit Sexual Content
2. Blood, Gore, Extreme Violence, Graphic Injuries
3. Hate symbols, Nazi imagery, racist/homophobic text inside image
4. Doxxing, personal private identity documents, credit cards, SSNs
5. Illegal substances, weapons, self-harm

Return a valid JSON object matching EXACTLY this schema:
{
  "flagged": true | false,
  "category": "nsfw" | "violence_gore" | "hate_speech" | "doxxing" | "illicit" | "none",
  "severity": "low" | "medium" | "high" | "extreme" | "none",
  "confidence": 0.0 to 1.0,
  "reason": "Short summary of why image was flagged or 'Safe image'",
  "recommended_action": "block" | "warn" | "ban_1d" | "perm_ban" | "allow"
}

If the image is completely normal, safe, and appropriate for students (games, memes, art, pets, code, screenshots), return:
{"flagged": false, "category": "none", "severity": "none", "confidence": 1.0, "reason": "Safe image", "recommended_action": "allow"}

Respond ONLY with valid JSON.`;

  let formattedImageUrl = imageUrlOrBase64;
  if (!formattedImageUrl.startsWith('http') && !formattedImageUrl.startsWith('data:')) {
    formattedImageUrl = `data:image/jpeg;base64,${formattedImageUrl}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: visionModel,
        temperature: 0.0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Please evaluate this image for safety compliance.' },
              { type: 'image_url', image_url: { url: formattedImageUrl } }
            ]
          }
        ]
      })
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const rawContent = data?.choices?.[0]?.message?.content;
      if (rawContent) {
        const parsed = JSON.parse(rawContent);
        return {
          flagged: Boolean(parsed.flagged),
          category: parsed.category || 'general',
          severity: parsed.severity || (parsed.flagged ? 'high' : 'none'),
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
          reason: parsed.reason || (parsed.flagged ? 'Inappropriate Image Content' : 'Safe image'),
          recommended_action: parsed.recommended_action || (parsed.flagged ? 'block' : 'allow'),
          latencyMs: Date.now() - startTime
        };
      }
    }
  } catch (err) {
    console.warn('[AI Image Moderation] Groq Vision call error:', err.message);
  }

  return {
    flagged: false,
    bypassed: true,
    reason: 'Groq Vision API unreachable / fallback',
    latencyMs: Date.now() - startTime
  };
}

async function testGroqModeration(text, customOptions = {}) {
  const result = await checkMessageWithGroqModeration(text, {
    force: true,
    ...customOptions
  });
  return result;
}

module.exports = {
  checkMessageWithGroqModeration,
  checkImageWithGroqModeration,
  testGroqModeration,
  evaluateAppealWithGroq,
  normalizeObfuscatedText
};
