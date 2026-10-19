import * as rules from "./rules.js";
import { createBoardView } from "./board-view.js";

// The start screen: two ways in, and a small board that quietly plays itself.

const N = 5;
const AREA = N * N;
const MOVES = Math.floor(AREA / 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A plausible move: keep your own stone apart, use the gift to join the opponent's islands. */
function demoMove(board, me) {
  const pick = (b, color, sign) => {
    const base = rules.islandsOf(b, color, N).length;
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < AREA; i++) {
      if (b[i] !== 0) continue;
      const next = b.slice();
      next[i] = color;
      const score = sign * (rules.islandsOf(next, color, N).length - base) + Math.random() * 0.6;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  };
  const self = pick(board, me, 1);
  const withSelf = board.slice();
  withSelf[self] = me;
  return [self, pick(withSelf, 3 - me, -1)];
}

export function createHome({ root, reducedMotion, summary, onPlay, onNew, onLearn, learned }) {
  const view = createBoardView(root.querySelector("#hero-board"), N);
  const playBtn = root.querySelector("#home-play");
  const newBtn = root.querySelector("#home-new");
  const learnBtn = root.querySelector("#home-learn");
  const metaEl = root.querySelector("#home-meta");
  const metaText = root.querySelector("#home-meta-text");
  let token = 0;

  const draw = (board, last = null) => view.render({ solid: board, last, locked: true });

  async function loop(mine) {
    const alive = () => mine === token;
    while (alive()) {
      const board = new Array(AREA).fill(0);
      draw(board);
      await sleep(900);
      for (let m = 0; m < MOVES && alive(); m++) {
        const me = m % 2 === 0 ? 1 : 2;
        const [self, gift] = demoMove(board, me);
        board[self] = me;
        draw(board, [self, null]);
        await sleep(280);
        if (!alive()) return;
        board[gift] = 3 - me;
        draw(board, [self, gift]);
        await sleep(900);
      }
      if (!alive()) return;
      draw(board);
      const islands = { 1: rules.islandsOf(board, 1, N), 2: rules.islandsOf(board, 2, N) };
      const steps = Math.max(islands[1].length, islands[2].length);
      for (let k = 0; k < steps && alive(); k++) {
        for (const color of [1, 2]) if (islands[color][k]) view.light(islands[color][k], color, 700);
        await sleep(180);
      }
      await sleep(2200);
    }
  }

  /** A still mid-game position for reduced motion. */
  function still() {
    const board = new Array(AREA).fill(0);
    for (let m = 0; m < 8; m++) {
      const me = m % 2 === 0 ? 1 : 2;
      const [self, gift] = demoMove(board, me);
      board[self] = me;
      board[gift] = 3 - me;
    }
    draw(board);
  }

  function refresh() {
    const game = summary();
    playBtn.textContent = game ? "继续对局" : "开始对局";
    metaText.textContent = game ? `${game.label} ·` : "";
    metaEl.hidden = !game;
    learnBtn.querySelector("span").textContent = learned() ? "复习规则" : "两分钟学会规则";
  }

  function start() {
    token++;
    if (reducedMotion.matches) return still();
    view.intro();
    loop(token);
  }

  playBtn.addEventListener("click", () => (summary() ? onPlay() : onNew()));
  newBtn.addEventListener("click", onNew);
  learnBtn.addEventListener("click", onLearn);

  let active = false;
  document.addEventListener("visibilitychange", () => {
    if (!active) return;
    if (document.hidden) token++;
    else start();
  });

  return {
    enter() {
      active = true;
      refresh();
      start();
    },
    leave() {
      active = false;
      token++;
    },
  };
}
