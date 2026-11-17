// Procedural sample synthesis. Every sound in the game is rendered here into AudioBuffers (lazily, cached),
// so playback at runtime is just a BufferSource -> Gain -> StereoPanner chain: cheap enough for big battles.
// Recipes return a mono Float32Array; `variants` gives several takes per sound for natural repetition.

const TAU = Math.PI * 2;
const rng = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

class BQ { // RBJ biquad
  constructor(type, f, q, sr) { this.t = type; this.sr = sr; this.q = q; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(f); }
  set(f, q = this.q) {
    this.q = q;
    const w = TAU * Math.min(Math.max(f, 10), this.sr * 0.45) / this.sr, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2;
    if (this.t === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (this.t === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else { b0 = a; b1 = 0; b2 = -a; } // bandpass, 0 dB peak
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - a) / a0;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}

function reverb(d, sr, wet, decay, pre = 0) {
  const combsMs = [29.7, 37.1, 41.1, 43.7, 53.3], aps = [5.0, 1.7];
  const out = new Float32Array(d.length), inv = 1 / combsMs.length;
  for (const ms of combsMs) {
    const n = Math.round(ms * sr / 1000), g = Math.pow(10, -3 * (ms / 1000) / decay), b = new Float32Array(n);
    let i = 0, lp = 0;
    for (let k = 0; k < d.length; k++) {
      const y = b[i]; lp = lp * 0.35 + y * 0.65; b[i] = d[k] + lp * g; if (++i >= n) i = 0; out[k] += y * inv;
    }
  }
  for (const ms of aps) {
    const n = Math.round(ms * sr / 1000), b = new Float32Array(n); let i = 0;
    for (let k = 0; k < out.length; k++) { const bv = b[i], x = out[k]; const y = -0.7 * x + bv; b[i] = x + 0.7 * y; out[k] = y; if (++i >= n) i = 0; }
  }
  const off = Math.round(pre * sr);
  for (let k = d.length - 1; k >= 0; k--) d[k] += wet * (k - off >= 0 ? out[k - off] : 0);
  return d;
}
function echo(d, sr, delay, fb, mix, lpf = 0.5) { // single slap-back w/ feedback (backyard fence)
  const n = Math.round(delay * sr); let lp = 0;
  for (let k = n; k < d.length; k++) { lp = lp * lpf + d[k - n] * (1 - lpf); d[k] += lp * fb * mix; }
  return d;
}
function normalize(d, peak = 0.9) {
  let m = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; }
  if (m > 0) { const g = peak / m; for (let i = 0; i < d.length; i++) d[i] *= g; }
  const fade = Math.min(d.length, 256); for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  return d;
}
function loopify(d, sr, xf = 0.15) { // crossfade tail into head for a seamless loop; returns shortened buffer
  const n = Math.round(xf * sr), len = d.length - n, o = new Float32Array(len);
  for (let i = 0; i < len; i++) o[i] = d[i];
  for (let i = 0; i < n; i++) { const t = i / n; o[i] = d[i] * t + d[len + i] * (1 - t); }
  return o;
}
const env = (t, a, dcy) => (t < a ? t / a : Math.exp(-(t - a) / dcy));
const sat = (x, k = 1.5) => Math.tanh(x * k);

// ---------- recipes ----------
function gunshot(sr, v, o) {
  const r = rng(v * 97 + o.seed), len = o.len, d = new Float32Array(Math.ceil(sr * len));
  const crack = new BQ('hp', o.crackHz * (0.9 + r() * 0.2), 0.8, sr), body = new BQ('lp', o.bodyHz * (0.85 + r() * 0.3), 0.9, sr);
  const far = o.far, tone = new BQ('bp', o.popHz * (0.9 + r() * 0.2), 3, sr);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, n = r() * 2 - 1;
    let s = 0;
    if (!far) s += crack.p(n) * env(t, 0.0004, o.crackDecay) * 1.3;
    s += body.p(n) * env(t, 0.001, o.bodyDecay) * 1.6;
    s += tone.p(n) * env(t, 0.001, o.bodyDecay * 0.7) * o.pop; // plastic "pop"
    const f = o.thumpHz * (1 + 1.5 * Math.exp(-t / 0.015)); ph += TAU * f / sr;
    s += Math.sin(ph) * env(t, 0.001, o.thumpDecay) * o.thump;
    d[i] = sat(s, 1.4);
  }
  if (far) { const lp = new BQ('lp', o.farHz, 0.7, sr), lp2 = new BQ('lp', o.farHz, 0.7, sr); for (let i = 0; i < d.length; i++) d[i] = lp2.p(lp.p(d[i])); }
  echo(d, sr, o.slap * (0.85 + r() * 0.3), 0.6, far ? 0.6 : 0.35);
  reverb(d, sr, far ? 0.7 : o.verb, o.tail);
  return normalize(d, 0.95);
}
const GUN = {
  rifle:  { len: 1.0, seed: 1, crackHz: 2500, crackDecay: 0.014, bodyHz: 1400, bodyDecay: 0.05, popHz: 900, pop: 0.8, thumpHz: 70, thumpDecay: 0.06, thump: 0.9, slap: 0.17, verb: 0.35, tail: 0.7 },
  smg:    { len: 0.6, seed: 2, crackHz: 3000, crackDecay: 0.01, bodyHz: 1800, bodyDecay: 0.03, popHz: 1300, pop: 0.7, thumpHz: 90, thumpDecay: 0.035, thump: 0.6, slap: 0.13, verb: 0.25, tail: 0.45 },
  pistol: { len: 0.7, seed: 3, crackHz: 2800, crackDecay: 0.011, bodyHz: 1600, bodyDecay: 0.035, popHz: 1100, pop: 0.9, thumpHz: 85, thumpDecay: 0.04, thump: 0.55, slap: 0.15, verb: 0.3, tail: 0.5 },
  sniper: { len: 1.8, seed: 4, crackHz: 2000, crackDecay: 0.02, bodyHz: 1100, bodyDecay: 0.09, popHz: 600, pop: 0.6, thumpHz: 55, thumpDecay: 0.12, thump: 1.2, slap: 0.28, verb: 0.5, tail: 1.4 },
};

function explosion(sr, v, far) {
  const r = rng(v * 131 + 7), len = far ? 3.2 : 2.6, d = new Float32Array(Math.ceil(sr * len));
  const lp = new BQ('lp', 3000, 0.7, sr), lp2 = new BQ('lp', 3000, 0.7, sr), crk = new BQ('bp', 2500, 2, sr);
  let ph = 0, brown = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, n = r() * 2 - 1;
    if ((i & 31) === 0) { const fc = (far ? 500 : 300) + (far ? 600 : 4200) * Math.exp(-t / 0.18); lp.set(fc); lp2.set(fc); }
    brown = brown * 0.985 + n * 0.12;
    let s = lp2.p(lp.p(n)) * (env(t, 0.004, 0.18) * 1.2 + env(t, 0.01, 0.9) * 0.45);
    s += brown * env(t, 0.02, 1.1) * 1.6; // rumble
    const f = 30 + 55 * Math.exp(-t / 0.12); ph += TAU * f / sr;
    s += Math.sin(ph) * env(t, 0.003, far ? 0.9 : 0.5) * (far ? 0.9 : 1.3); // sub thump
    if (!far && t > 0.05 && r() < 0.0016 * Math.exp(-t / 0.7)) { // debris crackles / plastic shrapnel
      const k = Math.min(d.length - 1, i + ((r() * 400) | 0)); d[k] += (r() - 0.5) * 1.5;
    }
    d[i] += sat(s, 1.8) * 0.9;
  }
  if (!far) for (let i = 0; i < d.length; i++) d[i] += crk.p(d[i]) * 0.3;
  else { const f2 = new BQ('lp', 700, 0.7, sr); for (let i = 0; i < d.length; i++) d[i] = f2.p(d[i]); }
  echo(d, sr, 0.33 + r() * 0.1, 0.5, 0.4);
  reverb(d, sr, far ? 0.8 : 0.4, far ? 2.2 : 1.6);
  return normalize(d, 0.98);
}

function whoosh(sr, v) { // bazooka launch
  const r = rng(v * 17 + 3), d = new Float32Array(Math.ceil(sr * 1.3));
  const bp = new BQ('bp', 400, 1.5, sr), thump = new BQ('lp', 200, 0.8, sr);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, n = r() * 2 - 1;
    if ((i & 31) === 0) bp.set(350 + 2600 * Math.min(1, t / 0.7));
    let s = bp.p(n) * (t < 0.1 ? t / 0.1 : Math.exp(-(t - 0.1) / 0.45)) * 2.2;
    s += thump.p(n) * env(t, 0.002, 0.06) * 3.5;
    s += (r() * 2 - 1) * env(t, 0.001, 0.008) * 0.8;
    d[i] = sat(s, 1.3);
  }
  reverb(d, sr, 0.3, 0.8); return normalize(d, 0.9);
}

function flameLoop(sr, v) {
  const r = rng(v + 51), raw = new Float32Array(Math.ceil(sr * 1.8));
  const lp = new BQ('lp', 520, 0.8, sr), bp = new BQ('bp', 2200, 0.9, sr), lp3 = new BQ('lp', 150, 0.7, sr);
  let am = 0.5, target = 0.5;
  for (let i = 0; i < raw.length; i++) {
    const n = r() * 2 - 1;
    if ((i & 511) === 0) target = 0.55 + r() * 0.45;
    am += (target - am) * 0.002;
    let s = lp.p(n) * 2.4 * am + bp.p(n) * 0.35 + lp3.p(n) * 3.0;
    if (r() < 0.0009) s += (r() - 0.5) * 2.5; // crackle
    raw[i] = sat(s, 1.2);
  }
  return normalize(loopify(raw, sr, 0.3), 0.8);
}

function battleBed(sr, v) { // distant combat ambience: far pops, thuds, rumble
  const r = rng(v + 900), raw = new Float32Array(Math.ceil(sr * 7.3));
  const lpN = new BQ('lp', 110, 0.7, sr);
  for (let i = 0; i < raw.length; i++) raw[i] = lpN.p(r() * 2 - 1) * 1.6;
  const pop = new BQ('lp', 900, 0.7, sr);
  for (let e = 0; e < 90; e++) {
    const start = (r() * (raw.length - sr * 0.3)) | 0, burst = r() < 0.3 ? 4 + ((r() * 6) | 0) : 1, amp = 0.15 + r() * 0.5;
    const gap = (sr * (0.06 + r() * 0.05)) | 0;
    for (let b = 0; b < burst; b++) {
      const s0 = start + b * gap;
      for (let k = 0; k < sr * 0.08 && s0 + k < raw.length; k++) raw[s0 + k] += pop.p(r() * 2 - 1) * amp * Math.exp(-k / (sr * 0.012));
    }
  }
  for (let e = 0; e < 5; e++) { // distant booms
    const s0 = (r() * (raw.length - sr)) | 0; let ph = 0;
    for (let k = 0; k < sr * 0.9 && s0 + k < raw.length; k++) { ph += TAU * (35 + 30 * Math.exp(-k / (sr * 0.1))) / sr; raw[s0 + k] += Math.sin(ph) * 0.8 * Math.exp(-k / (sr * 0.3)); }
  }
  const lp2 = new BQ('lp', 1200, 0.7, sr); for (let i = 0; i < raw.length; i++) raw[i] = lp2.p(raw[i]);
  reverb(raw, sr, 0.6, 1.8);
  return normalize(loopify(raw, sr, 0.3), 0.8);
}

function clink(sr, v, heavy) { // grenade pin / bounce
  const r = rng(v * 7 + 11), d = new Float32Array(Math.ceil(sr * 0.45));
  const parts = heavy ? [[180, 0.05, 1.2]] : [];
  const fs = [3100, 4870, 6230, 7400].map((f) => [f * (0.92 + r() * 0.16), 0.05 + r() * 0.1, heavy ? 0.25 : 0.5]);
  const clack = new BQ('bp', 1300, 4, sr);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr; let s = 0;
    for (const [f, dc, a] of parts) s += Math.sin(TAU * f * t * (1 - t * 0.6)) * Math.exp(-t / dc) * a;
    for (const [f, dc, a] of fs) s += Math.sin(TAU * f * t) * Math.exp(-t / dc) * a;
    if (heavy) s += clack.p(r() * 2 - 1) * Math.exp(-t / 0.02) * 2;
    s += (r() * 2 - 1) * Math.exp(-t / 0.002) * 0.5;
    d[i] = s;
  }
  return normalize(d, heavy ? 0.85 : 0.6);
}

function impact(sr, v, kind) {
  const r = rng(v * 23 + kind.length), len = kind === 'ricochet' ? 0.5 : 0.25, d = new Float32Array(Math.ceil(sr * len));
  const f = new BQ(kind === 'dirt' ? 'lp' : 'bp', kind === 'dirt' ? 700 : 1500 + r() * 1400, kind === 'dirt' ? 0.8 : 6, sr);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, n = r() * 2 - 1; let s;
    if (kind === 'dirt') s = f.p(n) * env(t, 0.001, 0.04) * 2 + (r() * 2 - 1) * env(t, 0.0005, 0.006) * 0.4;
    else if (kind === 'plastic') s = f.p(n) * env(t, 0.0005, 0.02) * 3 + Math.sin(TAU * 620 * t) * env(t, 0.0005, 0.03) * 0.5;
    else { // ricochet "pyeww"
      ph += TAU * (3600 - 2200 * Math.min(1, t / 0.35)) / sr;
      s = Math.sin(ph) * (t < 0.01 ? t / 0.01 : Math.exp(-(t - 0.01) / 0.15)) * 0.6 + f.p(n) * env(t, 0.0005, 0.015) * 2;
    }
    d[i] = s;
  }
  if (kind === 'ricochet') reverb(d, sr, 0.3, 0.5);
  return normalize(d, 0.8);
}

function whiz(sr, v) {
  const r = rng(v * 3 + 5), d = new Float32Array(Math.ceil(sr * 0.3)); const bp = new BQ('bp', 4000, 6, sr);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr; if ((i & 15) === 0) bp.set(4500 - 3000 * (t / 0.3));
    const e = t < 0.12 ? Math.pow(t / 0.12, 2) : Math.exp(-(t - 0.12) / 0.04);
    ph += TAU * (2400 - 900 * (t / 0.3)) / sr;
    d[i] = (bp.p(r() * 2 - 1) * 3 + Math.sin(ph) * 0.25) * e;
  }
  return normalize(d, 0.8);
}

function step(sr, v) {
  const r = rng(v * 41 + 2), d = new Float32Array(Math.ceil(sr * 0.14));
  const lp = new BQ('lp', 260 + r() * 120, 0.8, sr), hp = new BQ('hp', 2500 + r() * 1500, 0.7, sr);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, n = r() * 2 - 1;
    d[i] = lp.p(n) * env(t, 0.003, 0.025) * 3 + hp.p(n) * env(t, 0.01, 0.03) * (r() < 0.3 ? 1.2 : 0.3) + Math.sin(TAU * 80 * t) * env(t, 0.002, 0.02) * 0.4;
  }
  return normalize(d, 0.6);
}

function clicks(sr, v, times) { // reload / mechanical clicks: [[t, hz, amp, decay]]
  const r = rng(v * 13 + 99), len = Math.max(...times.map((x) => x[0])) + 0.15, d = new Float32Array(Math.ceil(sr * len));
  for (const [t0, hz, amp, dc] of times) {
    const bp = new BQ('bp', hz * (0.9 + r() * 0.2), 5, sr), s0 = (t0 * sr) | 0;
    for (let k = 0; k < sr * 0.1 && s0 + k < d.length; k++) {
      const t = k / sr; d[s0 + k] += (bp.p(r() * 2 - 1) * 3 + (k < 20 ? (r() - 0.5) : 0)) * Math.exp(-t / dc) * amp;
    }
  }
  return normalize(d, 0.7);
}

function tone(sr, notes, o = {}) { // notes: [[t, hz, dur, amp]] with simple brass/square timbre
  const len = Math.max(...notes.map((n) => n[0] + n[2])) + (o.tail ?? 0.3), d = new Float32Array(Math.ceil(sr * len));
  const lp = new BQ('lp', o.lp ?? 2000, 0.9, sr);
  for (const [t0, hz, dur, amp] of notes) {
    const s0 = (t0 * sr) | 0; let ph = 0;
    for (let k = 0; k < (dur + 0.08) * sr && s0 + k < d.length; k++) {
      const t = k / sr, vib = 1 + (o.vib ?? 0) * Math.sin(TAU * 5.5 * t) * Math.min(1, t / 0.2);
      ph += hz * vib / sr;
      const p = ph % 1;
      let w = o.wave === 'sine' ? Math.sin(TAU * p) : o.wave === 'square' ? (p < 0.5 ? 1 : -1) : (2 * p - 1) * 0.7 + Math.sin(TAU * p) * 0.5;
      const a = Math.min(1, t / (o.attack ?? 0.02)) * (t > dur ? Math.exp(-(t - dur) / 0.03) : (o.decay ? Math.exp(-t / o.decay) : 1));
      d[s0 + k] += w * a * amp;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] = lp.p(sat(d[i], 1.2));
  if (o.verb) reverb(d, sr, o.verb, 1.2);
  return normalize(d, o.peak ?? 0.8);
}

function noiseBurst(sr, v, o) { // generic filtered noise w/ envelope
  const r = rng(v * 71 + (o.seed || 0)), d = new Float32Array(Math.ceil(sr * o.len));
  const f = new BQ(o.type || 'bp', o.hz, o.q || 1, sr); let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr; if (o.sweep && (i & 31) === 0) f.set(o.hz + (o.sweep - o.hz) * Math.min(1, t / o.len));
    let s = f.p(r() * 2 - 1) * env(t, o.a || 0.002, o.d || 0.05);
    if (o.chirp) { ph += TAU * (o.chirp[0] + (o.chirp[1] - o.chirp[0]) * t / o.len) / sr; s += Math.sin(ph) * env(t, 0.002, o.d || 0.05) * (o.chirpAmp ?? 0.3); }
    if (o.crackle && r() < o.crackle) s += (r() - 0.5) * 2;
    d[i] = sat(s * 2, 1.5);
  }
  return normalize(d, o.peak ?? 0.7);
}

// comic gibberish voice through a walkie-talkie
const VOWELS = [[800, 1200, 2500], [400, 2000, 2600], [300, 870, 2240], [500, 1000, 2400], [350, 1800, 2500], [650, 1700, 2500]];
export function babble(sr, seed, o = {}) {
  const r = rng(seed * 313 + 1), syl = o.syllables ?? 3 + ((r() * 4) | 0), sylLen = o.scream ? 0.5 : 0.085 + r() * 0.05;
  const len = syl * sylLen + 0.12, d = new Float32Array(Math.ceil(sr * len));
  const f = [new BQ('bp', 800, 6, sr), new BQ('bp', 1200, 8, sr), new BQ('bp', 2500, 10, sr)];
  const radio = [new BQ('hp', 380, 0.7, sr), new BQ('lp', 2900, 0.7, sr)];
  const base = (o.pitch ?? 150) * (0.85 + r() * 0.3);
  let ph = 0, vA = VOWELS[(r() * 6) | 0], vB = VOWELS[(r() * 6) | 0], si = -1, cont = 1;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, s = Math.floor(t / sylLen), u = (t % sylLen) / sylLen;
    if (s !== si) { si = s; vA = vB; vB = o.scream ? VOWELS[0] : VOWELS[(r() * 6) | 0]; cont = o.scream ? 1.3 + r() * 0.5 : 0.8 + r() * 0.5; }
    if ((i & 63) === 0) for (let k = 0; k < 3; k++) f[k].set(vA[k] + (vB[k] - vA[k]) * u);
    const f0 = base * cont * (1 + 0.15 * Math.sin(u * Math.PI)) * (o.scream ? 1 + 0.08 * Math.sin(TAU * 9 * t) : 1);
    ph += f0 / sr; const p = ph % 1, src = (2 * p - 1) + (r() - 0.5) * 0.25;
    const ampl = t > syl * sylLen ? 0 : Math.pow(Math.sin(Math.min(1, u) * Math.PI), 0.6);
    let y = (f[0].p(src) * 1.0 + f[1].p(src) * 0.7 + f[2].p(src) * 0.3) * ampl * 3;
    y = radio[1].p(radio[0].p(sat(y, 2.5))) + (r() - 0.5) * 0.04; // radio crunch + hiss
    d[i] = y;
  }
  return normalize(d, 0.75);
}

function squeak(sr, v) { // squeaky-toy death "eeek"
  const r = rng(v + 400), d = new Float32Array(Math.ceil(sr * 0.4)); let ph = 0; const hp = new BQ('hp', 300, 0.7, sr);
  const f0 = 900 + r() * 500;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, f = f0 * (1 - 0.4 * t / 0.4) * (1 + 0.05 * Math.sin(TAU * 18 * t)); ph += f / sr;
    const p = ph % 1; d[i] = hp.p(((p < 0.5 ? 1 : -1) * 0.4 + Math.sin(TAU * p)) * env(t, 0.02, 0.12) + (r() - 0.5) * 0.3 * env(t, 0.005, 0.05));
  }
  return normalize(d, 0.6);
}

function drum(sr, v, kind) {
  const r = rng(v * 5 + kind.length * 31), len = kind === 'crash' ? 1.6 : kind === 'kick' || kind === 'tom' ? 0.45 : 0.25;
  const d = new Float32Array(Math.ceil(sr * len)); const hp = new BQ('hp', kind === 'crash' ? 5000 : 1500, 0.7, sr), bp = new BQ('bp', 3500, 1.2, sr);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, n = r() * 2 - 1; let s = 0;
    if (kind === 'snare') { s = hp.p(n) * env(t, 0.001, 0.085) * 1.6 + bp.p(n) * env(t, 0.001, 0.05); ph += TAU * (205 - 30 * t) / sr; s += Math.sin(ph) * env(t, 0.001, 0.03) * 0.9; }
    else if (kind === 'kick') { ph += TAU * (45 + 90 * Math.exp(-t / 0.03)) / sr; s = Math.sin(ph) * env(t, 0.001, 0.18) * 1.5 + n * env(t, 0.0005, 0.003) * 0.4; }
    else if (kind === 'tom') { ph += TAU * (95 + 50 * Math.exp(-t / 0.05)) / sr; s = Math.sin(ph) * env(t, 0.001, 0.2) + hp.p(n) * env(t, 0.001, 0.02) * 0.3; }
    else { s = hp.p(n) * env(t, 0.002, 0.55) + [5400, 7300, 8800].reduce((a, f) => a + Math.sin(TAU * f * t), 0) * 0.05 * env(t, 0.002, 0.4); }
    d[i] = sat(s, 1.2);
  }
  if (kind === 'snare') reverb(d, sr, 0.15, 0.5);
  return normalize(d, 0.85);
}

// name -> { variants, make(sr, v) }
export const RECIPES = {
  rifle: { variants: 4, make: (sr, v) => gunshot(sr, v, GUN.rifle) },
  rifle_far: { variants: 3, make: (sr, v) => gunshot(sr, v, { ...GUN.rifle, far: true, farHz: 900, len: 1.5, tail: 1.3 }) },
  smg: { variants: 4, make: (sr, v) => gunshot(sr, v, GUN.smg) },
  smg_far: { variants: 3, make: (sr, v) => gunshot(sr, v, { ...GUN.smg, far: true, farHz: 1000, len: 1.1, tail: 1.0 }) },
  pistol: { variants: 3, make: (sr, v) => gunshot(sr, v, GUN.pistol) },
  pistol_far: { variants: 2, make: (sr, v) => gunshot(sr, v, { ...GUN.pistol, far: true, farHz: 1000, len: 1.1, tail: 1.0 }) },
  sniper: { variants: 3, make: (sr, v) => gunshot(sr, v, GUN.sniper) },
  sniper_far: { variants: 2, make: (sr, v) => gunshot(sr, v, { ...GUN.sniper, far: true, farHz: 800, len: 2.4, tail: 2.0 }) },
  bazooka: { variants: 2, make: whoosh },
  throw: { variants: 2, make: (sr, v) => noiseBurst(sr, v, { len: 0.3, hz: 600, sweep: 1800, q: 1.2, a: 0.08, d: 0.1, peak: 0.45, seed: 3 }) },
  flame: { variants: 1, make: flameLoop },
  battle: { variants: 1, make: battleBed },
  explosion: { variants: 3, make: (sr, v) => explosion(sr, v, false) },
  explosion_far: { variants: 2, make: (sr, v) => explosion(sr, v, true) },
  pin: { variants: 2, make: (sr, v) => clink(sr, v, false) },
  bounce: { variants: 3, make: (sr, v) => clink(sr, v, true) },
  impact_plastic: { variants: 4, make: (sr, v) => impact(sr, v, 'plastic') },
  impact_dirt: { variants: 4, make: (sr, v) => impact(sr, v, 'dirt') },
  ricochet: { variants: 3, make: (sr, v) => impact(sr, v, 'ricochet') },
  whiz: { variants: 3, make: whiz },
  step: { variants: 5, make: step },
  reload: { variants: 2, make: (sr, v) => clicks(sr, v, [[0, 2600, 0.6, 0.012], [0.22, 1400, 1, 0.02], [0.3, 3200, 0.5, 0.01]]) },
  reload_long: { variants: 1, make: (sr, v) => clicks(sr, v, [[0, 2200, 0.6, 0.015], [0.35, 1200, 0.9, 0.03], [0.8, 1800, 0.8, 0.02], [0.92, 3000, 0.6, 0.01]]) },
  equip: { variants: 1, make: (sr, v) => clicks(sr, v, [[0, 1800, 0.7, 0.02], [0.07, 2900, 0.5, 0.01]]) },
  dryfire: { variants: 1, make: (sr, v) => clicks(sr, v, [[0, 3500, 0.7, 0.008]]) },
  hit: { variants: 1, make: (sr) => tone(sr, [[0, 2100, 0.03, 1]], { wave: 'sine', tail: 0.05, lp: 9000, peak: 0.5 }) },
  hit_kill: { variants: 1, make: (sr) => tone(sr, [[0, 1900, 0.04, 1], [0.06, 2800, 0.06, 1]], { wave: 'sine', tail: 0.08, lp: 9000, peak: 0.55 }) },
  hit_head: { variants: 1, make: (sr) => tone(sr, [[0, 1500, 0.02, 1], [0, 3000, 0.02, 0.6], [0, 4520, 0.02, 0.3]], { wave: 'sine', decay: 0.14, tail: 0.4, lp: 12000, peak: 0.6 }) },
  horn: { variants: 1, make: (sr) => tone(sr, [[0, 262, 0.14, 1], [0.18, 330, 0.14, 1], [0.36, 392, 0.14, 1], [0.54, 523, 0.9, 1], [0.54, 392, 0.9, 0.5]], { vib: 0.012, attack: 0.03, lp: 2400, verb: 0.5, tail: 1.0 }) },
  fanfare: { variants: 1, make: (sr) => tone(sr, [[0, 392, 0.12, 1], [0.15, 523, 0.12, 1], [0.3, 659, 0.12, 1], [0.45, 784, 0.6, 1], [0.45, 523, 0.6, 0.6]], { vib: 0.01, attack: 0.02, lp: 2800, verb: 0.45, tail: 0.9 }) },
  sad_trombone: { variants: 1, make: (sr) => tone(sr, [[0, 233, 0.32, 1], [0.38, 220, 0.32, 1], [0.76, 208, 0.32, 1], [1.14, 196, 1.1, 1]], { vib: 0.035, attack: 0.05, lp: 1300, verb: 0.3, tail: 0.6 }) },
  beep: { variants: 1, make: (sr) => tone(sr, [[0, 880, 0.08, 1]], { wave: 'square', tail: 0.05, lp: 3000, peak: 0.4 }) },
  beep_go: { variants: 1, make: (sr) => tone(sr, [[0, 1320, 0.25, 1]], { wave: 'square', tail: 0.08, lp: 3000, peak: 0.45 }) },
  click: { variants: 1, make: (sr) => tone(sr, [[0, 700, 0.025, 1], [0.025, 1050, 0.03, 0.8]], { wave: 'square', tail: 0.04, lp: 4000, peak: 0.35 }) },
  hover: { variants: 1, make: (sr) => tone(sr, [[0, 1500, 0.012, 1]], { wave: 'sine', tail: 0.03, lp: 8000, peak: 0.18 }) },
  stamp: { variants: 1, make: (sr, v) => noiseBurst(sr, v, { len: 0.35, type: 'lp', hz: 400, q: 0.9, a: 0.001, d: 0.05, chirp: [120, 50], chirpAmp: 1.2, peak: 0.85 }) },
  squawk: { variants: 3, make: (sr, v) => noiseBurst(sr, v, { len: 0.12, hz: 1900, q: 1.5, a: 0.002, d: 0.06, chirp: [2600, 1700], chirpAmp: 0.4, crackle: 0.01, peak: 0.45, seed: 9 }) },
  squawk_end: { variants: 2, make: (sr, v) => noiseBurst(sr, v, { len: 0.18, hz: 2200, q: 0.8, a: 0.005, d: 0.08, crackle: 0.02, peak: 0.35, seed: 19 }) },
  squeak: { variants: 4, make: squeak },
  snap: { variants: 3, make: (sr, v) => clicks(sr, v, [[0, 3600, 1, 0.006], [0.004, 900, 0.8, 0.025]]) },
  sizzle: { variants: 2, make: (sr, v) => noiseBurst(sr, v, { len: 1.2, type: 'hp', hz: 3500, q: 0.7, a: 0.05, d: 0.5, crackle: 0.003, peak: 0.5, seed: 33 }) },
  hurt: { variants: 3, make: (sr, v) => noiseBurst(sr, v, { len: 0.3, type: 'lp', hz: 500, q: 0.9, a: 0.002, d: 0.06, chirp: [140, 60], chirpAmp: 1.4, peak: 0.8, seed: 44 }) },
  tinnitus: { variants: 1, make: (sr) => tone(sr, [[0, 3700, 2.2, 0.4]], { wave: 'sine', attack: 0.05, decay: 0.9, lp: 12000, tail: 0.3, peak: 0.25 }) },
  snare: { variants: 3, make: (sr, v) => drum(sr, v, 'snare') },
  kick: { variants: 1, make: (sr, v) => drum(sr, v, 'kick') },
  tom: { variants: 2, make: (sr, v) => drum(sr, v, 'tom') },
  crash: { variants: 1, make: (sr, v) => drum(sr, v, 'crash') },
};

export function createSampleBank(ctx) {
  const cache = new Map();
  return {
    get(name, variant) {
      const rec = RECIPES[name]; if (!rec) return null;
      const v = variant ?? ((Math.random() * rec.variants) | 0);
      const key = name + ':' + v;
      let b = cache.get(key);
      if (!b) {
        const data = rec.make(ctx.sampleRate, v);
        b = ctx.createBuffer(1, data.length, ctx.sampleRate); b.copyToChannel(data, 0);
        cache.set(key, b);
      }
      return b;
    },
    custom(key, maker) { // cache arbitrary generated buffers (e.g. babble voices)
      let b = cache.get(key);
      if (!b) { const data = maker(ctx.sampleRate); b = ctx.createBuffer(1, data.length, ctx.sampleRate); b.copyToChannel(data, 0); cache.set(key, b); }
      return b;
    },
    warm(names) { for (const n of names) { const r = RECIPES[n]; if (r) for (let v = 0; v < r.variants; v++) this.get(n, v); } },
    get size() { return cache.size; },
  };
}
