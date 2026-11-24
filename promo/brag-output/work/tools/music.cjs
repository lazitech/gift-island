// The /brag cut's soundtrack, one piece on a 120 BPM grid counted from frame 0: soft kick on the
// beat from the reveal, off-beat shaker, sine bass per bar, a mallet pluck on every stone (event
// times mirror src/scenes.js), a riser into the 3 → 2 and a closing chord. Writes assets/music.m4a.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const SR = 48000, DUR = 20, LEN = DUR * SR, BB = 0.5;
const bt = (n) => Math.round(n * BB * 30) / 30;
const L = new Float32Array(LEN), R = new Float32Array(LEN);
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 99;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
const add = (i, l, r) => { if (i >= 0 && i < LEN) { L[i] += l; R[i] += r; } };

function mallet(t, midi, vel = 1, pan = 0, decay = 1) {
  const f = hz(midi), a = Math.round(t * SR);
  const tau1 = (0.45 + 0.6 * Math.max(0, Math.min(1, (84 - midi) / 30))) * decay;
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  for (let k = 0; k < Math.round(tau1 * 5 * SR); k++) {
    const x = k / SR;
    let s = Math.sin(2 * Math.PI * f * x) * Math.exp(-x / tau1) + 0.3 * Math.sin(2 * Math.PI * f * 3.98 * x) * Math.exp(-x / 0.1)
      + 0.1 * Math.sin(2 * Math.PI * f * 2 * x) * Math.exp(-x / (tau1 * 0.5));
    if (k < 0.005 * SR) s += 0.15 * noise() * (1 - k / (0.005 * SR));
    s *= Math.min(1, x / 0.003) * 0.15 * vel;
    add(a + k, s * gl, s * gr);
  }
}
function kick(t, vel = 1) {
  const a = Math.round(t * SR);
  let ph = 0;
  for (let k = 0; k < 0.35 * SR; k++) {
    const x = k / SR, f = 48 + 90 * Math.exp(-x / 0.03);
    ph += 2 * Math.PI * f / SR;
    const s = 0.38 * vel * Math.sin(ph) * Math.exp(-x / 0.12) * Math.min(1, x / 0.002);
    add(a + k, s, s);
  }
}
function shaker(t, vel = 1) {
  const a = Math.round(t * SR);
  let lp = 0, prev = 0;
  for (let k = 0; k < 0.07 * SR; k++) {
    const x = k / SR, n = noise();
    const hp = n - prev; prev = n; lp = lp * 0.4 + hp * 0.6;
    const s = 0.035 * vel * lp * Math.exp(-x / 0.018) * Math.min(1, x / 0.004);
    add(a + k, s * 0.8, s);
  }
}
function bass(t, midi, len, amp = 0.12) {
  const f = hz(midi), a = Math.round(t * SR);
  for (let k = 0; k < len * SR; k++) {
    const x = k / SR, env = Math.min(1, x / 0.01) * Math.exp(-x / 0.9) * Math.min(1, (len - x) / 0.05);
    const s = amp * env * (Math.sin(2 * Math.PI * f * x) + 0.2 * Math.sin(4 * Math.PI * f * x));
    add(a + k, s, s);
  }
}
function riser(t0, t1) {
  for (let i = Math.round(t0 * SR); i < Math.round(t1 * SR); i++) {
    const p = (i / SR - t0) / (t1 - t0);
    const s = 0.05 * p * p * noise();
    add(i, s, s);
  }
}

// Bars (2 s): F – Dm – B♭ – C, twice, then F.
const roots = [41, 38, 46, 48, 41, 38, 46, 48, 41, 41];
const chords = [[65, 69, 72, 76], [62, 65, 69, 72], [62, 65, 70, 74], [64, 67, 72, 74], [65, 69, 72, 76], [62, 65, 69, 72], [62, 65, 70, 74], [64, 67, 72, 74], [65, 69, 72, 79], [65, 69, 72, 79]];
const chordAt = (t) => chords[Math.min(chords.length - 1, Math.floor(t / 2))];

// Hook: a pluck per word, rising; silence underneath so the question lands.
[0, bt(1), bt(2), bt(3)].forEach((t, k) => mallet(t, [72, 74, 77, 79][k], 0.8, -0.2 + 0.1 * k));
mallet(bt(4), 84, 0.9, 0.2, 1.4); // the stone
// Drums and bass from the reveal; out for the beat before the outro, back on the button.
for (let n = 6; n < 40; n++) {
  const t = bt(n);
  if (n >= 30 && n < 34) continue;
  kick(t, n % 4 === 0 ? 1 : 0.7);
  shaker(t + BB / 2, n % 2 ? 1 : 0.7);
}
for (let bar = 3; bar < 10; bar++) bass(bar * 2, roots[bar], bar === 7 ? 1.0 : 1.9);
// Title strokes: a glissando.
for (let s = 0; s < 23; s++) mallet(bt(6) + 0.1 + s * 0.06, [65, 67, 69, 72, 74][s % 5] + 12 * Math.floor(s / 10), 0.35, -0.5 + s * 0.045, 0.6);
// Game: self and gift stones.
const pick = (t, i) => chordAt(t)[i % 4];
for (let k = 0; k < 6; k++) { const t = bt(13 + k); mallet(t, pick(t, k), 0.75, -0.2); mallet(t + 0.125, pick(t, k + 2) + 12, 0.55, 0.25); }
for (let k = 6; k < 10; k++) { const t = bt(21 + 0.25 * (k - 6)); mallet(t, pick(t, k), 0.45, -0.2, 0.6); }
[0, 1, 2].forEach((k) => mallet(bt(22.5 + 0.5 * k), [72, 74, 77][k], 0.7, 0.1));
mallet(bt(24), 70, 0.7, -0.2);
mallet(bt(25.5), 86, 0.3, 0.3, 1.4); // the gift being considered
riser(bt(24.5), bt(26.5));
bass(bt(26.5), 34, 1.4, 0.2);
[81, 84, 89].forEach((m, k) => mallet(bt(26.5) + k * 0.06, m, 0.7 - 0.1 * k, 0.15 * k, 1.5));
// Outro: the win line, then the closing chord on the button.
mallet(bt(31.2), 77, 0.6, 0, 1.4);
bass(bt(34), 29, DUR - bt(34), 0.18);
[53, 60, 65, 69, 72, 79, 81].forEach((m, k) => mallet(bt(34) + k * 0.025, m, 0.75 - 0.05 * k, -0.35 + 0.12 * k, 2.2));

for (let i = 0; i < LEN; i++) { const t = i / SR; if (t > DUR - 1.2) { const g = (DUR - t) / 1.2; L[i] *= g; R[i] *= g; } }
let peak = 0;
for (let i = 0; i < LEN; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const buf = Buffer.alloc(44 + LEN * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + LEN * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(LEN * 4, 40);
for (let i = 0; i < LEN; i++) {
  buf.writeInt16LE(Math.round((L[i] / peak) * 0.89 * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round((R[i] / peak) * 0.89 * 32767), 46 + i * 4);
}
const dir = path.join(__dirname, "..", "assets");
const wav = path.join(dir, "music.wav");
fs.writeFileSync(wav, buf);
const p1 = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", wav, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]).stderr.toString();
const st = JSON.parse(p1.slice(p1.lastIndexOf("{"), p1.lastIndexOf("}") + 1));
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-af",
  `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${st.input_i}:measured_TP=${st.input_tp}:measured_LRA=${st.input_lra}:measured_thresh=${st.input_thresh}:offset=${st.target_offset}:linear=true,aresample=48000`,
  "-c:a", "aac", "-b:a", "256k", path.join(dir, "music.m4a")]);
console.log(`wrote assets/music.m4a (input ${st.input_i} LUFS)`);
