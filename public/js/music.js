// Extended PRO Music Lounge, Playlists, Equalizer & Shuffle Engine
import { getCurrentUser } from './auth.js';

let activeProvider = 'youtube'; // 'youtube' or 'spotify'
let isPlayerVisible = false;
let currentTrackIndex = 0;
let isShuffle = false;
let isRepeat = false;

const DEFAULT_PLAYLISTS = {
  youtube: [
    { title: '🎧 Lofi Girl - Beats to Relax/Study to', id: 'jfKfPfyJRdk', thumb: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=200' },
    { title: '🌌 Synthwave Radio - Chill Retro Beats', id: '4xDzrJKXOOY', thumb: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=200' },
    { title: '🎮 Gaming Beats & Electronic Chill', id: '5qap5aO4i9A', thumb: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=200' },
    { title: '☕ Coffee Shop Chillhop Lounge', id: '7NOSDKb0HlU', thumb: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=200' },
    { title: '🌧️ Rainy Night Jazz Piano & Lo-Fi', id: 'lP26UCnoH9s', thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200' },
    { title: '⚡ Cyberpunk Synth Beats for Coding', id: 'DXf3QW7p3_s', thumb: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=200' }
  ],
  spotify: [
    { title: '💚 Lo-Fi Beats (Official Spotify)', embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXdLEN7aqioXM?utm_source=generator&theme=0' },
    { title: '⚡ Synthwave from Space', embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXdLEN7aqioXM?utm_source=generator&theme=0' },
    { title: '🎮 Video Game Soundtracks', embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXdfO2leQah3Q?utm_source=generator&theme=0' },
    { title: '📚 Deep Focus & Study Instrumental', embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWZeKCadgRdKQ?utm_source=generator&theme=0' }
  ]
};

export function initMusicPlayer() {
  setupMusicControls();
  renderMusicTracks();
  initEqualizerAnimation();
}

export function updateMusicPlayerVisibility() {
  const widget = document.getElementById('pro-music-dock');
  const proPlayerBtn = document.getElementById('pro-music-toggle-btn');
  if (proPlayerBtn) proPlayerBtn.style.display = 'inline-flex';
}

function setupMusicControls() {
  const toggleBtn = document.getElementById('pro-music-toggle-btn');
  const dock = document.getElementById('pro-music-dock');
  const closeBtn = document.getElementById('music-dock-close');
  const ytTab = document.getElementById('music-provider-yt');
  const spotifyTab = document.getElementById('music-provider-spotify');
  const customInput = document.getElementById('music-custom-url-input');
  const loadCustomBtn = document.getElementById('music-load-custom-btn');

  const prevBtn = document.getElementById('music-prev-btn');
  const nextBtn = document.getElementById('music-next-btn');
  const shuffleBtn = document.getElementById('music-shuffle-btn');
  const repeatBtn = document.getElementById('music-repeat-btn');

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

  if (ytTab && spotifyTab) {
    ytTab.addEventListener('click', () => {
      activeProvider = 'youtube';
      ytTab.classList.add('active');
      spotifyTab.classList.remove('active');
      renderMusicTracks();
      loadTrack(0);
    });

    spotifyTab.addEventListener('click', () => {
      activeProvider = 'spotify';
      spotifyTab.classList.add('active');
      ytTab.classList.remove('active');
      renderMusicTracks();
      loadTrack(0);
    });
  }

  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
      isShuffle = !isShuffle;
      shuffleBtn.style.color = isShuffle ? '#10b981' : 'var(--text-muted)';
      shuffleBtn.style.borderColor = isShuffle ? '#10b981' : 'var(--card-border)';
    });
  }

  if (repeatBtn) {
    repeatBtn.addEventListener('click', () => {
      isRepeat = !isRepeat;
      repeatBtn.style.color = isRepeat ? '#10b981' : 'var(--text-muted)';
      repeatBtn.style.borderColor = isRepeat ? '#10b981' : 'var(--card-border)';
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const tracks = DEFAULT_PLAYLISTS[activeProvider];
      currentTrackIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;
      loadTrack(currentTrackIndex);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const tracks = DEFAULT_PLAYLISTS[activeProvider];
      if (isShuffle) {
        currentTrackIndex = Math.floor(Math.random() * tracks.length);
      } else {
        currentTrackIndex = (currentTrackIndex + 1) % tracks.length;
      }
      loadTrack(currentTrackIndex);
    });
  }

  if (loadCustomBtn && customInput) {
    loadCustomBtn.addEventListener('click', () => {
      const raw = customInput.value.trim();
      if (!raw) return;

      const iframe = document.getElementById('music-player-iframe');
      if (!iframe) return;

      if (raw.includes('spotify.com')) {
        let embed = raw;
        if (!raw.includes('/embed/')) {
          embed = raw.replace('spotify.com/', 'spotify.com/embed/');
        }
        iframe.src = embed;
        document.getElementById('music-current-title').textContent = '🎵 Custom Spotify Stream';
      } else {
        let vId = raw;
        if (raw.includes('v=')) {
          vId = raw.split('v=')[1].split('&')[0];
        } else if (raw.includes('youtu.be/')) {
          vId = raw.split('youtu.be/')[1].split('?')[0];
        }
        iframe.src = `https://www.youtube-nocookie.com/embed/${vId}?autoplay=1&enablejsapi=1`;
        document.getElementById('music-current-title').textContent = '📺 Custom YouTube Track';
      }
      customInput.value = '';
    });
  }
}

function renderMusicTracks() {
  const container = document.getElementById('music-track-list');
  if (!container) return;

  const tracks = DEFAULT_PLAYLISTS[activeProvider];
  container.innerHTML = tracks.map((t, idx) => `
    <div class="music-track-item ${idx === currentTrackIndex ? 'active' : ''}" data-idx="${idx}">
      <span class="music-track-icon">${activeProvider === 'spotify' ? '🟢' : '🔴'}</span>
      <span class="music-track-name">${t.title}</span>
    </div>
  `).join('');

  container.querySelectorAll('.music-track-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx, 10);
      currentTrackIndex = idx;
      loadTrack(idx);
    });
  });
}

function loadTrack(idx) {
  const iframe = document.getElementById('music-player-iframe');
  const titleEl = document.getElementById('music-current-title');
  const tracks = DEFAULT_PLAYLISTS[activeProvider];
  const t = tracks[idx];
  if (!t || !iframe) return;

  if (titleEl) titleEl.textContent = t.title;

  if (activeProvider === 'youtube') {
    iframe.src = `https://www.youtube-nocookie.com/embed/${t.id}?autoplay=1&enablejsapi=1`;
  } else {
    iframe.src = t.embedUrl;
  }

  // Update active state in list
  const container = document.getElementById('music-track-list');
  if (container) {
    container.querySelectorAll('.music-track-item').forEach((it, i) => {
      it.classList.toggle('active', i === idx);
    });
  }
}

function initEqualizerAnimation() {
  const bars = document.querySelectorAll('.music-eq-bar');
  if (!bars.length) return;

  setInterval(() => {
    bars.forEach(bar => {
      const h = Math.floor(Math.random() * 18) + 4;
      bar.style.height = `${h}px`;
    });
  }, 180);
}
