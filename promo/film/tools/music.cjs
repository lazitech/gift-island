// Synthesises the film's score from assets/film-data.js: a soft mallet (marimba-like) note on
// every stone, a rising scale while islands are counted, a quiet pad and bass on a 90 BPM grid,
// and a closing F add9 chord. No samples, so no licensing. Writes assets/music.wav, then a
// loudness-normalised assets/music.m4a (-16 LUFS, -1.5 dBTP) with ffmpeg.
//
//   node tools/music.cjs
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const D = require("../assets/film-data.js");

const SR = 48000;
const LEN = Math.ceil(D.DURATION * SR);
const L = new Float32Array(LEN), R = new Float32Array(LEN);
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Seeded noise for the mallet's attack.
let seed = 12345;
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

function add(i, l, r) { if (i >= 0 && i < LEN) { L[i] += l; R[i] += r; } }

/** A soft mallet: fundamental, the marimba's 4th partial and a short 10th, with a felt attack. */
function mallet(t, midi, vel = 1, { pan = 0, decay = 1 } = {}) {
  const f = hz(midi);
  const start = Math.round(t * SR);
  const low = Math.max(0, Math.min(1, (84 - midi) / 30));
  const tau1 = (0.55 + 0.9 * low) * decay, tau2 = 0.11 * decay, tau3 = 0.035;
  const n = Math.round(Math.min(5, tau1 * 6) * SR);
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  const amp = 0.16 * vel;
  for (let k = 0; k < n; k++) {
    const x = k / SR;
    const att = Math.min(1, x / 0.003);
    let s = Math.sin(2 * Math.PI * f * x) * Math.exp(-x / tau1)
      + 0.32 * Math.sin(2 * Math.PI * f * 3.98 * x) * Math.exp(-x / tau2)
      + 0.10 * Math.sin(2 * Math.PI * f * 9.1 * x) * Math.exp(-x / tau3)
      + 0.12 * Math.sin(2 * Math.PI * f * 2 * x) * Math.exp(-x / (tau1 * 0.5));
    if (k < 0.006 * SR) s += 0.18 * noise() * (1 - k / (0.006 * SR));
    s *= att * amp;
    add(start + k, s * gl, s * gr);
  }
}

/** A slow pad voice: two detuned soft triangles. */
function padNote(t0, t1, midi, amp) {
  const f = hz(midi);
  const a = Math.round(t0 * SR), b = Math.min(LEN, Math.round((t1 + 1.4) * SR));
  const atk = 0.9, rel = 1.4;
  for (let i = Math.max(0, a); i < b; i++) {
    const x = (i - a) / SR, t = i / SR;
    let env = Math.min(1, x / atk);
    if (t > t1) env *= Math.max(0, 1 - (t - t1) / rel);
    const ph1 = 2 * Math.PI * f * 1.0023 * x, ph2 = 2 * Math.PI * f * 0.9977 * x;
    const v1 = Math.sin(ph1) + Math.sin(3 * ph1) / 9, v2 = Math.sin(ph2) + Math.sin(3 * ph2) / 9;
    const s = amp * env;
    add(i, s * v1, s * v2);
  }
}

function bass(t, midi, amp, tau = 1.6, len = 2.6) {
  const f = hz(midi);
  const a = Math.round(t * SR), n = Math.round(len * SR);
  for (let k = 0; k < n; k++) {
    const x = k / SR;
    const env = Math.min(1, x / 0.02) * Math.exp(-x / tau) * Math.min(1, (len - x) / 0.3);
    const s = amp * env * (Math.sin(2 * Math.PI * f * x) + 0.25 * Math.sin(4 * Math.PI * f * x));
    add(a + k, s, s);
  }
}

// ------------------------------------------------------------------ harmony bed
const BAR = 4 * D.BEAT;
const padLevel = (t) => (t < 4.0 ? 0 : Math.min(1, (t - 4.0) / 1.2));
D.BARS.forEach((bar, k) => {
  const t0 = k * BAR, t1 = Math.min(D.DURATION - 0.8, (k + 1) * BAR);
  if (t0 >= D.DURATION) return;
  const lvl = padLevel(t0 + 0.5) || (k === 1 ? 0.5 : 0);
  if (lvl > 0 && !bar.final) for (const m of bar.tones) padNote(Math.max(t0, 4.0), t1, m, 0.016 * lvl);
  if (k >= 3 && !bar.final) bass(t0, bar.root - 12 + 12, 0.07);
});

// ------------------------------------------------------------------ notes from the picture
const barAt = (t) => D.BARS[Math.min(D.BARS.length - 1, Math.floor(t / BAR + 1e-6))];
const PENT = [];
for (let o = 0; o < 4; o++) for (const d of [0, 2, 4, 7, 9]) PENT.push(53 + 12 * o + d); // F major pentatonic from F3
const pentFrom = (midi, steps) => { const i = PENT.findIndex((m) => m >= midi); return PENT[Math.min(PENT.length - 1, i + steps)]; };
function chordIn(t, lo, hi) {
  const out = new Set();
  for (const m of barAt(t).tones) for (let o = -2; o <= 3; o++) { const x = m + 12 * o; if (x >= lo && x <= hi) out.add(x); }
  return [...out].sort((a, b) => a - b);
}

const ZENG_STROKES = 16;
for (const n of D.notes) {
  const { t } = n;
  switch (n.role) {
    case "stroke": {
      // 赠: an arpeggio that climbs and turns; 岛: a run up to a held peak.
      const zeng = [0, 1, 2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 6, 5, 4, 3];
      const idx = n.step < ZENG_STROKES ? zeng[n.step] : 2 + (n.step - ZENG_STROKES);
      mallet(t, pentFrom(65, idx), 0.55 + 0.03 * idx, { pan: -0.3 + 0.04 * n.step });
      break;
    }
    case "self": case "gift": {
      const tones = chordIn(t, 62, 79);
      const i = (n.move * 2) % tones.length;
      const m = n.role === "self" ? tones[i] : tones[Math.min(tones.length - 1, i + 2)] ;
      const vel = n.quiet ? (n.role === "self" ? 0.42 : 0.3) : (n.role === "self" ? 0.8 : 0.62);
      mallet(t, m, vel, { pan: n.role === "self" ? -0.25 : 0.25, decay: n.quiet ? 0.6 : 1 });
      break;
    }
    case "count": mallet(t, pentFrom(72, n.step), 0.7, { pan: 0.1 }); break;
    case "ghost": mallet(t, n.t < D.ghost.glide ? 86 : 81, 0.32, { pan: 0.35, decay: 1.4 }); break;
    case "key": {
      bass(t, 46 - 12, 0.16, 2.2, 3.2); // B♭1
      mallet(t, 77, 0.85, { pan: 0 });
      mallet(t + 0.012, 70, 0.5, { pan: -0.2 });
      break;
    }
    case "join": [81, 84, 89].forEach((m, k) => mallet(t + k * D.BEAT / 8, m, 0.62 - 0.08 * k, { pan: 0.15 * k, decay: 1.6 })); break;
    case "ring": mallet(t, 88, 0.3, { pan: 0.3, decay: 1.5 }); break;
    case "final-count": mallet(t, pentFrom(65, n.step), 0.52 + 0.02 * n.step, { pan: n.step % 2 ? 0.25 : -0.25 }); break;
    case "win": [60, 65, 67, 70].forEach((m, k) => mallet(t + k * 0.02, m, 0.5, { decay: 1.8 })); break;
    case "gliss": mallet(t, pentFrom(65, Math.round(n.step * 12 / 22)), 0.28 + 0.01 * n.step, { pan: -0.4 + 0.035 * n.step, decay: 0.7 }); break;
    case "final": {
      // F add9, rolled from the bass up, held to the end.
      bass(t, 29, 0.22, 3.5, D.DURATION - t);
      bass(t, 41, 0.1, 3.0, D.DURATION - t);
      [53, 60, 65, 69, 72, 79, 81].forEach((m, k) => mallet(t + k * 0.028, m, 0.75 - 0.05 * k, { pan: -0.35 + 0.12 * k, decay: 2.4 }));
      for (const m of [53, 57, 60, 67, 69, 72]) padNote(t, D.DURATION - 0.6, m, 0.02);
      break;
    }
  }
}

// ------------------------------------------------------------------ room: a small Freeverb
function reverb(inp, combs, aps, wet) {
  const out = new Float32Array(inp.length);
  const cb = combs.map((d) => ({ buf: new Float32Array(d), i: 0, f: 0 }));
  const ab = aps.map((d) => ({ buf: new Float32Array(d), i: 0 }));
  const fb = 0.8, damp = 0.3;
  for (let n = 0; n < inp.length; n++) {
    const x = inp[n] * 0.015;
    let y = 0;
    for (const c of cb) {
      const o = c.buf[c.i];
      c.f = o * (1 - damp) + c.f * damp;
      c.buf[c.i] = x + c.f * fb;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    for (const a of ab) {
      const o = a.buf[a.i];
      a.buf[a.i] = y + o * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      y = o - y;
    }
    out[n] = inp[n] + wet * y;
  }
  return out;
}
const k = SR / 44100;
const combsL = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => Math.round(d * k));
const combsR = combsL.map((d) => d + 23);
const aps = [556, 441, 341, 225].map((d) => Math.round(d * k));
const outL = reverb(L, combsL, aps, 0.9), outR = reverb(R, combsR, aps.map((d) => d + 23), 0.9);

// Fade the tail into the last frame.
for (let i = 0; i < LEN; i++) {
  const t = i / SR;
  const g = t > D.DURATION - 1.6 ? Math.max(0, (D.DURATION - t) / 1.6) : 1;
  outL[i] *= g; outR[i] *= g;
}
let peak = 0;
for (let i = 0; i < LEN; i++) peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
const norm = 0.89 / peak;

const buf = Buffer.alloc(44 + LEN * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + LEN * 4, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(LEN * 4, 40);
for (let i = 0; i < LEN; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outL[i] * norm)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outR[i] * norm)) * 32767), 46 + i * 4);
}
const assets = path.join(__dirname, "..", "assets");
const wav = path.join(assets, "music.wav");
fs.writeFileSync(wav, buf);
console.log(`wrote ${wav} (peak ${peak.toFixed(3)} → normalised)`);

// Two-pass loudness normalisation to -16 LUFS / -1.5 dBTP.
const pass1 = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", wav, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]).stderr.toString();
const stats = JSON.parse(pass1.slice(pass1.lastIndexOf("{"), pass1.lastIndexOf("}") + 1));
const m4a = path.join(assets, "music.m4a");
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-af",
  `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true,aresample=48000`,
  "-c:a", "aac", "-b:a", "256k", m4a]);
console.log(`wrote ${m4a} (input ${stats.input_i} LUFS)`);
