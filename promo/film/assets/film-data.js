// The film's single source of truth: the demo game, every event time and the score.
// Loaded by the page (window.FILM_DATA) and by tools/music.cjs (require), so picture and
// sound are cut from the same numbers. All times are seconds from the film's first frame.
(function (root) {
  "use strict";

  const BPM = 90;
  const BEAT = 60 / BPM; // 0.667 s = 20 frames at 30 fps
  const b = (n) => Math.round(n * BEAT * 30) / 30; // beat index → time, snapped to a frame
  const DURATION = 53;

  // ---------------------------------------------------------------- glyphs (frontend/glyphs.js)
  function line([r0, c0], [r1, c1]) {
    const dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0), out = [];
    for (let r = r0, c = c0; ; r += dr, c += dc) {
      out.push([r, c]);
      if (r === r1 && c === c1) return out;
    }
  }
  const ZENG = {
    width: 15, height: 14,
    strokes: [
      line([1, 0], [9, 0]),
      [...line([1, 1], [1, 4]), ...line([2, 4], [9, 4])],
      [...line([3, 2], [10, 2]), [11, 1], [12, 0]],
      [[11, 3], [12, 4]],
      [[0, 8], [1, 9]],
      [[0, 12], [1, 11]],
      line([3, 6], [7, 6]),
      [...line([3, 7], [3, 14]), ...line([4, 14], [7, 14])],
      [[5, 8]],
      [[5, 12]],
      line([4, 10], [6, 10]),
      line([7, 7], [7, 13]),
      line([9, 7], [13, 7]),
      [...line([9, 8], [9, 13]), ...line([10, 13], [13, 13])],
      line([11, 8], [11, 12]),
      line([13, 8], [13, 12]),
    ],
  };
  const DAO = {
    width: 13, height: 14,
    strokes: [
      [[0, 6], [1, 5]],
      [...line([2, 1], [2, 10]), ...line([3, 10], [6, 10])],
      [[4, 4], [5, 5]],
      [...line([3, 1], [7, 1]), ...line([7, 2], [7, 12]), ...line([8, 12], [13, 12]), [13, 11], [13, 10]],
      line([9, 4], [11, 4]),
      [...line([10, 0], [12, 0]), ...line([12, 1], [12, 8])],
      line([10, 8], [11, 8]),
    ],
  };

  /** The home page's "across" title: 33 × 16 cells, 赠 at (1,1) in black, 岛 at (1,19) in white. */
  const TITLE = { cols: 33, rows: 16, glyphs: [[ZENG, 1, 1, 1], [DAO, 1, 19, 2]] };

  /** Stones of the title in writing order: [{cell, color, stroke}], strokes numbered across both glyphs. */
  function titleStones() {
    const out = [];
    let stroke = 0;
    for (const [glyph, r0, c0, color] of TITLE.glyphs) {
      for (const s of glyph.strokes) {
        s.forEach(([r, c], k) => out.push({ cell: (r0 + r) * TITLE.cols + c0 + c, color, stroke, k }));
        stroke++;
      }
    }
    return { stones: out, strokes: stroke };
  }

  // ---------------------------------------------------------------- the demo game (7 × 7, black first)
  const N = 7;
  const at = (r, c) => r * N + c;
  // [self, gift]: odd moves are black's (self black, gift white), even moves white's.
  const MOVES = [
    [at(1, 3), at(3, 4)], //  1 B
    [at(3, 5), at(6, 3)], //  2 W
    [at(0, 3), at(5, 5)], //  3 B
    [at(3, 0), at(1, 0)], //  4 W
    [at(2, 3), at(6, 6)], //  5 B
    [at(3, 1), at(4, 5)], //  6 W
    [at(0, 2), at(5, 6)], //  7 B
    [at(3, 6), at(5, 1)], //  8 W
    [at(0, 4), at(6, 5)], //  9 B
    [at(3, 2), at(5, 2)], // 10 W  → black 5 islands, white 3
    [at(1, 2), at(3, 3)], // 11 B  the gift that joins white's row: white 3 → 2
    [at(1, 5), at(4, 1)], // 12 W
    [at(4, 2), at(2, 2)], // 13 B
    [at(1, 4), at(0, 6)], // 14 W
    [at(4, 3), at(6, 2)], // 15 B
    [at(2, 1), at(5, 4)], // 16 W
    [at(4, 0), at(0, 5)], // 17 B
    [at(2, 4), at(2, 0)], // 18 W
    [at(0, 1), at(1, 6)], // 19 B
    [at(5, 3), at(6, 1)], // 20 W
    [at(4, 6), at(0, 0)], // 21 B
    [at(1, 1), at(2, 5)], // 22 W
    [at(5, 0), at(2, 6)], // 23 B
    [at(4, 4), at(6, 4)], // 24 W  → board full but (6,0): black 7, white 5
  ];
  const HOLE = at(6, 0);
  const GHOST_CORNER = at(0, 6);

  function neighbors(i) {
    const r = Math.floor(i / N), c = i % N, out = [];
    if (r > 0) out.push(i - N);
    if (r < N - 1) out.push(i + N);
    if (c > 0) out.push(i - 1);
    if (c < N - 1) out.push(i + 1);
    return out;
  }
  function islandsOf(board, color) {
    const seen = new Uint8Array(N * N), islands = [];
    for (let i = 0; i < N * N; i++) {
      if (board[i] !== color || seen[i]) continue;
      const island = [], stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop();
        island.push(j);
        for (const k of neighbors(j)) if (board[k] === color && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
      islands.push(island.sort((x, y) => x - y));
    }
    return islands;
  }
  function boardAfter(moves) {
    const board = new Array(N * N).fill(0);
    MOVES.slice(0, moves).forEach(([self, gift], k) => {
      const color = k % 2 === 0 ? 1 : 2;
      board[self] = color;
      board[gift] = 3 - color;
    });
    return board;
  }

  // ---------------------------------------------------------------- scene times
  const T = {
    s1: [0, b(10)],
    game: [b(10), b(70)], // the 7 × 7 board, shots 2–5
    s2: [b(10), b(22)],
    s3: [b(22), b(36)],
    s4: [b(36), b(52)],
    s5: [b(52), b(70)],
    s6: [b(70), DURATION],
  };

  // Title (shot 1): one stroke per sixteenth from beat 1; stones of a stroke 30 ms apart.
  const title = titleStones();
  const TITLE_TIMES = { dots: 0, strokeStart: b(1), strokeStep: BEAT / 4, stoneStep: 0.03, caption: b(7) };
  // End card (shot 6): the same title written in the bar before the final chord (bar 18, 48.0 s).
  const MARK_TIMES = { dots: b(70), strokeStart: b(70.5), strokeStep: (b(72) - b(70.5) - 0.15) / title.strokes, stoneStep: 0.012 };

  const placements = []; // {cell, color, land, launch, from, move}
  const notes = [];
  const lastMarks = []; // {t, cells: [a, b|null] | null}
  const lit = []; // {t, cells, color, hold}
  const counters = []; // {t, color, value | preview | show | hide}
  const dims = []; // {color, t0, t1, from, to}
  const badges = []; // {cell, label, t0, t1}: a numbered sticker on an island while it is counted
  const islandCenter = (cells) => {
    const cy = cells.reduce((s, i) => s + Math.floor(i / N), 0) / cells.length;
    const cx = cells.reduce((s, i) => s + (i % N), 0) / cells.length;
    return cells.reduce((best, i) => {
      const d = (Math.floor(i / N) - cy) ** 2 + ((i % N) - cx) ** 2;
      return d < best.d ? { i, d } : best;
    }, { i: cells[0], d: Infinity }).i;
  };

  /** A move as it is played: your own stone, then — a beat later — the one you give away. */
  function place(moveIndex, t, { gap = BEAT, quiet = false, marks = false } = {}) {
    const [self, gift] = MOVES[moveIndex];
    const color = moveIndex % 2 === 0 ? 1 : 2;
    placements.push({ cell: self, color, land: t, launch: t, from: null, move: moveIndex + 1 });
    placements.push({ cell: gift, color: 3 - color, land: t + gap, launch: t + gap, from: null, move: moveIndex + 1 });
    notes.push({ t, role: "self", move: moveIndex + 1, quiet });
    if (!quiet) notes.push({ t: t + gap, role: "gift", move: moveIndex + 1 });
    if (marks) lastMarks.push({ t: t + gap, cells: [self, gift] });
  }

  // Shot 2: three moves at playing speed, then seven more, a half-beat each.
  // One move reads as one gesture: its two stones land a quarter beat apart (own stone first, the
  // gift right after), and the moves themselves are two beats apart.
  place(0, b(12), { gap: BEAT / 4, marks: true });
  place(1, b(14), { gap: BEAT / 4, marks: true });
  place(2, b(16), { gap: BEAT / 4, marks: true });
  lastMarks.push({ t: b(17.75), cells: null });
  for (let k = 3; k < 10; k++) place(k, b(18 + 0.5 * (k - 3)), { gap: 2 / 30, quiet: true }); // pairs, 2 frames apart

  // Shot 3: what an island is. Light each black island and leave a numbered badge on it.
  const mid = boardAfter(10);
  const blackMid = islandsOf(mid, 1);
  const isl = (r, c, board = mid, color = 1) => islandsOf(board, color).find((x) => x.includes(at(r, c)));
  dims.push({ color: 2, t0: b(23), t1: b(23) + 0.4, from: 1, to: 0.16 });
  dims.push({ color: 2, t0: b(35), t1: b(35) + 0.4, from: 0.16, to: 1 });
  counters.push({ t: b(24.5), color: 1, show: true });
  const count3 = [
    [isl(0, 2), b(24.5)], // the big one: side-by-side stones, joined by bridges
    [isl(5, 1), b(26)], // a pair …
    [isl(6, 3), b(27)], // … and the stone touching it only at a corner: a separate island
    [isl(1, 0), b(30.5)],
    [isl(4, 5), b(31.5)],
  ];
  count3.forEach(([cells, t], k) => {
    lit.push({ t, cells, color: 1, hold: 0.45 });
    badges.push({ cell: islandCenter(cells), label: k + 1, t0: t, t1: b(35.5) });
    counters.push({ t, color: 1, value: k + 1 });
    notes.push({ t, role: "count", step: k });
  });
  const diagonal = { a: at(5, 2), b: at(6, 3), t0: b(27.5), t1: b(29.75) };
  notes.push({ t: diagonal.t0, role: "diag" });
  counters.push({ t: b(35.25), color: 1, hide: true });
  void blackMid;

  // Shot 4: white's three islands, then the gift that joins two of them.
  const whiteMid = [isl(3, 0, mid, 2), isl(3, 4, mid, 2), isl(5, 5, mid, 2)];
  dims.push({ color: 1, t0: b(36.5), t1: b(36.5) + 0.4, from: 1, to: 0.16 });
  dims.push({ color: 1, t0: b(39), t1: b(39) + 0.4, from: 0.16, to: 1 });
  counters.push({ t: b(37.25), color: 2, show: true });
  whiteMid.forEach((cells, k) => {
    const t = b(37.25 + 0.5 * k);
    lit.push({ t, cells, color: 2, hold: 0.35 });
    badges.push({ cell: islandCenter(cells), label: k + 1, t0: t, t1: b(45.25) });
    counters.push({ t, color: 2, value: k + 1 });
    notes.push({ t, role: "count", step: k + 2 });
  });
  const KEY = MOVES[10];
  placements.push({ cell: KEY[0], color: 1, land: b(40), launch: b(40), from: null, move: 11 });
  lastMarks.push({ t: b(40), cells: [KEY[0], null] });
  notes.push({ t: b(40), role: "self", move: 11 });
  // The gift under consideration appears where it could go — first a corner, then the gap — as the
  // game's preview stone with its pending ring. It never slides.
  const ghost = { corner: GHOST_CORNER, target: KEY[1], cornerIn: b(41), cornerOut: b(42.75), targetIn: b(43), commit: b(44.5) };
  counters.push({ t: b(41.25), color: 2, preview: 4 });
  counters.push({ t: b(43.25), color: 2, preview: 2 });
  notes.push({ t: ghost.cornerIn, role: "ghost", high: true });
  notes.push({ t: ghost.targetIn, role: "ghost" });
  placements.push({ cell: KEY[1], color: 2, land: ghost.commit, launch: ghost.commit, from: null, move: 11, fromGhost: true });
  lastMarks.push({ t: ghost.commit, cells: [KEY[0], KEY[1]] });
  notes.push({ t: ghost.commit, role: "key" });
  const afterKey = boardAfter(11);
  const joined = isl(3, 3, afterKey, 2);
  lit.push({ t: b(45.25), cells: joined, color: 2, hold: 0.9 });
  badges.push({ cell: islandCenter(joined), label: 1, t0: b(45.25), t1: b(51.5) });
  badges.push({ cell: islandCenter(whiteMid[2]), label: 2, t0: b(45.25), t1: b(51.5) });
  counters.push({ t: b(45.25), color: 2, value: 2, preview: null });
  notes.push({ t: b(45.25), role: "join" });
  // Black still holds five: the gift cost black nothing.
  counters.push({ t: b(47.5), color: 1, show: true });
  counters.push({ t: b(47.5), color: 1, value: islandsOf(afterKey, 1).length });
  lastMarks.push({ t: b(51.5), cells: null });
  counters.push({ t: b(51.5), color: 2, hide: true });
  counters.push({ t: b(51.5), color: 1, hide: true });

  // Shot 5: thirteen moves fill the board, a half-beat each, then both sides are counted.
  for (let k = 11; k < 24; k++) place(k, b(53 + 0.5 * (k - 11)), { gap: 2 / 30, quiet: true });
  const final = boardAfter(24);
  const finalIslands = { 1: islandsOf(final, 1), 2: islandsOf(final, 2) };
  const holeRing = { cell: HOLE, t: b(60) };
  notes.push({ t: holeRing.t, role: "ring" });
  const winner = { t: b(64.5), color: 1 };
  [[1, b(61)], [2, b(63)]].forEach(([color, t0]) => {
    counters.push({ t: t0, color, show: true });
    finalIslands[color].forEach((cells, k) => {
      const t = t0 + k * BEAT / 4;
      lit.push({ t, cells, color, hold: 0.3 });
      badges.push({ cell: islandCenter(cells), label: k + 1, t0: t, t1: color === winner.color ? b(69.5) : winner.t });
      counters.push({ t, color, value: k + 1 });
      notes.push({ t, role: "final-count", step: k, color });
    });
  });
  dims.push({ color: 2, t0: winner.t, t1: winner.t + 0.5, from: 1, to: 0.28 });
  notes.push({ t: winner.t, role: "win" });
  // The result holds for a bar: every winning island lights up together and the headline names the winner.
  winner.lit = b(65);
  lit.push({ t: winner.lit, cells: finalIslands[winner.color].flat(), color: winner.color, hold: b(69.5) - winner.lit - 0.12 });

  // Shot 6: the mark writes itself; the button lands on the final chord.
  notes.push({ t: b(72), role: "final" });
  for (let s = 0; s < title.strokes; s++) notes.push({ t: TITLE_TIMES.strokeStart + s * TITLE_TIMES.strokeStep, role: "stroke", step: s });

  // ---------------------------------------------------------------- copy, per shot
  // [headline, subline, second subline (shot 3 only)]; "/" breaks a line.
  const COPY = {
    zh: {
      s1: ["Gift Islands", ""],
      s2: ["一手，两子。", "先下自己的，/再送对方一枚。"],
      s3: ["相连成岛。", "上下左右相连，/才算同一座岛。", "一岛一分，/不论大小。"],
      s4: ["送出的子，/也能连起对方的岛。", "送对位置，/对方反而少一座岛。"],
      s5: ["下满即止。", "岛多者胜。", "黑方胜。"],
      s6: ["giftislands.top", "三档 AI，随时对弈"],
    },
    en: {
      s1: ["Gift Islands", ""],
      s2: ["One move. /Two stones.", "One for you, /then one for your opponent."],
      s3: ["Connected stones /make an island.", "Side by side connects. /Corner to corner doesn't.", "Every island scores one, /big or small."],
      s4: ["A gift can join /their islands.", "Give it in the right place, /and they lose one."],
      s5: ["Fill the board.", "Most islands wins.", "Black wins."],
      s6: ["giftislands.top", "Three AI levels, any time."],
    },
  };

  // [headline in, subline in, both out, then shot 3: second subline in / shot 5: winner headline in].
  const COPY_TIMES = {
    s1: [TITLE_TIMES.caption, null, b(9.5)],
    s2: [b(10.5), b(12.5), b(21.5)],
    s3: [b(22.25), b(23.5), b(35.5), b(30)],
    s4: [b(36.25), b(46), b(51.5)],
    s5: [b(52.25), b(60.5), b(69.5), b(65.25)],
    s6: [b(72), b(72.5), null],
  };

  // ---------------------------------------------------------------- harmony: one chord per bar
  // MIDI notes; the score in tools/music.cjs voices them.
  const F = 53, G = 55, A = 57, Bb = 58, C = 60, D = 62, E = 64;
  const BARS = [
    { name: "Fmaj7", root: 41, tones: [F, A, C, E] },
    { name: "Dm9", root: 38, tones: [D - 12, F, A, C, E] },
    { name: "Bbmaj7", root: 46, tones: [Bb - 12, D, F, A] },
    { name: "C6/9", root: 48, tones: [C - 12, E - 12, A, D] },
    { name: "Fmaj7", root: 41, tones: [F, A, C, E] },
    { name: "Am7", root: 45, tones: [A - 12, C, E, G] },
    { name: "Bbmaj7", root: 46, tones: [Bb - 12, D, F, A] },
    { name: "Csus4", root: 48, tones: [C - 12, F, G, C] },
    { name: "Dm7", root: 38, tones: [D - 12, F, A, C] },
    { name: "Bbmaj9", root: 46, tones: [Bb - 12, D, F, A, C + 12] },
    { name: "F/A", root: 45, tones: [F, A, C, E] },
    { name: "Gm7-C", root: 43, tones: [G - 12, Bb - 12, D, F] },
    { name: "Fmaj7", root: 41, tones: [F, A, C, E] },
    { name: "Dm9", root: 38, tones: [D - 12, F, A, C, E] },
    { name: "Bbmaj7", root: 46, tones: [Bb - 12, D, F, A] },
    { name: "Am7", root: 45, tones: [A - 12, C, E, G] },
    { name: "C9sus", root: 48, tones: [C - 12, F, G, Bb, D + 12] },
    { name: "Bbmaj7/C", root: 48, tones: [C - 12, Bb - 12, D, F, A] },
    { name: "Fadd9", root: 41, tones: [F, A, C, G + 12, A + 12], final: true },
    { name: "Fadd9", root: 41, tones: [F, A, C, G + 12, A + 12], final: true },
    { name: "Fadd9", root: 41, tones: [F, A, C, G + 12, A + 12], final: true },
  ];

  const data = {
    BPM, BEAT, DURATION, FPS: 30, b,
    N, MOVES, HOLE, TITLE, title, TITLE_TIMES, MARK_TIMES, T,
    placements, lit, counters, dims, ghost, lastMarks, holeRing, winner, badges, diagonal,
    finalScore: { 1: finalIslands[1].length, 2: finalIslands[2].length },
    notes: notes.sort((x, y) => x.t - y.t),
    COPY, COPY_TIMES, BARS,
  };
  root.FILM_DATA = data;
  if (typeof module !== "undefined" && module.exports) module.exports = data;
})(typeof window !== "undefined" ? window : globalThis);
