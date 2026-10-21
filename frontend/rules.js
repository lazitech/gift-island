// Scoring rules on a cols × rows board (mirrors giftisland/game.py, where the board is square).
// 0 empty, 1 black, 2 white.

export function neighbors(i, cols, rows = cols) {
  const r = Math.floor(i / cols), c = i % cols, out = [];
  if (r > 0) out.push(i - cols);
  if (r < rows - 1) out.push(i + cols);
  if (c > 0) out.push(i - 1);
  if (c < cols - 1) out.push(i + 1);
  return out;
}

/** Islands of one colour, each a list of cell indices, in reading order. */
export function islandsOf(board, color, cols, rows = cols) {
  const area = cols * rows, seen = new Uint8Array(area), islands = [];
  for (let i = 0; i < area; i++) {
    if (board[i] !== color || seen[i]) continue;
    const island = [], stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      island.push(j);
      for (const k of neighbors(j, cols, rows)) {
        if (board[k] === color && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    islands.push(island);
  }
  return islands;
}

export function scoresOf(board, cols, rows = cols) {
  return { 1: islandsOf(board, 1, cols, rows).length, 2: islandsOf(board, 2, cols, rows).length };
}
