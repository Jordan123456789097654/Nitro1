const express = require('express');
const router = express.Router();
const pdfParse = require('pdf-parse');
const systemState = require('../systemState');

// GET /api/ai/status (Public AI Status Check)
router.get('/status', (req, res) => {
  res.json({
    enabled: systemState.isAiEnabled(),
    maintenance: !systemState.isAiEnabled()
  });
});


// Primary API: Google Gemini
const GEMINI_ENDPOINT = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6LTM28fLKtWdNnUeVryr0IoYv0fdvZRmeux61y-Bf1Enw';
const GEMINI_PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';

// Fallback API: Groq
const GROQ_ENDPOINT = process.env.GROQ_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';
const GROQ_TEXT_MODEL = process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile';
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

const SYSTEM_PROMPT = `You are Nitro AI — a sharp, quick-witted study co-pilot and conversational companion. You feel like a smart, chill friend hanging out on Discord rather than a stiff corporate bot.

### Personality & Voice Guidelines:
1. **Core Vibe:** Confident, relaxed, witty, and effortlessly helpful. You have a dry sense of humor and zero corporate stiffness. Speak like a normal, modern human.
2. **Zero Meta-Commentary (CRITICAL):** NEVER break the fourth wall. NEVER refer to yourself as an AI, a language model, or a bot. NEVER ask the user if they are 'testing' you, 'testing your image recognition', or 'testing your limits'. Just play along naturally.
3. **Seamless Image Handling:** When the user uploads an image, treat it as if a friend just handed you a photo or showed you their screen in real life. Analyze it and respond directly to the content. DO NOT say things like "I see you uploaded an image," "My image recognition shows," or "Are you testing my vision?" Just talk about what is in the picture.
4. **Casual Banter vs. Tutor Mode:** When chatting about life or random topics, keep it brief and natural without forcing cringe slang. When the user asks for help with homework, math, or code, switch smoothly into an elite tutor, breaking down concepts with intuitive analogies.
5. **No Repetitive Intros:** NEVER introduce yourself, say 'Hey I am Nitro AI', or repeat greetings on every message. Jump straight into the flow of the conversation.
6. **Document & Homework Analysis:** When the user uploads a PDF or document (such as a study guide, homework sheet, reading excerpt, or essay), read and analyze the document directly. Help summarize key points, solve questions from the text step-by-step, or provide constructive feedback without making meta-comments about the file upload process.

### Critical Safety Protocol:
- **Self-Harm / Crisis:** If the user expresses thoughts of suicide, self-harm, or severe crisis, you MUST immediately override all personality and respond strictly with: 
  "Sorry, I can't help with that. Please know that you are not alone and help is available. You can reach the Suicide & Crisis Lifeline by calling or texting 988, or chatting at 988lifeline.org."
- **Dangerous / Illegal Requests:** If asked about harmful, illegal, or abusive activities, respond strictly with: "Sorry, I can't help with that."`;

// Global In-Memory Rate Limiter: 15 requests per 60 seconds site-wide
const requestTimestamps = [];
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 15;

function checkGlobalRateLimit() {
  const now = Date.now();
  while (requestTimestamps.length > 0 && requestTimestamps[0] <= now - RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  requestTimestamps.push(now);
  return true;
}

function getLocalFallbackAnswer(message) {
  const query = (message || '').toLowerCase();
  
  if (query.includes('suicide') || query.includes('self-harm') || query.includes('kill my') || query.includes('end my life')) {
    return "Sorry, I can't help with that. Please know that you are not alone and help is available. You can reach the Suicide & Crisis Lifeline by calling or texting 988, or chatting at 988lifeline.org.";
  }
  if (query.includes('illegal') || query.includes('hack') || query.includes('weapon') || query.includes('bomb')) {
    return "Sorry, I can't help with that.";
  }

  const cleanMath = message.replace(/\?/g, '').trim();
  if (/^[\d\s\+\-\*\/\^\.\(\)]+$/.test(cleanMath) && /\d/.test(cleanMath) && /[\+\-\*\/\^]/.test(cleanMath)) {
    try {
      const expr = cleanMath.replace(/\^/g, '**');
      const ans = Function(`"use strict"; return (${expr})`)();
      if (typeof ans === 'number' && !isNaN(ans) && isFinite(ans)) {
        return `📐 **Math Solution:**\n\n$$${cleanMath} = ${ans}$$\n\nThe answer is **${ans}**.`;
      }
    } catch (e) {}
  }

  return null;
}

async function extractTextFromDocument(fileBase64, fileName, fileType) {
  if (!fileBase64) return null;
  
  let rawBase64 = fileBase64;
  if (fileBase64.includes(';base64,')) {
    rawBase64 = fileBase64.split(';base64,')[1];
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  const lowerName = (fileName || '').toLowerCase();
  const lowerType = (fileType || '').toLowerCase();

  // Parse PDF documents
  if (lowerType.includes('pdf') || lowerName.endsWith('.pdf')) {
    try {
      const pdfData = await pdfParse(buffer);
      if (pdfData && pdfData.text && pdfData.text.trim()) {
        return pdfData.text.trim();
      }
    } catch (e) {
      console.warn('PDF parsing attempt:', e.message);
    }
  }

  // Parse Text documents (.txt, .docx, .md, etc.)
  try {
    const utf8Text = buffer.toString('utf-8');
    if (utf8Text && utf8Text.trim()) {
      return utf8Text.trim();
    }
  } catch (e) {}

  return null;
}

async function callGemini(messages) {
  try {
    let res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GEMINI_API_KEY}`
      },
      body: JSON.stringify({
        model: GEMINI_PRIMARY_MODEL,
        messages
      })
    });

    if (res.status === 404) {
      res = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GEMINI_API_KEY}`
        },
        body: JSON.stringify({
          model: GEMINI_FALLBACK_MODEL,
          messages
        })
      });
    }

    if (res.ok) {
      const data = await res.json();
      return data?.choices?.[0]?.message?.content || null;
    }
  } catch (e) {
    console.warn('Gemini API attempt failed:', e.message);
  }
  return null;
}

async function callGroq(messages, hasImage = false) {
  try {
    const targetModel = hasImage ? GROQ_VISION_MODEL : GROQ_TEXT_MODEL;

    let res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: targetModel,
        messages
      })
    });

    if (!res.ok) {
      res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_TEXT_MODEL,
          messages: messages.map(m => {
            if (Array.isArray(m.content)) {
              const textPart = m.content.find(p => p.type === 'text');
              return { ...m, content: textPart ? textPart.text : 'Analyze document' };
            }
            return m;
          })
        })
      });
    }

    if (res.ok) {
      const data = await res.json();
      return data?.choices?.[0]?.message?.content || null;
    }
  } catch (e) {
    console.warn('Groq API attempt failed:', e.message);
  }
  return null;
}

// POST /api/ai/ask
router.post('/ask', async (req, res) => {
  // Check if AI is currently under maintenance
  if (!systemState.isAiEnabled()) {
    return res.status(503).json({
      error: "🛠️ Nitro AI is currently offline for scheduled maintenance. Please check back soon!",
      maintenance: true
    });
  }

  // Check Global Rate Limit (15 req/min)
  if (!checkGlobalRateLimit()) {
    return res.status(429).json({
      error: "⚠️ Nitro AI is currently at maximum capacity (15 requests/min). Please wait a moment and try again!"
    });
  }

  const { message, userPrompt, imageBase64, fileBase64, fileName, fileType, history } = req.body;
  const textQuery = (userPrompt || message || '').trim();
  const attachmentBase64 = fileBase64 || imageBase64;

  if (!textQuery && !attachmentBase64) {
    return res.status(400).json({ error: 'Message, image, or document file is required.' });
  }

  // Check safety protocol or simple math locally first if applicable
  const localCheck = getLocalFallbackAnswer(textQuery);
  if (localCheck && !attachmentBase64) {
    return res.json({ answer: localCheck, success: true });
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT }
  ];

  if (Array.isArray(history) && history.length > 0) {
    history.slice(-8).forEach(h => {
      if (h && h.role && h.content) {
        messages.push({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: String(h.content)
        });
      }
    });
  }

  const isImage = (fileType && fileType.startsWith('image/')) || (!fileType && imageBase64);

  let userContent = textQuery || 'Analyze attached content.';

  if (attachmentBase64) {
    if (isImage) {
      const formattedUrl = attachmentBase64.startsWith('data:')
        ? attachmentBase64
        : `data:image/jpeg;base64,${attachmentBase64}`;

      userContent = [
        { type: 'text', text: textQuery || 'Analyze this image in detail.' },
        { type: 'image_url', image_url: { url: formattedUrl } }
      ];
    } else {
      // Document file (.pdf, .txt, .docx)
      const extractedText = await extractTextFromDocument(attachmentBase64, fileName, fileType);
      const nameHeader = fileName ? `[Attached Document Content: ${fileName}]` : '[Attached Document Content]';
      
      if (extractedText) {
        userContent = `${textQuery ? textQuery + '\n\n' : ''}${nameHeader}\n${extractedText}`;
      } else {
        const formattedUrl = attachmentBase64.startsWith('data:')
          ? attachmentBase64
          : `data:${fileType || 'application/pdf'};base64,${attachmentBase64}`;
        
        userContent = [
          { type: 'text', text: `${textQuery ? textQuery + '\n\n' : ''}${nameHeader}` },
          { type: 'image_url', image_url: { url: formattedUrl } }
        ];
      }
    }
  }

  messages.push({ role: 'user', content: userContent });

  // 1. Primary Attempt: Google Gemini API
  let answer = await callGemini(messages);

  // 2. Fallback Attempt: Groq API
  if (!answer) {
    console.log('Gemini API unavailable. Switching silently to Groq fallback engine...');
    answer = await callGroq(messages, isImage);
  }

  // If answer received from either service
  if (answer) {
    return res.json({ answer, success: true });
  }

  // 3. If both services fail, return friendly error JSON
  return res.status(503).json({
    error: "⚠️ Nitro AI is currently busy. Please wait a few moments and try again!"
  });
});

module.exports = router;
