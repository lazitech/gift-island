// The SVG board shared by the game, the home-page title and the lessons: dots, stones,
// island bridges and selection marks for a cols × rows grid, plus pointer/keyboard input.

const svgNS = "http://www.w3.org/2000/svg";
const CELL = 100;
const STONE_R = 36;

function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

const centerOf = (i, cols) => [(i % cols) * CELL + CELL / 2, Math.floor(i / cols) * CELL + CELL / 2];

/**
 * A waisted bridge from the stone at (x, y) to its right or lower neighbour, so islands read as one
 * landmass. `W` is the half-width at the waist; near STONE_R the bridge is almost straight.
 */
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

export function createBoardView(boardEl, cols, rows = cols) {
  const area = cols * rows;
  const svg = boardEl.querySelector("svg") ?? svgEl("svg", { "aria-hidden": "true" }, boardEl);
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${cols * CELL} ${rows * CELL}`);

  const els = { dots: [], stones: { 1: [], 2: [] }, bridges: { 1: new Map(), 2: new Map() } };
  const edges = [];
  const marks = {};
  const center = (i) => centerOf(i, cols);

  const dots = svgEl("g", {}, svg);
  for (let i = 0; i < area; i++) {
    const [cx, cy] = center(i);
    const d = svgEl("circle", { cx, cy, r: 5, class: "dot" }, dots);
    d.style.setProperty("--d", Math.floor(i / cols) + (i % cols));
    els.dots.push(d);
  }

  for (let a = 0; a < area; a++) {
    if (a % cols < cols - 1) edges.push({ a, b: a + 1, key: `${a}h`, h: true });
    if (a < area - cols) edges.push({ a, b: a + cols, key: `${a}v`, h: false });
  }

  for (const color of [1, 2]) {
    const layer = svgEl("g", { class: `layer l${color}` }, svg);
    const bridges = svgEl("g", {}, layer);
    const stones = svgEl("g", {}, layer);
    for (const e of edges) {
      els.bridges[color].set(e.key, svgEl("path", { d: bridgePath(center(e.a), e.h), class: `bridge ${e.h ? "h" : "v"}` }, bridges));
    }
    for (let i = 0; i < area; i++) {
      const [cx, cy] = center(i);
      els.stones[color].push(svgEl("circle", { cx, cy, r: STONE_R, class: "stone" }, stones));
    }
  }

  const markLayer = svgEl("g", { class: "mark" }, svg);
  marks.last = [svgEl("circle", { r: 7, class: "last" }, markLayer), svgEl("circle", { r: 7, class: "last" }, markLayer)];
  marks.pending = svgEl("circle", { r: 45, class: "ring" }, markLayer);
  marks.focusWrap = svgEl("g", { class: "focus-wrap" }, markLayer);
  marks.focus = svgEl("circle", { cx: 0, cy: 0, r: 46, class: "ring focus-ring" }, marks.focusWrap);

  /**
   * solid / ghost: per-cell colour (0 none). last: [self, gift] or null. pending, focus: a cell or null.
   */
  function render({ solid, ghost = null, last = null, pending = null, focus = null, locked = false }) {
    for (let i = 0; i < area; i++) {
      const g = ghost ? ghost[i] : 0;
      els.dots[i].classList.toggle("off", solid[i] !== 0 || g !== 0);
      for (const color of [1, 2]) {
        const el = els.stones[color][i];
        el.classList.toggle("on", solid[i] === color);
        el.classList.toggle("ghost", g === color);
      }
    }
    for (const e of edges) {
      for (const color of [1, 2]) {
        const ea = solid[e.a] === color ? 1 : ghost?.[e.a] === color ? 2 : 0;
        const eb = solid[e.b] === color ? 1 : ghost?.[e.b] === color ? 2 : 0;
        const el = els.bridges[color].get(e.key);
        el.classList.toggle("on", ea === 1 && eb === 1);
        el.classList.toggle("ghost", ea > 0 && eb > 0 && (ea === 2 || eb === 2));
      }
    }

    marks.last.forEach((m, k) => {
      const cell = last ? last[k] : null;
      if (cell !== null) {
        const [cx, cy] = center(cell);
        m.setAttribute("cx", cx);
        m.setAttribute("cy", cy);
      }
      m.classList.toggle("show", cell !== null);
    });

    if (pending !== null) {
      const [cx, cy] = center(pending);
      marks.pending.setAttribute("cx", cx);
      marks.pending.setAttribute("cy", cy);
    }
    marks.pending.classList.toggle("show", pending !== null);

    if (focus !== null) {
      const [fx, fy] = center(focus);
      marks.focusWrap.style.transform = `translate(${fx}px, ${fy}px)`;
    }
    marks.focus.classList.toggle("show", focus !== null);

    boardEl.classList.toggle("locked", locked);
  }

  /** The stones of one island and the bridges inside it. */
  function islandEls(cells, color) {
    const inIsland = new Set(cells);
    const out = cells.map((i) => els.stones[color][i]);
    for (const e of edges) {
      if (inIsland.has(e.a) && inIsland.has(e.b)) out.push(els.bridges[color].get(e.key));
    }
    return out;
  }

  /** Toggle a class on a whole island, e.g. "found" or "peek". */
  function mark(cells, color, cls, on = true) {
    for (const el of islandEls(cells, color)) el.classList.toggle(cls, on);
  }

  function clearMarks(cls) {
    for (const el of svg.querySelectorAll(`.${cls}`)) el.classList.remove(cls);
  }

  function light(cells, color, ms = 520) {
    const lit = islandEls(cells, color);
    lit.forEach((el) => el.classList.add("lit"));
    setTimeout(() => lit.forEach((el) => el.classList.remove("lit")), ms);
  }

  function cellFromEvent(event) {
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
    return Math.floor(y * rows) * cols + Math.floor(x * cols);
  }

  function restart(cls) {
    boardEl.classList.remove(cls);
    void boardEl.offsetWidth;
    boardEl.classList.add(cls);
  }

  const nope = () => restart("nope");

  /** The dots appear in a sweep from the top-left corner, or with `scatter`, in no order at all. */
  function intro({ scatter = false } = {}) {
    if (scatter) els.dots.forEach((d) => d.style.setProperty("--d", Math.floor(Math.random() * (cols + rows))));
    restart("intro");
    setTimeout(() => boardEl.classList.remove("intro"), 600 + 28 * (cols + rows));
  }

  return { cols, rows, area, el: boardEl, render, mark, clearMarks, light, cellFromEvent, nope, intro };
}

/**
 * A still drawing in stones of one colour, with no dots or input: for seals and badges.
 * `order` lists the cells in writing order; every stone and bridge carries --k, its place in that
 * order, so CSS can write the drawing out stroke by stroke.
 */
export function drawStones(svg, cols, rows, order, color, { waist } = {}) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${cols * CELL} ${rows * CELL}`);
  const k = new Map(order.map((cell, i) => [cell, i]));
  const layer = svgEl("g", { class: `layer l${color}` }, svg);
  const bridges = svgEl("g", {}, layer);
  const stones = svgEl("g", {}, layer);
  for (const [cell, i] of k) {
    const [cx, cy] = centerOf(cell, cols);
    svgEl("circle", { cx, cy, r: STONE_R, class: "stone on", style: `--k: ${i}` }, stones);
    for (const [next, horizontal] of [[cell + 1, true], [cell + cols, false]]) {
      if (!k.has(next) || (horizontal && next % cols === 0) || next >= cols * rows) continue;
      const style = `--k: ${Math.max(i, k.get(next))}`;
      svgEl("path", { d: bridgePath([cx, cy], horizontal, waist), class: `bridge on ${horizontal ? "h" : "v"}`, style }, bridges);
    }
  }
}

/**
 * Mouse hover, taps and arrow-key navigation for an interactive board.
 * `state` holds { hover, focus, keyboard } and is mutated in place; `onChange` re-renders.
 */
export function bindBoardInput(view, state, { onChange, onChoose }) {
  const { el, cols, rows } = view;

  el.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const cell = view.cellFromEvent(event);
    if (state.keyboard) state.keyboard = false;
    if (cell === state.hover) return;
    state.hover = cell;
    onChange();
  });

  el.addEventListener("pointerleave", () => {
    if (state.hover === null) return;
    state.hover = null;
    onChange();
  });

  el.addEventListener("click", (event) => {
    const cell = view.cellFromEvent(event);
    if (cell === null) return;
    state.keyboard = false;
    state.focus = cell;
    onChoose(cell);
  });

  el.addEventListener("keydown", (event) => {
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
    if (step) {
      event.preventDefault();
      const r = Math.floor(state.focus / cols), c = state.focus % cols;
      const nr = Math.min(rows - 1, Math.max(0, r + step[0])), nc = Math.min(cols - 1, Math.max(0, c + step[1]));
      state.focus = nr * cols + nc;
      state.keyboard = true;
      onChange();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      state.keyboard = true;
      onChoose(state.focus);
    }
  });

  el.addEventListener("focus", () => onChange());
  el.addEventListener("blur", () => { state.keyboard = false; onChange(); });
}

/** The cell whose keyboard ring should show, or null. */
export function focusCell(view, state) {
  return state.keyboard && document.activeElement === view.el ? state.focus : null;
}
