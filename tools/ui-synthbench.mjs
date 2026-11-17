// Times every procedural audio recipe (pure JS, no WebAudio) and checks for NaN/silence.
import { RECIPES, babble } from '../src/audio/synth.js';
const sr = 48000; let total = 0; const bad = [];
for (const [name, r] of Object.entries(RECIPES)) {
  for (let v = 0; v < r.variants; v++) {
    const t = performance.now(); const d = r.make(sr, v); const ms = performance.now() - t; total += ms;
    let peak = 0, nan = false; for (const x of d) { if (Number.isNaN(x)) nan = true; peak = Math.max(peak, Math.abs(x)); }
    if (nan || peak < 0.05) bad.push(`${name}:${v} nan=${nan} peak=${peak.toFixed(3)}`);
    if (v === 0) console.log(name.padEnd(16), (d.length / sr).toFixed(2) + 's', ms.toFixed(1) + 'ms');
  }
}
let t = performance.now(); for (let i = 0; i < 6; i++) babble(sr, i, {}); console.log('babble x6', (performance.now() - t).toFixed(1) + 'ms');
console.log('TOTAL', total.toFixed(0) + 'ms', 'bad:', bad);
