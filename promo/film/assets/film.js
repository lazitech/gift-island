// Draws the whole film as a pure function of time: renderAt(t) sets every stone, bridge, dot and
// line of copy from FILM_DATA alone, so any frame renders on its own. Board geometry (CELL,
// STONE_R, bridgePath) and the curves (spring, ease-out) are the web front end's.
(function () {
  "use strict";
  const D = window.FILM_DATA;
  const svgNS = "http://www.w3.org/2000/svg";
  const CELL = 100;
  const STONE_R = 36;

  // ------------------------------------------------------------------ curves
  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (u) => ((ax * u + bx) * u + cx) * u;
    const sy = (u) => ((ay * u + by) * u + cy) * u;
    const dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let u = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(u) - x, d = dx(u);
        if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
        u -= e / d;
      }
      return sy(Math.min(1, Math.max(0, u)));
    };
  }
  const spring = cubicBezier(0.34, 1.56, 0.64, 1); // --spring
  const easeOut = cubicBezier(0.22, 1, 0.36, 1); // --ease-out
  const ease = cubicBezier(0.25, 0.1, 0.25, 1); // --ease
  const inOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2); // power2.inOut
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const prog = (t, t0, dur) => clamp((t - t0) / dur);

  // ------------------------------------------------------------------ setup
  const root = document.getElementById("root");
  let vars = {};
  try { vars = (window.__hyperframes && window.__hyperframes.getVariables && window.__hyperframes.getVariables()) || {}; } catch (e) { vars = {}; }
  const query = new URLSearchParams(location.search);
  const LANG = query.get("lang") || vars.lang || "zh";
  const THEME = query.get("theme") || vars.theme || "dark";
  const W = +root.dataset.width, H = +root.dataset.height;
  const PORTRAIT = H > W;
  root.classList.add(LANG, THEME, PORTRAIT ? "portrait" : "landscape");

  const css = getComputedStyle(root);
  function rgb(name) {
    const v = css.getPropertyValue(name).trim();
    const h = v.replace("#", "");
    return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
  }
  const PAL = {
    black: rgb("--black"), white: rgb("--white"), accent: rgb("--accent"),
    ink: rgb("--ink"), ink3: rgb("--ink-3"),
  };
  const mix = (a, b, t) => `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(",")})`;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(svgNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function bridgePath([x, y], horizontal, W = 23) {
    const A = 15;
    const YC = Math.sqrt(STONE_R * STONE_R - A * A);
    const K = 2 * W - YC;
    if (horizontal) {
      const x1 = x + A, x2 = x + CELL - A, m = x + CELL / 2;
      return `M${x1} ${y - YC}Q${m} ${y - K} ${x2} ${y - YC}L${x2} ${y + YC}Q${m} ${y + K} ${x1} ${y + YC}Z`;
    }
    const y1 = y + A, y2 = y + CELL - A, m = y + CELL / 2;
    return `M${x - YC} ${y1}Q${x - K} ${m} ${x - YC} ${y2}L${x + YC} ${y2}Q${x + K} ${m} ${x + YC} ${y1}Z`;
  }

  // ------------------------------------------------------------------ a board
  /**
   * stones: [{cell, color, land, launch, from, fromGhost}] — a cell's colour never changes.
   * opts: introAt, dotStep, lit, dims, lastMarks, ring, ghost.
   */
  function Board(host, cols, rows, stones, opts) {
    const svg = el("svg", { viewBox: `0 0 ${cols * CELL} ${rows * CELL}`, "aria-hidden": "true" });
    host.appendChild(svg);
    const center = (i) => [(i % cols) * CELL + CELL / 2, Math.floor(i / cols) * CELL + CELL / 2];
    const byCell = new Map(stones.map((s) => [s.cell, s]));

    const dots = [];
    const gDots = el("g", {}, svg);
    for (let i = 0; i < cols * rows; i++) {
      const [cx, cy] = center(i);
      dots.push({ i, d: Math.floor(i / cols) + (i % cols), node: el("circle", { cx, cy, r: 5, class: "dot" }, gDots) });
    }

    const layers = {}, stoneNodes = [], bridgeNodes = [];
    for (const color of [1, 2]) {
      const layer = el("g", { class: `layer l${color}` }, svg);
      layers[color] = { layer, bridges: el("g", {}, layer), stones: el("g", {}, layer) };
    }
    for (const s of stones) {
      if (s.color !== 1 && s.color !== 2) continue;
      for (const [next, horizontal] of [[s.cell + 1, true], [s.cell + cols, false]]) {
        if ((horizontal && next % cols === 0) || next >= cols * rows) continue;
        const o = byCell.get(next);
        if (!o || o.color !== s.color) continue;
        const node = el("path", { d: bridgePath(center(s.cell), horizontal), fill: "#000" }, layers[s.color].bridges);
        const [x, y] = center(s.cell);
        bridgeNodes.push({ a: s, b: o, node, horizontal, cx: horizontal ? x + CELL / 2 : x, cy: horizontal ? y : y + CELL / 2 });
      }
      stoneNodes.push({ s, node: el("circle", { cx: 0, cy: 0, r: 0 }, layers[s.color].stones) });
    }

    const marks = el("g", {}, svg);
    const lastNodes = [el("circle", { r: 0, class: "last" }, marks), el("circle", { r: 0, class: "last" }, marks)];
    const ringNode = el("circle", { r: 0, class: "ring", opacity: 0 }, marks);
    const ghostNode = opts.ghost ? el("circle", { r: 0, fill: "var(--ghost-white)", opacity: 0 }, layers[2].stones) : null;
    // The game's pending-cell ring follows the stone being considered.
    const pendingNode = opts.ghost ? el("circle", { r: 0, class: "ring", opacity: 0 }, marks) : null;

    const lit = opts.lit || [];
    function litAmount(cell, color, t) {
      let a = 0;
      for (const L of lit) {
        if (L.color !== color || t < L.t || !L.cells.includes(cell)) continue;
        const hold = L.hold ?? 0.5;
        const up = prog(t, L.t, 0.12), down = prog(t, L.t + 0.12 + hold, 0.35);
        a = Math.max(a, ease(up) * (1 - ease(down)));
      }
      return a;
    }
    function layerOpacity(color, t) {
      let v = 1;
      for (const d of opts.dims || []) if (d.color === color && t >= d.t0) v = d.from + (d.to - d.from) * ease(prog(t, d.t0, d.t1 - d.t0));
      return v;
    }

    function stoneGeom(s, t) {
      if (t < s.launch) return null;
      let [x, y] = center(s.cell);
      if (s.from != null && t < s.land) {
        const p = easeOut(prog(t, s.launch, s.land - s.launch));
        const [x0, y0] = center(s.from);
        const dist = Math.hypot(x - x0, y - y0);
        return {
          x: x0 + (x - x0) * p,
          y: y0 + (y - y0) * p - Math.sin(Math.PI * p) * Math.min(CELL * 0.6, dist * 0.18),
          r: STONE_R * (0.55 + 0.3 * p),
          op: clamp((t - s.launch) / 0.06),
        };
      }
      const s0 = s.from != null || s.fromGhost ? 0.82 : 0.35;
      return { x, y, r: STONE_R * (s0 + (1 - s0) * spring(prog(t, s.land, 0.5))), op: s.from != null || s.fromGhost ? 1 : clamp((t - s.land) / 0.14) };
    }

    // The gift being considered: shown in place on one cell, then on another, as a player hovering
    // the board would see it. Nothing slides.
    function ghostGeom(t) {
      const g = opts.ghost;
      if (!g) return null;
      let cell, t0, t1;
      if (t >= g.cornerIn && t < g.cornerOut) { cell = g.corner; t0 = g.cornerIn; t1 = g.cornerOut; }
      else if (t >= g.targetIn && t < g.commit) { cell = g.target; t0 = g.targetIn; t1 = g.commit; }
      else return null;
      const [x, y] = center(cell);
      const p = prog(t, t0, 0.4);
      const out = cell === g.corner ? ease(prog(t, t1 - 0.22, 0.22)) : 0; // the corner one fades; the target one becomes the stone
      return { x, y, r: STONE_R * (0.6 + 0.34 * spring(p)), op: 0.9 * clamp(p / 0.3) * (1 - out), at: cell, ring: p, ringOp: clamp(p / 0.45) * (1 - out) };
    }

    // Numbered stickers on islands as they are counted, and the corner-to-corner demonstration.
    const gBadges = el("g", {}, svg);
    const badgeNodes = (opts.badges || []).map((bd) => {
      const [cx, cy] = center(bd.cell);
      const g = el("g", { class: "badge", opacity: 0 }, gBadges);
      el("circle", { cx: 0, cy: 0, r: 23 }, g);
      const tx = el("text", { x: 0, y: 1 }, g);
      tx.textContent = bd.label;
      return { bd, g, cx, cy };
    });
    let diag = null;
    if (opts.diagonal) {
      const [ax, ay] = center(opts.diagonal.a), [bx, by] = center(opts.diagonal.b);
      const g = el("g", { class: "diag", opacity: 0 }, svg);
      const line = el("line", { class: "path", x1: ax, y1: ay, x2: ax, y2: ay }, g);
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const xg = el("g", {}, g);
      el("circle", { cx: 0, cy: 0, r: 19 }, xg);
      el("line", { class: "x", x1: -7, y1: -7, x2: 7, y2: 7 }, xg);
      el("line", { class: "x", x1: -7, y1: 7, x2: 7, y2: -7 }, xg);
      diag = { g, line, xg, ax, ay, bx, by, mx, my };
    }

    function render(t) {
      // Dots sweep in from the top-left corner and drop away under a stone or a ghost.
      const intro = opts.introAt ?? 0, step = opts.dotStep ?? 0.028;
      const g = ghostGeom(t);
      for (const dot of dots) {
        const p = prog(t, intro + dot.d * step, 0.6);
        let s = easeOut(p), o = p > 0 ? easeOut(p) : 0;
        const st = byCell.get(dot.i);
        if (st && t >= st.land) { const q = easeOut(prog(t, st.land, 0.3)); s *= 1 - q; o *= 1 - q; }
        if (g && g.at === dot.i) { const k = 1 - clamp(g.op / 0.5); s *= k; o *= k; }
        dot.node.setAttribute("r", (5 * s).toFixed(2));
        dot.node.setAttribute("opacity", o.toFixed(3));
      }

      for (const color of [1, 2]) layers[color].layer.setAttribute("opacity", layerOpacity(color, t).toFixed(3));

      for (const { s, node } of stoneNodes) {
        const gm = stoneGeom(s, t);
        if (!gm) { node.setAttribute("r", 0); continue; }
        node.setAttribute("cx", gm.x.toFixed(2));
        node.setAttribute("cy", gm.y.toFixed(2));
        node.setAttribute("r", Math.max(0, gm.r).toFixed(2));
        node.setAttribute("opacity", gm.op.toFixed(3));
        node.setAttribute("fill", mix(s.color === 1 ? PAL.black : PAL.white, PAL.accent, litAmount(s.cell, s.color, t)));
      }

      for (const br of bridgeNodes) {
        const tb = Math.max(br.a.land, br.b.land) + 0.08;
        if (t < tb) { br.node.setAttribute("opacity", 0); continue; }
        const sc = easeOut(prog(t, tb, 0.42));
        const sx = br.horizontal ? sc : 1, sy = br.horizontal ? 1 : sc;
        br.node.setAttribute("transform", `translate(${br.cx} ${br.cy}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-br.cx} ${-br.cy})`);
        br.node.setAttribute("opacity", clamp((t - tb) / 0.1).toFixed(3));
        const a = Math.min(litAmount(br.a.cell, br.a.color, t), litAmount(br.b.cell, br.b.color, t));
        br.node.setAttribute("fill", mix(br.a.color === 1 ? PAL.black : PAL.white, PAL.accent, a));
      }

      if (ghostNode) {
        if (!g) { ghostNode.setAttribute("opacity", 0); pendingNode.setAttribute("opacity", 0); }
        else {
          ghostNode.setAttribute("cx", g.x.toFixed(2));
          ghostNode.setAttribute("cy", g.y.toFixed(2));
          ghostNode.setAttribute("r", g.r.toFixed(2));
          ghostNode.setAttribute("opacity", g.op.toFixed(3));
          pendingNode.setAttribute("cx", g.x.toFixed(2));
          pendingNode.setAttribute("cy", g.y.toFixed(2));
          pendingNode.setAttribute("r", (45 * (0.7 + 0.3 * spring(g.ring))).toFixed(2));
          pendingNode.setAttribute("opacity", g.ringOp.toFixed(3));
        }
      }

      // The accent dots on the latest move's stones, as in the game (one dot while the gift is pending).
      let lm = null;
      for (const m of opts.lastMarks || []) if (t >= m.t) lm = m;
      lastNodes.forEach((node, k) => {
        if (!lm || !lm.cells || lm.cells[k] == null) { node.setAttribute("r", 0); return; }
        const [cx, cy] = center(lm.cells[k]);
        node.setAttribute("cx", cx);
        node.setAttribute("cy", cy);
        node.setAttribute("r", (7 * spring(prog(t, lm.t + 0.2, 0.35))).toFixed(2));
      });

      for (const { bd, g: node, cx, cy } of badgeNodes) {
        if (t < bd.t0) { node.setAttribute("opacity", 0); continue; }
        const p = prog(t, bd.t0, 0.45), q = ease(prog(t, bd.t1, 0.3));
        const sc = 0.4 + 0.6 * spring(p);
        node.setAttribute("transform", `translate(${cx} ${cy})` + (Math.abs(sc - 1) < 1e-4 ? "" : ` scale(${sc.toFixed(4)})`));
        node.setAttribute("opacity", (clamp(p / 0.3) * (1 - q)).toFixed(3));
      }

      if (diag) {
        const d = opts.diagonal;
        if (t < d.t0) diag.g.setAttribute("opacity", 0);
        else {
          const p = easeOut(prog(t, d.t0, 0.45));
          diag.line.setAttribute("x2", (diag.ax + (diag.bx - diag.ax) * p).toFixed(2));
          diag.line.setAttribute("y2", (diag.ay + (diag.by - diag.ay) * p).toFixed(2));
          const xp = prog(t, d.t0 + 0.4, 0.4), xs = 0.3 + 0.7 * spring(xp);
          diag.xg.setAttribute("transform", `translate(${diag.mx} ${diag.my})` + (Math.abs(xs - 1) < 1e-4 ? "" : ` scale(${xs.toFixed(4)})`));
          diag.xg.setAttribute("opacity", clamp(xp / 0.25).toFixed(3));
          diag.g.setAttribute("opacity", (1 - ease(prog(t, d.t1, 0.3))).toFixed(3));
        }
      }

      if (opts.ring && t >= opts.ring.t) {
        const [cx, cy] = center(opts.ring.cell);
        ringNode.setAttribute("cx", cx);
        ringNode.setAttribute("cy", cy);
        ringNode.setAttribute("r", (45 * (0.7 + 0.3 * spring(prog(t, opts.ring.t, 0.4)))).toFixed(2));
        ringNode.setAttribute("opacity", clamp((t - opts.ring.t) / 0.18).toFixed(3));
      } else ringNode.setAttribute("opacity", 0);
    }

    return { render };
  }

  // ------------------------------------------------------------------ layout
  function placeBoard(node, { left, top, width, height, pad, radius }) {
    Object.assign(node.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, padding: `${pad}px`, borderRadius: `${radius}px` });
  }
  function titleBox(cell, top) {
    const pad = cell * 0.42, width = D.TITLE.cols * cell + 2 * pad, height = D.TITLE.rows * cell + 2 * pad;
    return { left: (W - width) / 2, top, width, height, pad, radius: cell * 0.9 };
  }
  function squareBox(size, left, top) {
    return { left, top, width: size, height: size, pad: size * 0.028, radius: size * 0.05 };
  }
  const LAYOUT = PORTRAIT
    ? { title: titleBox(28, 560), game: squareBox(700, 190, 830), mark: titleBox(22, 500) }
    : { title: titleBox(40, 150), game: squareBox(780, 210, 150), mark: titleBox(19, 200) };

  // ------------------------------------------------------------------ boards
  const titleStones = (times) => D.title.stones.map(({ cell, color, stroke, k }) => {
    const t = times.strokeStart + stroke * times.strokeStep + k * times.stoneStep;
    return { cell, color, land: t, launch: t, from: null };
  });

  const titleHost = document.getElementById("s1-board");
  placeBoard(titleHost, LAYOUT.title);
  const titleBoard = Board(titleHost, D.TITLE.cols, D.TITLE.rows, titleStones(D.TITLE_TIMES), { introAt: D.TITLE_TIMES.dots, dotStep: 0.016 });

  const gameHost = document.getElementById("game-board");
  placeBoard(gameHost, LAYOUT.game);
  const gameBoard = Board(gameHost, D.N, D.N, D.placements, {
    introAt: D.T.game[0] + 0.12, dotStep: 0.028,
    lit: D.lit, dims: D.dims, lastMarks: D.lastMarks, ring: D.holeRing, ghost: D.ghost,
    badges: D.badges, diagonal: D.diagonal,
  });

  const markHost = document.getElementById("s6-board");
  placeBoard(markHost, LAYOUT.mark);
  const markBoard = Board(markHost, D.TITLE.cols, D.TITLE.rows, titleStones(D.MARK_TIMES), { introAt: D.MARK_TIMES.dots, dotStep: 0.006 });

  // ------------------------------------------------------------------ copy
  const COPY = D.COPY[LANG];
  function setLines(node, text) {
    node.textContent = "";
    text.split("/").forEach((part, k) => {
      if (k) node.appendChild(document.createElement("br"));
      node.appendChild(document.createTextNode(part.trim()));
    });
  }
  const shots = ["s2", "s3", "s4", "s5"];
  for (const s of shots) {
    setLines(document.getElementById(`${s}-head`), COPY[s][0]);
    setLines(document.getElementById(`${s}-sub`), COPY[s][1]);
  }
  setLines(document.getElementById("s3-sub2"), COPY.s3[2]); // shot 3's second point replaces its first
  document.getElementById("s1-head").textContent = LANG === "zh" ? "赠岛 · Gift Islands" : "Gift Islands";
  document.getElementById("s6-pill").textContent = COPY.s6[0];
  document.getElementById("s6-sub").textContent = COPY.s6[1];

  /** Rise (the site's `rise`: up 14 px out of an 8 px blur, 0.9 s ease-out), then blur away. */
  function riseOut(node, t, tin, tout, { dy = 26, blur = 12, dur = 0.9, outDur = 0.3 } = {}) {
    if (tin == null || t < tin) { node.style.opacity = 0; return; }
    const p = easeOut(prog(t, tin, dur));
    let op = p, y = dy * (1 - p), b = blur * (1 - p), sc = 1;
    if (tout != null && t >= tout) {
      const q = ease(prog(t, tout, outDur));
      op *= 1 - q; b += 6 * q; sc = 1 - 0.015 * q;
    }
    node.style.opacity = op.toFixed(3);
    // Identity once landed: a lingering transform keeps the text on its own layer, rasterised
    // differently by each render worker, and the line shimmers from frame to frame.
    node.style.transform = y < 0.01 && sc > 0.9999 ? "none" : `translateY(${y.toFixed(2)}px) scale(${sc.toFixed(4)})`;
    node.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none";
  }

  // The view transition: out to a 4 px blur at 98.5 %, in from a 6 px blur at 101.2 %.
  function stage(node, t, tin, tout) {
    let op = 1, sc = 1, b = 0;
    if (tin != null) { const p = easeOut(prog(t, tin, 0.5)); op = p; sc = 1.012 - 0.012 * p; b = 6 * (1 - p); }
    if (tout != null && t >= tout) { const q = ease(prog(t, tout, 0.33)); op *= 1 - q; sc *= 1 - 0.015 * q; b += 4 * q; }
    node.style.opacity = op.toFixed(3);
    node.style.transform = Math.abs(sc - 1) < 1e-4 ? "none" : `scale(${sc.toFixed(4)})`;
    node.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none";
  }

  // ------------------------------------------------------------------ counters
  const shotOf = (t) => (t < D.T.s4[0] ? "s3" : t < D.T.s5[0] ? "s4" : "s5");
  function Counter(host, color, events) {
    const wrap = document.createElement("div");
    wrap.className = "counter";
    const chip = document.createElement("div");
    chip.className = `chip c${color}`;
    const num = document.createElement("div");
    num.className = "num";
    num.setAttribute("data-layout-allow-overlap", ""); // the old digit rolls out under the new one
    const sizer = document.createElement("span");
    sizer.className = "sizer";
    sizer.textContent = "0";
    const cur = document.createElement("span"), prev = document.createElement("span");
    num.append(sizer, prev, cur);
    const preview = document.createElement("div");
    preview.className = "preview";
    const pvCur = document.createElement("span"), pvPrev = document.createElement("span");
    pvPrev.style.position = "absolute";
    preview.style.position = "relative";
    preview.append(pvPrev, pvCur);
    wrap.append(chip, num, preview);
    host.appendChild(wrap);

    const shows = events.filter((e) => e.show || e.hide);
    const values = events.filter((e) => e.value != null);
    const previews = events.filter((e) => "preview" in e);

    function render(t, { winnerDim = 0 } = {}) {
      let on = null, off = null;
      for (const e of shows) if (t >= e.t) { if (e.show) { on = e.t; off = null; } else off = e.t; }
      riseOut(wrap, t, on, off, { dy: 18, blur: 10, dur: 0.6 });
      if (on == null) return;

      let v = null, tc = -1, pv = 0;
      for (const e of values) if (t >= e.t) { if (v != null && e.value !== v) { pv = v; tc = e.t; } v = e.value; }
      if (v == null) v = 0;
      cur.textContent = v;
      prev.textContent = tc >= 0 && t - tc < 0.4 ? pv : "";
      const p = tc < 0 ? 1 : easeOut(prog(t, tc, 0.4));
      const k = PORTRAIT ? 40 : 44;
      cur.style.transform = `translateY(${(k * (1 - p)).toFixed(2)}px)`;
      cur.style.opacity = p.toFixed(3);
      cur.style.filter = p < 1 ? `blur(${(8 * (1 - p)).toFixed(2)}px)` : "none";
      prev.style.transform = `translateY(${(-k * p).toFixed(2)}px)`;
      prev.style.opacity = (1 - p).toFixed(3);
      prev.style.filter = p < 1 ? `blur(${(8 * p).toFixed(2)}px)` : "none";
      num.style.color = mix(PAL.ink, PAL.ink3, winnerDim);
      chip.style.opacity = (1 - 0.55 * winnerDim).toFixed(3);

      let pval = null, ptc = -1, pprev = null;
      for (const e of previews) if (t >= e.t) { if (e.preview !== pval) { pprev = pval; ptc = e.t; } pval = e.preview; }
      const q = ptc < 0 ? 1 : easeOut(prog(t, ptc, 0.45));
      const arrow = (x) => (x == null ? "" : `→ ${x}`);
      pvCur.textContent = arrow(pval);
      pvPrev.textContent = arrow(pprev);
      pvCur.style.opacity = (pval == null ? 0 : q).toFixed(3);
      pvCur.style.display = "inline-block";
      pvCur.style.filter = q < 1 ? `blur(${(8 * (1 - q)).toFixed(2)}px)` : "none";
      pvPrev.style.opacity = (pprev == null ? 0 : 1 - q).toFixed(3);
      pvPrev.style.filter = q < 1 ? `blur(${(8 * q).toFixed(2)}px)` : "none";
    }
    return { render };
  }

  const counters = [];
  for (const s of ["s3", "s4", "s5"]) {
    const host = document.getElementById(`${s}-counters`);
    const colors = [1, 2]
      .map((color) => ({ color, evs: D.counters.filter((e) => e.color === color && shotOf(e.t) === s) }))
      .filter((x) => x.evs.length)
      .sort((x, y) => x.evs[0].t - y.evs[0].t); // the first to appear takes the left slot
    for (const { color, evs } of colors) counters.push({ shot: s, color, c: Counter(host, color, evs) });
  }

  // ------------------------------------------------------------------ the frame
  const nodes = {
    s1Stage: document.querySelector("#s1 .stage"),
    gameStage: document.querySelector("#game .stage"),
    s6Stage: document.querySelector("#s6 .stage"),
    s1Head: document.getElementById("s1-head"),
    pill: document.getElementById("s6-pill"),
    s6Sub: document.getElementById("s6-sub"),
  };
  const CT = D.COPY_TIMES;

  // Every scene is set on every call, whatever t is, so no frame inherits the previous seek's state.
  function renderAt(t) {
    stage(nodes.s1Stage, t, null, CT.s1[2]);
    titleBoard.render(t);
    riseOut(nodes.s1Head, t, CT.s1[0], null);

    stage(nodes.gameStage, t, D.T.game[0], D.b(65.5));
    gameBoard.render(t);
    for (const s of shots) {
      const [hin, sin, out] = CT[s];
      riseOut(document.getElementById(`${s}-head`), t, hin, out);
      riseOut(document.getElementById(`${s}-sub`), t, sin, CT[s][3] ?? out);
    }
    riseOut(document.getElementById("s3-sub2"), t, CT.s3[3], CT.s3[2]);
    const winDim = ease(prog(t, D.winner.t, 0.5));
    for (const { shot, color, c } of counters) c.render(t, { winnerDim: shot === "s5" && color !== D.winner.color ? winDim : 0 });

    stage(nodes.s6Stage, t, D.T.s6[0], null);
    markBoard.render(t);
    const p = prog(t, CT.s6[0], 0.6);
    nodes.pill.style.opacity = (t < CT.s6[0] ? 0 : clamp(p / 0.4)).toFixed(3);
    const ps = 0.86 + 0.14 * spring(p);
    nodes.pill.style.transform = Math.abs(ps - 1) < 1e-4 ? "none" : `scale(${ps.toFixed(4)})`;
    nodes.pill.style.filter = p < 0.5 ? `blur(${(6 * (1 - p * 2)).toFixed(2)}px)` : "none";
    riseOut(nodes.s6Sub, t, CT.s6[1], null, { dy: 18, blur: 10 });
  }

  window.__filmRenderAt = renderAt;
  window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
  renderAt(0);

  const proxy = { t: 0 };
  const tl = gsap.timeline({ paused: true });
  tl.to(proxy, { t: D.DURATION, duration: D.DURATION, ease: "none", onUpdate: () => renderAt(proxy.t) }, 0);
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
})();
