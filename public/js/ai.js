// Nitro AI Chatbot & Academic Tutor Engine (Multimodal Vision & PDF/Document Upload Support)
let conversationHistory = [];
let currentSelectedFile = null;

export function initAiHelper() {
  setupAiModal();
  setupAiChat();
  setupFileUpload();
  checkAiStatusAndUpdateUi();
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

  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', () => {
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const isImg = file.type.startsWith('image/');
      const reader = new FileReader();

      reader.onload = (event) => {
        const base64Data = event.target.result;
        currentSelectedFile = {
          name: file.name,
          type: file.type || 'application/octet-stream',
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
      };

      reader.readAsDataURL(file);
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', clearSelectedFile);
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
        appendMessage('bot', '👋 **Chat conversation cleared.** Ready for your next homework prompt or document upload!', getFormattedTime());
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

        const requestBody = {
          message: query,
          userPrompt: query,
          history: conversationHistory
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
      ${!isUser ? `<button class="copy-ai-ans-btn" style="margin-top: 10px; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">📋 Copy Answer</button>` : ''}
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

function formatAiText(text) {
  if (!text) return '';
  let formatted = escapeHtml(text)
    .replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre style="background: rgba(0,0,0,0.5); padding: 12px; border-radius: 8px; border: 1px solid var(--card-border); overflow-x: auto; margin: 8px 0; font-family: monospace; font-size: 0.85rem; color: var(--accent-color);"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.4); padding: 2px 6px; border-radius: 4px; color: var(--accent-color); font-family: monospace;">$1</code>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/### (.*?)\n/g, '<h4 style="color: var(--accent-color); margin: 10px 0 6px; font-size: 0.95rem;">$1</h4>')
    .replace(/\n/g, '<br>');
  return formatted;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
