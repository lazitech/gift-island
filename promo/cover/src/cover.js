  // ================================================================== cover directions
  // Appended to film.js's engine (curves, palette, Board) by tools/build.cjs. Three static
  // compositions, one per second of a 3 s timeline, so `snapshot --at 0.5,1.5,2.5` gives all three.
  const FMT = root.dataset.format; // "16x9" | "3x4" | "9x16"
  const C = window.COVER_COPY[LANG];
  const N = 7;
  const at = (r, c) => r * N + c;
  const SETTLED = 5; // render time: every stone has landed, every dot has swept in

  function position(moves) {
    const m = new Map();
    for (let k = 0; k < moves; k++) {
      const [self, gift] = D.MOVES[k];
      const color = k % 2 === 0 ? 1 : 2;
      m.set(self, color);
      m.set(gift, 3 - color);
    }
    return m;
  }
  /** Rows r0..r1 of a position as a smaller board; returns its stones and a cell mapper. */
  function crop(pos, r0, r1) {
    const stones = [];
    for (let r = r0; r <= r1; r++) for (let c = 0; c < N; c++) {
      const color = pos.get(at(r, c));
      if (color) stones.push({ cell: (r - r0) * N + c, color, land: -5, launch: -5, from: null });
    }
    return { cols: N, rows: r1 - r0 + 1, stones, map: (r, c) => (r - r0) * N + c };
  }
  function whole(pos) {
    return { cols: N, rows: N, stones: [...pos].map(([cell, color]) => ({ cell, color, land: -5, launch: -5, from: null })), map: (r, c) => at(r, c) };
  }

  /** A sea tablet sized by its cell pitch, like the film's boards (padding 0.21 cell, radius 0.37 cell). */
  function tablet(id, cols, rows, cell, left, top, padK = 0.21) {
    const host = document.getElementById(id);
    const pad = cell * padK;
    const box = { width: cols * cell + 2 * pad, height: rows * cell + 2 * pad };
    Object.assign(host.style, { left: `${left}px`, top: `${top}px`, width: `${box.width}px`, height: `${box.height}px`, padding: `${pad}px`, borderRadius: `${cell * (padK > 0.3 ? 0.9 : 0.37)}px` });
    return { host, ...box };
  }
  function text(id, str, { x, y, size, width = null, align = "left" }) {
    const node = document.getElementById(id);
    node.textContent = str.replace(/\//g, "\n");
    Object.assign(node.style, { left: `${x}px`, top: `${y}px`, fontSize: `${size}px`, textAlign: align, width: width == null ? "auto" : `${width}px` });
    return node;
  }

  const KEY_GIFT = D.MOVES[10][1]; // the gift that joined white's row
  const keyR = Math.floor(KEY_GIFT / N), keyC = KEY_GIFT % N;

  // ---------- A · The one stone: the row the gift completes, held up close.
  (function () {
    const b = crop(position(11), keyR - 1, keyR + 1);
    const L = {
      "16x9": { M: 120, head: 96, sub: 38, textTop: 300, cell: 118, boardLeft: 868, mark: 7 },
      "3x4": { M: 88, head: 100, sub: 40, textTop: 168, cell: 118, boardLeft: 88, mark: 8 },
      "9x16": { M: 88, head: 108, sub: 42, textTop: 300, cell: 118, boardLeft: 88, mark: 8 },
    }[FMT];
    const side = FMT === "16x9";
    const t = tablet("a-board", b.cols, b.rows, L.cell, L.boardLeft, 0);
    const boardTop = side ? (H - t.height) / 2 : FMT === "3x4" ? 640 : 900;
    t.host.style.top = `${boardTop}px`;
    // Only the gift is blue; its bridges stay white, so it reads as the one stone holding the row together.
    Board(t.host, b.cols, b.rows, b.stones, { introAt: -5, lit: [{ t: -5, cells: [b.map(keyR, keyC)], color: 2, hold: 100 }] }).render(SETTLED);
    text("a-head", C.head, { x: L.M, y: L.textTop, size: L.head });
    text("a-sub", C.sub, { x: L.M, y: L.textTop + L.head * 1.18 * 2 + L.head * 0.42, size: L.sub });
    // The mark, small, as a signature.
    const mk = tablet("a-mark", D.TITLE.cols, D.TITLE.rows, L.mark, L.M, 0, 0.42);
    mk.host.style.top = `${H - (FMT === "9x16" ? 360 : side ? 96 : 88) - mk.height}px`;
    Board(mk.host, D.TITLE.cols, D.TITLE.rows, D.title.stones.map(({ cell, color }) => ({ cell, color, land: -5, launch: -5, from: null })), { introAt: -5, dotStep: 0 }).render(SETTLED);
  })();

  // ---------- B · The mark: the name in stones, one white stone holding 岛 together is the gift.
  (function () {
    const stones = D.title.stones.map(({ cell, color }) => ({ cell, color, land: -5, launch: -5, from: null }));
    const cols = D.TITLE.cols, rows = D.TITLE.rows;
    const white = new Set(stones.filter((s) => s.color === 2).map((s) => s.cell));
    const count = (set) => {
      const seen = new Set();
      let n = 0;
      for (const s of set) {
        if (seen.has(s)) continue;
        n++;
        const stack = [s];
        seen.add(s);
        while (stack.length) {
          const x = stack.pop();
          for (const y of [x - cols, x + cols, x % cols ? x - 1 : -1, (x + 1) % cols ? x + 1 : -1]) if (y >= 0 && set.has(y) && !seen.has(y)) { seen.add(y); stack.push(y); }
        }
      }
      return n;
    };
    const base = count(white);
    const ws = [...white];
    const cx = ws.reduce((a, s) => a + (s % cols), 0) / ws.length, cy = ws.reduce((a, s) => a + Math.floor(s / cols), 0) / ws.length;
    // The joint nearest the centre of 岛: take it away and 岛 falls into two islands.
    const joints = ws.filter((s) => { const w = new Set(white); w.delete(s); return count(w) > base; });
    joints.sort((a, b) => Math.hypot(a % cols - cx, Math.floor(a / cols) - cy) - Math.hypot(b % cols - cx, Math.floor(b / cols) - cy));
    const gift = joints[0];

    const L = {
      "16x9": { cell: 36, top: 132, head: 76, sub: 36, gap: 76 },
      "3x4": { cell: 26.6, top: 372, head: 70, sub: 36, gap: 96 },
      "9x16": { cell: 26.6, top: 560, head: 72, sub: 38, gap: 110 },
    }[FMT];
    const t = tablet("b-board", cols, rows, L.cell, 0, L.top, 0.42);
    t.host.style.left = `${(W - t.width) / 2}px`;
    Board(t.host, cols, rows, stones, { introAt: -5, dotStep: 0, lit: [{ t: -5, cells: [gift], color: 2, hold: 100 }] }).render(SETTLED);
    const y = L.top + t.height + L.gap;
    text("b-head", C.headOne, { x: 0, y, size: L.head, width: W, align: "center" });
    text("b-sub", C.sub, { x: 0, y: y + L.head * 1.18 + L.head * 0.34, size: L.sub, width: W, align: "center" });
  })();

  // ---------- C · The archipelago: the finished board running off the frame, white's joined row in blue.
  (function () {
    const fin = position(24);
    const b = whole(fin);
    const row = [...Array(N).keys()].map((c) => at(keyR, c));
    const L = {
      "16x9": { cell: 186, left: 780, top: -322, M: 120, textTop: 360, head: 82, sub: 36 },
      "3x4": { cell: 176, left: -79, top: 640, M: 88, textTop: 168, head: 100, sub: 40 },
      "9x16": { cell: 196, left: -143, top: 940, M: 88, textTop: 300, head: 108, sub: 42 },
    }[FMT];
    const t = tablet("c-board", N, N, L.cell, L.left, L.top);
    Board(t.host, N, N, b.stones, { introAt: -5, lit: [{ t: -5, cells: row, color: 2, hold: 100 }], ring: { cell: KEY_GIFT, t: -5 } }).render(SETTLED);
    text("c-eyebrow", C.brand, { x: L.M, y: L.textTop - L.sub * 2.2, size: L.sub * 0.8 });
    text("c-head", C.head, { x: L.M, y: L.textTop, size: L.head });
    text("c-sub", C.sub, { x: L.M, y: L.textTop + L.head * 1.18 * 2 + L.head * 0.42, size: L.sub });
  })();

  // ---------- frame
  const dirs = ["dir-a", "dir-b", "dir-c"].map((id) => document.getElementById(id));
  function renderAt(t) {
    dirs.forEach((node, k) => { node.style.opacity = t >= k && t < k + 1 ? 1 : 0; });
  }
  window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
  renderAt(0);
  const proxy = { t: 0 };
  const tl = gsap.timeline({ paused: true });
  tl.to(proxy, { t: 3, duration: 3, ease: "none", onUpdate: () => renderAt(proxy.t) }, 0);
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
