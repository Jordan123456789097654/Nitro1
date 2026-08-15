const fetch = require('node-fetch');
const { sendDiscordLog } = require('./discordLogger');

const GROQ_ENDPOINT = process.env.GROQ_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';
const GROQ_MODEL = process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile';

async function checkMessageWithGroqModeration(text) {
  if (!text || typeof text !== 'string') return { flagged: false };
  const clean = text.trim();
  if (clean.length < 2) return { flagged: false };

  // Quick local pre-check for common safe messages to keep latency minimal
  if (/^(hi|hello|hey|gg|lol|lmao|nice|brb|yes|no|ok|np|ty|thanks|pls|good game|join room|play|who's online|what's up)\b/i.test(clean) && clean.length < 30) {
    return { flagged: false };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s timeout for fast chat latency

    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an automated real-time chat safety filter for a school/student gaming website. Evaluate the provided user text message for severe safety violations.

Flag as inappropriate ONLY IF the message contains:
1. Severe hate speech, racial/homophobic slurs, or targeted harassment.
2. Explicit threats of violence, self-harm encouragement, or suicide instruction.
3. Explicit sexual content or grooming.
4. Real-life doxxing (posting private addresses, phone numbers, SSNs).
5. Severe graphic toxicity or illegal act instructions.

If the message is flagged, return JSON:
{"flagged": true, "reason": "Short 2-4 word reason"}

If the message is safe and acceptable, return JSON:
{"flagged": false}

Respond ONLY with valid JSON.`
          },
          {
            role: 'user',
            content: clean
          }
        ]
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { flagged: false };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return {
        flagged: Boolean(parsed.flagged),
        reason: parsed.reason || 'Flagged by AI Moderation'
      };
    }
  } catch (err) {
    console.warn('Groq AI Moderation check skipped/timed out:', err.message);
  }

  return { flagged: false };
}

module.exports = { checkMessageWithGroqModeration };
