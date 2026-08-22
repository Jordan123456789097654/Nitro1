import { getCurrentUser } from './auth.js';

let currentChannelId = null;
let currentSocket = null;
let currentGameType = null; // 'chess' | 'checkers' | null
let localPlayerColor = null; // 'white' | 'black' | null (or 'red' | 'black' for checkers)
let turn = 'white'; // 'white' | 'black'

// Seating
let seats = {
  white: null, // { username, displayName }
  black: null
};

// 8x8 Board Matrix
let board = Array(8).fill(null).map(() => Array(8).fill(null));

// Selection states
let selectedCell = null; // { row, col }

// Piece unicode definitions
const CHESS_PIECES = {
  black: {
    king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟'
  },
  white: {
    king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙'
  }
};

const CHECKERS_PIECES = {
  red: '🔴',
  black: '⚫',
  redKing: '👑🔴',
  blackKing: '👑⚫'
};

export function initBoardGames(socket, channelId) {
  currentSocket = socket;
  currentChannelId = channelId;

  // Toggle container visibility
  const container = document.getElementById('voice-games-container');
  if (container) container.style.display = 'block';

  // Bind game select buttons
  const chessBtn = document.getElementById('voice-game-select-chess');
  const checkersBtn = document.getElementById('voice-game-select-checkers');
  const quitBtn = document.getElementById('voice-game-quit');
  const restartBtn = document.getElementById('btn-game-restart');
  const claimWhiteBtn = document.getElementById('btn-claim-white');
  const claimBlackBtn = document.getElementById('btn-claim-black');

  if (chessBtn) {
    chessBtn.onclick = () => startNewGame('chess');
  }
  if (checkersBtn) {
    checkersBtn.onclick = () => startNewGame('checkers');
  }
  if (quitBtn) {
    quitBtn.onclick = quitGame;
  }
  if (restartBtn) {
    restartBtn.onclick = () => triggerAction('reset', { gameType: currentGameType });
  }

  if (claimWhiteBtn) {
    claimWhiteBtn.onclick = () => claimSeat('white');
  }
  if (claimBlackBtn) {
    claimBlackBtn.onclick = () => claimSeat('black');
  }

  // Socket Listener for game state sync
  socket.off('voice_game_action');
  socket.on('voice_game_action', ({ from, action, data }) => {
    handleIncomingAction(action, data);
  });

  // Default state: select prompt
  updateStatusLabel();
  renderBoard();
}

export function cleanupBoardGames() {
  currentChannelId = null;
  currentGameType = null;
  localPlayerColor = null;
  seats = { white: null, black: null };
  board = Array(8).fill(null).map(() => Array(8).fill(null));
  
  const container = document.getElementById('voice-games-container');
  if (container) container.style.display = 'none';
}

function startNewGame(gameType) {
  currentGameType = gameType;
  turn = 'white';
  
  // Show game-specific elements
  const quitBtn = document.getElementById('voice-game-quit');
  const restartBtn = document.getElementById('btn-game-restart');
  if (quitBtn) quitBtn.style.display = 'inline-block';
  if (restartBtn) restartBtn.style.display = 'inline-block';

  // Set up seat labels based on game type (Red/Black for checkers, White/Black for chess)
  const whiteLabel = document.getElementById('white-seat-label');
  const blackLabel = document.getElementById('black-seat-label');
  if (whiteLabel) whiteLabel.textContent = gameType === 'checkers' ? 'Red' : 'White';
  if (blackLabel) blackLabel.textContent = 'Black';

  initializeBoardState(gameType);
  triggerAction('sync_state', {
    gameType,
    board,
    seats,
    turn
  });

  updateStatusLabel();
  renderBoard();
}

function quitGame() {
  triggerAction('quit', {});
  currentGameType = null;
  localPlayerColor = null;
  seats = { white: null, black: null };
  board = Array(8).fill(null).map(() => Array(8).fill(null));

  const quitBtn = document.getElementById('voice-game-quit');
  const restartBtn = document.getElementById('btn-game-restart');
  if (quitBtn) quitBtn.style.display = 'none';
  if (restartBtn) restartBtn.style.display = 'none';

  updateStatusLabel();
  renderBoard();
}

function claimSeat(color) {
  const user = getCurrentUser();
  if (!user) return alert('Log in to claim a player seat.');

  seats[color] = {
    username: user.username,
    display_name: user.display_name || user.username
  };
  localPlayerColor = color;

  triggerAction('claim_seat', { color, player: seats[color] });
  renderSeatsUI();
  updateStatusLabel();
  renderBoard(); // refresh click permissions
}

function initializeBoardState(gameType) {
  board = Array(8).fill(null).map(() => Array(8).fill(null));

  if (gameType === 'chess') {
    // Row 0: Black major pieces
    board[0][0] = { type: 'rook', color: 'black', icon: CHESS_PIECES.black.rook };
    board[0][1] = { type: 'knight', color: 'black', icon: CHESS_PIECES.black.knight };
    board[0][2] = { type: 'bishop', color: 'black', icon: CHESS_PIECES.black.bishop };
    board[0][3] = { type: 'queen', color: 'black', icon: CHESS_PIECES.black.queen };
    board[0][4] = { type: 'king', color: 'black', icon: CHESS_PIECES.black.king };
    board[0][5] = { type: 'bishop', color: 'black', icon: CHESS_PIECES.black.bishop };
    board[0][6] = { type: 'knight', color: 'black', icon: CHESS_PIECES.black.knight };
    board[0][7] = { type: 'rook', color: 'black', icon: CHESS_PIECES.black.rook };
    
    // Row 1: Black pawns
    for (let col = 0; col < 8; col++) {
      board[1][col] = { type: 'pawn', color: 'black', icon: CHESS_PIECES.black.pawn };
    }

    // Row 6: White pawns
    for (let col = 0; col < 8; col++) {
      board[6][col] = { type: 'pawn', color: 'white', icon: CHESS_PIECES.white.pawn };
    }

    // Row 7: White major pieces
    board[7][0] = { type: 'rook', color: 'white', icon: CHESS_PIECES.white.rook };
    board[7][1] = { type: 'knight', color: 'white', icon: CHESS_PIECES.white.knight };
    board[7][2] = { type: 'bishop', color: 'white', icon: CHESS_PIECES.white.bishop };
    board[7][3] = { type: 'queen', color: 'white', icon: CHESS_PIECES.white.queen };
    board[7][4] = { type: 'king', color: 'white', icon: CHESS_PIECES.white.king };
    board[7][5] = { type: 'bishop', color: 'white', icon: CHESS_PIECES.white.bishop };
    board[7][6] = { type: 'knight', color: 'white', icon: CHESS_PIECES.white.knight };
    board[7][7] = { type: 'rook', color: 'white', icon: CHESS_PIECES.white.rook };
  } else if (gameType === 'checkers') {
    // Black pieces (top rows 0-2 on dark squares)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) {
          board[row][col] = { type: 'pawn', color: 'black', icon: CHECKERS_PIECES.black };
        }
      }
    }
    // Red/White pieces (bottom rows 5-7 on dark squares)
    for (let row = 5; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) {
          board[row][col] = { type: 'pawn', color: 'white', icon: CHECKERS_PIECES.red }; // we treat 'white' color internally as Red player
        }
      }
    }
  }
}

function handleIncomingAction(action, data) {
  if (action === 'sync_state') {
    currentGameType = data.gameType;
    board = data.board;
    seats = data.seats;
    turn = data.turn;

    // Show controls
    const quitBtn = document.getElementById('voice-game-quit');
    const restartBtn = document.getElementById('btn-game-restart');
    if (quitBtn) quitBtn.style.display = currentGameType ? 'inline-block' : 'none';
    if (restartBtn) restartBtn.style.display = currentGameType ? 'inline-block' : 'none';

    // Synchronize local claimed color seat mapping
    const user = getCurrentUser();
    localPlayerColor = null;
    if (user) {
      if (seats.white && seats.white.username === user.username) localPlayerColor = 'white';
      if (seats.black && seats.black.username === user.username) localPlayerColor = 'black';
    }

    renderSeatsUI();
    updateStatusLabel();
    renderBoard();
  } else if (action === 'claim_seat') {
    seats[data.color] = data.player;
    renderSeatsUI();
    updateStatusLabel();
  } else if (action === 'move') {
    const { fromRow, fromCol, toRow, toCol, nextTurn, newBoard } = data;
    board = newBoard;
    turn = nextTurn;
    updateStatusLabel();
    renderBoard();
  } else if (action === 'reset') {
    startNewGame(data.gameType);
  } else if (action === 'quit') {
    currentGameType = null;
    localPlayerColor = null;
    seats = { white: null, black: null };
    board = Array(8).fill(null).map(() => Array(8).fill(null));

    const quitBtn = document.getElementById('voice-game-quit');
    const restartBtn = document.getElementById('btn-game-restart');
    if (quitBtn) quitBtn.style.display = 'none';
    if (restartBtn) restartBtn.style.display = 'none';

    updateStatusLabel();
    renderBoard();
  }
}

function triggerAction(action, data) {
  if (currentSocket && currentChannelId) {
    currentSocket.emit('voice_game_action', {
      channelId: currentChannelId,
      action,
      data
    });
  }
}

function renderSeatsUI() {
  const whiteSeat = document.getElementById('board-player-white');
  const blackSeat = document.getElementById('board-player-black');
  const btnWhite = document.getElementById('btn-claim-white');
  const btnBlack = document.getElementById('btn-claim-black');

  if (whiteSeat) {
    whiteSeat.textContent = seats.white ? seats.white.display_name : 'Empty';
    if (btnWhite) btnWhite.style.display = seats.white ? 'none' : 'inline-block';
  }
  if (blackSeat) {
    blackSeat.textContent = seats.black ? seats.black.display_name : 'Empty';
    if (btnBlack) btnBlack.style.display = seats.black ? 'none' : 'inline-block';
  }
}

function updateStatusLabel() {
  const statusEl = document.getElementById('board-game-status');
  if (!statusEl) return;

  if (!currentGameType) {
    statusEl.innerHTML = '🎮 Select Chess or Checkers to start!';
    statusEl.style.color = '#cbd5e1';
    return;
  }

  const turnLabel = turn === 'white' ? (currentGameType === 'checkers' ? 'Red' : 'White') : 'Black';
  const playerInTurn = seats[turn];

  if (playerInTurn) {
    statusEl.innerHTML = `⏳ Current Turn: <strong style="color: #fbbf24;">${turnLabel} (@${playerInTurn.username})</strong>`;
  } else {
    statusEl.innerHTML = `⏳ Current Turn: <strong style="color: #cbd5e1;">${turnLabel} (Unclaimed)</strong>`;
  }
  statusEl.style.color = '#38bdf8';
}

function renderBoard() {
  const container = document.getElementById('board-game-canvas-container');
  if (!container) return;

  container.innerHTML = '';

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const tile = document.createElement('div');
      tile.style.width = '100%';
      tile.style.height = '100%';
      tile.style.display = 'flex';
      tile.style.alignItems = 'center';
      tile.style.justifyContent = 'center';
      tile.style.fontSize = currentGameType === 'checkers' ? '1.5rem' : '1.8rem';
      tile.style.cursor = 'pointer';

      // Colors
      const isDarkTile = (row + col) % 2 === 1;
      tile.style.background = isDarkTile ? '#b58863' : '#f0d9b5';

      // Selection indicator
      if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
        tile.style.background = '#86efac'; // soft green highlight
      }

      const piece = board[row][col];
      if (piece) {
        tile.textContent = piece.icon;
        
        // Add styling for checkers
        if (currentGameType === 'checkers') {
          tile.style.fontWeight = 'bold';
        }
      }

      // Add click handler
      tile.onclick = () => handleCellClick(row, col);

      container.appendChild(tile);
    }
  }
}

function handleCellClick(row, col) {
  if (!currentGameType) return;

  // Turn check: Only let the claimed seat color move pieces during their turn
  if (!localPlayerColor) {
    alert('Please claim a seat (White/Red or Black) to move pieces.');
    return;
  }

  if (localPlayerColor !== turn) {
    alert(`It's not your turn! Waiting for ${turn === 'white' ? 'White' : 'Black'} to move.`);
    return;
  }

  const piece = board[row][col];

  // If a piece is already selected
  if (selectedCell) {
    // If clicked on own piece again, re-select or deselect
    if (piece && piece.color === turn) {
      if (selectedCell.row === row && selectedCell.col === col) {
        selectedCell = null; // deselect
      } else {
        selectedCell = { row, col }; // select other piece
      }
      renderBoard();
      return;
    }

    // Move piece to the new target cell!
    executeMove(selectedCell.row, selectedCell.col, row, col);
    selectedCell = null;
  } else {
    // Select piece
    if (piece && piece.color === turn) {
      selectedCell = { row, col };
      renderBoard();
    }
  }
}

function executeMove(fromRow, fromCol, toRow, toCol) {
  const piece = board[fromRow][fromCol];
  if (!piece) return;

  // Sandbox mode: Execute move directly. 
  // Let's add simple checkers king promotions!
  let movedPiece = { ...piece };
  if (currentGameType === 'checkers') {
    // Red (White internally) reaches row 0
    if (piece.color === 'white' && toRow === 0) {
      movedPiece.icon = CHECKERS_PIECES.redKing;
      movedPiece.type = 'king';
    }
    // Black reaches row 7
    if (piece.color === 'black' && toRow === 7) {
      movedPiece.icon = CHECKERS_PIECES.blackKing;
      movedPiece.type = 'king';
    }

    // Checkers Jump detection for capturing
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);
    if (rowDiff === 2 && colDiff === 2) {
      const midRow = (fromRow + toRow) / 2;
      const midCol = (fromCol + toCol) / 2;
      board[midRow][midCol] = null; // capture mid piece
    }
  }

  // Update board grid
  board[toRow][toCol] = movedPiece;
  board[fromRow][fromCol] = null;

  // Toggle turn
  const nextTurn = turn === 'white' ? 'black' : 'white';
  turn = nextTurn;

  // Replicate to other users
  triggerAction('move', {
    fromRow,
    fromCol,
    toRow,
    toCol,
    nextTurn,
    newBoard: board
  });

  updateStatusLabel();
  renderBoard();
}
