// Scoring rules on an n×n board (mirrors giftisland/game.py). 0 empty, 1 black, 2 white.

export function neighbors(i, n) {
  const r = Math.floor(i / n), c = i % n, out = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

/** Islands of one colour, each a list of cell indices, in reading order. */
export function islandsOf(board, color, n) {
  const area = n * n, seen = new Uint8Array(area), islands = [];
  for (let i = 0; i < area; i++) {
    if (board[i] !== color || seen[i]) continue;
    const island = [], stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      island.push(j);
      for (const k of neighbors(j, n)) {
        if (board[k] === color && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    islands.push(island);
  }
  return islands;
}

export function scoresOf(board, n) {
  return { 1: islandsOf(board, 1, n).length, 2: islandsOf(board, 2, n).length };
}
