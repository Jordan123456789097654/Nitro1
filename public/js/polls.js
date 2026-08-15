function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function initPolls() {
  window.loadPolls = loadPolls;
  loadPolls();
  setupPollModal();
  loadGameSuggestions();
  setupGameSuggestionForm();
}

export async function loadPolls() {
  const container = document.getElementById('community-polls-container');
  if (!container) return;

  try {
    const res = await fetch('/api/polls');
    const data = await res.json();
    const polls = data.polls || [];

    if (polls.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">No active polls currently running.</div>';
      return;
    }

    container.innerHTML = polls.map(p => renderPollCard(p)).join('');

    // Attach vote click listeners
    container.querySelectorAll('.poll-option-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const user = getCurrentUser();
        if (!user) {
          alert('Please log in to vote in community polls!');
          return;
        }

        const pollId = btn.dataset.pollId;
        const optIdx = parseInt(btn.dataset.optIdx, 10);

        try {
          const vRes = await fetch(`/api/polls/${pollId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ optionIndex: optIdx })
          });
          const vData = await vRes.json();
          if (vRes.ok) {
            loadPolls();
          } else {
            alert(vData.error || 'Failed to submit vote.');
          }
        } catch (e) {
          alert('Error submitting vote.');
        }
      });
    });
  } catch (err) {
    console.error('Polls loading error:', err);
  }
}

function renderPollCard(poll) {
  const options = Array.isArray(poll.options) ? poll.options : (typeof poll.options === 'string' ? JSON.parse(poll.options) : []);
  const totalVotes = parseInt(poll.totalVotes !== undefined ? poll.totalVotes : (poll.total_votes || 0), 10);

  const optionsHtml = options.map((opt, idx) => {
    const optText = typeof opt === 'object' && opt !== null ? (opt.text || '') : String(opt);
    const count = typeof opt === 'object' && opt !== null ? (opt.votes || 0) : 0;
    const pct = typeof opt === 'object' && opt !== null ? (opt.percentage || 0) : (totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0);
    const isSelected = poll.userVotedOption === idx || poll.user_voted_option === idx;

    return `
      <div class="poll-option-row">
        <button class="poll-option-btn ${isSelected ? 'voted' : ''}" data-poll-id="${poll.id}" data-opt-idx="${idx}">
          <div class="poll-bar-fill" style="width: ${pct}%;"></div>
          <div class="poll-option-content">
            <span class="poll-option-text">${isSelected ? '✓ ' : ''}${escapeHtml(optText)}</span>
            <span class="poll-option-pct"><strong>${pct}%</strong> (${count})</span>
          </div>
        </button>
      </div>
    `;
  }).join('');

  return `
    <div class="poll-card" id="poll-${poll.id}">
      <div class="poll-header">
        <span class="poll-badge">📊 COMMUNITY VOTE</span>
        <span class="poll-total-badge">${totalVotes} ${totalVotes === 1 ? 'Vote' : 'Votes'}</span>
      </div>
      <h3 class="poll-question">${escapeHtml(poll.question)}</h3>
      <div class="poll-options-list">
        ${optionsHtml}
      </div>
      <div class="poll-footer">
        <span>Created by <strong>${escapeHtml(poll.created_by || 'System')}</strong></span>
      </div>
    </div>
  `;
}

function setupPollModal() {
  const openBtn = document.getElementById('open-polls-modal-btn');
  const modal = document.getElementById('polls-modal');
  const closeBtn = document.getElementById('polls-modal-close');

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      loadPolls();
      modal.classList.add('active');
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }
}

export async function loadGameSuggestions() {
  const container = document.getElementById('game-suggestions-list');
  if (!container) return;

  try {
    const res = await fetch('/api/polls/suggestions');
    const data = await res.json();
    const suggestions = data.suggestions || [];

    if (suggestions.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 24px;">No game requests submitted yet. Be the first player to request a game below!</div>';
      return;
    }

    const { getCurrentUser } = await import('./auth.js');
    const user = getCurrentUser();

    container.innerHTML = suggestions.map(s => {
      let voters = [];
      try { voters = typeof s.voters === 'string' ? JSON.parse(s.voters) : s.voters; } catch (e) {}
      const hasUpvoted = user && voters.includes(user.username);

      return `
        <div style="background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-md); padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 12px; backdrop-filter: blur(10px);">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="color: var(--text-main); font-size: 1rem;">🎮 ${escapeHtml(s.title)}</strong>
              <span style="font-size: 0.72rem; color: var(--text-muted);">by @${escapeHtml(s.username)}</span>
            </div>
            ${s.description ? `<p style="font-size: 0.82rem; color: var(--text-muted); margin: 4px 0 0;">${escapeHtml(s.description)}</p>` : ''}
            ${s.game_url ? `<a href="${escapeHtml(s.game_url)}" target="_blank" style="font-size: 0.75rem; color: #38bdf8; text-decoration: none; display: inline-block; margin-top: 4px;">🔗 Reference Link</a>` : ''}
          </div>
          <button class="btn-pill ${hasUpvoted ? 'active' : 'primary'}" data-suggestion-id="${s.id}" style="display: flex; align-items: center; gap: 6px; padding: 8px 16px; font-weight: 800; font-size: 0.88rem; flex-shrink: 0; background: ${hasUpvoted ? '#10b981' : 'var(--accent-color)'}; color: #000;">
            <span>👍</span>
            <span>${s.upvotes}</span>
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('button[data-suggestion-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { getCurrentUser } = await import('./auth.js');
        const user = getCurrentUser();
        if (!user) return alert('Please log in to upvote game suggestions!');
        const id = btn.dataset.suggestionId;
        try {
          const uRes = await fetch(`/api/polls/suggestions/${id}/upvote`, { method: 'POST' });
          if (uRes.ok) {
            loadGameSuggestions();
          }
        } catch (e) {}
      });
    });
  } catch (err) {}
}

function setupGameSuggestionForm() {
  const form = document.getElementById('game-suggestion-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { getCurrentUser } = await import('./auth.js');
    const user = getCurrentUser();
    if (!user) return alert('Please log in to submit a game request.');

    const titleInput = document.getElementById('suggest-game-title');
    const descInput = document.getElementById('suggest-game-desc');
    const urlInput = document.getElementById('suggest-game-url');

    const title = titleInput ? titleInput.value.trim() : '';
    const description = descInput ? descInput.value.trim() : '';
    const gameUrl = urlInput ? urlInput.value.trim() : '';

    if (!title) return alert('Please enter a game title.');

    try {
      const res = await fetch('/api/polls/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, gameUrl })
      });
      const data = await res.json();
      if (res.ok) {
        if (titleInput) titleInput.value = '';
        if (descInput) descInput.value = '';
        if (urlInput) urlInput.value = '';
        loadGameSuggestions();
        alert('🎉 Game suggestion submitted! Community members can now vote on it.');
      } else {
        alert(data.error || 'Failed to submit game suggestion.');
      }
    } catch (err) {
      alert('Error submitting game suggestion.');
    }
  });
}
