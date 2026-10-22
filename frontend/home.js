import * as rules from "./rules.js";
import { createBoardView, bindBoardInput, focusCell } from "./board-view.js";
import { ZENG, DAO, compose } from "./glyphs.js";
import { chooseMove } from "./title-ai.js";
import { sealRecord, drawSeal } from "./seal.js";

// The start screen. Its title is a board: 赠 in black stones and 岛 in white, which settle into place
// all over the characters at once when the page opens, the way a diffusion model resolves an image.
// It is also a game: you play black, a modest AI plays white, eight moves each from the title, and
// whoever adds more islands wins. Beat it and an easter egg opens.

const MATCH = 8;
const YOU = 1, AI = 2;
const DIFFUSE_MS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Side by side on wide screens; one above the other, like vertical writing, on tall phones. */
const LAYOUTS = {
  across: { cols: 33, rows: 16, at: [[1, 1], [1, 19]], reserve: 340 },
  down: { cols: 17, rows: 32, at: [[1, 1], [17, 2]], reserve: 320 },
};

/** The layout whose stones come out larger on this screen (mirrors the --cell formula in style.css). */
function preferredLayout() {
  const fit = ({ cols, rows, reserve }) =>
    Math.min((innerWidth - 32) / (cols + 0.84), (innerHeight - reserve) / (rows + 0.84), 30);
  return fit(LAYOUTS.down) > fit(LAYOUTS.across) * 1.15 ? "down" : "across";
}

export function createHome({ root, reducedMotion, summary, onPlay, onNew, onLearn, learned, onWin, onSeal }) {
  const masthead = root.querySelector("#masthead");
  const restoreBtn = root.querySelector("#title-restore");
  const cornerSeal = root.querySelector("#corner-seal");
  const playBtn = root.querySelector("#home-play");
  const learnBtn = root.querySelector("#home-learn");
  const metaEl = root.querySelector("#home-meta");
  const metaText = root.querySelector("#home-meta-text");
  drawSeal(cornerSeal.querySelector(".seal"));

  let layoutKey = null;
  let view = null;
  let cols = 0, rows = 0;
  let base = [];        // the title alone
  let start = null;     // its island counts, the zero of the match
  let board = [];       // the title plus the moves played on it
  let moves = [];       // [own stone, gift], yours and the AI's in turn
  let turn = YOU;
  let pending = null;
  let thinking = false;
  let result = null;    // "win" | "draw" | "loss" once eight moves each are played
  let busy = false;     // diffusing or restoring
  let settled = false;  // the title has come out of the noise
  let active = false;
  let token = 0;
  let seenWins = sealRecord()?.wins ?? 0;
  const input = { hover: null, focus: 0, keyboard: false };

  const islandsOf = (b, color) => rules.islandsOf(b, color, cols, rows);
  const scoresOf = (b) => rules.scoresOf(b, cols, rows);
  const gainsOf = (b) => {
    const s = scoresOf(b);
    return { 1: s[1] - start[1], 2: s[2] - start[2] };
  };

  function build() {
    layoutKey = preferredLayout();
    const layout = LAYOUTS[layoutKey];
    ({ cols, rows } = layout);

    const el = document.createElement("div");
    el.className = "board title-board";
    el.id = "title-board";
    el.tabIndex = 0;
    el.dataset.layout = layoutKey;
    el.setAttribute("role", "application");
    el.setAttribute("aria-label", "用黑白棋子拼成的标题“赠岛”，也是一局棋：你执黑，和白方各下八手。方向键移动，空格或回车落子，Esc 取消。");
    el.style.setProperty("--cols", cols);
    el.style.setProperty("--rows", rows);
    el.style.setProperty("--reserve", `${layout.reserve}px`);
    root.querySelector("#title-board")?.remove();
    masthead.prepend(el);

    view = createBoardView(el, cols, rows);
    const title = compose(cols, rows, [[ZENG, ...layout.at[0], YOU], [DAO, ...layout.at[1], AI]]);
    base = title.board;
    start = scoresOf(base);
    input.focus = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
    input.hover = null;
    bindBoardInput(view, input, { onChange: render, onChoose: choose });
    reset();
  }

  function reset() {
    board = base.slice();
    moves = [];
    turn = YOU;
    pending = null;
    thinking = false;
    result = null;
  }

  const lastMove = () => (moves.length ? moves[moves.length - 1] : null);
  const yourTurn = () => !busy && !thinking && result === null && turn === YOU;

  // ---------- Drawing ----------

  function render() {
    const solid = board.slice();
    const ghost = new Array(board.length).fill(0);
    const playable = yourTurn();
    const target = busy ? null : input.keyboard ? input.focus : input.hover;
    if (playable) {
      if (pending !== null) solid[pending] = YOU;
      if (target !== null && board[target] === 0 && target !== pending) ghost[target] = pending !== null ? AI : YOU;
    }
    view.render({
      solid, ghost,
      last: lastMove(),
      pending: playable ? pending : null,
      focus: focusCell(view, input),
      locked: !playable,
    });

    // Point at a stone and its whole island answers.
    view.clearMarks("peek");
    if (target !== null && board[target] !== 0) {
      const island = islandsOf(board, board[target]).find((cells) => cells.includes(target));
      view.mark(island, board[target], "peek");
    }

    renderCaption();
  }

  function renderCaption() {
    restoreBtn.hidden = !settled || !moves.length || result === "win";
    restoreBtn.querySelector("span").textContent = result ? "再来一局" : "重来";
    restoreBtn.disabled = busy;
  }

  /**
   * Let the title's stones settle the way a diffusion model resolves an image: everywhere at once
   * rather than stroke by stroke. Each stone lands at its own random moment; the empty board
   * around the characters stays empty throughout.
   */
  function diffuse() {
    const mine = ++token;
    busy = true;
    settled = false;
    masthead.classList.remove("ready");
    board = new Array(base.length).fill(0);
    render();
    view.intro({ scatter: true });

    // When each stone lands, a little before the end so the last ones finish springing in.
    const timing = [];
    base.forEach((color, i) => {
      if (color) timing.push({ i, color, at: 0.96 * Math.random() });
    });

    let begin = null;
    const frame = (now) => {
      if (mine !== token) return;
      begin ??= now + 160;
      const p = Math.max(0, Math.min(1, (now - begin) / DIFFUSE_MS));
      const t = 0.5 - 0.5 * Math.cos(Math.PI * p);  // few at first, most in the middle, the last few slowly
      for (const { i, color, at } of timing) board[i] = t >= at ? color : 0;
      render();
      if (p < 1) requestAnimationFrame(frame);
      else settle();
    };
    requestAnimationFrame(frame);
  }

  function settle() {
    busy = false;
    settled = true;
    reset();
    masthead.classList.add("ready");
    render();
  }

  // ---------- The match ----------

  function choose(cell) {
    if (busy || cell === null) return;
    if (board[cell] !== 0) {
      const island = islandsOf(board, board[cell]).find((cells) => cells.includes(cell));
      return view.light(island, board[cell], 700);
    }
    if (!yourTurn()) return;
    if (cell === pending) {
      pending = null;
    } else if (pending === null) {
      pending = cell;
    } else {
      board[pending] = YOU;
      board[cell] = AI;
      moves.push([pending, cell]);
      pending = null;
      turn = AI;
      reply();
    }
    render();
  }

  /** The AI's answer, in two beats like the game's: its own stone, then the gift. */
  async function reply() {
    const mine = token;
    thinking = true;
    render();
    await sleep(reducedMotion.matches ? 150 : 480 + Math.random() * 360);
    if (mine !== token) return;

    const [self, gift] = chooseMove(board, cols, rows, AI);
    thinking = false;
    board[self] = AI;
    moves.push([self, null]);
    if (!reducedMotion.matches) {
      render();
      await sleep(260);
      if (mine !== token) return;
    }
    board[gift] = YOU;
    moves[moves.length - 1] = [self, gift];
    turn = YOU;
    if (moves.length === 2 * MATCH) finish();
    else render();
  }

  function finish() {
    const g = gainsOf(board);
    result = g[YOU] > g[AI] ? "win" : g[YOU] === g[AI] ? "draw" : "loss";
    render();
    if (result === "win") celebrate(g);
  }

  /** Light each island you made, one after another, then open the easter egg. */
  async function celebrate(g) {
    const mine = token;
    const yours = moves.filter((_, k) => k % 2 === 0).map(([self]) => self);
    for (const cell of yours) {
      const island = islandsOf(board, YOU).find((cells) => cells.includes(cell));
      view.light(island, YOU, 650);
      await sleep(reducedMotion.matches ? 0 : 110);
      if (mine !== token) return;
    }
    await sleep(reducedMotion.matches ? 300 : 1000);
    if (mine === token && active) onWin({ black: g[YOU], white: g[AI] });
  }

  /** Take every move back, newest first, until only the title is left. */
  async function restore() {
    if (busy || !moves.length) return;
    const mine = ++token;  // also calls off an AI reply that is still thinking
    busy = true;
    pending = null;
    thinking = false;
    result = null;
    const beat = reducedMotion.matches ? 0 : Math.max(24, Math.min(80, 900 / moves.length));
    while (moves.length) {
      const [self, gift] = moves.pop();
      board[self] = 0;
      if (gift !== null) board[gift] = 0;
      render();
      await sleep(beat);
      if (mine !== token) return;
    }
    turn = YOU;
    busy = false;
    render();
    view.el.focus({ preventScroll: true });
  }

  function onKey(event) {
    if (event.key === "Escape" && pending !== null && !event.target.closest?.("dialog")) {
      pending = null;
      render();
    }
  }

  restoreBtn.addEventListener("click", restore);
  cornerSeal.addEventListener("click", onSeal);

  let resizeFrame = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (!active || preferredLayout() === layoutKey) return;
      token++;
      build();
      if (reducedMotion.matches) settle();
      else diffuse();
    });
  });

  // ---------- The two ways in, and the seal ----------

  function refresh() {
    const game = summary();
    playBtn.textContent = game ? "继续对局" : "开始对局";
    metaText.textContent = game ? `${game.label} ·` : "";
    metaEl.hidden = !game;
    learnBtn.querySelector("span").textContent = learned() ? "复习规则" : "两分钟学会规则";

    // A new win is pressed onto the corner of the title as you arrive.
    const wins = sealRecord()?.wins ?? 0;
    cornerSeal.hidden = wins === 0;
    cornerSeal.classList.remove("stamping");
    if (wins > seenWins && !reducedMotion.matches) {
      void cornerSeal.offsetWidth;
      cornerSeal.classList.add("stamping");
    }
    seenWins = wins;
  }

  playBtn.addEventListener("click", () => (summary() ? onPlay() : onNew()));
  root.querySelector("#home-new").addEventListener("click", onNew);
  learnBtn.addEventListener("click", onLearn);

  return {
    enter() {
      active = true;
      refresh();
      document.addEventListener("keydown", onKey);
      if (!view || preferredLayout() !== layoutKey) build();
      if (!settled && !reducedMotion.matches) {
        diffuse();
      } else {
        // Coming back: the title is simply there, and the last match is put away.
        token++;
        settle();
      }
    },
    leave() {
      active = false;
      document.removeEventListener("keydown", onKey);
      token++;
      if (busy) settle();
    },
  };
}
