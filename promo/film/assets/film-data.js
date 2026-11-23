// The film's single source of truth: the demo game, every event time and the score.
// Loaded by the page (window.FILM_DATA) and by tools/music.cjs (require), so picture and
// sound are cut from the same numbers. All times are seconds from the film's first frame.
(function (root) {
  "use strict";

  const BPM = 90;
  const BEAT = 60 / BPM; // 0.667 s = 20 frames at 30 fps
  const b = (n) => Math.round(n * BEAT * 30) / 30; // beat index → time, snapped to a frame
  const DURATION = 45;

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
    game: [b(10), b(59)], // the 7 × 7 board, shots 2–5
    s2: [b(10), b(20)],
    s3: [b(20), b(30)],
    s4: [b(30), b(48)],
    s5: [b(48), b(59)],
    s6: [b(59), DURATION],
  };

  // Title (shot 1): one stroke per sixteenth from beat 1; stones of a stroke 30 ms apart.
  const title = titleStones();
  const TITLE_TIMES = { dots: 0, strokeStart: b(1), strokeStep: BEAT / 4, stoneStep: 0.03, caption: b(7) };
  // End card (shot 6): the same title written as a glissando into the final chord.
  const MARK_TIMES = { dots: b(59), strokeStart: b(59) + 0.06, strokeStep: (b(60) - b(59) - 0.12) / title.strokes, stoneStep: 0.012 };

  // Placements on the game board: {cell, color, land, launch, from, move}.
  const placements = [];
  const notes = [];
  const lastMarks = []; // {t, cells}

  function place(moveIndex, t, { travel = 0.333, gap = BEAT / 4, quiet = false, marks = false } = {}) {
    const [self, gift] = MOVES[moveIndex];
    const color = moveIndex % 2 === 0 ? 1 : 2;
    placements.push({ cell: self, color, land: t, launch: t, from: null, move: moveIndex + 1 });
    const land = t + gap + travel;
    placements.push({ cell: gift, color: 3 - color, land, launch: t + gap, from: self, move: moveIndex + 1 });
    notes.push({ t, role: "self", move: moveIndex + 1, quiet });
    notes.push({ t: land, role: "gift", move: moveIndex + 1, quiet });
    if (marks) lastMarks.push({ t: land, cells: [self, gift] });
  }

  // Shot 2: three slow moves, then seven quick ones.
  place(0, b(12), { travel: BEAT / 2, gap: BEAT / 4, marks: true });
  place(1, b(14), { travel: BEAT / 2, gap: BEAT / 4, marks: true });
  place(2, b(16), { travel: BEAT / 2, gap: BEAT / 4, marks: true });
  for (let k = 3; k < 10; k++) place(k, b(17.5 + 0.25 * (k - 3)), { travel: BEAT / 8, gap: 0.03, quiet: true });
  lastMarks.push({ t: b(17.5), cells: null });

  // Shot 3: count black's islands, biggest first, one per beat.
  const mid = boardAfter(10);
  const blackMid = islandsOf(mid, 1);
  const order3 = [at(0, 2), at(1, 0), at(5, 1), at(4, 5), at(6, 3)].map((c) => blackMid.find((isl) => isl.includes(c)));
  const lit = []; // {t, cells, color}
  const counters = []; // {t, color, value, preview?}
  const dims = []; // {color, t0, t1, to}
  dims.push({ color: 2, t0: b(21.5), t1: b(21.5) + 0.4, from: 1, to: 0.16 });
  dims.push({ color: 2, t0: b(28.5), t1: b(28.5) + 0.4, from: 0.16, to: 1 });
  counters.push({ t: b(23), color: 1, show: true });
  order3.forEach((cells, k) => {
    lit.push({ t: b(23 + k), cells, color: 1 });
    counters.push({ t: b(23 + k), color: 1, value: k + 1 });
    notes.push({ t: b(23 + k), role: "count", step: k });
  });
  counters.push({ t: b(29.25), color: 1, hide: true });

  // Shot 4: white's three islands, then the gift that joins two of them.
  const whiteMid = islandsOf(mid, 2);
  dims.push({ color: 1, t0: b(30.5), t1: b(30.5) + 0.4, from: 1, to: 0.16 });
  dims.push({ color: 1, t0: b(32.5), t1: b(32.5) + 0.4, from: 0.16, to: 1 });
  counters.push({ t: b(31), color: 2, show: true });
  whiteMid.forEach((cells, k) => {
    lit.push({ t: b(31 + 0.5 * k), cells, color: 2 });
    counters.push({ t: b(31 + 0.5 * k), color: 2, value: k + 1 });
    notes.push({ t: b(31 + 0.5 * k), role: "count", step: k + 2 });
  });
  const KEY = MOVES[10];
  placements.push({ cell: KEY[0], color: 1, land: b(33), launch: b(33), from: null, move: 11 });
  notes.push({ t: b(33), role: "self", move: 11 });
  const ghost = {
    from: KEY[0], corner: GHOST_CORNER, target: KEY[1],
    appear: b(33.5), arrive: b(34), // slides out of the black stone into the corner
    glide: b(36), reach: b(37), // corner → the gap
    commit: b(38),
  };
  counters.push({ t: b(34.25), color: 2, preview: 4 });
  counters.push({ t: b(37), color: 2, preview: 2 });
  notes.push({ t: b(34), role: "ghost" });
  notes.push({ t: b(37), role: "ghost" });
  placements.push({ cell: KEY[1], color: 2, land: ghost.commit, launch: ghost.commit, from: null, move: 11, fromGhost: true });
  lastMarks.push({ t: ghost.commit, cells: [KEY[0], KEY[1]] });
  notes.push({ t: ghost.commit, role: "key" });
  const afterKey = boardAfter(11);
  const joined = islandsOf(afterKey, 2).find((isl) => isl.includes(KEY[1]));
  lit.push({ t: b(39), cells: joined, color: 2, hold: 0.9 });
  counters.push({ t: b(39), color: 2, value: 2, preview: null });
  notes.push({ t: b(39), role: "join" });
  // Black still holds five: the gift cost black nothing.
  counters.push({ t: b(42), color: 1, show: true });
  counters.push({ t: b(42), color: 1, value: islandsOf(afterKey, 1).length });
  notes.push({ t: b(42), role: "count", step: 4 });
  lastMarks.push({ t: b(47), cells: null });
  counters.push({ t: b(47.5), color: 2, hide: true });
  counters.push({ t: b(47.5), color: 1, hide: true });

  // Shot 5: thirteen quick moves fill the board, then both sides count.
  for (let k = 11; k < 24; k++) place(k, b(49 + 0.25 * (k - 11)), { travel: BEAT / 8, gap: 0.03, quiet: true });
  const final = boardAfter(24);
  const finalIslands = { 1: islandsOf(final, 1), 2: islandsOf(final, 2) };
  const holeRing = { cell: HOLE, t: b(52.5) };
  notes.push({ t: b(52.5), role: "ring" });
  counters.push({ t: b(53), color: 1, show: true });
  counters.push({ t: b(53.25), color: 2, show: true });
  const seq = [];
  for (let k = 0; k < Math.max(finalIslands[1].length, finalIslands[2].length); k++) {
    if (k < finalIslands[1].length) seq.push([1, finalIslands[1][k], k + 1]);
    if (k < finalIslands[2].length) seq.push([2, finalIslands[2][k], k + 1]);
  }
  seq.forEach(([color, cells, value], j) => {
    const t = b(53 + 0.25 * j);
    lit.push({ t, cells, color, hold: 0.35 });
    counters.push({ t, color, value });
    notes.push({ t, role: "final-count", step: j });
  });
  const winner = { t: b(56.5), color: 1 };
  dims.push({ color: 2, t0: winner.t, t1: winner.t + 0.5, from: 1, to: 0.28 });
  notes.push({ t: winner.t, role: "win" });

  // Shot 6: the mark writes itself; the button lands on the final chord.
  title.strokes && notes.push({ t: b(60), role: "final" });
  for (let s = 0; s < title.strokes; s++) notes.push({ t: MARK_TIMES.strokeStart + s * MARK_TIMES.strokeStep, role: "gliss", step: s, quiet: true });
  for (let s = 0; s < title.strokes; s++) notes.push({ t: TITLE_TIMES.strokeStart + s * TITLE_TIMES.strokeStep, role: "stroke", step: s });

  // ---------------------------------------------------------------- copy, per shot
  const COPY = {
    zh: {
      s1: ["Gift Islands", ""],
      s2: ["一手，两子。", "一枚给自己，/一枚送对方。"],
      s3: ["相连成岛。", "一岛一分，/不论大小。"],
      s4: ["送出的子，/也能连起对方的岛。", "送对位置，/对方反而少一座岛。"],
      s5: ["下满即止。", "岛多者胜。"],
      s6: ["giftislands.top", "三档 AI，随时对弈"],
    },
    en: {
      s1: ["Gift Islands", ""],
      s2: ["One move. /Two stones.", "One for you, /one for your opponent."],
      s3: ["Connected stones /make an island.", "Every island scores one, /big or small."],
      s4: ["A gift can join /their islands.", "Give it in the right place, /and they lose one."],
      s5: ["Fill the board.", "Most islands wins."],
      s6: ["giftislands.top", "Three AI levels, any time."],
    },
  };

  // When each shot's copy enters and leaves: [headline in, subline in, both out].
  const COPY_TIMES = {
    s1: [TITLE_TIMES.caption, null, b(9.5)],
    s2: [b(10.5), b(12.5), b(19.5)],
    s3: [b(20.25), b(21.75), b(29.5)],
    s4: [b(30.25), b(40), b(47.5)],
    s5: [b(48.25), b(54), b(58.5)],
    s6: [b(60), b(60.5), null],
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
    { name: "C9sus", root: 48, tones: [C - 12, F, G, Bb, D + 12] },
    { name: "Fadd9", root: 41, tones: [F, A, C, G + 12, A + 12], final: true },
    { name: "Fadd9", root: 41, tones: [F, A, C, G + 12, A + 12], final: true },
  ];

  const data = {
    BPM, BEAT, DURATION, FPS: 30, b,
    N, MOVES, HOLE, TITLE, title, TITLE_TIMES, MARK_TIMES, T,
    placements, lit, counters, dims, ghost, lastMarks, holeRing, winner,
    finalScore: { 1: finalIslands[1].length, 2: finalIslands[2].length },
    notes: notes.sort((x, y) => x.t - y.t),
    COPY, COPY_TIMES, BARS,
  };
  root.FILM_DATA = data;
  if (typeof module !== "undefined" && module.exports) module.exports = data;
})(typeof window !== "undefined" ? window : globalThis);
