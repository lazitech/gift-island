import { DAO, ZHU, compose } from "./glyphs.js";
import { drawStones } from "./board-view.js";

// The 岛主 seal: the reward for beating the title board. 岛 above 主, read top to bottom as on
// a seal, cut as white strokes into vermilion. The record of wins stays in this browser.

const STORE_KEY = "giftislands.seal.v1";
const COLS = 13, ROWS = 27;
const CARVED = 33;  // near-straight bridges, so the strokes read as cut lines rather than beads

export function sealRecord() {
  try {
    const record = JSON.parse(localStorage.getItem(STORE_KEY));
    return record && Number.isInteger(record.wins) && record.wins > 0 && record.last ? record : null;
  } catch {
    return null;
  }
}

/** Remember a win: `score` is each side's islands gained, { black, white }. */
export function recordWin(score) {
  const prev = sealRecord();
  const record = { first: prev?.first ?? Date.now(), wins: (prev?.wins ?? 0) + 1, last: { ...score, at: Date.now() } };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(record));
  } catch { /* without storage the egg still opens, the seal just isn't kept */ }
  return record;
}

/** Draw the seal into a .seal element that holds an <svg>. */
export function drawSeal(sealEl) {
  const { order } = compose(COLS, ROWS, [[DAO, 0, 0, 2], [ZHU, 15, 0, 2]]);
  drawStones(sealEl.querySelector("svg"), COLS, ROWS, order.flat(), 2, { waist: CARVED });
  sealEl.style.setProperty("--cols", COLS);
  sealEl.style.setProperty("--rows", ROWS);
  sealEl.style.setProperty("--stones", order.flat().length);
}

const STEMS = "甲乙丙丁戊己庚辛壬癸";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const DIGITS = "〇一二三四五六七八九";

/** 1 → 一, 12 → 十二, 30 → 三十. */
export function chineseNumber(n) {
  if (n < 10) return DIGITS[n];
  if (n >= 100) return String(n);
  const tens = Math.floor(n / 10), ones = n % 10;
  return `${tens > 1 ? DIGITS[tens] : ""}十${ones ? DIGITS[ones] : ""}`;
}

/** "丙午年秋": the year in the sexagenary cycle, turning at 立春 (about 4 February), and the season. */
export function seasonOf(time) {
  const d = new Date(time);
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  const year = d.getFullYear() - (md < 204 ? 1 : 0);
  const season = md >= 1107 || md < 204 ? "冬" : md >= 807 ? "秋" : md >= 505 ? "夏" : "春";
  const k = (((year - 4) % 60) + 60) % 60;
  return `${STEMS[k % 10]}${BRANCHES[k % 12]}年${season}`;
}
