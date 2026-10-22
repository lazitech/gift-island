import { createGiftIslandsClient } from "./client.js";
import * as rules from "./rules.js";
import { createBoardView, bindBoardInput, focusCell } from "./board-view.js";
import { createHome } from "./home.js";
import { createLearn, hasLearned } from "./learn.js";
import { createEgg } from "./egg.js";
import { sealRecord, recordWin } from "./seal.js";

// ---------- Constants ----------

const N = 9;
const AREA = N * N;

const params = new URLSearchParams(location.search);
// Locally serve.sh runs beside a backend on :8765; deployed, the site proxies /api/v1 on its own origin.
const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];
const API_BASE = params.get("api") || (LOCAL_HOSTS.includes(location.hostname) ? "http://127.0.0.1:8765" : location.origin);
const api = createGiftIslandsClient({ baseUrl: API_BASE });

const STORE_KEY = "giftislands.game.v1";
const LEVEL_NAMES = { level1: "入门", level2: "初级", level3: "进阶", best: "最强" };
const THINK_SIMS = { fast: 128, normal: 256, deep: 512 };
const COLOR_NAME = { 1: "黑", 2: "白" };
const COLS = "ABCDEFGHI";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (sel) => document.querySelector(sel);

// ---------- Rules (mirrors giftisland/game.py) ----------

const emptyBoard = () => new Array(AREA).fill(0);

const islandsOf = (board, color) => rules.islandsOf(board, color, N);
const scoresOf = (board) => rules.scoresOf(board, N);

function positionOf(board) {
  let black = 0, empty = 0;
  for (const v of board) { if (v === 1) black++; else if (v === 0) empty++; }
  const scores = scoresOf(board);
  const terminal = empty < 2;
  let winner = null;
  if (terminal) winner = scores[1] > scores[2] ? 1 : scores[2] > scores[1] ? 2 : 0;
  return { player: black % 2 === 0 ? 1 : 2, moveNumber: black, empty, scores, terminal, winner };
}

const toPoint = (i) => [Math.floor(i / N), i % N];
const fromPoint = ([r, c]) => r * N + c;
const cellName = (i) => `${COLS[i % N]}${Math.floor(i / N) + 1}`;

function isValidBoard(board) {
  if (!Array.isArray(board) || board.length !== AREA) return false;
  let b = 0, w = 0;
  for (const v of board) {
    if (v === 1) b++; else if (v === 2) w++; else if (v !== 0) return false;
  }
  return b === w;
}

// ---------- State ----------

let settings = { opponent: "level3", humanColor: 1, think: "normal" };
/** Each entry: { board, move: {player, self, gift} | null, value: black-perspective AI estimate | null } */
let history = [{ board: emptyBoard(), move: null, value: null }];

const ui = {
  pending: null,
  hover: null,
  focus: 40,
  keyboard: false,
  thinking: false,
  staged: null,
  counting: null,
  error: null,
};

let hasSavedGame = false;
let maxSimulations = 512;
let engineReady = null;
let aiController = null;
let turnToken = 0;

const current = () => history[history.length - 1];
const position = () => positionOf(current().board);
const vsAI = () => settings.opponent !== "human";
const aiColor = () => 3 - settings.humanColor;
const levelName = () => LEVEL_NAMES[settings.opponent] ?? "AI";

function isHumanTurn(pos = position()) {
  return !pos.terminal && (!vsAI() || pos.player === settings.humanColor);
}

function canInteract() {
  return isHumanTurn() && !ui.thinking && !ui.counting && !ui.staged;
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ settings, history }));
  } catch { /* storage unavailable: the game still works for this tab */ }
}

function restore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!data || !Array.isArray(data.history) || !data.history.length) return false;
    if (!data.history.every((e) => isValidBoard(e.board))) return false;
    const s = data.settings || {};
    settings = {
      opponent: s.opponent in LEVEL_NAMES || s.opponent === "human" ? s.opponent : "level3",
      humanColor: s.humanColor === 2 ? 2 : 1,
      think: s.think in THINK_SIMS ? s.think : "normal",
    };
    history = data.history.map((e) => ({ board: e.board, move: e.move ?? null, value: e.value ?? null }));
    return true;
  } catch {
    return false;
  }
}

// ---------- Board (SVG) ----------

const boardEl = $("#board");
const view = createBoardView(boardEl, N);

/** What the board should show right now: real stones, the pending stone, and a hover preview. */
function displayModel() {
  const base = ui.staged ?? current().board;
  const solid = base.slice();
  const ghost = new Array(AREA).fill(0);
  if (canInteract()) {
    const me = position().player;
    if (ui.pending !== null) solid[ui.pending] = me;
    const target = ui.keyboard ? ui.focus : ui.hover;
    if (target !== null && base[target] === 0 && target !== ui.pending) {
      ghost[target] = ui.pending !== null ? 3 - me : me;
    }
  }
  return { base, solid, ghost };
}

function renderBoard(model) {
  const move = !ui.staged && current().move;
  const interactive = canInteract();
  view.render({
    solid: model.solid,
    ghost: model.ghost,
    last: move ? [move.self, move.gift] : null,
    pending: ui.pending !== null && interactive ? ui.pending : null,
    focus: focusCell(view, ui),
    locked: !interactive,
  });
}

// ---------- Scoreboard, hint, banner ----------

const scoreEls = { 1: $("#score-1"), 2: $("#score-2") };
const deltaEls = { 1: $("#delta-1"), 2: $("#delta-2") };
const sideEls = { 1: $("#side-1"), 2: $("#side-2") };
const nameEls = { 1: $("#name-1"), 2: $("#name-2") };
const hintEl = $("#hint");
const undoBtn = $("#undo");

function setScore(color, value) {
  const el = scoreEls[color];
  const text = String(value);
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

function renderScores(model) {
  const pos = position();
  const real = ui.counting ? ui.counting.shown : scoresOf(model.base);
  const preview = model.solid.map((v, i) => v || model.ghost[i]);
  const next = scoresOf(preview);
  for (const color of [1, 2]) {
    setScore(color, real[color]);
    const d = ui.counting ? 0 : next[color] - real[color];
    const el = deltaEls[color];
    if (d !== 0) el.textContent = d > 0 ? `+${d}` : `−${-d}`;
    el.classList.toggle("show", d !== 0);
    el.classList.toggle("down", d < 0);

    nameEls[color].textContent = vsAI()
      ? (color === settings.humanColor ? "你" : levelName())
      : `${COLOR_NAME[color]}方`;
    sideEls[color].classList.toggle("active", pos.terminal ? pos.winner === color || pos.winner === 0 : pos.player === color);
    sideEls[color].classList.toggle("thinking", ui.thinking && color === aiColor());
  }
  $("#move-no").textContent = pos.moveNumber;

  const balance = $("#balance");
  const last = [...history].reverse().find((e) => e.value !== null);
  balance.hidden = !vsAI() || !last;
  if (last) {
    const v = Math.max(-1, Math.min(1, last.value));
    const bar = balance.firstElementChild;
    bar.style.transform = `scaleX(${-v})`;
  }
}

let hintText = "";
function setHint(html) {
  if (html === hintText) return;
  hintText = html;
  if (reducedMotion.matches || !hintEl.innerHTML) {
    hintEl.innerHTML = html;
    return;
  }
  hintEl.classList.add("swap");
  clearTimeout(setHint.timer);
  setHint.timer = setTimeout(() => {
    hintEl.innerHTML = hintText;
    hintEl.classList.remove("swap");
  }, 140);
}

function renderHint() {
  const pos = position();
  if (ui.counting) return setHint("数岛中");
  if (pos.terminal) {
    const result = pos.winner === 0 ? "平局" : vsAI() ? (pos.winner === settings.humanColor ? "你赢了" : `${levelName()}赢了`) : `${COLOR_NAME[pos.winner]}方获胜`;
    return setHint(`棋局结束，${result}`);
  }
  if (ui.thinking || ui.staged) return setHint(`<span class="ellipsis">${levelName()}正在思考</span>`);
  if (vsAI() && pos.player !== settings.humanColor) return setHint(`轮到${levelName()}`);
  const me = COLOR_NAME[pos.player], them = COLOR_NAME[3 - pos.player];
  const who = vsAI() ? "" : `${me}方：`;
  if (ui.pending === null) return setHint(`${who}选一个空格，放下你的${me}子`);
  return setHint(`${who}再选一个空格，送给对方一枚${them}子`);
}

const banner = $("#banner");
function renderBanner() {
  if (!ui.error) {
    banner.hidden = true;
    return;
  }
  $("#banner-text").textContent = ui.error.text;
  $("#banner-action").textContent = ui.error.actionLabel ?? "重试";
  banner.hidden = false;
}

function canUndo() {
  if (ui.counting) return false;
  if (!vsAI()) return history.length > 1;
  return history.some((e) => e.move && e.move.player === settings.humanColor);
}

function render() {
  const model = displayModel();
  renderBoard(model);
  renderScores(model);
  renderHint();
  renderBanner();
  undoBtn.disabled = !canUndo();
}

function announce(text) {
  $("#announce").textContent = text;
}

// ---------- Turns ----------

function pushPosition(board, move, value = null) {
  history.push({ board, move, value });
  save();
}

async function commitHumanMove(self, gift) {
  const pos = position();
  const board = current().board.slice();
  board[self] = pos.player;
  board[gift] = 3 - pos.player;
  ui.pending = null;
  pushPosition(board, { player: pos.player, self, gift });
  announce(`${COLOR_NAME[pos.player]}子落在 ${cellName(self)}，送给对方 ${cellName(gift)}`);
  render();
  await afterMove();
}

async function afterMove() {
  const pos = position();
  if (pos.terminal) return finishGame();
  if (vsAI() && pos.player === aiColor()) return aiTurn();
}

function errorFor(err) {
  if (err?.code === "network_error") {
    return "无法连接引擎。请在后端目录运行 bash start.sh。";
  }
  if (err?.code === "inference_timeout") return "AI 计算超时。";
  if (err?.code === "engine_busy") return "引擎仍在处理上一个请求。";
  return err?.message || "AI 出招失败。";
}

async function aiTurn() {
  const token = ++turnToken;
  const before = current();
  const pos = position();
  ui.thinking = true;
  ui.error = null;
  render();

  aiController = new AbortController();
  const started = performance.now();
  const payload = {
    board: before.board,
    player: pos.player,
    level: settings.opponent,
    simulations: Math.min(THINK_SIMS[settings.think], maxSimulations),
  };

  let result = null;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        result = await api.aiMove(payload, { signal: aiController.signal });
        break;
      } catch (err) {
        // A previous search (e.g. one abandoned by undo) still holds the engine; wait for it.
        if (err?.code === "engine_busy" && attempt < 60 && token === turnToken) {
          await sleep(700);
          continue;
        }
        throw err;
      }
    }
  } catch (err) {
    if (token !== turnToken || err?.name === "AbortError") return;
    ui.thinking = false;
    engineReady = err?.code === "network_error" ? false : engineReady;
    ui.error = { text: errorFor(err), action: () => aiTurn() };
    render();
    return;
  }
  if (token !== turnToken || current() !== before) return;

  engineReady = true;
  // Give very fast replies a beat, so the turn change is perceptible.
  const minThink = reducedMotion.matches ? 0 : 420;
  const elapsed = performance.now() - started;
  if (elapsed < minThink) await sleep(minThink - elapsed);
  if (token !== turnToken) return;

  const board = result.position.board;
  const self = fromPoint(result.move.self_point);
  const gift = fromPoint(result.move.opponent_point);
  const value = result.search.signed_value * (pos.player === 1 ? 1 : -1);

  // Two beats: the AI places its own stone, then hands over the gift.
  ui.thinking = false;
  if (!reducedMotion.matches) {
    const staged = before.board.slice();
    staged[self] = pos.player;
    ui.staged = staged;
    render();
    await sleep(260);
    if (token !== turnToken) return;
  }
  ui.staged = null;
  pushPosition(board, { player: pos.player, self, gift }, value);
  announce(`${levelName()}落在 ${cellName(self)}，送给你 ${cellName(gift)}`);
  render();
  await afterMove();
}

function cancelAI() {
  turnToken++;
  aiController?.abort();
  aiController = null;
  ui.thinking = false;
  ui.staged = null;
}

function undo() {
  if (!canUndo()) return;
  cancelAI();
  closeDialog(resultDialog);
  ui.pending = null;
  ui.error = null;
  if (!vsAI()) {
    history.pop();
  } else {
    // Rewind to just before the human's most recent move, dropping the AI's reply.
    while (history.length > 1) {
      const e = history.pop();
      if (e.move && e.move.player === settings.humanColor) break;
    }
  }
  save();
  render();
}

// ---------- End of game: count the islands ----------

async function finishGame() {
  const token = turnToken;
  const board = current().board;
  const islands = { 1: islandsOf(board, 1), 2: islandsOf(board, 2) };

  // A game that ends while the player is elsewhere is simply shown finished when they return.
  if (route !== "play") return render();

  if (!reducedMotion.matches) {
    ui.counting = { shown: { 1: 0, 2: 0 } };
    render();
    await sleep(500);
    const steps = Math.max(islands[1].length, islands[2].length);
    const beat = Math.max(55, Math.min(150, 1500 / Math.max(steps, 1)));
    for (let k = 0; k < steps; k++) {
      if (token !== turnToken || !ui.counting) return;
      for (const color of [1, 2]) {
        const island = islands[color][k];
        if (!island) continue;
        view.light(island, color);
        ui.counting.shown[color] = k + 1;
      }
      renderScores(displayModel());
      await sleep(beat);
    }
    await sleep(600);
    if (token !== turnToken) return;
    ui.counting = null;
  }
  render();
  if (route === "play") openResult();
}

// ---------- Dialogs ----------

const setupDialog = $("#setup");
const resultDialog = $("#result");
const setupForm = $("#setup-form");

function openDialog(dialog) {
  if (dialog.open) return;
  dialog.classList.remove("closing");
  dialog.showModal();
}

/** Resolves once the dialog has finished closing. */
function closeDialog(dialog) {
  return new Promise((resolve) => {
    if (!dialog.open) return resolve();
    if (reducedMotion.matches) {
      dialog.close();
      return resolve();
    }
    dialog.addEventListener("close", () => resolve(), { once: true });
    if (dialog.classList.contains("closing")) return;
    dialog.classList.add("closing");
    dialog.addEventListener("animationend", () => {
      dialog.classList.remove("closing");
      dialog.close();
    }, { once: true });
  });
}

function syncSegments() {
  for (const seg of setupForm.querySelectorAll(".seg")) {
    const inputs = [...seg.querySelectorAll("input")];
    seg.style.setProperty("--count", inputs.length);
    seg.style.setProperty("--index", Math.max(0, inputs.findIndex((i) => i.checked)));
  }
  const form = new FormData(setupForm);
  $("#ai-fields").classList.toggle("closed", form.get("opponent") === "human");
}

/**
 * `suggest` preselects an opponent for someone who has never set up a game;
 * `opponent` preselects one regardless.
 */
function openSetup({ suggest = null, opponent = null } = {}) {
  setupForm.elements.opponent.value = opponent ?? (suggest && !hasSavedGame ? suggest : settings.opponent);
  setupForm.elements.color.value = String(settings.humanColor);
  setupForm.elements.think.value = settings.think;
  syncSegments();
  openDialog(setupDialog);
}

function startGame() {
  cancelAI();
  closeDialog(resultDialog);
  history = [{ board: emptyBoard(), move: null, value: null }];
  ui.pending = null;
  ui.error = null;
  ui.counting = null;
  hasSavedGame = true;
  save();
  if (route === "play") playIntro();
  render();
  afterMove();
}

function openResult() {
  const pos = position();
  const { scores, winner } = pos;
  let title;
  if (winner === 0) title = "平局";
  else if (vsAI()) title = winner === settings.humanColor ? "你赢了" : `${levelName()}赢了`;
  else title = `${COLOR_NAME[winner]}方获胜`;
  $("#result-title").textContent = title;
  $("#result-score").textContent = `黑 ${scores[1]} 座岛，白 ${scores[2]} 座岛`;
  openDialog(resultDialog);
}

function playIntro() {
  if (!reducedMotion.matches) view.intro();
}

// ---------- Input ----------

function choose(cell) {
  if (!canInteract() || cell === null) return;
  const board = current().board;
  if (board[cell] !== 0) return view.nope();
  if (ui.pending === null) {
    ui.pending = cell;
    render();
  } else if (ui.pending === cell) {
    ui.pending = null;
    render();
  } else {
    commitHumanMove(ui.pending, cell);
  }
}

bindBoardInput(view, ui, { onChange: render, onChoose: choose });

document.addEventListener("keydown", (event) => {
  if (route !== "play" || setupDialog.open || resultDialog.open) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
  } else if (event.key === "Escape" && ui.pending !== null) {
    ui.pending = null;
    render();
  }
});

for (const color of [1, 2]) {
  sideEls[color].addEventListener("pointerenter", () => { boardEl.dataset.spot = color; });
  sideEls[color].addEventListener("pointerleave", () => { delete boardEl.dataset.spot; });
}

undoBtn.addEventListener("click", undo);
$("#new").addEventListener("click", () => openSetup());
$("#to-home").addEventListener("click", () => go("home"));
$("#to-learn").addEventListener("click", () => go("learn"));
$("#banner-action").addEventListener("click", () => ui.error?.action?.());

setupForm.addEventListener("change", syncSegments);
setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(setupForm);
  settings = {
    opponent: form.get("opponent"),
    humanColor: Number(form.get("color")) === 2 ? 2 : 1,
    think: form.get("think"),
  };
  startGame();
  await closeDialog(setupDialog);
  go("play");
});
$("#setup-cancel").addEventListener("click", () => closeDialog(setupDialog));
$("#setup-learn").addEventListener("click", async () => {
  await closeDialog(setupDialog);
  go("learn");
});
for (const dialog of [setupDialog, resultDialog]) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });
}

$("#result-board").addEventListener("click", () => closeDialog(resultDialog));
$("#result-again").addEventListener("click", startGame);

// ---------- Engine connection ----------

async function connect() {
  try {
    const info = await api.getModels();
    maxSimulations = info.max_simulations ?? maxSimulations;
    engineReady = true;
    if (ui.error?.connection) ui.error = null;
  } catch {
    engineReady = false;
    if (vsAI()) {
      ui.error = {
        connection: true,
        text: "无法连接引擎。请在后端目录运行 bash start.sh。",
        action: async () => {
          await connect();
          if (engineReady) resumeTurn();
        },
      };
    }
  }
  render();
}

/** Let the AI move if it is its turn and nothing is already under way. */
function resumeTurn() {
  if (engineReady === false || ui.thinking || ui.staged || ui.counting) return;
  const pos = position();
  if (!pos.terminal && vsAI() && pos.player === aiColor()) aiTurn();
}

// ---------- Views: home, learn, play, and the easter egg ----------

const views = { home: $("#view-home"), learn: $("#view-learn"), play: $("#view-play"), egg: $("#view-egg") };
const TITLES = { home: "赠岛", learn: "学习规则 · 赠岛", play: "对局 · 赠岛", egg: "岛主 · 赠岛" };
let route = null;
let learnReturn = "home";
let eggFresh = false;

function gameSummary() {
  const pos = position();
  if (!hasSavedGame || pos.terminal || history.length < 2) return null;
  const against = vsAI() ? `对阵${levelName()}` : "双人对局";
  return { label: `第 ${pos.moveNumber} 手 · ${against}` };
}

const home = createHome({
  root: views.home,
  reducedMotion,
  summary: gameSummary,
  learned: hasLearned,
  onPlay: () => go("play"),
  onNew: () => openSetup(),
  onLearn: () => go("learn"),
  onWin: (score) => {
    recordWin(score);
    eggFresh = true;
    go("egg");
  },
  onSeal: () => go("egg"),
});

const learn = createLearn({
  root: views.learn,
  reducedMotion,
  onClose: () => go(learnReturn),
  onHome: () => go("home"),
  onFinish: () => openSetup({ suggest: "level1" }),
});

const egg = createEgg({
  root: views.egg,
  reducedMotion,
  onHome: () => go("home"),
  onPlay: () => openSetup({ opponent: "best" }),
});

const routeFromHash = () => {
  const name = location.hash.replace(/^#\/?/, "");
  return name in views ? name : "home";
};

function go(name) {
  const hash = `#/${name === "home" ? "" : name}`;
  if (location.hash !== hash) location.hash = hash;
  else show(name);
}

function show(name) {
  // The egg page exists only for someone who has earned it.
  if (name === "egg" && !sealRecord()) {
    window.history.replaceState(null, "", "#/");
    name = "home";
  }
  if (name === route) return;
  const prev = route;
  route = name;
  if (name === "learn" && prev) learnReturn = prev;

  const swap = () => {
    if (setupDialog.open) setupDialog.close();
    if (resultDialog.open) resultDialog.close();
    if (prev === "home") home.leave();
    if (prev === "learn") learn.leave();
    for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
    document.title = TITLES[name];
    window.scrollTo(0, 0);
    if (name === "home") home.enter();
    if (name === "learn") learn.enter();
    if (name === "egg") {
      egg.enter({ fresh: eggFresh });
      eggFresh = false;
    }
    if (name === "play") {
      render();
      if (history.length === 1) playIntro();
      resumeTurn();
    }
  };

  const el = views[name];
  if (!prev || reducedMotion.matches) return swap();
  if (document.startViewTransition) {
    document.startViewTransition(swap);
    return;
  }
  swap();
  el.classList.remove("view-enter");
  void el.offsetWidth;
  el.classList.add("view-enter");
}

addEventListener("hashchange", () => show(routeFromHash()));

// ---------- Boot ----------

hasSavedGame = restore();
render();
show(routeFromHash());
connect().then(() => {
  if (engineReady && route === "play") resumeTurn();
});
