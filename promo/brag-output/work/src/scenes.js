  // ================================================================== /brag scenes (120 BPM)
  const BB = 0.5; // one beat
  const bt = (n) => Math.round(n * BB * 30) / 30;
  window.BRAG_BEAT = BB;

  // ---------- shot 1: the hook, word by word on the beat
  const hookWords = [...document.querySelectorAll("#hook .w")];
  const hookStone = document.getElementById("hook-stone");
  const hookTimes = [0, bt(1), bt(2), bt(3), bt(4.5)];
  function popWord(node, t, t0, tout) {
    if (t < t0) { node.style.opacity = 0; return; }
    const p = prog(t, t0, 0.35);
    let op = clamp((t - t0) / 0.13), b = 10 * (1 - clamp((t - t0) / 0.13)), sc = 0.9 + 0.1 * spring(p);
    if (t0 === 0) { op = 1; b = 0; sc = 1; }
    if (tout != null && t >= tout) { const q = ease(prog(t, tout, 0.2)); op *= 1 - q; b += 8 * q; }
    node.style.opacity = op.toFixed(3);
    node.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none";
    node.style.transform = Math.abs(sc - 1) < 1e-4 ? "none" : `scale(${sc.toFixed(4)})`;
  }

  // ---------- shot 2: the title in stones
  const titleCell = 40;
  const tpad = titleCell * 0.42, tw = D.TITLE.cols * titleCell + 2 * tpad, th = D.TITLE.rows * titleCell + 2 * tpad;
  const titleHost = document.getElementById("title-board");
  Object.assign(titleHost.style, { left: `${(W - tw) / 2}px`, top: "150px", width: `${tw}px`, height: `${th}px`, padding: `${tpad}px`, borderRadius: `${titleCell * 0.9}px` });
  const strokeStep = 0.06;
  const titleStart = bt(6) + 0.1;
  const titleBoard = Board(titleHost, D.TITLE.cols, D.TITLE.rows, D.title.stones.map(({ cell, color, stroke, k }) => {
    const t = titleStart + stroke * strokeStep + k * 0.01;
    return { cell, color, land: t, launch: t, from: null };
  }), { introAt: bt(6), dotStep: 0.008 });

  // ---------- shots 3–4: the game, faster than the film
  const placements = [], lit = [], dims = [], lastMarks = [];
  // Each move places its own stone, then the gift on its own cell a moment later. Nothing slides.
  const moveAt = (k, t, gap) => {
    const [self, gift] = D.MOVES[k];
    const color = k % 2 === 0 ? 1 : 2;
    placements.push({ cell: self, color, land: t, launch: t, from: null });
    placements.push({ cell: gift, color: 3 - color, land: t + gap, launch: t + gap, from: null });
    return t + gap;
  };
  for (let k = 0; k < 6; k++) { const land = moveAt(k, bt(13 + k), 0.125); lastMarks.push({ t: land, cells: D.MOVES[k] }); }
  for (let k = 6; k < 10; k++) moveAt(k, bt(21 + 0.25 * (k - 6)), 1 / 30);
  lastMarks.push({ t: bt(21), cells: null });
  // white's three islands, then the gift in the gap
  const whiteIslands = [[21, 22, 23], [25, 26, 27], [40, 41, 47, 48]];
  dims.push({ color: 1, t0: bt(22), t1: bt(22) + 0.3, from: 1, to: 0.2 }, { color: 1, t0: bt(24), t1: bt(24) + 0.3, from: 0.2, to: 1 });
  whiteIslands.forEach((cells, k) => lit.push({ t: bt(22.5 + 0.5 * k), cells, color: 2, hold: 0.3 }));
  const KEY = D.MOVES[10];
  placements.push({ cell: KEY[0], color: 1, land: bt(24), launch: bt(24), from: null });
  const ghost = { corner: KEY[1], target: KEY[1], cornerIn: bt(25.5), cornerOut: bt(25.5), targetIn: bt(25.5), commit: bt(26) };
  placements.push({ cell: KEY[1], color: 2, land: bt(26), launch: bt(26), from: null, fromGhost: true });
  lastMarks.push({ t: bt(26), cells: KEY });
  lit.push({ t: bt(26.5), cells: [21, 22, 23, 24, 25, 26, 27], color: 2, hold: 1.2 });

  const gameHost = document.getElementById("game-board");
  Object.assign(gameHost.style, { left: "170px", top: "130px", width: "820px", height: "820px", padding: `${820 * 0.028}px`, borderRadius: `${820 * 0.05}px` });
  const gameBoard = Board(gameHost, D.N, D.N, placements, { introAt: bt(12) + 0.05, dotStep: 0.02, lit, dims, lastMarks, ghost });

  const big = document.getElementById("big-num");
  const bigOld = big.querySelector(".old"), bigNew = big.querySelector(".new");

  // ---------- frame
  const $ = (id) => document.getElementById(id);
  const stages = { hook: $("hook"), title: $("title"), game: $("game"), outro: $("outro") };
  function rise(node, t, tin, tout, dy = 30) {
    if (t < tin) { node.style.opacity = 0; return; }
    const p = easeOut(prog(t, tin, 0.6));
    let op = p, b = 12 * (1 - p);
    if (tout != null && t >= tout) { const q = ease(prog(t, tout, 0.22)); op *= 1 - q; b += 8 * q; }
    node.style.opacity = op.toFixed(3);
    // identity once landed, so the line is not left on a layer each render worker rasterises differently
    node.style.transform = dy * (1 - p) < 0.01 ? "none" : `translateY(${(dy * (1 - p)).toFixed(2)}px)`;
    node.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none";
  }
  function swap(node, t, tin, tout) {
    let op = 1, sc = 1, b = 0;
    if (tin != null) { const p = easeOut(prog(t, tin, 0.35)); op = p; sc = 1.03 - 0.03 * p; b = 10 * (1 - p); }
    if (tout != null && t >= tout) { const q = ease(prog(t, tout, 0.25)); op *= 1 - q; sc *= 1 - 0.03 * q; b += 8 * q; }
    node.style.opacity = op.toFixed(3);
    node.style.transform = Math.abs(sc - 1) < 1e-4 ? "none" : `scale(${sc.toFixed(4)})`;
    node.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none";
  }

  function renderAt(t) {
    // 1 hook
    swap(stages.hook, t, null, bt(5.6));
    hookWords.forEach((w, k) => popWord(w, t, hookTimes[k], null));
    const sp = prog(t, bt(4), 0.5);
    hookStone.style.opacity = t < bt(4) ? 0 : 1;
    hookStone.style.transform = `translateY(${(-160 * (1 - easeOut(clamp((t - bt(4)) / 0.22)))).toFixed(1)}px) scale(${(0.4 + 0.6 * spring(sp)).toFixed(4)})`;

    // 2 title
    swap(stages.title, t, bt(6), bt(11.6));
    titleBoard.render(t);
    rise($("title-cap"), t, bt(9), null, 20);

    // 3–4 game
    swap(stages.game, t, bt(12), bt(30.7));
    gameBoard.render(t);
    rise($("rule-head"), t, bt(12.5), bt(20.6));
    rise($("rule-sub"), t, bt(13.5), bt(20.6));
    rise($("twist-head"), t, bt(26.5), null);
    // the giant count: 3 builds with the lights, then 2 slams in on the gift
    big.style.opacity = t < bt(22.5) ? 0 : 1;
    const c = t >= bt(26.5) ? 2 : t >= bt(23.5) ? 3 : t >= bt(23) ? 2 : 1;
    const tc = t >= bt(26.5) ? bt(26.5) : t >= bt(23.5) ? bt(23.5) : t >= bt(23) ? bt(23) : bt(22.5);
    const p = prog(t, tc, 0.45);
    bigNew.textContent = c;
    bigOld.textContent = t - tc < 0.45 && c !== 1 ? (t >= bt(26.5) ? 3 : c - 1) : "";
    const slam = t >= bt(26.5);
    bigNew.style.transform = slam ? `scale(${(1.5 - 0.5 * spring(p)).toFixed(4)})` : `translateY(${(60 * (1 - easeOut(p))).toFixed(1)}px)`;
    bigNew.style.opacity = clamp(p / 0.4).toFixed(3);
    bigNew.style.filter = p < 0.4 ? `blur(${(14 * (1 - p / 0.4)).toFixed(2)}px)` : "none";
    bigNew.style.color = slam ? `var(--accent)` : "";
    bigOld.style.transform = `translateY(${(-60 * easeOut(p)).toFixed(1)}px)`;
    bigOld.style.opacity = (1 - clamp(p / 0.5)).toFixed(3);

    // 5 outro
    swap(stages.outro, t, bt(31), null);
    rise($("win"), t, bt(31.2), null);
    const q = prog(t, bt(34), 0.6);
    $("cta").style.opacity = t < bt(34) ? 0 : clamp(q / 0.4).toFixed(3);
    const cs = 0.85 + 0.15 * spring(q);
    $("cta").style.transform = Math.abs(cs - 1) < 1e-4 ? "none" : `scale(${cs.toFixed(4)})`;
    rise($("url"), t, bt(34.75), null, 16);
  }

  window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
  renderAt(0);
  const proxy = { t: 0 };
  const tl = gsap.timeline({ paused: true });
  tl.to(proxy, { t: 20, duration: 20, ease: "none", onUpdate: () => renderAt(proxy.t) }, 0);
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
