// NITRO 3.0 Interactive Widgets & Focus Synthesizers

let audioCtx = null;
let rainNode = null;
let wavesNode = null;
let lofiInterval = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Synthesize Ambient Sounds (Firewall-Proof)
window.toggleAmbient = function (type) {
  const rainBtn = document.getElementById('ambient-play-rain');
  const lofiBtn = document.getElementById('ambient-play-lofi');
  const wavesBtn = document.getElementById('ambient-play-waves');

  try {
    const ctx = getAudioContext();

    if (type === 'rain') {
      if (rainNode) {
        rainNode.source.stop();
        rainNode = null;
        if (rainBtn) rainBtn.textContent = 'Play';
      } else {
        // Rain White Noise synthesis with Lowpass filter
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(550, ctx.currentTime);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.12, ctx.currentTime);

        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        whiteNoise.start();
        rainNode = { source: whiteNoise, gain: gain };
        if (rainBtn) rainBtn.textContent = 'Stop ⏹️';
      }
    }

    if (type === 'waves') {
      if (wavesNode) {
        wavesNode.source.stop();
        wavesNode.lfo.stop();
        wavesNode = null;
        if (wavesBtn) wavesBtn.textContent = 'Play';
      } else {
        // Ocean waves white noise modulated by a slow LFO
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(300, ctx.currentTime);
        filter.Q.setValueAtTime(0.8, ctx.currentTime);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.04, ctx.currentTime);

        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.08, ctx.currentTime); // 1 cycle per 12 seconds

        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0.03, ctx.currentTime);

        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);

        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        lfo.start();
        whiteNoise.start();

        wavesNode = { source: whiteNoise, gain: gain, lfo: lfo };
        if (wavesBtn) wavesBtn.textContent = 'Stop ⏹️';
      }
    }

    if (type === 'lofi') {
      if (lofiInterval) {
        clearInterval(lofiInterval);
        lofiInterval = null;
        if (lofiBtn) lofiBtn.textContent = 'Play';
      } else {
        const chords = [
          [130.81, 164.81, 196.00, 246.94], // Cmaj7
          [146.83, 174.61, 220.00, 261.63], // Dm7
          [164.81, 196.00, 246.94, 293.66], // Em7
          [174.61, 220.00, 261.63, 329.63]  // Fmaj7
        ];
        let chordIndex = 0;

        const playNote = (freq, time, duration) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, time);

          gain.gain.setValueAtTime(0, time);
          gain.gain.linearRampToValueAtTime(0.05, time + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

          // Add a lowpass filter to make it sound muffled/lofi
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(800, time);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start(time);
          osc.stop(time + duration);
        };

        const playChord = () => {
          const now = ctx.currentTime;
          const notes = chords[chordIndex];
          notes.forEach((freq, idx) => {
            playNote(freq, now + idx * 0.18, 3.5);
          });
          chordIndex = (chordIndex + 1) % chords.length;
        };

        playChord();
        lofiInterval = setInterval(playChord, 4500);
        if (lofiBtn) lofiBtn.textContent = 'Stop ⏹️';
      }
    }
  } catch (e) {
    console.error('Audio synthesis failed:', e.message);
  }
};

// Pomodoro Timer Engine
let pomodoroInterval = null;
let pomodoroSeconds = 25 * 60;

window.setStudyDuration = function (mins) {
  if (pomodoroInterval) {
    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
  }
  pomodoroSeconds = mins * 60;
  updateTimerDisplay();
};

function updateTimerDisplay() {
  const display = document.getElementById('study-timer-display');
  if (!display) return;
  const m = Math.floor(pomodoroSeconds / 60).toString().padStart(2, '0');
  const s = (pomodoroSeconds % 60).toString().padStart(2, '0');
  display.textContent = `${m}:${s}`;
}

export function initStudyTimer() {
  const openBtn = document.getElementById('open-study-timer-btn');
  const modal = document.getElementById('study-timer-modal');
  const closeBtn = document.getElementById('study-timer-modal-close');
  const startBtn = document.getElementById('study-timer-start');
  const pauseBtn = document.getElementById('study-timer-pause');
  const resetBtn = document.getElementById('study-timer-reset');

  if (openBtn && modal) {
    openBtn.onclick = () => modal.classList.add('active');
  }
  if (closeBtn && modal) {
    closeBtn.onclick = () => modal.classList.remove('active');
  }

  if (startBtn) {
    startBtn.onclick = () => {
      if (pomodoroInterval) return;
      pomodoroInterval = setInterval(() => {
        if (pomodoroSeconds > 0) {
          pomodoroSeconds--;
          updateTimerDisplay();
        } else {
          clearInterval(pomodoroInterval);
          pomodoroInterval = null;
          alert('🔔 Time is up! Great focus session.');
        }
      }, 1000);
    };
  }

  if (pauseBtn) {
    pauseBtn.onclick = () => {
      if (pomodoroInterval) {
        clearInterval(pomodoroInterval);
        pomodoroInterval = null;
      }
    };
  }

  if (resetBtn) {
    resetBtn.onclick = () => {
      window.setStudyDuration(25);
    };
  }
}



// Paint Canvas Deluxe Logic
export function initPaintCanvas() {
  const canvas = document.getElementById('paint-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let drawing = false;

  const colorInput = document.getElementById('paint-color');
  const sizeInput = document.getElementById('paint-size');
  const sizeVal = document.getElementById('paint-size-val');

  const btnBrush = document.getElementById('paint-tool-brush');
  const btnEraser = document.getElementById('paint-tool-eraser');
  const btnClear = document.getElementById('paint-tool-clear');
  const btnDownload = document.getElementById('paint-tool-download');

  let strokeColor = '#38bdf8';
  let strokeWidth = 5;
  let isEraser = false;

  // Resize canvas to match container size
  const resizeCanvas = () => {
    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  sizeInput.oninput = (e) => {
    strokeWidth = e.target.value;
    sizeVal.textContent = strokeWidth;
  };

  colorInput.onchange = (e) => {
    strokeColor = e.target.value;
  };

  btnBrush.onclick = () => {
    isEraser = false;
    btnBrush.style.background = 'var(--accent-gradient)';
    btnBrush.style.color = '#fff';
    btnEraser.style.background = '#141724';
    btnEraser.style.borderColor = 'var(--card-border)';
  };

  btnEraser.onclick = () => {
    isEraser = true;
    btnEraser.style.background = 'var(--accent-gradient)';
    btnEraser.style.color = '#fff';
    btnBrush.style.background = '#141724';
    btnBrush.style.borderColor = 'var(--card-border)';
  };

  btnClear.onclick = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  btnDownload.onclick = () => {
    const link = document.createElement('a');
    link.download = 'nitro_paint_drawing.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDraw = (e) => {
    drawing = true;
    ctx.beginPath();
    const pos = getPos(e);
    ctx.moveTo(pos.x, pos.y);
    e.preventDefault();
  };

  const draw = (e) => {
    if (!drawing) return;
    const pos = getPos(e);
    ctx.strokeStyle = isEraser ? '#ffffff' : strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    e.preventDefault();
  };

  const endDraw = () => {
    drawing = false;
  };

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);

  canvas.addEventListener('touchstart', startDraw);
  canvas.addEventListener('touchmove', draw);
  canvas.addEventListener('touchend', endDraw);
}



// Mini-Games Integration inside Study Break Overlay
let activeGameLoop = null;

window.closeMiniGame = function () {
  const container = document.getElementById('mini-arcade-container');
  const frame = document.getElementById('mini-game-frame');
  if (container) container.style.display = 'none';
  if (frame) frame.innerHTML = '';
  if (activeGameLoop) {
    clearInterval(activeGameLoop);
    activeGameLoop = null;
  }
};

window.startMiniGame = function (type) {
  window.closeMiniGame();

  const container = document.getElementById('mini-arcade-container');
  const frame = document.getElementById('mini-game-frame');
  const title = document.getElementById('mini-game-title');

  if (!container || !frame) return;

  container.style.display = 'block';

  if (type === 'snake') {
    title.textContent = '🐍 Classic Snake';
    frame.innerHTML = `
      <div style="text-align: center;">
        <canvas id="mini-snake-canvas" width="200" height="200" style="background:#090a0f; border: 2px solid #38bdf8; display:block; margin: 0 auto;"></canvas>
        <div id="mini-snake-score" style="color:#fbbf24; font-weight:800; font-size:0.9rem; margin-top:8px;">Score: 0</div>
      </div>
    `;

    const canvas = document.getElementById('mini-snake-canvas');
    const ctx = canvas.getContext('2d');
    const gridSize = 10;
    let snake = [{ x: 50, y: 50 }, { x: 40, y: 50 }, { x: 30, y: 50 }];
    let dx = gridSize;
    let dy = 0;
    let food = { x: 100, y: 100 };
    let score = 0;

    const generateFood = () => {
      food.x = Math.floor(Math.random() * (canvas.width / gridSize)) * gridSize;
      food.y = Math.floor(Math.random() * (canvas.height / gridSize)) * gridSize;
    };

    const handleKey = (e) => {
      if (e.key === 'ArrowUp' && dy === 0) { dx = 0; dy = -gridSize; e.preventDefault(); }
      else if (e.key === 'ArrowDown' && dy === 0) { dx = 0; dy = gridSize; e.preventDefault(); }
      else if (e.key === 'ArrowLeft' && dx === 0) { dx = -gridSize; dy = 0; e.preventDefault(); }
      else if (e.key === 'ArrowRight' && dx === 0) { dx = gridSize; dy = 0; e.preventDefault(); }
    };
    window.addEventListener('keydown', handleKey);

    const update = () => {
      // Move head
      const head = { x: snake[0].x + dx, y: snake[0].y + dy };
      
      // Check wall collision
      if (head.x < 0 || head.x >= canvas.width || head.y < 0 || head.y >= canvas.height) {
        alert('💥 Game Over! Score: ' + score);
        window.closeMiniGame();
        window.removeEventListener('keydown', handleKey);
        return;
      }

      // Check self collision
      for (const part of snake) {
        if (part.x === head.x && part.y === head.y) {
          alert('💥 Game Over! Score: ' + score);
          window.closeMiniGame();
          window.removeEventListener('keydown', handleKey);
          return;
        }
      }

      snake.unshift(head);

      // Check food
      if (head.x === food.x && head.y === food.y) {
        score += 10;
        const scoreVal = document.getElementById('mini-snake-score');
        if (scoreVal) scoreVal.textContent = 'Score: ' + score;
        generateFood();
      } else {
        snake.pop();
      }

      // Draw
      ctx.fillStyle = '#090a0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#10b981';
      for (const part of snake) {
        ctx.fillRect(part.x, part.y, gridSize - 1, gridSize - 1);
      }

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(food.x, food.y, gridSize - 1, gridSize - 1);
    };

    activeGameLoop = setInterval(update, 150);
  }

  if (type === 'ttt') {
    title.textContent = '❌ Tic-Tac-Toe';
    frame.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(3, 60px); gap:6px; justify-content:center; margin: 10px auto;">
        ${Array.from({ length: 9 }, (_, i) => `
          <button class="ttt-cell" data-idx="${i}" onclick="window.playTTTStep(${i})" style="width:60px; height:60px; font-size:1.8rem; font-weight:800; color:#fff; background:#1e293b; border:1px solid #333; cursor:pointer; border-radius:6px; display:flex; align-items:center; justify-content:center;"></button>
        `).join('')}
      </div>
    `;

    window.tttBoard = Array(9).fill(null);
    window.tttActive = true;
  }
};

window.playTTTStep = function (idx) {
  if (!window.tttActive || window.tttBoard[idx]) return;

  const cells = document.querySelectorAll('.ttt-cell');
  
  // Player Move
  window.tttBoard[idx] = 'X';
  cells[idx].textContent = 'X';
  cells[idx].style.color = '#38bdf8';

  if (checkTTTWin('X')) {
    alert('🎉 You Won!');
    window.tttActive = false;
    return;
  }

  if (!window.tttBoard.includes(null)) {
    alert('🤝 Draw Game!');
    window.tttActive = false;
    return;
  }

  // AI Move (Random simple move)
  window.tttActive = false;
  setTimeout(() => {
    const emptyIndices = window.tttBoard
      .map((val, i) => (val === null ? i : null))
      .filter((v) => v !== null);

    if (emptyIndices.length > 0) {
      const aiChoice = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
      window.tttBoard[aiChoice] = 'O';
      cells[aiChoice].textContent = 'O';
      cells[aiChoice].style.color = '#f43f5e';

      if (checkTTTWin('O')) {
        alert('🤖 AI Won! Better luck next time.');
        window.tttActive = false;
        return;
      }
    }
    window.tttActive = true;
  }, 300);
};

function checkTTTWin(player) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
  ];
  return lines.some(([a, b, c]) => {
    return window.tttBoard[a] === player && window.tttBoard[b] === player && window.tttBoard[c] === player;
  });
}
