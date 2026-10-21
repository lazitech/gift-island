import { neighbors } from "./rules.js";

// A deliberately modest opponent for the title board. It finds the obvious move — a stone of its
// own that starts a new island, a gift that joins two of yours — but it likes to settle near its
// own stones and never asks what that leaves open, and now and then it settles for less.
// A player who keeps their own stones apart and joins its islands will beat it.

const NEAR = 0.45;       // pull towards its own stones, which tends to leave joins for you
const NOISE = 0.35;      // variety between moves of similar value
const OWN_SLIP = 0.12;   // chance its own stone only grows an island
const GIFT_SLIP = 0.22;  // chance its gift only grows one of yours

/** Island id of every stone of one colour, -1 elsewhere. */
export function labelIslands(board, color, cols, rows) {
  const ids = new Int32Array(board.length).fill(-1);
  let next = 0;
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== color || ids[i] >= 0) continue;
    const stack = [i];
    ids[i] = next;
    while (stack.length) {
      const j = stack.pop();
      for (const k of neighbors(j, cols, rows)) {
        if (board[k] === color && ids[k] < 0) { ids[k] = next; stack.push(k); }
      }
    }
    next++;
  }
  return ids;
}

/** Distinct islands (by id) touching a cell. */
export function islandsAround(ids, cell, cols, rows) {
  const out = [];
  for (const k of neighbors(cell, cols, rows)) {
    if (ids[k] >= 0 && !out.includes(ids[k])) out.push(ids[k]);
  }
  return out;
}

/** Empty cells next to a new stone at `cell` that would also touch another island of its colour. */
export function opensAt(board, ids, cell, cols, rows) {
  const joined = islandsAround(ids, cell, cols, rows);
  let open = 0;
  for (const x of neighbors(cell, cols, rows)) {
    if (board[x] === 0 && x !== cell && islandsAround(ids, x, cols, rows).some((id) => !joined.includes(id))) open++;
  }
  return open;
}

function nearOwn(board, me, cell, cols, rows) {
  const r = Math.floor(cell / cols), c = cell % cols;
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr, cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < rows && cc >= 0 && cc < cols && board[rr * cols + cc] === me) return true;
    }
  }
  return false;
}

function best(cells, score) {
  let pick = null, top = -Infinity;
  for (const i of cells) {
    const s = score(i);
    if (s > top) { top = s; pick = i; }
  }
  return pick;
}

const any = (cells, rng) => (cells.length ? cells[Math.floor(rng() * cells.length)] : null);

/** The move for `me`: [own stone, gift]. */
export function chooseMove(board, cols, rows, me, rng = Math.random) {
  const own = labelIslands(board, me, cols, rows);
  const theirs = labelIslands(board, 3 - me, cols, rows);
  const empty = [];
  for (let i = 0; i < board.length; i++) if (board[i] === 0) empty.push(i);

  let self = null;
  if (rng() < OWN_SLIP) self = any(empty.filter((i) => islandsAround(own, i, cols, rows).length === 1), rng);
  self ??= best(empty, (i) =>
    1 - islandsAround(own, i, cols, rows).length + (nearOwn(board, me, i, cols, rows) ? NEAR : 0) + rng() * NOISE);

  const rest = empty.filter((i) => i !== self);
  let gift = null;
  if (rng() < GIFT_SLIP) gift = any(rest.filter((i) => islandsAround(theirs, i, cols, rows).length === 1), rng);
  gift ??= best(rest, (i) => islandsAround(theirs, i, cols, rows).length - 1 + rng() * NOISE);

  return [self, gift];
}
