import { sealRecord, drawSeal, seasonOf, chineseNumber } from "./seal.js";
import { signed } from "./tally.js";

// The easter egg behind the title board. Beat the title and a seal is carved and pressed here;
// from then on it sits beside the title on the home page, and tapping it brings you back.

export function createEgg({ root, reducedMotion, onHome, onPlay }) {
  const seal = root.querySelector("#egg-seal");
  const art = root.querySelector(".egg-art");
  drawSeal(seal);

  // The seal leans towards the pointer, like a stone turned in the hand.
  art.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || reducedMotion.matches) return;
    const r = seal.getBoundingClientRect();
    const x = (event.clientX - r.left) / r.width - 0.5;
    const y = (event.clientY - r.top) / r.height - 0.5;
    seal.style.setProperty("--ry", `${Math.max(-1, Math.min(1, x)) * 12}deg`);
    seal.style.setProperty("--rx", `${Math.max(-1, Math.min(1, -y)) * 8}deg`);
  });
  art.addEventListener("pointerleave", () => {
    seal.style.removeProperty("--rx");
    seal.style.removeProperty("--ry");
  });

  root.querySelector("#egg-home").addEventListener("click", onHome);
  root.querySelector("#egg-play").addEventListener("click", onPlay);

  return {
    /** `fresh`: arriving straight from a win, rather than coming back through the seal. */
    enter({ fresh = false } = {}) {
      const record = sealRecord();
      if (!record) return;
      const { black, white, at } = record.last;
      const n = record.wins;
      root.querySelector("#egg-title").textContent = !fresh ? "岛主之印" : n > 1 ? "又赢了一次。" : "你赢了标题。";
      root.querySelector("#egg-body").textContent = !fresh
        ? "这是你在标题上赢下一局时留下的印。想再赢一次，就回到首页，在标题上落子。"
        : n > 1
          ? `这是你第 ${n} 次赢下标题里的那局棋。印还是那一枚，再盖一次。`
          : "很少有人发现，“赠岛”这两个字本身就是一局棋。这枚印归你了，从今往后，它会盖在首页的标题旁。";
      root.querySelector("#egg-score").textContent = `八手 · 黑 ${signed(black)} 岛 · 白 ${signed(white)} 岛`;
      root.querySelector("#egg-inscription").textContent = `${seasonOf(at)}　题上${chineseNumber(n)}胜`;

      seal.classList.remove("carve");
      void seal.offsetWidth;
      if (!reducedMotion.matches) seal.classList.add("carve");
    },
  };
}
