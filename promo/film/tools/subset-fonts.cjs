// Subsets PingFang SC to the characters the film uses (13 MB → a few KB each).
// Needs uv (runs fontTools via uvx). Source fonts: assets/fonts/PingFangSC-{Regular,Semibold}.otf (not in git:
// copy them from a Mac's /System/Library/Fonts or a licensed install first).
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const D = require("../assets/film-data.js");
const text = new Set("赠岛 · Gift Islands→0123456789 ");
for (const lang of Object.values(D.COPY)) for (const pair of Object.values(lang)) for (const s of pair) for (const ch of s) text.add(ch);
const chars = [...text].join("");
const dir = path.join(__dirname, "..", "assets", "fonts");
for (const w of ["Regular", "Semibold"]) {
  execFileSync("uvx", ["--from", "fonttools", "pyftsubset", path.join(dir, `PingFangSC-${w}.otf`),
    `--text=${chars}`, `--output-file=${path.join(dir, `PingFangSC-${w}.subset.otf`)}`, "--layout-features=*"], { stdio: "inherit" });
}
console.log(`subset ${[...text].length} characters`);
