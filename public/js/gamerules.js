// public/js/gamerules.js
// Move-legality rules for the voice-room Chess & Checkers games.
//
// Previously boardgames.js let a player move ANY piece to ANY square — the
// code literally called it "Sandbox mode: Execute move directly." There was
// no check for how a piece is allowed to move, so pawns could jump across
// the board, kings could teleport, checkers pieces could move backwards or
// skip the diagonal-only rule, etc.
//
// Note on scope: this validates standard piece-movement patterns, path
// blocking, and capture legality for both games. It does NOT implement
// check/checkmate detection, castling, en passant, or forced-capture rules
// in checkers — a player can still make a legal-but-bad move (e.g. leaving
// their own king in check), same as a casual physical board with no referee.
// Because the room state is peer-broadcast rather than server-authoritative
// (see server/voiceSocket.js — it just relays whatever a client sends), a
// determined player could still fabricate a 'move' event from the browser
// console to bypass this. Closing that fully would require moving the rule
// engine server-side and having the server be the source of truth for board
// state, which is a bigger architecture change than a rules bugfix.

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isPathClear(board, fromRow, fromCol, toRow, toCol) {
  const dRow = Math.sign(toRow - fromRow);
  const dCol = Math.sign(toCol - fromCol);
  let r = fromRow + dRow;
  let c = fromCol + dCol;
  while (r !== toRow || c !== toCol) {
    if (board[r][c]) return false;
    r += dRow;
    c += dCol;
  }
  return true;
}

export function isLegalChessMove(board, fromRow, fromCol, toRow, toCol, turnColor) {
  if (!inBounds(fromRow, fromCol) || !inBounds(toRow, toCol)) return false;
  if (fromRow === toRow && fromCol === toCol) return false;

  const piece = board[fromRow][fromCol];
  if (!piece || piece.color !== turnColor) return false;

  const target = board[toRow][toCol];
  if (target && target.color === piece.color) return false; // can't capture own piece

  const dRow = toRow - fromRow;
  const dCol = toCol - fromCol;
  const absRow = Math.abs(dRow);
  const absCol = Math.abs(dCol);

  switch (piece.type) {
    case 'pawn': {
      // White moves "up" the board (toward row 0), Black moves "down" (toward row 7)
      const dir = piece.color === 'white' ? -1 : 1;
      const startRow = piece.color === 'white' ? 6 : 1;

      // Straight move (no capture allowed straight ahead)
      if (dCol === 0 && !target) {
        if (dRow === dir) return true;
        if (dRow === dir * 2 && fromRow === startRow && !board[fromRow + dir][fromCol]) return true;
        return false;
      }
      // Diagonal capture only
      if (absCol === 1 && dRow === dir && target && target.color !== piece.color) return true;
      return false;
    }
    case 'knight':
      return (absRow === 2 && absCol === 1) || (absRow === 1 && absCol === 2);
    case 'bishop':
      return absRow === absCol && isPathClear(board, fromRow, fromCol, toRow, toCol);
    case 'rook':
      return (dRow === 0 || dCol === 0) && isPathClear(board, fromRow, fromCol, toRow, toCol);
    case 'queen':
      return (dRow === 0 || dCol === 0 || absRow === absCol) && isPathClear(board, fromRow, fromCol, toRow, toCol);
    case 'king':
      return absRow <= 1 && absCol <= 1;
    default:
      return false;
  }
}

export function isLegalCheckersMove(board, fromRow, fromCol, toRow, toCol, turnColor) {
  if (!inBounds(fromRow, fromCol) || !inBounds(toRow, toCol)) return false;

  const piece = board[fromRow][fromCol];
  if (!piece || piece.color !== turnColor) return false;
  if (board[toRow][toCol]) return false; // destination must be empty
  if ((toRow + toCol) % 2 === 0) return false; // must stay on dark squares

  const dRow = toRow - fromRow;
  const dCol = toCol - fromCol;
  const absRow = Math.abs(dRow);
  const absCol = Math.abs(dCol);
  if (absRow !== absCol) return false; // must be diagonal
  if (absRow !== 1 && absRow !== 2) return false;

  const isKing = piece.type === 'king';
  // Red ('white' internally) advances toward row 0, Black advances toward row 7,
  // unless the piece has been kinged, which can move either direction.
  const forwardDir = piece.color === 'white' ? -1 : 1;
  const rowDir = Math.sign(dRow);
  if (!isKing && rowDir !== forwardDir) return false;

  if (absRow === 1) return true; // simple non-capturing step

  // absRow === 2: must be a jump over an adjacent opponent piece
  const midRow = (fromRow + toRow) / 2;
  const midCol = (fromCol + toCol) / 2;
  const midPiece = board[midRow][midCol];
  return Boolean(midPiece && midPiece.color !== piece.color);
}
