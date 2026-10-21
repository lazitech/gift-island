// Island counts for both colours, with a +1 / −1 preview of the move under the cursor.
// `labels` names the two sides; `format` turns a count into text (e.g. signed gains).

/** 3 → "+3", 0 → "0", −2 → "−2". */
export const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");

export function createTally(parent, { labels = null } = {}) {
  const el = document.createElement("div");
  el.className = "tally";
  el.innerHTML = [1, 2].map((c) => `
    <span class="tally-side" data-color="${c}">
      <span class="chip" data-color="${c}"></span>
      ${labels ? `<span class="tally-label">${labels[c - 1]}</span>` : ""}
      <span class="tally-num">0</span><span class="tally-unit">岛</span>
      <span class="delta"></span>
    </span>`).join("");
  parent.append(el);
  const nums = el.querySelectorAll(".tally-num");
  const deltas = el.querySelectorAll(".delta");

  return {
    show(real, next = null, format = String) {
      [1, 2].forEach((c, k) => {
        const text = format(real[c]);
        if (nums[k].textContent !== text) {
          nums[k].textContent = text;
          nums[k].classList.remove("bump");
          void nums[k].offsetWidth;
          nums[k].classList.add("bump");
        }
        const d = next ? next[c] - real[c] : 0;
        if (d !== 0) deltas[k].textContent = d > 0 ? `+${d}` : `−${-d}`;
        deltas[k].classList.toggle("show", d !== 0);
        deltas[k].classList.toggle("down", d < 0);
      });
    },
  };
}
