import * as rules from "./rules.js";
import { createBoardView, bindBoardInput, focusCell } from "./board-view.js";
import { createTally } from "./tally.js";

// An interactive rules course: each lesson is a small 5×5 board with one thing to do.

const STORE_KEY = "giftislands.learned.v1";
const canHover = matchMedia("(hover: hover)");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function hasLearned() {
  try { return localStorage.getItem(STORE_KEY) === "1"; } catch { return false; }
}

function markLearned() {
  try { localStorage.setItem(STORE_KEY, "1"); } catch { /* the course still works without storage */ }
}

/** "BB.WB/.BW.W/…" → a board, one row per slash. */
function parse(rows) {
  return [...rows.replaceAll("/", "")].map((ch) => (ch === "B" ? 1 : ch === "W" ? 2 : 0));
}

const sizeOf = (board) => Math.round(Math.sqrt(board.length));

/** Change in `color`'s island count if `cell` became `color`. */
function islandDelta(board, cell, color) {
  const n = sizeOf(board);
  const next = board.slice();
  next[cell] = color;
  return rules.islandsOf(next, color, n).length - rules.islandsOf(board, color, n).length;
}

const ICONS = {
  check: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9"/><path d="m6 10.2 2.6 2.6L14.2 7"/></svg>',
  info: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9"/><path d="M10 9v5M10 6.2v.1"/></svg>',
};

// ---------- Building blocks ----------

/**
 * A board you play one move on: pick a cell for your own stone, then one for the gift.
 * `check.self` / `check.gift` may return a sentence explaining why a choice is refused.
 */
function playable(ctx, { start, me = 1, tally = false, check = {}, onPick, onMove }) {
  const n = sizeOf(start);
  const { view, head } = ctx.mountBoard(n);
  const counter = tally ? createTally(head) : null;
  const state = {
    board: start.slice(), pending: null, last: null, locked: false,
    hover: null, focus: Math.floor((n * n) / 2), keyboard: false,
  };

  function render() {
    const solid = state.board.slice();
    const ghost = new Array(n * n).fill(0);
    if (!state.locked) {
      if (state.pending !== null) solid[state.pending] = me;
      const target = state.keyboard ? state.focus : state.hover;
      if (target !== null && state.board[target] === 0 && target !== state.pending) {
        ghost[target] = state.pending !== null ? 3 - me : me;
      }
    }
    view.render({
      solid, ghost, last: state.last,
      pending: state.locked ? null : state.pending,
      focus: focusCell(view, state),
      locked: state.locked,
    });
    if (counter && !state.counting) {
      counter.show(rules.scoresOf(state.board, n), rules.scoresOf(solid.map((v, i) => v || ghost[i]), n));
    }
  }

  function refuse(problem) {
    view.nope();
    if (problem) ctx.say(problem, "warn");
  }

  function choose(cell) {
    if (state.locked || cell === null) return;
    if (state.board[cell] !== 0) return refuse();
    if (cell === state.pending) {
      state.pending = null;
      onPick?.(null);
      return render();
    }
    if (state.pending === null) {
      const problem = check.self?.(cell, state.board);
      if (problem) return refuse(problem);
      state.pending = cell;
      onPick?.(cell);
      return render();
    }
    const withSelf = state.board.slice();
    withSelf[state.pending] = me;
    const problem = check.gift?.(cell, withSelf);
    if (problem) return refuse(problem);

    const self = state.pending;
    state.board[self] = me;
    state.board[cell] = 3 - me;
    state.pending = null;
    state.last = [self, cell];
    state.locked = true;
    render();
    onMove(self, cell);
  }

  bindBoardInput(view, state, { onChange: render, onChoose: choose });
  render();
  return { view, state, render, counter, n };
}

// ---------- Lessons ----------

function lessonMove(ctx) {
  const hint = (cell) => cell === null
    ? "点一个空格，放下你的黑子"
    : "再点另一个空格，送给白方一枚白子";
  ctx.say(hint(null));

  const game = playable(ctx, {
    start: new Array(25).fill(0),
    onPick: (cell) => ctx.say(hint(cell)),
    async onMove(self) {
      ctx.say("一枚给自己，一枚送对方，这就是一手。", "ok");
      await ctx.wait(1300);
      if (!ctx.alive()) return;

      const { board } = game.state;
      const n = game.n;
      const dist = (i) => Math.abs(Math.floor(i / n) - Math.floor(self / n)) + Math.abs((i % n) - (self % n));
      const far = board.map((v, i) => i).filter((i) => board[i] === 0).sort((a, b) => dist(b) - dist(a));
      const reply = far.find((i) => !rules.neighbors(i, n).some((k) => board[k] === 2));
      const gift = far.find((i) => i !== reply && !rules.neighbors(i, n).includes(reply));

      ctx.say("轮到白方");
      await ctx.wait(500);
      if (!ctx.alive()) return;
      board[reply] = 2;
      game.state.last = [reply, null];
      game.render();
      await ctx.wait(300);
      if (!ctx.alive()) return;
      board[gift] = 1;
      game.state.last = [reply, gift];
      game.render();
      ctx.say("白方也落下两枚，其中那枚黑子是送给你的。双方这样轮流，黑白棋子总是一样多。", "ok");
      ctx.done();
    },
  });
}

function lessonIslands(ctx) {
  const n = 5;
  const board = parse("BB.WB/.BW.W/W..B./..B.W/B.W.W");
  const islands = rules.islandsOf(board, 1, n);
  const found = new Set();
  const { view, head } = ctx.mountBoard(n);
  const state = { hover: null, focus: 12, keyboard: false };

  head.innerHTML = `<div class="tally counter">已找到 <span class="tally-num">0</span> / ${islands.length} 座黑岛</div>`;
  const countEl = head.querySelector(".tally-num");

  const islandAt = (cell) => islands.findIndex((island) => island.includes(cell));
  const diagonalTwin = (cell) => {
    const r = Math.floor(cell / n), c = cell % n;
    return [[-1, -1], [-1, 1], [1, -1], [1, 1]].some(([dr, dc]) => {
      const rr = r + dr, cc = c + dc;
      return rr >= 0 && rr < n && cc >= 0 && cc < n && board[rr * n + cc] === 1;
    });
  };

  function render() {
    view.render({ solid: board, focus: focusCell(view, state), locked: found.size === islands.length });
    view.clearMarks("peek");
    const target = state.keyboard ? state.focus : state.hover;
    const k = target === null ? -1 : islandAt(target);
    if (k >= 0 && !found.has(k)) view.mark(islands[k], 1, "peek");
  }

  function choose(cell) {
    if (found.size === islands.length) return;
    if (board[cell] === 2) {
      view.nope();
      return ctx.say("这是白子。这一课只数黑岛。", "warn");
    }
    const k = islandAt(cell);
    if (k < 0) return view.nope();
    const island = islands[k];
    if (found.has(k)) {
      view.light(island, 1);
      return ctx.say("这座岛已经数过了。");
    }
    found.add(k);
    view.mark(island, 1, "found");
    countEl.textContent = found.size;
    countEl.classList.remove("bump");
    void countEl.offsetWidth;
    countEl.classList.add("bump");
    render();

    if (found.size === islands.length) {
      ctx.say(`全部找到了，黑方共有 ${islands.length} 座岛。`, "ok");
      return ctx.done();
    }
    if (island.length > 1) ctx.say(`${island.length} 枚连在一起，也只算一座岛。`, "ok");
    else if (diagonalTwin(cell)) ctx.say("斜对角的黑子不算相连，所以它单独算一座岛。", "ok");
    else ctx.say("又找到一座。", "ok");
  }

  ctx.say(canHover.matches
    ? "点一下黑子，找出全部 5 座黑岛。鼠标停在棋子上，可以看到哪些子连在一起"
    : "点一下黑子，找出全部 5 座黑岛");
  bindBoardInput(view, state, { onChange: render, onChoose: choose });
  render();
}

function lessonScore(ctx) {
  const first = canHover.matches
    ? "放一枚黑子，让黑方多一座岛。鼠标停在空格上，上方会预览岛数变化"
    : "放一枚黑子，让黑方多一座岛";
  const hint = (cell) => cell === null ? first : "黑方 +1。现在送出白子，把两座白岛连成一座";
  ctx.say(hint(null));

  playable(ctx, {
    start: parse(".B..W/W..B./.W.W./B...B/..WB."),
    tally: true,
    onPick: (cell) => ctx.say(hint(cell)),
    check: {
      self(cell, board) {
        const d = islandDelta(board, cell, 1);
        if (d > 0) return null;
        return d === 0
          ? "这里挨着黑子，只会让原来的岛变大，黑岛数不变。试试四周没有黑子的空格。"
          : "这枚黑子会把两座黑岛连成一座，黑方反而少一座岛。";
      },
      gift(cell, board) {
        const d = islandDelta(board, cell, 2);
        if (d < 0) return null;
        return d > 0
          ? "这枚白子四周没有白子，等于送了对方一座新岛。试着放在两座白岛之间。"
          : "这枚白子只让一座白岛变大，白方分数不变。找一个同时挨着两座白岛的空格。";
      },
    },
    onMove() {
      ctx.say("黑 +1，白 −1。每一手都在做这道题：给自己多一座岛，替对方把岛连起来。", "ok");
      ctx.done();
    },
  });
}

function lessonEnd(ctx) {
  const hint = (cell) => cell === null ? "你执黑，下出最后一手" : "再选一格送给白方，剩下的那格留空";
  ctx.say(hint(null));
  const game = playable(ctx, {
    start: parse("WBBBB/BWBWW/WBWB./B.BWW/WBWW."),
    tally: true,
    onPick: (cell) => ctx.say(hint(cell)),
    async onMove() {
      const { board } = game.state;
      game.state.counting = true;
      ctx.say("只剩一个空格，对局结束。开始数岛");
      await ctx.wait(600);
      if (!ctx.alive()) return;

      const islands = { 1: rules.islandsOf(board, 1, game.n), 2: rules.islandsOf(board, 2, game.n) };
      const shown = { 1: 0, 2: 0 };
      game.counter.show(shown);
      const steps = Math.max(islands[1].length, islands[2].length);
      for (let k = 0; k < steps; k++) {
        for (const color of [1, 2]) {
          if (!islands[color][k]) continue;
          game.view.light(islands[color][k], color, 600);
          shown[color] = k + 1;
        }
        game.counter.show(shown);
        await ctx.wait(240);
        if (!ctx.alive()) return;
      }
      await ctx.wait(400);
      if (!ctx.alive()) return;

      const b = islands[1].length, w = islands[2].length;
      const won = b > w;
      if (won) {
        ctx.say(`黑 ${b} 座，白 ${w} 座，黑方获胜。你找到了这里唯一的赢法。`, "ok");
      } else {
        const verdict = b === w ? `双方都是 ${b} 座岛，平局。` : `白 ${w} 座，黑 ${b} 座，白方获胜。`;
        ctx.say(`${verdict}这里其实有一步能赢，再试一次？`, "warn");
      }
      ctx.done({ retry: true });
    },
  });
}

function lessonRecap(ctx) {
  markLearned();
  ctx.stage.innerHTML = `
    <ul class="recap">
      <li>
        <svg viewBox="0 0 64 32" aria-hidden="true"><circle class="s1" cx="16" cy="16" r="11"/><circle class="s2" cx="48" cy="16" r="11"/></svg>
        <div><b>一手两枚</b><span>一枚给自己，一枚送对方。黑方先行。</span></div>
      </li>
      <li>
        <svg viewBox="0 0 64 32" aria-hidden="true"><path class="s1" d="M20 9.4Q32 12 44 9.4V22.6Q32 20 20 22.6Z"/><circle class="s1" cx="16" cy="16" r="11"/><circle class="s1" cx="48" cy="16" r="11"/></svg>
        <div><b>相连成岛</b><span>上下左右相连的同色棋子算一座岛，斜着不算。</span></div>
      </li>
      <li>
        <svg viewBox="0 0 64 32" aria-hidden="true"><circle class="s1" cx="10" cy="16" r="7"/><circle class="s1" cx="32" cy="16" r="7"/><circle class="s1" cx="54" cy="16" r="7"/></svg>
        <div><b>岛多者胜</b><span>只剩一个空格时数岛，多的一方获胜，大小不计。</span></div>
      </li>
    </ul>`;
  ctx.say("每一手都同时是进攻和让步。第一局不妨从「入门」对手开始。", "ok");
  ctx.done();
}

const LESSONS = [
  {
    title: "一手，落两枚子",
    body: "黑方先行。轮到你时，先选一个空格放下自己的棋子，再选另一个空格，替对方放下一枚。",
    run: lessonMove,
  },
  {
    title: "相连成岛",
    body: "上下左右相邻的同色棋子连成一座岛。斜着挨着不算相连。",
    run: lessonIslands,
  },
  {
    title: "岛越多，分越高",
    body: "每座岛计一分，和岛的大小无关。所以好的一手，往往是让自己的子各自独立，把送出的子用来连接对方的岛。",
    run: lessonScore,
  },
  {
    title: "最后一格",
    body: "棋盘只剩一个空格时，对局结束。双方各数自己的岛，多者获胜，一样多则平局。",
    run: lessonEnd,
  },
  {
    title: "你已经会了",
    body: "规则只有三条，真正的乐趣在下棋本身。",
    run: lessonRecap,
    finale: true,
  },
];

// ---------- Course shell ----------

export function createLearn({ root, reducedMotion, onClose, onFinish, onHome }) {
  const lessonEl = root.querySelector(".lesson");
  const titleEl = root.querySelector("#lesson-title");
  const bodyEl = root.querySelector("#lesson-body");
  const stageEl = root.querySelector("#lesson-stage");
  const feedbackEl = root.querySelector("#lesson-feedback");
  const nextBtn = root.querySelector("#lesson-next");
  const retryBtn = root.querySelector("#lesson-retry");
  const progressEl = root.querySelector("#learn-progress");

  let index = 0;
  let token = 0;
  let busy = false;
  const completed = new Set();

  progressEl.innerHTML = LESSONS.map((l, i) =>
    `<button type="button" class="capsule" data-i="${i}" aria-label="第 ${i + 1} 课：${l.title}"></button>`).join("");
  const capsules = [...progressEl.children];

  function say(text, tone = "hint") {
    const html = (tone === "hint" ? "" : ICONS[tone === "ok" ? "check" : "info"]) + `<span>${text}</span>`;
    if (feedbackEl.dataset.html === html) {
      if (tone === "warn") {
        feedbackEl.classList.remove("again");
        void feedbackEl.offsetWidth;
        feedbackEl.classList.add("again");
      }
      return;
    }
    feedbackEl.dataset.html = html;
    feedbackEl.dataset.tone = tone;
    if (reducedMotion.matches || !feedbackEl.innerHTML) {
      feedbackEl.innerHTML = html;
      return;
    }
    feedbackEl.classList.add("swap");
    clearTimeout(say.timer);
    say.timer = setTimeout(() => {
      feedbackEl.innerHTML = feedbackEl.dataset.html;
      feedbackEl.classList.remove("swap");
    }, 140);
  }

  function renderChrome() {
    const lesson = LESSONS[index];
    capsules.forEach((c, i) => {
      c.classList.toggle("current", i === index);
      c.classList.toggle("done", completed.has(i) && i !== index);
      c.toggleAttribute("aria-current", i === index);
    });
    nextBtn.textContent = lesson.finale ? "开始对局" : "继续";
    nextBtn.disabled = !completed.has(index);
    retryBtn.textContent = lesson.finale ? "回到首页" : "再试一次";
  }

  function build() {
    const lesson = LESSONS[index];
    const mine = ++token;
    titleEl.textContent = lesson.title;
    bodyEl.textContent = lesson.body;
    stageEl.replaceChildren();
    retryBtn.hidden = !lesson.finale;
    feedbackEl.innerHTML = "";
    delete feedbackEl.dataset.html;

    const ctx = {
      stage: stageEl,
      alive: () => mine === token,
      wait: (ms) => sleep(reducedMotion.matches ? Math.min(ms, 120) : ms),
      say: (text, tone) => { if (mine === token) say(text, tone); },
      done({ retry = false } = {}) {
        if (mine !== token) return;
        completed.add(index);
        if (retry) retryBtn.hidden = false;
        renderChrome();
        if (!lesson.finale) nextBtn.classList.add("ready");
      },
      mountBoard(n) {
        const wrap = document.createElement("div");
        wrap.className = "lesson-board";
        const head = document.createElement("div");
        head.className = "board-head";
        const boardEl = document.createElement("div");
        boardEl.className = "board";
        boardEl.tabIndex = 0;
        boardEl.setAttribute("role", "application");
        boardEl.setAttribute("aria-label", "练习棋盘。方向键移动，空格或回车落子。");
        wrap.append(head, boardEl);
        stageEl.append(wrap);
        const view = createBoardView(boardEl, n);
        if (!reducedMotion.matches) view.intro();
        return { view, head };
      },
    };
    nextBtn.classList.remove("ready");
    renderChrome();
    lesson.run(ctx);
  }

  async function goTo(i, { animate = true } = {}) {
    if (busy || i < 0 || i >= LESSONS.length) return;
    const dir = i >= index ? 1 : -1;
    const motion = animate && !reducedMotion.matches;
    busy = true;
    token++;
    if (motion) {
      lessonEl.style.setProperty("--dx", `${-dir * 24}px`);
      lessonEl.classList.remove("entering");
      lessonEl.classList.add("leaving");
      await sleep(200);
    }
    index = i;
    build();
    if (motion) {
      lessonEl.style.setProperty("--dx", `${dir * 32}px`);
      lessonEl.classList.remove("leaving");
      void lessonEl.offsetWidth;
      lessonEl.classList.add("entering");
    }
    busy = false;
  }

  nextBtn.addEventListener("click", () => {
    if (LESSONS[index].finale) return onFinish();
    goTo(index + 1);
  });
  retryBtn.addEventListener("click", () => {
    if (LESSONS[index].finale) return onHome();
    goTo(index);
  });
  progressEl.addEventListener("click", (event) => {
    const c = event.target.closest(".capsule");
    if (c) goTo(Number(c.dataset.i));
  });
  root.querySelector("#learn-close").addEventListener("click", onClose);
  lessonEl.addEventListener("animationend", () => lessonEl.classList.remove("entering"));

  function onKey(event) {
    if (event.target.closest?.(".board, dialog")) return;
    if (event.key === "Escape") onClose();
    else if (event.key === "ArrowRight" && completed.has(index) && !LESSONS[index].finale) goTo(index + 1);
    else if (event.key === "ArrowLeft") goTo(index - 1);
  }

  return {
    enter() {
      completed.clear();
      index = 0;
      build();
      document.addEventListener("keydown", onKey);
    },
    leave() {
      token++;
      document.removeEventListener("keydown", onKey);
    },
  };
}
