// Nitro AI Chatbot & Academic Tutor Engine (Multimodal Vision & PDF/Document Upload Support)
let conversationHistory = [];
let currentSelectedFile = null;
let activeAiMode = 'general';

const MODE_LABELS = {
  general: 'Nitro AI • General Co-Pilot',
  math: 'Nitro AI • STEM & Math Solver',
  code: 'Nitro AI • Senior Code Mentor',
  writing: 'Nitro AI • Essay & Writing Coach',
  science: 'Nitro AI • Science Explainer'
};

export function initAiHelper() {
  setupAiModal();
  setupAiModes();
  setupQuickPrompts();
  setupAiStudioTabs();
  setupFlashcardsStudio();
  setupCodeSandboxRunner();
  setupAiChat();
  setupFileUpload();
  checkAiStatusAndUpdateUi();
}

function setupAiModes() {
  const chips = document.querySelectorAll('.ai-mode-chip');
  const headerTitle = document.getElementById('ai-header-title');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => {
        c.classList.remove('active');
        c.style.background = 'rgba(255,255,255,0.04)';
        c.style.borderColor = 'rgba(255,255,255,0.1)';
        c.style.color = '#cbd5e1';
      });

      chip.classList.add('active');
      chip.style.background = 'rgba(56,189,248,0.15)';
      chip.style.borderColor = '#38bdf8';
      chip.style.color = '#38bdf8';

      activeAiMode = chip.dataset.mode || 'general';
      if (headerTitle) {
        headerTitle.textContent = MODE_LABELS[activeAiMode] || 'Nitro AI';
      }
    });
  });
}

function setupQuickPrompts() {
  const chips = document.querySelectorAll('.ai-prompt-chip');
  const input = document.getElementById('ai-chat-input');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const promptText = chip.dataset.prompt;
      if (input && promptText) {
        input.value = promptText;
        input.focus();
      }
    });
  });
}

function setupAiModal() {
  const modal = document.getElementById('ai-helper-modal');
  const openBtn = document.getElementById('open-ai-helper-btn');
  const closeBtn = document.getElementById('ai-helper-modal-close');

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      modal.classList.add('active');
      checkAiStatusAndUpdateUi();
      document.getElementById('ai-chat-input')?.focus();
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }
}

async function checkAiStatusAndUpdateUi() {
  try {
    const res = await fetch('/api/ai/status');
    const data = await res.json();
    const statusVal = document.querySelector('#ai-helper-modal .ai-info-card div:nth-child(2) strong');
    const onlineBadge = document.querySelector('#ai-helper-modal .ai-info-card div:nth-child(3)');
    const input = document.getElementById('ai-chat-input');

    if (data.enabled === false || data.maintenance === true) {
      if (statusVal) {
        statusVal.textContent = 'Maintenance';
        statusVal.style.color = '#ef4444';
      }
      if (onlineBadge) {
        onlineBadge.innerHTML = '<span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%; box-shadow: 0 0 8px #ef4444;"></span><span>🔴 Under Maintenance</span>';
        onlineBadge.style.color = '#ef4444';
      }
      if (input) {
        input.placeholder = '🛠️ Nitro AI is currently under maintenance...';
      }
    } else {
      if (statusVal) {
        statusVal.textContent = 'Ready';
        statusVal.style.color = '#10b981';
      }
      if (onlineBadge) {
        onlineBadge.innerHTML = '<span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981;"></span><span>🟢 AI Online</span>';
        onlineBadge.style.color = '#10b981';
      }
      if (input && input.placeholder.includes('maintenance')) {
        input.placeholder = 'Ask me anything...';
      }
    }
  } catch (e) {}
}

function getFormattedTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setupFileUpload() {
  const fileInput = document.getElementById('ai-file-input');
  const attachBtn = document.getElementById('ai-attach-file-btn');
  const previewBar = document.getElementById('ai-image-preview-bar');
  const imageWrapper = document.getElementById('ai-image-preview-wrapper');
  const previewImg = document.getElementById('ai-image-preview-img');
  const docBadge = document.getElementById('ai-doc-preview-badge');
  const docFilenameSpan = document.getElementById('ai-doc-filename');
  const removeBtn = document.getElementById('ai-remove-image-btn');
  const chatInput = document.getElementById('ai-chat-input');
  const modal = document.getElementById('ai-helper-modal');

  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', () => {
      fileInput.click();
    });
  }

  function handleFileSelected(file) {
    if (!file) return;

    const isImg = file.type.startsWith('image/');
    const reader = new FileReader();

    reader.onload = (event) => {
      const base64Data = event.target.result;
      currentSelectedFile = {
        name: file.name || `Screenshot_${Date.now()}.png`,
        type: file.type || 'image/png',
        base64: base64Data,
        isImage: isImg
      };

      if (previewBar) previewBar.style.display = 'flex';

      if (isImg) {
        if (imageWrapper) imageWrapper.style.display = 'inline-block';
        if (previewImg) previewImg.src = base64Data;
        if (docBadge) docBadge.style.display = 'none';
      } else {
        if (imageWrapper) imageWrapper.style.display = 'none';
        if (docBadge) docBadge.style.display = 'flex';
        if (docFilenameSpan) docFilenameSpan.textContent = file.name;
      }

      if (chatInput) chatInput.focus();
    };

    reader.readAsDataURL(file);
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      handleFileSelected(e.target.files[0]);
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', clearSelectedFile);
  }

  // CLIPBOARD IMAGE PASTE (Ctrl+V / Paste Screenshot)
  const handlePaste = (e) => {
    if (!modal || modal.style.display === 'none') return;

    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items || [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false }).replace(/:/g, '-');
          const namedFile = new File([file], `Pasted_Image_${timestamp}.png`, { type: file.type || 'image/png' });
          handleFileSelected(namedFile);
          return;
        }
      }
    }
  };

  if (chatInput) {
    chatInput.addEventListener('paste', handlePaste);
  }
  if (modal) {
    modal.addEventListener('paste', handlePaste);
  }
  window.addEventListener('paste', (e) => {
    if (modal && modal.style.display !== 'none') {
      handlePaste(e);
    }
  });

  // DRAG & DROP FILE SUPPORT ON AI MODAL
  if (modal) {
    modal.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    modal.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    });
  }
}

function clearSelectedFile() {
  currentSelectedFile = null;
  const fileInput = document.getElementById('ai-file-input');
  if (fileInput) fileInput.value = '';
  const previewBar = document.getElementById('ai-image-preview-bar');
  if (previewBar) previewBar.style.display = 'none';
  const imageWrapper = document.getElementById('ai-image-preview-wrapper');
  if (imageWrapper) imageWrapper.style.display = 'none';
  const docBadge = document.getElementById('ai-doc-preview-badge');
  if (docBadge) docBadge.style.display = 'none';
}

function setupAiChat() {
  const form = document.getElementById('ai-chat-form');
  const input = document.getElementById('ai-chat-input');
  const clearBtn = document.getElementById('ai-clear-chat-btn');

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      conversationHistory = [];
      clearSelectedFile();
      const messagesList = document.getElementById('ai-messages-list');
      if (messagesList) {
        messagesList.innerHTML = '';
        appendMessage('bot', '👋 **Conversation reset.** Choose a specialized mode on the left or type your question below!', getFormattedTime());
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = input.value.trim();
      if (!query && !currentSelectedFile) return;

      const time = getFormattedTime();
      const attachedFile = currentSelectedFile;

      appendMessage('user', query || (attachedFile ? `[Attached ${attachedFile.name}]` : ''), time, attachedFile);

      const historyItem = { role: 'user', content: query || `Analyze attached file: ${attachedFile?.name}` };
      if (attachedFile) historyItem.file = attachedFile.name;
      conversationHistory.push(historyItem);

      input.value = '';
      clearSelectedFile();

      appendTypingIndicator(attachedFile);

      try {
        const token = localStorage.getItem('nitro_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        let guestNickname = '';
        if (!token) {
          guestNickname = localStorage.getItem('guest_nickname');
          if (!guestNickname) {
            guestNickname = prompt('Please enter your name/nickname to use the AI Assistant:');
            if (!guestNickname || !guestNickname.trim()) {
              guestNickname = 'Guest_' + Math.floor(Math.random() * 8999 + 1000);
            } else {
              guestNickname = guestNickname.trim().replace(/\s+/g, '_');
            }
            localStorage.setItem('guest_nickname', guestNickname);
          }
        }

        const requestBody = {
          message: query,
          userPrompt: query,
          mode: activeAiMode,
          history: conversationHistory,
          guestNickname: guestNickname
        };

        if (attachedFile) {
          requestBody.fileName = attachedFile.name;
          requestBody.fileType = attachedFile.type;
          requestBody.fileBase64 = attachedFile.base64;
          if (attachedFile.isImage) {
            requestBody.imageBase64 = attachedFile.base64;
          }
        }

        const res = await fetch('/api/ai/ask', {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });

        const data = await res.json();
        removeTypingIndicator();

        const responseTime = getFormattedTime();

        if (res.ok && data.answer) {
          appendMessage('bot', data.answer, responseTime);
          conversationHistory.push({ role: 'assistant', content: data.answer });
        } else {
          const errorMsg = data.error || '⚠️ Unable to connect to AI server. Please try again.';
          appendMessage('bot', errorMsg, responseTime);
        }
      } catch (err) {
        removeTypingIndicator();
        appendMessage('bot', '⚠️ **Connection Error:** Failed to reach Nitro AI endpoint.', getFormattedTime());
      }
    });
  }
}

function appendMessage(sender, text, timestamp = getFormattedTime(), fileObj = null) {
  const messagesList = document.getElementById('ai-messages-list');
  if (!messagesList) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `ai-message ${sender}`;
  msgDiv.style.cssText = sender === 'user'
    ? 'display: flex; flex-direction: column; max-width: 78%; align-self: flex-end;'
    : 'display: flex; flex-direction: column; max-width: 82%; align-self: flex-start;';

  const isUser = sender === 'user';
  const headerHtml = isUser
    ? `<div class="ai-msg-header" style="font-size: 0.76rem; font-weight: 700; margin-bottom: 5px; text-align: right; color: rgba(255, 255, 255, 0.85);">You · ${timestamp}</div>`
    : `<div class="ai-msg-header" style="font-size: 0.76rem; font-weight: 700; margin-bottom: 5px;">Nitro AI · ${timestamp}</div>`;

  let fileAttachmentHtml = '';
  if (fileObj) {
    if (fileObj.isImage) {
      fileAttachmentHtml = `<div style="margin-bottom: 10px;"><img src="${fileObj.base64}" style="max-width: 220px; max-height: 180px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); object-fit: cover;"></div>`;
    } else {
      fileAttachmentHtml = `<div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.3); border: 1px solid var(--accent-color); padding: 8px 12px; border-radius: 10px; font-size: 0.82rem; margin-bottom: 10px;"><span style="font-size: 1.2rem;">📄</span><span style="font-weight: 700;">${fileObj.name}</span></div>`;
    }
  }

  msgDiv.innerHTML = `
    ${headerHtml}
    <div class="ai-bubble" style="border-radius: 14px; padding: 14px 18px; font-size: 0.92rem; line-height: 1.6;">
      ${fileAttachmentHtml}
      ${formatAiText(text)}
      ${!isUser ? `
        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button class="copy-ai-ans-btn" style="padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.15);">📋 Copy Answer</button>
          <button class="tts-ai-ans-btn" style="padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px; background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid #38bdf8;">🔊 Read Aloud</button>
        </div>
      ` : ''}
    </div>
  `;

  // Attach copy answer click handler
  const copyBtn = msgDiv.querySelector('.copy-ai-ans-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text);
      copyBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy Answer'; }, 2000);
    });
  }

  // Attach Read Aloud Speech Synthesis
  const ttsBtn = msgDiv.querySelector('.tts-ai-ans-btn');
  if (ttsBtn) {
    ttsBtn.addEventListener('click', () => {
      if ('speechSynthesis' in window) {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          ttsBtn.textContent = '🔊 Read Aloud';
          return;
        }
        const cleanSpeechText = text.replace(/[*_#`$]/g, '').replace(/https?:\/\/\S+/g, '');
        const utterance = new SpeechSynthesisUtterance(cleanSpeechText.slice(0, 800));
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
        ttsBtn.textContent = '🔊 Speaking...';
        utterance.onend = () => { ttsBtn.textContent = '🔊 Read Aloud'; };
      }
    });
  }

  messagesList.appendChild(msgDiv);
  messagesList.scrollTop = messagesList.scrollHeight;
}

function appendTypingIndicator(fileObj = null) {
  const messagesList = document.getElementById('ai-messages-list');
  if (!messagesList) return;

  const typingDiv = document.createElement('div');
  typingDiv.id = 'ai-typing-indicator';
  typingDiv.style.cssText = 'display: flex; flex-direction: column; max-width: 82%; align-self: flex-start;';
  
  let statusText = 'Gemini Flash is generating your response...';
  if (fileObj) {
    statusText = fileObj.isImage
      ? 'Gemini Vision is analyzing your image & prompt...'
      : `Nitro AI is parsing & analyzing document: ${fileObj.name}...`;
  }

  typingDiv.innerHTML = `
    <div class="ai-msg-header" style="font-size: 0.76rem; font-weight: 700; margin-bottom: 5px;">Nitro AI · Thinking...</div>
    <div class="ai-bubble" style="border-radius: 14px; padding: 12px 18px; font-size: 0.88rem; font-style: italic; display: flex; align-items: center; gap: 8px;">
      <span class="online-dot" style="width: 8px; height: 8px; background: var(--accent-color); border-radius: 50%; animation: pulse 1s infinite;"></span>
      ${statusText}
    </div>
  `;
  messagesList.appendChild(typingDiv);
  messagesList.scrollTop = messagesList.scrollHeight;
}

function removeTypingIndicator() {
  const typing = document.getElementById('ai-typing-indicator');
  if (typing) typing.remove();
}

function cleanMathSymbols(mathStr) {
  return mathStr
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\cdot/g, '·')
    .replace(/\\approx/g, '≈')
    .replace(/\\le/g, '≤')
    .replace(/\\ge/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\infty/g, '∞')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\theta/g, 'θ')
    .replace(/\\pi/g, 'π')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\text\{([^}]+)\}/g, '$1');
}

function formatAiText(text) {
  if (!text) return '';
  let formatted = escapeHtml(text);

  // 1. Code blocks with Copy & Run Sandbox buttons
  formatted = formatted.replace(/```([a-z]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const cleanCode = code.trim();
    const encoded = encodeURIComponent(cleanCode);
    return `
      <div style="position: relative; margin: 10px 0; background: rgba(0,0,0,0.5); border: 1px solid var(--card-border); border-radius: 8px; overflow: hidden;">
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; background: rgba(255,255,255,0.04); border-bottom: 1px solid var(--card-border); font-size: 0.75rem; font-weight: 700; color: #94a3b8;">
          <span>${lang ? lang.toUpperCase() : 'CODE'}</span>
          <div style="display: flex; gap: 6px;">
            <button class="btn-small" style="padding: 2px 8px; font-size: 0.72rem; background: #38bdf8; color: #000; font-weight: 800;" onclick="window.openCodeInSandbox('${encoded}')">▶️ Run Live Code</button>
          </div>
        </div>
        <pre style="padding: 12px; margin: 0; overflow-x: auto; font-family: monospace; font-size: 0.85rem; color: #38bdf8;"><code>${cleanCode}</code></pre>
      </div>
    `;
  });

  // 2. Inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.4); padding: 2px 6px; border-radius: 4px; color: #38bdf8; font-family: monospace;">$1</code>');

  // 3. Display Math Block ($$...$$)
  formatted = formatted.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    const cleanFormula = cleanMathSymbols(formula.trim());
    return `<div class="math-block" style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 10px 16px; margin: 10px 0; font-family: 'Cambria Math', 'KaTeX_Main', serif; font-size: 1.08rem; color: #38bdf8; text-align: center; font-weight: 700; letter-spacing: 0.5px;">${cleanFormula}</div>`;
  });

  // 4. Inline Math ($...$)
  formatted = formatted.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
    if (/^\d+(\.\d{2})?$/.test(formula.trim())) {
      return `$${formula}`;
    }
    const cleanFormula = cleanMathSymbols(formula.trim());
    return `<span class="inline-math" style="background: rgba(56, 189, 248, 0.12); padding: 2px 7px; border-radius: 5px; font-family: 'Cambria Math', 'KaTeX_Main', 'Courier New', serif; color: #38bdf8; font-weight: 700; font-size: 0.94em; border: 1px solid rgba(56, 189, 248, 0.25);">${cleanFormula}</span>`;
  });

  // 5. Bold & Headings
  formatted = formatted
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/### (.*?)\n/g, '<h4 style="color: #38bdf8; margin: 12px 0 6px; font-size: 0.96rem; font-weight: 800;">$1</h4>')
    .replace(/## (.*?)\n/g, '<h3 style="color: #fff; margin: 14px 0 8px; font-size: 1.05rem; font-weight: 900;">$1</h3>')
    .replace(/\n/g, '<br>');

  return formatted;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -------------------------------------------------------------
// FLASHCARDS STUDIO ENGINE
// -------------------------------------------------------------
let currentFlashcardDeck = null;
let currentCardIndex = 0;
let isCardFlipped = false;
let knownCardsCount = 0;
let reviewCardsCount = 0;
let currentFlashcardFile = null;

function setupAiStudioTabs() {
  const chatTab = document.getElementById('ai-tab-chat-btn');
  const fcTab = document.getElementById('ai-tab-flashcards-btn');
  const chatView = document.getElementById('ai-chat-view-container');
  const fcView = document.getElementById('ai-flashcards-view-container');

  if (chatTab && fcTab) {
    chatTab.addEventListener('click', () => {
      chatTab.classList.add('active');
      fcTab.classList.remove('active');
      if (chatView) chatView.style.display = 'flex';
      if (fcView) fcView.style.display = 'none';
    });

    fcTab.addEventListener('click', () => {
      fcTab.classList.add('active');
      chatTab.classList.remove('active');
      if (chatView) chatView.style.display = 'none';
      if (fcView) fcView.style.display = 'flex';
    });
  }
}

function setupFlashcardsStudio() {
  const generateBtn = document.getElementById('ai-generate-fc-btn');
  const topicInput = document.getElementById('ai-fc-topic-input');
  const countSelect = document.getElementById('ai-fc-count-select');
  const cardBox = document.getElementById('ai-fc-card-box');
  const prevBtn = document.getElementById('ai-fc-prev-btn');
  const nextBtn = document.getElementById('ai-fc-next-btn');
  const knownBtn = document.getElementById('ai-fc-mark-known-btn');
  const reviewBtn = document.getElementById('ai-fc-mark-review-btn');
  const fileInput = document.getElementById('ai-fc-file-input');
  const attachBtn = document.getElementById('ai-fc-attach-btn');
  const docBadge = document.getElementById('ai-fc-doc-badge');
  const filenameSpan = document.getElementById('ai-fc-filename');
  const removeFileBtn = document.getElementById('ai-fc-remove-file-btn');

  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        currentFlashcardFile = {
          name: file.name,
          type: file.type || 'application/pdf',
          base64: event.target.result
        };
        if (docBadge) docBadge.style.display = 'inline-flex';
        if (filenameSpan) filenameSpan.textContent = file.name;
        if (topicInput && !topicInput.value) {
          topicInput.placeholder = `Deck will be generated from: ${file.name}`;
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (removeFileBtn) {
    removeFileBtn.addEventListener('click', () => {
      currentFlashcardFile = null;
      if (fileInput) fileInput.value = '';
      if (docBadge) docBadge.style.display = 'none';
      if (topicInput) topicInput.placeholder = 'Or enter topic / concept (e.g. AP Chemistry Unit 1, Spanish Vocab)...';
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      const topic = (topicInput?.value || '').trim();
      if (!topic && !currentFlashcardFile) {
        return alert('Please enter a study topic or upload a PDF / notes document.');
      }

      generateBtn.textContent = currentFlashcardFile ? '⏳ Reading PDF & Generating Deck...' : '⏳ Generating Deck...';
      generateBtn.disabled = true;

      try {
        const token = localStorage.getItem('nitro_jwt_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const reqPayload = {
          topic: topic || (currentFlashcardFile ? `Key Concepts from ${currentFlashcardFile.name}` : ''),
          count: parseInt(countSelect?.value || '8', 10)
        };

        if (currentFlashcardFile) {
          reqPayload.fileName = currentFlashcardFile.name;
          reqPayload.fileType = currentFlashcardFile.type;
          reqPayload.fileBase64 = currentFlashcardFile.base64;
        }

        const res = await fetch('/api/ai/flashcards', {
          method: 'POST',
          headers,
          body: JSON.stringify(reqPayload)
        });

        const data = await res.json();
        generateBtn.textContent = '✨ Generate Deck';
        generateBtn.disabled = false;

        if (res.ok && data.deck && data.deck.cards && data.deck.cards.length > 0) {
          currentFlashcardDeck = data.deck;
          currentCardIndex = 0;
          isCardFlipped = false;
          knownCardsCount = 0;
          reviewCardsCount = 0;
          renderCurrentFlashcard();
          const container = document.getElementById('ai-fc-deck-container');
          if (container) container.style.display = 'flex';
        } else {
          alert(data.error || 'Failed to generate flashcard deck. Please try again or check the document format.');
        }
      } catch (err) {
        generateBtn.textContent = '✨ Generate Deck';
        generateBtn.disabled = false;
        alert('Network error generating flashcards.');
      }
    });
  }

  if (cardBox) {
    cardBox.addEventListener('click', flipCurrentCard);
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (!currentFlashcardDeck || currentCardIndex <= 0) return;
      currentCardIndex--;
      isCardFlipped = false;
      renderCurrentFlashcard();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (!currentFlashcardDeck || currentCardIndex >= currentFlashcardDeck.cards.length - 1) return;
      currentCardIndex++;
      isCardFlipped = false;
      renderCurrentFlashcard();
    });
  }

  if (knownBtn) {
    knownBtn.addEventListener('click', () => {
      knownCardsCount++;
      const el = document.getElementById('ai-fc-known-count');
      if (el) el.textContent = knownCardsCount;
      if (currentCardIndex < (currentFlashcardDeck?.cards?.length || 0) - 1) {
        currentCardIndex++;
        isCardFlipped = false;
        renderCurrentFlashcard();
      }
    });
  }

  if (reviewBtn) {
    reviewBtn.addEventListener('click', () => {
      reviewCardsCount++;
      const el = document.getElementById('ai-fc-review-count');
      if (el) el.textContent = reviewCardsCount;
      if (currentCardIndex < (currentFlashcardDeck?.cards?.length || 0) - 1) {
        currentCardIndex++;
        isCardFlipped = false;
        renderCurrentFlashcard();
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    const fcView = document.getElementById('ai-flashcards-view-container');
    if (fcView && fcView.style.display !== 'none' && e.code === 'Space' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      flipCurrentCard();
    }
  });
}

function flipCurrentCard() {
  if (!currentFlashcardDeck || !currentFlashcardDeck.cards[currentCardIndex]) return;
  isCardFlipped = !isCardFlipped;
  const card = currentFlashcardDeck.cards[currentCardIndex];
  const sideLabel = document.getElementById('ai-fc-side-label');
  const cardContent = document.getElementById('ai-fc-card-content');
  const cardHint = document.getElementById('ai-fc-card-hint');
  const cardBox = document.getElementById('ai-fc-card-box');

  if (cardBox) {
    cardBox.style.transform = 'scale(0.98)';
    setTimeout(() => { cardBox.style.transform = 'scale(1)'; }, 150);
  }

  if (isCardFlipped) {
    if (sideLabel) {
      sideLabel.textContent = 'BACK • DEFINITION / ANSWER';
      sideLabel.style.color = '#10b981';
    }
    if (cardContent) cardContent.innerHTML = formatAiText(card.back);
    if (cardHint) cardHint.textContent = card.hint ? `💡 Key takeaway: ${card.hint}` : 'Click to flip back to question';
  } else {
    if (sideLabel) {
      sideLabel.textContent = 'FRONT • QUESTION / TERM (CLICK TO FLIP)';
      sideLabel.style.color = '#38bdf8';
    }
    if (cardContent) cardContent.innerHTML = formatAiText(card.front);
    if (cardHint) cardHint.textContent = card.hint ? `💡 Hint: ${card.hint}` : 'Click card or press [Space] to flip';
  }
}

function renderCurrentFlashcard() {
  if (!currentFlashcardDeck || !currentFlashcardDeck.cards[currentCardIndex]) return;
  const card = currentFlashcardDeck.cards[currentCardIndex];
  const total = currentFlashcardDeck.cards.length;

  const deckTitle = document.getElementById('ai-fc-deck-title');
  const progressBadge = document.getElementById('ai-fc-progress-badge');
  const sideLabel = document.getElementById('ai-fc-side-label');
  const cardContent = document.getElementById('ai-fc-card-content');
  const cardHint = document.getElementById('ai-fc-card-hint');

  if (deckTitle) deckTitle.textContent = currentFlashcardDeck.title || 'Study Deck';
  if (progressBadge) progressBadge.textContent = `Card ${currentCardIndex + 1} of ${total}`;

  if (sideLabel) {
    sideLabel.textContent = 'FRONT • QUESTION / TERM (CLICK TO FLIP)';
    sideLabel.style.color = '#38bdf8';
  }
  if (cardContent) cardContent.innerHTML = formatAiText(card.front);
  if (cardHint) cardHint.textContent = card.hint ? `💡 Hint: ${card.hint}` : 'Click card or press [Space] to flip';
}

// -------------------------------------------------------------
// IN-CHAT CODE RUNNER & SANDBOX
// -------------------------------------------------------------
function setupCodeSandboxRunner() {
  const rerunBtn = document.getElementById('sandbox-rerun-btn');
  const textarea = document.getElementById('sandbox-code-textarea');

  if (rerunBtn && textarea) {
    rerunBtn.addEventListener('click', () => {
      runCodeInSandbox(textarea.value);
    });
  }
}

window.openCodeInSandbox = (encodedCode) => {
  const code = decodeURIComponent(encodedCode);
  const modal = document.getElementById('ai-code-sandbox-modal');
  const textarea = document.getElementById('sandbox-code-textarea');

  if (modal) modal.style.display = 'flex';
  if (textarea) textarea.value = code;

  runCodeInSandbox(code);
};

function runCodeInSandbox(code) {
  const iframe = document.getElementById('sandbox-preview-iframe');
  const consoleLogs = document.getElementById('sandbox-console-logs');

  if (!iframe) return;

  if (consoleLogs) consoleLogs.innerHTML = '<div>[Sandbox Execution Initialized]</div>';

  let htmlDoc = code;
  if (!code.includes('<html') && !code.includes('<body')) {
    htmlDoc = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 18px; color: #1e293b; }
          button { padding: 8px 16px; background: #3b82f6; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 700; }
        </style>
      </head>
      <body>
        <div id="app"></div>
        <script>
          const _log = console.log;
          console.log = function(...args) {
            _log(...args);
            window.parent.postMessage({ type: 'sandbox_log', msg: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') }, '*');
          };
          window.onerror = function(msg, url, line) {
            window.parent.postMessage({ type: 'sandbox_error', msg: msg + ' (Line ' + line + ')' }, '*');
          };
          try {
            ${code}
          } catch(e) {
            console.log('Error:', e.message);
          }
        <\/script>
      </body>
      </html>
    `;
  }

  iframe.srcdoc = htmlDoc;
}

window.addEventListener('message', (e) => {
  if (e.data && (e.data.type === 'sandbox_log' || e.data.type === 'sandbox_error')) {
    const consoleLogs = document.getElementById('sandbox-console-logs');
    if (consoleLogs) {
      const color = e.data.type === 'sandbox_error' ? '#f87171' : '#a7f3d0';
      const logDiv = document.createElement('div');
      logDiv.style.color = color;
      logDiv.textContent = `> ${e.data.msg}`;
      consoleLogs.appendChild(logDiv);
      consoleLogs.scrollTop = consoleLogs.scrollHeight;
    }
  }
});
