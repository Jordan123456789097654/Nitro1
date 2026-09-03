// Client-side Hardware Fingerprint Generator & Global Performance Controller

function getOrCreateHardwareId() {
  try {
    const existing = localStorage.getItem('nitro_hwid');
    if (existing && existing.startsWith('HWID-') && existing.length >= 16) {
      return existing;
    }

    const components = [
      screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
      window.devicePixelRatio || 1,
      navigator.hardwareConcurrency || 2,
      navigator.deviceMemory || 4,
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      navigator.userAgent || '',
      navigator.language || ''
    ];

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px "Arial"';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('NitroOS,HWID_v1!', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('NitroOS,HWID_v1!', 4, 17);
        components.push(canvas.toDataURL());
      }
    } catch (e) {}

    const rawString = components.join('###');
    let hash1 = 0x811c9dc5, hash2 = 0x01000193;
    for (let i = 0; i < rawString.length; i++) {
      const c = rawString.charCodeAt(i);
      hash1 = Math.imul(hash1 ^ c, 0x01000193);
      hash2 = Math.imul(hash2 ^ c, 0x811c9dc5);
    }
    
    const hwid = 'HWID-' + Math.abs(hash1).toString(16).padStart(8, '0') + Math.abs(hash2).toString(16).padStart(8, '0') + Date.now().toString(16).slice(-6);
    localStorage.setItem('nitro_hwid', hwid);
    return hwid;
  } catch (e) {
    const fallback = 'HWID-' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    try { localStorage.setItem('nitro_hwid', fallback); } catch(err) {}
    return fallback;
  }
}

const currentHwid = getOrCreateHardwareId();
window.__nitro_hwid__ = currentHwid;

export const getHardwareId = () => localStorage.getItem('nitro_hwid') || window.__nitro_hwid__ || currentHwid;

const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
  options = options || {};
  const hwid = getHardwareId();

  if (options.headers instanceof Headers) {
    if (hwid) options.headers.set('X-Hardware-Id', hwid);
  } else if (typeof options.headers === 'object' && options.headers !== null) {
    options.headers['X-Hardware-Id'] = hwid;
  } else {
    options.headers = { 'X-Hardware-Id': hwid };
  }
  return originalFetch.call(this, url, options);
};

export function initPerformanceSettings() {
  const potatoCheck = document.getElementById('perf-potato-checkbox');
  const animCheck = document.getElementById('perf-disable-anim-checkbox');
  const pollCheck = document.getElementById('perf-slow-poll-checkbox');
  const glassCheck = document.getElementById('disable-glass-checkbox');
  const suspenderCheck = document.getElementById('perf-tab-suspender-checkbox');

  const prefs = JSON.parse(localStorage.getItem('nitro_perf_settings') || '{}');

  if (potatoCheck) potatoCheck.checked = Boolean(prefs.potatoMode);
  if (animCheck) animCheck.checked = Boolean(prefs.disableAnim);
  if (pollCheck) pollCheck.checked = Boolean(prefs.slowPolling);
  if (glassCheck) glassCheck.checked = Boolean(prefs.disableGlass || localStorage.getItem('nitro_disable_glass') === 'true');
  if (suspenderCheck) suspenderCheck.checked = Boolean(prefs.tabSuspender !== false);

  applyPerformanceMode();

  potatoCheck?.addEventListener('change', (e) => {
    savePerfPref('potatoMode', e.target.checked);
    applyPerformanceMode();
  });

  animCheck?.addEventListener('change', (e) => {
    savePerfPref('disableAnim', e.target.checked);
    applyPerformanceMode();
  });

  pollCheck?.addEventListener('change', (e) => {
    savePerfPref('slowPolling', e.target.checked);
    applyPerformanceMode();
  });

  glassCheck?.addEventListener('change', (e) => {
    savePerfPref('disableGlass', e.target.checked);
    localStorage.setItem('nitro_disable_glass', e.target.checked ? 'true' : 'false');
    applyPerformanceMode();
  });

  suspenderCheck?.addEventListener('change', (e) => {
    savePerfPref('tabSuspender', e.target.checked);
  });
}

document.addEventListener('visibilitychange', () => {
  const prefs = JSON.parse(localStorage.getItem('nitro_perf_settings') || '{}');
  if (prefs.tabSuspender === false) return;

  const iframes = document.querySelectorAll('iframe.game-viewport-iframe, iframe.game-iframe');
  if (document.hidden) {
    iframes.forEach(frame => {
      if (frame.src && !frame.dataset.suspendedSrc && frame.src !== 'about:blank') {
        frame.dataset.suspendedSrc = frame.src;
        try { frame.contentWindow.stop(); } catch(e) {}
      }
    });
  } else {
    iframes.forEach(frame => {
      if (frame.dataset.suspendedSrc) {
        frame.src = frame.dataset.suspendedSrc;
        delete frame.dataset.suspendedSrc;
      }
    });
  }
});

function savePerfPref(key, val) {
  const prefs = JSON.parse(localStorage.getItem('nitro_perf_settings') || '{}');
  prefs[key] = Boolean(val);
  localStorage.setItem('nitro_perf_settings', JSON.stringify(prefs));
}

export function applyPerformanceMode() {
  const prefs = JSON.parse(localStorage.getItem('nitro_perf_settings') || '{}');
  const body = document.body;
  if (!body) return;

  if (prefs.potatoMode) {
    body.classList.add('perf-potato-mode');
  } else {
    body.classList.remove('perf-potato-mode');
  }

  if (prefs.disableAnim) {
    body.classList.add('perf-no-anim');
  } else {
    body.classList.remove('perf-no-anim');
  }

  if (prefs.disableGlass || localStorage.getItem('nitro_disable_glass') === 'true') {
    body.classList.add('perf-no-glass');
  } else {
    body.classList.remove('perf-no-glass');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initPerformanceSettings();
    applyPerformanceMode();
  });
} else {
  initPerformanceSettings();
  applyPerformanceMode();
}
