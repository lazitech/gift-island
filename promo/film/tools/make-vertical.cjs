// vertical/index.html is index.html at 1080 × 1920: same scenes, same scripts; film.js lays out by
// aspect. vertical/assets is a copy of what the film loads from ../assets (the renderer does not
// follow symlinks); rerun after changing anything in assets/.
//   node tools/make-vertical.cjs
const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(dir, "index.html"), "utf8");
const out = src
  .replace('content="width=1920, height=1080"', 'content="width=1080, height=1920"')
  .replace("width: 1920px; height: 1080px;", "width: 1080px; height: 1920px;")
  .replace('data-width="1920" data-height="1080"', 'data-width="1080" data-height="1920"')
  .replace("<title>Gift Islands · 16:9</title>", "<title>Gift Islands · 9:16</title>")
  .replace("<!doctype html>", "<!doctype html>\n<!-- Generated from index.html by tools/make-vertical.cjs: edit index.html, then rerun. -->");
if (out === src || !out.includes('data-width="1080"')) throw new Error("index.html no longer matches the patterns");
const vdir = path.join(dir, "vertical");
fs.mkdirSync(vdir, { recursive: true });
fs.writeFileSync(path.join(vdir, "index.html"), out);
const vassets = path.join(vdir, "assets");
fs.rmSync(vassets, { recursive: true, force: true });
fs.mkdirSync(path.join(vassets, "fonts"), { recursive: true });
const assets = path.join(dir, "assets");
const skip = (f) => f.endsWith(".wav") || /^PingFangSC-(Regular|Semibold)\.otf$/.test(f);
for (const f of fs.readdirSync(assets)) if (fs.statSync(path.join(assets, f)).isFile() && !skip(f)) fs.copyFileSync(path.join(assets, f), path.join(vassets, f));
for (const f of fs.readdirSync(path.join(assets, "fonts"))) if (!skip(f)) fs.copyFileSync(path.join(assets, "fonts", f), path.join(vassets, "fonts", f));
console.log("wrote vertical/index.html");
