// Procedural military march: snare cadences, bass drum, toms, crashes and a low brass/tuba line.
// Intensity (0..1) blends layers: calm menu tap -> full combat rolls. Runs on its own lookahead scheduler
// (setInterval) so it keeps playing in the menu and while paused.
const BPM = 116, STEP = 60 / BPM / 4; // 16th notes
// 16-step snare patterns: value = velocity (0 = rest). Layered by intensity.
const SN_CALM = [0.9, 0, 0, 0, 0.5, 0, 0.3, 0, 0.9, 0, 0, 0, 0.5, 0, 0.3, 0.3];
const SN_MARCH = [1, 0, 0.45, 0.45, 0.8, 0, 0.45, 0, 1, 0.4, 0.4, 0.4, 0.8, 0, 0.6, 0.6];
const SN_BATTLE = [1, 0.35, 0.6, 0.35, 0.9, 0.35, 0.6, 0.6, 1, 0.35, 0.6, 0.35, 0.9, 0.6, 0.8, 0.9];
const KICK = [1, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0];
const KICK_HI = [1, 0, 0, 0, 0.8, 0, 0, 0, 1, 0, 0, 0, 0.8, 0, 0.5, 0];
const TOMS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.6, 0.7, 0.9];
// tuba line in D minor-ish: [step, semitone offset from D2]
const BASS_A = [[0, 0], [4, 7], [8, 0], [12, 7]], BASS_B = [[0, 3], [4, 10], [8, 5], [12, 7]], BASS_C = [[0, 8], [4, 3], [8, 7], [10, 5], [12, 2], [14, 7]];
const D2 = 73.42;

export function createMusic(ctx, bus, bank) {
  const out = ctx.createGain(); out.gain.value = 0; out.connect(bus);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(out); // brass bus filter
  let next = 0, step = 0, bar = 0, timer = null, intensity = 0.15, target = 0.15, enabled = true, level = 1;

  function hit(name, t, vel, rate = 1, pan = 0) {
    if (vel <= 0.02) return;
    const src = ctx.createBufferSource(); src.buffer = bank.get(name); src.playbackRate.value = rate * (0.98 + Math.random() * 0.04);
    const g = ctx.createGain(); g.gain.value = vel;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; src.connect(g).connect(p).connect(out); } else src.connect(g).connect(out);
    src.start(t);
  }
  function tuba(t, semis, dur, vel) {
    const f = D2 * Math.pow(2, semis / 12);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 2.003;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.22, t + 0.03); g.gain.setTargetAtTime(0, t + dur * 0.75, 0.05);
    o.connect(g); o2.connect(g); g.connect(lp); o.start(t); o2.start(t); o.stop(t + dur + 0.3); o2.stop(t + dur + 0.3);
  }
  function schedule(t, s) {
    const I = intensity, i16 = s % 16;
    // snare: crossfade calm -> march -> battle
    const calm = Math.max(0, 1 - I * 2.5), march = Math.max(0, 1 - Math.abs(I - 0.45) * 2.5), battle = Math.max(0, (I - 0.55) * 2.2);
    const sv = SN_CALM[i16] * calm * 0.5 + SN_MARCH[i16] * march * 0.75 + SN_BATTLE[i16] * Math.min(1, battle) * 0.9;
    hit('snare', t, sv * 0.55, 1, -0.15);
    if (battle > 0.4 && i16 % 2 === 1 && Math.random() < battle * 0.5) hit('snare', t + STEP / 2, 0.18 * battle, 1.05, -0.15); // rolls/ruffs
    if (s % 64 === 60 && I > 0.3) for (let k = 0; k < 4; k++) hit('snare', t + k * STEP / 4, 0.25 + k * 0.08, 1, -0.15); // pickup roll
    const kv = I < 0.5 ? KICK[i16] : KICK_HI[i16];
    hit('kick', t, kv * (0.35 + I * 0.55));
    if (I > 0.6 && (bar % 4 === 3)) hit('tom', t, TOMS[i16] * (I - 0.4), i16 > 13 ? 0.85 : 1, 0.2);
    if (i16 === 0 && bar % 4 === 0 && I > 0.5) hit('crash', t, 0.35 * I, 1, 0.25);
    // tuba / low brass from medium intensity up
    if (I > 0.3) {
      const line = bar % 4 === 3 ? BASS_C : bar % 2 ? BASS_B : BASS_A;
      for (const [st, semi] of line) if (st === i16) tuba(t, semi, STEP * (line === BASS_C ? 1.8 : 3.2), Math.min(1, (I - 0.3) * 2));
    }
  }
  function tick() {
    if (ctx.state !== 'running') return;
    intensity += (target - intensity) * 0.02;
    const now = ctx.currentTime;
    if (next < now) next = now + 0.05;
    while (next < now + 0.15) {
      schedule(next, step);
      next += STEP; step++; if (step % 16 === 0) bar++;
    }
    lp.frequency.value = 700 + intensity * 1600;
  }
  return {
    start() { if (!timer) timer = setInterval(tick, 30); },
    stop() { clearInterval(timer); timer = null; },
    setIntensity(v) { target = Math.max(0, Math.min(1, v)); },
    get intensity() { return intensity; },
    setLevel(v, ramp = 0.4) { level = v; out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(enabled ? v : 0, ctx.currentTime, ramp); },
    get level() { return level; },
    output: out,
  };
}
