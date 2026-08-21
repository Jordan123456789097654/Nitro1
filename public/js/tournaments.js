import { getSharedSocket } from './socket.js';
import { getCurrentUser } from './auth.js';

let activeTournamentsList = [];
let countdownInterval = null;
let currentScreenshotBase64 = '';

export function initTournaments() {
  const openModalBtn = document.getElementById('nav-tournaments-btn');
  const closeModalBtn = document.getElementById('tournaments-modal-close');
  const modal = document.getElementById('tournaments-modal');

  window.openTournamentsModal = () => {
    if (modal) {
      modal.classList.add('active');
      fetchTournaments();
    }
  };

  window.closeTournamentsModal = () => {
    if (modal) {
      modal.classList.remove('active');
    }
  };

  if (openModalBtn) {
    openModalBtn.addEventListener('click', () => {
      window.openTournamentsModal();
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      window.closeTournamentsModal();
    });
  }

  // Handle Screenshot Upload Preview & Base64 conversion
  const screenshotInput = document.getElementById('tour-screenshot-file');
  const fileStatus = document.getElementById('tour-file-status');
  const previewWrapper = document.getElementById('tour-screenshot-preview-wrapper');
  const previewImg = document.getElementById('tour-screenshot-preview-img');
  const removeScreenshotBtn = document.getElementById('tour-remove-screenshot-btn');

  if (screenshotInput) {
    screenshotInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      fileStatus.textContent = file.name;

      const reader = new FileReader();
      reader.onload = function(evt) {
        currentScreenshotBase64 = evt.target.result;
        previewImg.src = currentScreenshotBase64;
        previewWrapper.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });
  }

  if (removeScreenshotBtn) {
    removeScreenshotBtn.addEventListener('click', () => {
      currentScreenshotBase64 = '';
      screenshotInput.value = '';
      fileStatus.textContent = 'No file selected';
      previewWrapper.style.display = 'none';
      previewImg.src = '';
    });
  }

  // Form submission
  const submitForm = document.getElementById('tournament-submit-form');
  const feedback = document.getElementById('tour-submission-feedback');

  if (submitForm) {
    submitForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const user = getCurrentUser();
      if (!user) {
        showFeedback('You must be logged in to submit a score.', 'error');
        return;
      }

      if (activeTournamentsList.length === 0) {
        showFeedback('No active tournament found to submit to.', 'error');
        return;
      }

      const activeTour = activeTournamentsList[0];
      const score = document.getElementById('tour-score-input').value;

      if (!currentScreenshotBase64) {
        showFeedback('Please upload a screenshot proof of your score.', 'error');
        return;
      }

      showFeedback('Uploading submission...', 'info');

      try {
        const res = await fetch(`/api/tournaments/${activeTour.id}/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('nitro_jwt_token')}`
          },
          body: JSON.stringify({
            score: parseInt(score, 10),
            proofImageUrl: currentScreenshotBase64
          })
        });

        const data = await res.json();
        if (data.success) {
          showFeedback(data.message, 'success');
          submitForm.reset();
          if (removeScreenshotBtn) removeScreenshotBtn.click();
        } else {
          showFeedback(data.error || 'Failed to submit score.', 'error');
        }
      } catch (err) {
        showFeedback('Network error. Failed to connect to server.', 'error');
      }
    });
  }

  function showFeedback(msg, type) {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.style.display = 'block';
    if (type === 'error') {
      feedback.style.background = 'rgba(239, 68, 68, 0.15)';
      feedback.style.color = '#f87171';
      feedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    } else if (type === 'success') {
      feedback.style.background = 'rgba(16, 185, 129, 0.15)';
      feedback.style.color = '#34d399';
      feedback.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    } else {
      feedback.style.background = 'rgba(56, 189, 248, 0.15)';
      feedback.style.color = '#38bdf8';
      feedback.style.border = '1px solid rgba(56, 189, 248, 0.3)';
    }
  }

  // Socket event listening
  const socket = getSharedSocket();
  if (socket) {
    socket.on('tournament_created', () => {
      if (modal.classList.contains('active')) {
        fetchTournaments();
      }
    });

    socket.on('tournament_submission_reviewed', () => {
      if (modal.classList.contains('active')) {
        fetchTournaments();
      }
    });

    socket.on('tournament_closed', () => {
      if (modal.classList.contains('active')) {
        fetchTournaments();
      }
    });
  }
}

async function fetchTournaments() {
  const loading = document.getElementById('tournaments-modal-loading');
  const empty = document.getElementById('tournaments-modal-empty');
  const content = document.getElementById('tournaments-modal-content');

  try {
    const res = await fetch('/api/tournaments');
    const data = await res.json();
    
    if (loading) loading.style.display = 'none';

    if (data.success && data.tournaments && data.tournaments.length > 0) {
      activeTournamentsList = data.tournaments;
      if (empty) empty.style.display = 'none';
      if (content) content.style.display = 'block';

      renderTournamentDetails(data.tournaments[0]);
    } else {
      activeTournamentsList = [];
      if (empty) empty.style.display = 'block';
      if (content) content.style.display = 'none';
    }
  } catch (e) {
    console.error('fetchTournaments error:', e);
    if (loading) loading.style.display = 'none';
    if (empty) {
      empty.style.display = 'block';
      empty.innerHTML = `<strong>Failed to load tournaments.</strong><p style="font-size:0.8rem; margin-top:4px;">Please try again later.</p>`;
    }
  }
}

function renderTournamentDetails(tour) {
  const titleEl = document.getElementById('tour-detail-title');
  const descEl = document.getElementById('tour-detail-desc');
  const prizesEl = document.getElementById('tour-detail-prizes');
  const tbody = document.getElementById('tour-leaderboard-tbody');

  if (titleEl) titleEl.textContent = tour.title;
  if (descEl) descEl.textContent = tour.description || `Play ${tour.game_title} and upload screenshot proof of your high score!`;
  
  let rewardsStr = `🪙 ${tour.reward_coins} Coins + ${tour.reward_xp} XP`;
  if (tour.reward_flair) {
    rewardsStr += ` + 🏆 "${tour.reward_flair}" Flair`;
  }
  if (prizesEl) prizesEl.textContent = rewardsStr;

  startCountdown(tour.end_at);

  if (tbody) {
    if (tour.leaderboard && tour.leaderboard.length > 0) {
      tbody.innerHTML = tour.leaderboard.map((item, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
        const nameGlow = item.role === 'owner' ? 'color:#ef4444;font-weight:900;' : item.role === 'admin' ? 'color:#a855f7;font-weight:800;' : 'color:#fff;';
        
        return `
          <tr style="border-bottom: 1px solid var(--card-border);">
            <td style="padding: 10px; font-weight: 800; font-size: 1rem; color: #fbbf24;">${medal}</td>
            <td style="padding: 10px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.2rem;">${item.avatar_url || '👤'}</span>
              <span style="${nameGlow}">${item.display_name || item.username}</span>
            </td>
            <td style="padding: 10px; text-align: right; font-weight: 900; color: #38bdf8; font-size: 0.95rem;">${item.score.toLocaleString()}</td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="padding: 24px; text-align: center; color: var(--text-muted);">
            No approved scores yet. Be the first!
          </td>
        </tr>
      `;
    }
  }
}

function startCountdown(endTimeString) {
  if (countdownInterval) clearInterval(countdownInterval);

  const timerEl = document.getElementById('tour-detail-timer');
  const targetDate = new Date(endTimeString).getTime();

  function updateTimer() {
    const now = Date.now();
    const diff = targetDate - now;

    if (diff <= 0) {
      if (timerEl) timerEl.textContent = 'Ended';
      clearInterval(countdownInterval);
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    let displayStr = '';
    if (hours > 0) displayStr += `${hours}h `;
    displayStr += `${mins}m ${secs}s`;

    if (timerEl) {
      timerEl.textContent = displayStr;
      if (hours === 0 && mins < 10) {
        timerEl.style.color = '#ef4444';
      } else {
        timerEl.style.color = '#38bdf8';
      }
    }
  }

  updateTimer();
  countdownInterval = setInterval(updateTimer, 1000);
}
