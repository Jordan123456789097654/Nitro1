// Theme Presets and Custom Theme Creator Studio
export const BUILTIN_THEMES = [
  { id: 'cherry', name: 'Cherry Red', desc: 'Sleek dark theme with crimson neon accents', bg: '#090a0f', accent: '#eb2f5f', text: '#ffffff', cardbg: '#12141d', muted: '#94a3b8' },
  { id: 'midnight-blue', name: 'Midnight Blue', desc: 'Deep cosmic navy with electric cyan sparks', bg: '#050a18', accent: '#38bdf8', text: '#f0f9ff', cardbg: '#0a192f', muted: '#7dd3fc' },
  { id: 'obsidian', name: 'Obsidian Glow', desc: 'Pitch black stealth with royal indigo highlights', bg: '#000000', accent: '#818cf8', text: '#ffffff', cardbg: '#0f0f12', muted: '#808080' },
  { id: 'inferno', name: 'Inferno Fire', desc: 'Warm molten amber and blaze orange flames', bg: '#0c0502', accent: '#ff5722', text: '#fff7ed', cardbg: '#180e0a', muted: '#fdba74' },
  { id: 'deep-forest', name: 'Emerald Forest', desc: 'Lush dark evergreen with radioactive emerald', bg: '#030d07', accent: '#10b981', text: '#ecfdf5', cardbg: '#061a11', muted: '#6ee7b7' },
  { id: 'neon-night', name: 'Cyberpunk Neon', desc: 'Futuristic synth glow with cyan & magenta', bg: '#04000c', accent: '#00f0ff', text: '#fdf4ff', cardbg: '#120a20', muted: '#f0abfc' },
  { id: 'retro-vapor', name: 'Retro Vaporwave', desc: '80s nostalgic violet with pastel pink vibes', bg: '#12072b', accent: '#f472b6', text: '#fdf2f8', cardbg: '#1c103a', muted: '#c084fc' },
  { id: 'deep-ocean', name: 'Deep Abyss', desc: 'Atmospheric underwater sapphire and azure', bg: '#020c1b', accent: '#0284c7', text: '#f0f9ff', cardbg: '#051c36', muted: '#38bdf8' },
  { id: 'slate', name: 'Slate Minimal', desc: 'Modern monochrome slate and industrial gray', bg: '#0f172a', accent: '#94a3b8', text: '#f8fafc', cardbg: '#1e293b', muted: '#cbd5e1' },
  { id: 'gotham', name: 'Matrix Emerald', desc: 'Dark terminal green and cyber matrix styling', bg: '#08080a', accent: '#4ade80', text: '#f0fdf4', cardbg: '#0f1712', muted: '#86efac' },
  { id: 'solar-flare', name: 'Solar Gold', desc: 'Warm golden sunshine and radiant amber', bg: '#0d0901', accent: '#eab308', text: '#fefce8', cardbg: '#1d1505', muted: '#fde047' },
  { id: 'violet-dream', name: 'Violet Nebula', desc: 'Cosmic amethyst purple and starlight lavender', bg: '#0b0416', accent: '#a855f7', text: '#faf5ff', cardbg: '#1a0c2e', muted: '#d8b4fe' },
  { id: 'dracula', name: 'Dracula Dark', desc: 'Classic Dracula Dark with hot pink accents', bg: '#282a36', accent: '#ff79c6', text: '#f8f8f2', cardbg: '#44475a', muted: '#6272a4' }
];

export function getCustomThemes() {
  try {
    return JSON.parse(localStorage.getItem('nitro_custom_themes') || '[]');
  } catch (e) {
    return [];
  }
}

export function saveCustomThemes(themes) {
  localStorage.setItem('nitro_custom_themes', JSON.stringify(themes));
}

export function getAllThemes() {
  return [...BUILTIN_THEMES, ...getCustomThemes()];
}

export function initThemes() {
  const currentTheme = localStorage.getItem('nitro_theme') || 'cherry';
  applyTheme(currentTheme);
  renderThemeList();
  setupThemeListeners();
  setupCustomThemeCreator();
}

export function applyTheme(themeId) {
  const allThemes = getAllThemes();
  const found = allThemes.find(t => t.id === themeId) || BUILTIN_THEMES[0];

  document.documentElement.setAttribute('data-theme', found.id);
  localStorage.setItem('nitro_theme', found.id);

  // Apply custom CSS variables if custom or override
  if (found.isCustom || found.bg) {
    document.documentElement.style.setProperty('--bg-color', found.bg);
    document.documentElement.style.setProperty('--card-bg', found.cardbg);
    document.documentElement.style.setProperty('--accent-color', found.accent);
    document.documentElement.style.setProperty('--text-main', found.text);
    document.documentElement.style.setProperty('--text-muted', found.muted);
  }

  updatePreviewCard(found);
}

function updatePreviewCard(theme) {
  const titleEl = document.getElementById('preview-theme-title');
  const descEl = document.getElementById('preview-theme-desc');
  const swatchBg = document.getElementById('swatch-bg');
  const swatchAccent = document.getElementById('swatch-accent');
  const swatchText = document.getElementById('swatch-text');
  const swatchCard = document.getElementById('swatch-cardbg');
  const swatchMuted = document.getElementById('swatch-muted');

  if (titleEl) titleEl.textContent = theme.name;
  if (descEl) descEl.textContent = theme.desc || 'Custom designed theme preset';

  if (swatchBg) swatchBg.style.background = theme.bg;
  if (swatchAccent) swatchAccent.style.background = theme.accent;
  if (swatchText) swatchText.style.background = theme.text;
  if (swatchCard) swatchCard.style.background = theme.cardbg;
  if (swatchMuted) swatchMuted.style.background = theme.muted;
}

export function renderThemeList(filter = '') {
  const listEl = document.getElementById('themes-preset-list');
  if (!listEl) return;

  const current = localStorage.getItem('nitro_theme') || 'cherry';
  const allThemes = getAllThemes();
  const filtered = allThemes.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()));

  listEl.innerHTML = filtered.map(t => `
    <div style="display: flex; align-items: center; gap: 6px; width: 100%;">
      <button class="theme-item-btn ${t.id === current ? 'active' : ''}" data-theme-id="${t.id}" style="flex: 1;">
        <span class="theme-orb" style="background: ${t.accent}; color: ${t.accent};"></span>
        <span>${t.name} ${t.isCustom ? '⭐' : ''}</span>
      </button>
      ${t.isCustom ? `<button class="btn-small danger" style="padding: 4px 8px; flex-shrink: 0;" onclick="window.deleteCustomTheme('${t.id}')" title="Delete custom theme">✕</button>` : ''}
    </div>
  `).join('');

  listEl.querySelectorAll('.theme-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tid = btn.dataset.themeId;
      applyTheme(tid);
      renderThemeList(document.getElementById('theme-search-input')?.value || '');
    });
  });
}

function setupThemeListeners() {
  const searchInput = document.getElementById('theme-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderThemeList(e.target.value);
    });
  }

  window.deleteCustomTheme = (themeId) => {
    if (!confirm('Delete this custom theme?')) return;
    let custom = getCustomThemes();
    custom = custom.filter(t => t.id !== themeId);
    saveCustomThemes(custom);
    applyTheme('cherry');
    renderThemeList();
  };
}

function setupCustomThemeCreator() {
  const createBtn = document.getElementById('open-custom-theme-btn');
  const modal = document.getElementById('custom-theme-modal');
  const closeBtn = document.getElementById('custom-theme-close');
  const form = document.getElementById('custom-theme-form');

  const nameInput = document.getElementById('custom-theme-name');
  const bgInput = document.getElementById('custom-theme-bg');
  const cardInput = document.getElementById('custom-theme-card');
  const accentInput = document.getElementById('custom-theme-accent');
  const textInput = document.getElementById('custom-theme-text');
  const mutedInput = document.getElementById('custom-theme-muted');

  const previewBox = document.getElementById('custom-theme-preview-box');

  function updateLivePreview() {
    const bg = bgInput ? bgInput.value : '#090a0f';
    const card = cardInput ? cardInput.value : '#12141d';
    const accent = accentInput ? accentInput.value : '#38bdf8';
    const text = textInput ? textInput.value : '#ffffff';
    const muted = mutedInput ? mutedInput.value : '#94a3b8';

    if (previewBox) {
      previewBox.style.background = bg;
      previewBox.style.borderColor = accent;
      const cardEl = previewBox.querySelector('.preview-subcard');
      if (cardEl) {
        cardEl.style.background = card;
        cardEl.style.color = text;
      }
      const accentBtn = previewBox.querySelector('.preview-btn');
      if (accentBtn) {
        accentBtn.style.background = accent;
      }
    }

    // Apply live styles to the document while editing
    document.documentElement.style.setProperty('--bg-color', bg);
    document.documentElement.style.setProperty('--card-bg', card);
    document.documentElement.style.setProperty('--accent-color', accent);
    document.documentElement.style.setProperty('--text-main', text);
    document.documentElement.style.setProperty('--text-muted', muted);
  }

  [bgInput, cardInput, accentInput, textInput, mutedInput].forEach(inp => {
    if (inp) {
      inp.addEventListener('input', updateLivePreview);
      inp.addEventListener('change', updateLivePreview);
    }
  });

  if (createBtn) {
    createBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
        updateLivePreview();
      }
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
      modal.style.display = 'none';
      const currentTheme = localStorage.getItem('nitro_theme') || 'cherry';
      applyTheme(currentTheme);
    });
  }

  // Inline Theme Customizers in Settings Page
  const inBg = document.getElementById('inline-theme-bg');
  const inCard = document.getElementById('inline-theme-card');
  const inAccent = document.getElementById('inline-theme-accent');
  const inText = document.getElementById('inline-theme-text');

  function updateInlineTheme() {
    if (inBg) document.documentElement.style.setProperty('--bg-color', inBg.value);
    if (inCard) document.documentElement.style.setProperty('--card-bg', inCard.value);
    if (inAccent) document.documentElement.style.setProperty('--accent-color', inAccent.value);
    if (inText) document.documentElement.style.setProperty('--text-main', inText.value);
  }

  [inBg, inCard, inAccent, inText].forEach(inp => {
    if (inp) {
      inp.addEventListener('input', updateInlineTheme);
      inp.addEventListener('change', updateInlineTheme);
    }
  });

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'Custom Theme';
      const id = 'custom-' + Date.now();

      const newTheme = {
        id,
        name,
        desc: `Custom created by user: ${name}`,
        bg: bgInput ? bgInput.value : '#090a0f',
        cardbg: cardInput ? cardInput.value : '#12141d',
        accent: accentInput ? accentInput.value : '#38bdf8',
        text: textInput ? textInput.value : '#ffffff',
        muted: mutedInput ? mutedInput.value : '#94a3b8',
        isCustom: true
      };

      const customThemes = getCustomThemes();
      customThemes.push(newTheme);
      saveCustomThemes(customThemes);

      applyTheme(id);
      renderThemeList();

      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
      }
      alert(`✨ Custom theme "${name}" saved and applied!`);
    });
  }
}
