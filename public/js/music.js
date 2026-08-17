// Universal Search-Based Music Player Core (No Premade Channels)
// Instant YouTube Music & Spotify Searching, Custom Queue Management & Universal Access

let userQueue = []; // Array of { id, title, artist, thumbnail, duration, url }
let searchResults = [];
let currentTrackIndex = -1;
let isPlayerVisible = false;
let isPlaying = false;
let isShuffle = false;
let isRepeat = false;

export function initMusicPlayer() {
  loadSavedQueue();
  setupMusicControls();
  setupSearchUI();
  renderQueueList();
  initEqualizerAnimation();
}

export function updateMusicPlayerVisibility() {
  const toggleBtn = document.getElementById('pro-music-toggle-btn');
  if (toggleBtn) toggleBtn.style.display = 'inline-flex';
}

function loadSavedQueue() {
  try {
    const saved = localStorage.getItem('nitro_user_music_queue');
    if (saved) userQueue = JSON.parse(saved);
  } catch (e) {
    userQueue = [];
  }
}

function saveQueue() {
  try {
    localStorage.setItem('nitro_user_music_queue', JSON.stringify(userQueue));
  } catch (e) {}
}

function setupSearchUI() {
  const searchInput = document.getElementById('music-search-input');
  const searchBtn = document.getElementById('music-search-btn');

  if (searchBtn && searchInput) {
    searchBtn.addEventListener('click', () => performMusicSearch(searchInput.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') performMusicSearch(searchInput.value);
    });
  }
}

async function performMusicSearch(queryStr) {
  const query = (queryStr || '').trim();
  if (!query) return;

  const resultsContainer = document.getElementById('music-search-results');
  const searchBtn = document.getElementById('music-search-btn');

  if (searchBtn) searchBtn.textContent = '⏳ Searching...';

  try {
    const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (searchBtn) searchBtn.textContent = '🔍 Search';

    if (data.success && Array.isArray(data.results) && data.results.length > 0) {
      searchResults = data.results;
      renderSearchResults(searchResults);
    } else {
      if (resultsContainer) {
        resultsContainer.innerHTML = '<div style="padding: 16px; color: #94a3b8; font-size: 0.8rem; text-align: center;">No music results found. Try another query or paste a direct YouTube / Spotify URL below.</div>';
      }
    }
  } catch (err) {
    if (searchBtn) searchBtn.textContent = '🔍 Search';
    if (resultsContainer) {
      resultsContainer.innerHTML = '<div style="padding: 16px; color: #ef4444; font-size: 0.8rem; text-align: center;">Network error searching music.</div>';
    }
  }
}

function renderSearchResults(results) {
  const container = document.getElementById('music-search-results');
  if (!container) return;

  container.style.display = 'flex';
  container.innerHTML = results.map((item, idx) => `
    <div class="music-search-item" data-idx="${idx}" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; margin-bottom: 6px; transition: all 0.2s ease;">
      <div style="display: flex; align-items: center; gap: 10px; overflow: hidden; flex: 1;">
        <img src="${escapeHtml(item.thumbnail)}" style="width: 38px; height: 38px; border-radius: 6px; object-fit: cover; flex-shrink: 0;">
        <div style="overflow: hidden;">
          <strong style="color: #fff; font-size: 0.82rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.title)}</strong>
          <span style="color: #94a3b8; font-size: 0.72rem;">${escapeHtml(item.artist)} • ${item.duration}</span>
        </div>
      </div>
      <div style="display: flex; gap: 4px; flex-shrink: 0;">
        <button class="music-search-play-btn btn-small" data-idx="${idx}" style="padding: 4px 8px; font-size: 0.72rem; background: #fbbf24; color: #000; font-weight: 800; border: none; border-radius: 6px; cursor: pointer;">▶️ Play</button>
        <button class="music-search-add-btn btn-small" data-idx="${idx}" style="padding: 4px 8px; font-size: 0.72rem; background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-weight: 800; border: 1px solid #38bdf8; border-radius: 6px; cursor: pointer;">➕ Queue</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.music-search-play-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const track = searchResults[idx];
      if (track) {
        userQueue.push(track);
        currentTrackIndex = userQueue.length - 1;
        saveQueue();
        renderQueueList();
        playTrack(currentTrackIndex);
      }
    });
  });

  container.querySelectorAll('.music-search-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const track = searchResults[idx];
      if (track) {
        userQueue.push(track);
        saveQueue();
        renderQueueList();
        btn.textContent = '✅ Added';
        setTimeout(() => { btn.textContent = '➕ Queue'; }, 1500);
      }
    });
  });
}

function setupMusicControls() {
  const toggleBtn = document.getElementById('pro-music-toggle-btn');
  const dock = document.getElementById('pro-music-dock');
  const closeBtn = document.getElementById('music-dock-close');

  const prevBtn = document.getElementById('music-prev-btn');
  const nextBtn = document.getElementById('music-next-btn');
  const shuffleBtn = document.getElementById('music-shuffle-btn');
  const repeatBtn = document.getElementById('music-repeat-btn');

  const customInput = document.getElementById('music-custom-url-input');
  const loadCustomBtn = document.getElementById('music-load-custom-btn');

  if (toggleBtn && dock) {
    toggleBtn.addEventListener('click', () => {
      isPlayerVisible = !isPlayerVisible;
      dock.style.display = isPlayerVisible ? 'flex' : 'none';
    });
  }

  if (closeBtn && dock) {
    closeBtn.addEventListener('click', () => {
      isPlayerVisible = false;
      dock.style.display = 'none';
    });
  }

  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
      isShuffle = !isShuffle;
      shuffleBtn.style.color = isShuffle ? '#10b981' : '#94a3b8';
    });
  }

  if (repeatBtn) {
    repeatBtn.addEventListener('click', () => {
      isRepeat = !isRepeat;
      repeatBtn.style.color = isRepeat ? '#10b981' : '#94a3b8';
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (userQueue.length === 0) return;
      currentTrackIndex = (currentTrackIndex - 1 + userQueue.length) % userQueue.length;
      playTrack(currentTrackIndex);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (userQueue.length === 0) return;
      if (isShuffle) {
        currentTrackIndex = Math.floor(Math.random() * userQueue.length);
      } else {
        currentTrackIndex = (currentTrackIndex + 1) % userQueue.length;
      }
      playTrack(currentTrackIndex);
    });
  }

  const volumeSlider = document.getElementById('music-volume-slider');
  const volumeText = document.getElementById('music-volume-text');
  const muteBtn = document.getElementById('music-mute-btn');
  let isMuted = false;
  let prevVolume = 80;

  function updateVolume(val) {
    const num = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
    if (volumeSlider) volumeSlider.value = num;
    if (volumeText) volumeText.textContent = `${num}%`;
    if (muteBtn) muteBtn.textContent = num === 0 ? '🔇' : '🔊';

    const iframe = document.getElementById('music-player-iframe');
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [num] }), '*');
      } catch(e) {}
    }
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      isMuted = false;
      updateVolume(e.target.value);
    });
  }

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      if (isMuted) {
        isMuted = false;
        updateVolume(prevVolume || 80);
      } else {
        prevVolume = parseInt(volumeSlider?.value || '80', 10);
        isMuted = true;
        updateVolume(0);
      }
    });
  }

  if (loadCustomBtn && customInput) {
    loadCustomBtn.addEventListener('click', () => {
      const raw = customInput.value.trim();
      if (!raw) return;

      let customTrack = null;

      if (raw.includes('list=')) {
        // YouTube Playlist Import!
        const playlistId = raw.split('list=')[1].split('&')[0];
        customTrack = {
          id: playlistId,
          title: `📜 YouTube Playlist (${playlistId.slice(0, 10)}...)`,
          artist: 'YouTube Playlist',
          thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100',
          duration: 'Playlist',
          url: `https://www.youtube-nocookie.com/embed/videoseries?list=${playlistId}&autoplay=1&enablejsapi=1`
        };
      } else {
        let vId = raw;
        if (raw.includes('v=')) vId = raw.split('v=')[1].split('&')[0];
        else if (raw.includes('youtu.be/')) vId = raw.split('youtu.be/')[1].split('?')[0];

        customTrack = {
          id: vId,
          title: raw.includes('spotify.com') ? '🎵 Spotify Track' : '📺 YouTube Stream',
          artist: 'User Link',
          thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100',
          duration: 'Stream',
          url: raw.includes('spotify.com') ? (raw.includes('/embed/') ? raw : raw.replace('spotify.com/', 'spotify.com/embed/')) : `https://www.youtube-nocookie.com/embed/${vId}?autoplay=1&enablejsapi=1`
        };
      }

      userQueue.push(customTrack);
      currentTrackIndex = userQueue.length - 1;
      saveQueue();
      renderQueueList();
      playTrack(currentTrackIndex);
      customInput.value = '';
    });
  }
}

function renderQueueList() {
  const container = document.getElementById('music-track-list');
  if (!container) return;

  if (userQueue.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 0.78rem;">Queue is empty. Search up any song above to play!</div>';
    return;
  }

  container.innerHTML = userQueue.map((item, idx) => `
    <div class="music-queue-item ${idx === currentTrackIndex ? 'active' : ''}" data-idx="${idx}" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-radius: 6px; cursor: pointer; margin-bottom: 4px; background: ${idx === currentTrackIndex ? 'rgba(251, 191, 36, 0.15)' : 'rgba(0,0,0,0.3)'}; border: 1px solid ${idx === currentTrackIndex ? '#fbbf24' : 'rgba(255,255,255,0.06)'};">
      <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1;">
        <span style="font-size: 0.8rem; color: #fbbf24; font-weight: 800;">${idx + 1}.</span>
        <span style="font-size: 0.78rem; font-weight: 700; color: ${idx === currentTrackIndex ? '#fbbf24' : '#fff'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.title)}</span>
      </div>
      <button class="remove-queue-btn" data-idx="${idx}" style="background: transparent; border: none; color: #94a3b8; font-size: 0.75rem; cursor: pointer; padding: 2px 6px;">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.music-queue-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-queue-btn')) return;
      const idx = parseInt(el.dataset.idx, 10);
      currentTrackIndex = idx;
      playTrack(idx);
    });
  });

  container.querySelectorAll('.remove-queue-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      userQueue.splice(idx, 1);
      if (currentTrackIndex === idx) {
        currentTrackIndex = Math.min(currentTrackIndex, userQueue.length - 1);
        if (currentTrackIndex >= 0) playTrack(currentTrackIndex);
      }
      saveQueue();
      renderQueueList();
    });
  });
}

function playTrack(idx) {
  const iframe = document.getElementById('music-player-iframe');
  const titleEl = document.getElementById('music-current-title');
  const track = userQueue[idx];
  if (!track || !iframe) return;

  if (titleEl) titleEl.textContent = `${track.title} • ${track.artist}`;
  iframe.src = track.url;
  isPlaying = true;
  renderQueueList();
}

function initEqualizerAnimation() {
  const bars = document.querySelectorAll('.music-eq-bar');
  if (!bars.length) return;

  setInterval(() => {
    bars.forEach(bar => {
      const h = isPlaying ? (Math.floor(Math.random() * 16) + 4) : 4;
      bar.style.height = `${h}px`;
    });
  }, 160);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
