import { ensureSettings } from '../ui/settings.js';
import { createSampleBank, babble } from './synth.js';
import { createMusic } from './music.js';
import { pickBark } from './barks.js';

// Fully procedural WebAudio for Plastic Front.
//  - Samples are synthesized once (lazily, warmed in the background) into AudioBuffers; playback is cheap.
//  - Positional: gain falloff + stereo pan relative to the camera, speed-of-sound delay for far booms,
//    pre-filtered "far" variants for distant gunfire.
//  - Mixer protection: global + per-group voice limits with quiet-voice stealing; very distant gunfire is
//    folded into a looping "battle ambience" bed whose level follows the distant fire rate; master compressor.
//  - Music: procedural snare/drum march whose intensity follows combat.
//  - Barks: radio squawk + synthesized gibberish voice, optional speechSynthesis (setting `voice`), rate-limited.
// API: play(name, {position?, unit?, volume?, rate?, pan?, delay?, self?}), bark(unit, kind, text?), update(dt),
//      unlock(), setIntensity(v), stats, ready.

const MAX_VOICES = 40;
// vol: base gain, ref: full-volume radius, maxDist: silent beyond, limit: concurrent voices in group,
// far/farDist: distant variant, pv: random pitch variance, agg: weight added to the battle bed when culled, sos: speed-of-sound delay
const D = (o) => ({ vol: 0.6, ref: 5, maxDist: 120, limit: 6, pv: 0.05, ...o });
const DEFS = {
  rifle: D({ vol: 0.55, ref: 6, maxDist: 240, limit: 8, far: 'rifle_far', farDist: 40, agg: 1, group: 'gun' }),
  smg: D({ vol: 0.45, ref: 5, maxDist: 200, limit: 8, far: 'smg_far', farDist: 35, agg: 0.6, group: 'gun' }),
  pistol: D({ vol: 0.45, ref: 5, maxDist: 160, limit: 6, far: 'pistol_far', farDist: 35, agg: 0.5, group: 'gun' }),
  sniper: D({ vol: 0.8, ref: 10, maxDist: 400, limit: 3, far: 'sniper_far', farDist: 60, agg: 2, sos: true }),
  bazooka: D({ vol: 0.7, ref: 8, maxDist: 200, limit: 4, pv: 0.08 }),
  throw: D({ vol: 0.5, ref: 3, maxDist: 40, limit: 3 }),
  explosion: D({ vol: 1.0, ref: 14, maxDist: 500, limit: 5, far: 'explosion_far', farDist: 70, agg: 4, sos: true, pv: 0.1 }),
  pin: D({ vol: 0.5, ref: 3, maxDist: 30, limit: 2 }),
  bounce: D({ vol: 0.5, ref: 3, maxDist: 40, limit: 4, pv: 0.15 }),
  impact_plastic: D({ vol: 0.35, ref: 3, maxDist: 45, limit: 5, group: 'impact', pv: 0.2 }),
  impact_dirt: D({ vol: 0.3, ref: 3, maxDist: 40, limit: 5, group: 'impact', pv: 0.2 }),
  ricochet: D({ vol: 0.35, ref: 4, maxDist: 60, limit: 2, pv: 0.15 }),
  whiz: D({ vol: 0.55, ref: 1, maxDist: 5, limit: 3, pv: 0.15 }),
  step: D({ vol: 0.18, ref: 2, maxDist: 20, limit: 3, pv: 0.12 }),
  reload: D({ vol: 0.45, ref: 2, maxDist: 25, limit: 3 }),
  reload_long: D({ vol: 0.45, ref: 2, maxDist: 25, limit: 2 }),
  equip: D({ vol: 0.35, limit: 2 }), dryfire: D({ vol: 0.35, limit: 2 }),
  hit: D({ vol: 0.5, limit: 3, pv: 0 }), hit_kill: D({ vol: 0.6, limit: 2, pv: 0 }), hit_head: D({ vol: 0.6, limit: 2, pv: 0 }),
  horn: D({ vol: 0.55, limit: 1, pv: 0 }), fanfare: D({ vol: 0.55, limit: 1, pv: 0 }), sad_trombone: D({ vol: 0.6, limit: 1, pv: 0 }),
  beep: D({ vol: 0.4, limit: 2, pv: 0 }), beep_go: D({ vol: 0.45, limit: 1, pv: 0 }),
  click: D({ vol: 0.5, limit: 3, pv: 0.03 }), hover: D({ vol: 0.4, limit: 2, pv: 0.05 }), stamp: D({ vol: 0.7, limit: 2 }),
  squawk: D({ vol: 0.35, limit: 2 }), squawk_end: D({ vol: 0.3, limit: 2 }),
  squeak: D({ vol: 0.35, ref: 4, maxDist: 50, limit: 3, pv: 0.15 }),
  snap: D({ vol: 0.55, ref: 4, maxDist: 60, limit: 4, pv: 0.2 }),
  sizzle: D({ vol: 0.4, ref: 4, maxDist: 50, limit: 3 }),
  hurt: D({ vol: 0.7, limit: 2 }), tinnitus: D({ vol: 0.35, limit: 1, pv: 0 }),
  voice: D({ vol: 0.75, ref: 6, maxDist: 60, limit: 3, pv: 0 }),
};
const GUN_SOUND = { rifle: 'rifle', smg: 'smg', pistol: 'pistol', sniper: 'sniper', bazooka: 'bazooka', grenade: 'throw' };
const WARM = ['click', 'hover', 'stamp', 'rifle', 'smg', 'pistol', 'hit', 'hit_kill', 'hit_head', 'explosion', 'snare', 'kick', 'tom', 'crash',
  'rifle_far', 'smg_far', 'impact_plastic', 'impact_dirt', 'whiz', 'step', 'reload', 'squawk', 'squawk_end', 'horn', 'fanfare', 'sniper',
  'bazooka', 'explosion_far', 'flame', 'battle', 'throw', 'pin', 'bounce', 'snap', 'squeak', 'sizzle', 'hurt', 'beep', 'beep_go',
  'pistol_far', 'sniper_far', 'ricochet', 'reload_long', 'equip', 'sad_trombone', 'tinnitus', 'dryfire'];
const RADIO_KINDS = new Set(['wave_start', 'wave_clear', 'objective', 'player_spawn', 'player_death', 'radio']);
const SCREAM_KINDS = new Set(['burning', 'death', 'panic']);

export function createAudio(game) {
  const settings = ensureSettings(game);
  let ctx = null, bank = null, music = null, master, comp, sfx, sfxLP, ui, voiceBus, bedGain = null, warmIdx = 0;
  const voices = [];
  const stats = { requests: 0, played: 0, culled: 0, aggregated: 0, stolen: 0, dropped: 0, barks: 0, spoken: 0, get voices() { return voices.length; } };
  const flames = new Map(); // unit -> {src,g,p,last}
  let battleRate = 0, battleAccum = 0, combat = 0, waveActive = false, incomingEnd = -1, lastBeep = 99;
  let stepDist = 0, lastStepPos = null, heartbeatT = 0, lastWhiz = 0, lastBarkSound = 0, lastSpeech = -10, deafUntil = 0;

  // ---------- context / mixer ----------
  function unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        ctx = new AC({ latencyHint: 'interactive' });
        bank = createSampleBank(ctx);
        master = ctx.createGain(); master.gain.value = settings.volume;
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
        comp.connect(master); master.connect(ctx.destination);
        sfxLP = ctx.createBiquadFilter(); sfxLP.type = 'lowpass'; sfxLP.frequency.value = 20000; sfxLP.Q.value = 0.5; sfxLP.connect(comp);
        sfx = ctx.createGain(); sfx.connect(sfxLP);
        ui = ctx.createGain(); ui.connect(comp);
        voiceBus = ctx.createGain(); voiceBus.gain.value = 1; voiceBus.connect(comp);
        const mbus = ctx.createGain(); mbus.gain.value = 1; mbus.connect(comp);
        music = createMusic(ctx, mbus, bank);
        music.setLevel(musicLevel(), 1.5);
        setInterval(idleTick, 40); // background sample warming + bed/music upkeep even outside 'playing'
      }
      if (ctx.state === 'suspended') ctx.resume();
      music?.start();
    } catch (e) { console.warn('[audio] unlock failed', e); }
  }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlock, { capture: true, passive: true });

  const ready = () => ctx && ctx.state === 'running';
  const musicLevel = () => settings.music * 0.55 * (game.state === 'paused' ? 0.45 : game.state === 'gameover' ? 0.5 : 1);

  function idleTick() {
    if (!ctx) return;
    // warm one recipe per tick so the first gunshot of the match doesn't hitch
    if (warmIdx < WARM.length) { const t0 = performance.now(); while (warmIdx < WARM.length && performance.now() - t0 < 6) bank.warm([WARM[warmIdx++]]); }
    if (!bedGain && ready() && warmIdx >= WARM.length) startBed();
    if (game.state !== 'playing') { music?.setIntensity(game.state === 'menu' ? 0.12 : 0.2); if (bedGain) bedGain.gain.setTargetAtTime(0, ctx.currentTime, 0.5); }
  }
  function startBed() {
    const src = ctx.createBufferSource(); src.buffer = bank.get('battle', 0); src.loop = true;
    bedGain = ctx.createGain(); bedGain.gain.value = 0; src.connect(bedGain).connect(sfx); src.start();
  }

  // ---------- listener ----------
  function listen(pos, out) { // fills out = [dist, pan, frontness]
    const e = game.camera.matrixWorld.elements;
    let dx = pos.x - e[12], dy = pos.y - e[13], dz = pos.z - e[14];
    const dist = Math.hypot(dx, dy, dz) || 0.0001; dx /= dist; dy /= dist; dz /= dist;
    out[0] = dist; out[1] = dx * e[0] + dy * e[1] + dz * e[2]; out[2] = -(dx * e[8] + dy * e[9] + dz * e[10]);
    return out;
  }
  const L = [0, 0, 0];
  function falloff(dist, def) {
    if (dist <= def.ref) return 1;
    const inv = def.ref / (def.ref + (dist - def.ref) * 1.0);
    const edge = 1 - Math.min(1, dist / def.maxDist); return inv * edge * edge;
  }

  // ---------- voices ----------
  function play(name, opts = {}) {
    stats.requests++;
    if (!ready()) return null;
    const def = DEFS[name] || D({});
    let gain = (opts.volume ?? 1) * def.vol, pan = opts.pan ?? 0, delay = opts.delay || 0, sample = name;
    const pos = opts.position || (opts.unit && !opts.unit.isPlayer ? opts.unit.position : null);
    if (pos && !opts.self) {
      listen(pos, L);
      const dist = L[0];
      gain *= falloff(dist, def);
      pan = Math.max(-1, Math.min(1, L[1])) * Math.min(1, dist / 3) * 0.85;
      if (L[2] < 0) gain *= 1 + 0.25 * L[2];
      if (def.far && dist > def.farDist) { sample = def.far; gain *= 1.6; }
      if (def.sos && dist > 30) delay += dist / 343;
      if (def.agg) {
        if (gain < 0.01) { battleAccum += def.agg; stats.aggregated++; return null; }
        if (gain < 0.05 && Math.random() < 0.7) { battleAccum += def.agg; stats.aggregated++; return null; }
      }
    }
    if (gain < 0.006) { stats.culled++; return null; }
    const group = def.group || name;
    let n = 0, quiet = null;
    for (const v of voices) if (v.group === group) { n++; if (!quiet || v.gain < quiet.gain) quiet = v; }
    if (n >= def.limit) { if (quiet && quiet.gain < gain * 0.8) { kill(quiet); stats.stolen++; } else { stats.dropped++; if (def.agg) battleAccum += def.agg; return null; } }
    if (voices.length >= MAX_VOICES) {
      let q = voices[0]; for (const v of voices) if (v.gain < q.gain) q = v;
      if (q.gain < gain) { kill(q); stats.stolen++; } else { stats.dropped++; return null; }
    }
    const buf = opts.buffer || bank.get(sample); if (!buf) return null;
    const src = ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * def.pv);
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(g).connect(p).connect(opts.bus === 'ui' ? ui : opts.bus === 'voice' ? voiceBus : sfx);
    const v = { src, g, gain, group, name };
    src.onended = () => { const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); try { p.disconnect(); } catch { } };
    src.start(ctx.currentTime + delay);
    voices.push(v); stats.played++;
    return v;
  }
  function kill(v) {
    const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1);
    try { v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.01); v.src.stop(ctx.currentTime + 0.06); } catch { }
  }

  // ---------- flamethrower loops ----------
  function flameFire(unit) {
    let f = flames.get(unit);
    if (f) { f.last = game.time; return; }
    if (flames.size >= 4) return;
    const src = ctx.createBufferSource(); src.buffer = bank.get('flame', 0); src.loop = true;
    src.loopStart = Math.random() * 0.5;
    const g = ctx.createGain(); g.gain.value = 0; const p = ctx.createStereoPanner();
    src.connect(g).connect(p).connect(sfx); src.start(ctx.currentTime, Math.random());
    f = { src, g, p, last: game.time }; flames.set(unit, f);
  }
  function updateFlames() {
    for (const [unit, f] of flames) {
      const off = game.time - f.last > 0.14 || game.state !== 'playing' || !unit.alive;
      let gain = 0.55, pan = 0;
      if (!unit.isPlayer) { listen(unit.position, L); gain *= falloff(L[0], DEFS.explosion) * 0.8; pan = L[1] * 0.8; }
      if (off) {
        f.g.gain.setTargetAtTime(0, ctx.currentTime, 0.06); f.src.stop(ctx.currentTime + 0.4); flames.delete(unit);
        if (unit.isPlayer) play('sizzle', { self: true, volume: 0.25 });
      } else { f.g.gain.setTargetAtTime(gain, ctx.currentTime, 0.05); f.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime, 0.05); }
    }
  }

  // ---------- barks ----------
  const lastUnitBark = new WeakMap();
  function bark(unit, kind = 'taunt', text) {
    const now = performance.now() / 1000;
    if (unit && (lastUnitBark.get(unit) || -9) > now - 3 && !RADIO_KINDS.has(kind)) return null;
    if (unit) lastUnitBark.set(unit, now);
    text = text || pickBark(kind, unit?.team);
    game.events.emit('bark', { unit, kind, text });
    return text;
  }
  function onBark({ unit, kind, text, radio: radioFlag }) {
    if (!ready()) return;
    const now = performance.now() / 1000;
    const radio = !unit || RADIO_KINDS.has(kind) || radioFlag || unit.isPlayer || (unit.team === 'green' && !SCREAM_KINDS.has(kind) && kind !== 'limb');
    let dist = 0;
    if (unit && !unit.isPlayer) dist = listen(unit.position, L)[0];
    if (!radio && dist > 45) return;
    if (now - lastBarkSound < 0.3 && !RADIO_KINDS.has(kind)) return;
    lastBarkSound = now; stats.barks++;
    const scream = SCREAM_KINDS.has(kind), team = unit?.team || 'green';
    const i = (Math.random() * 6) | 0;
    const buf = bank.custom(`babble:${team}:${scream}:${i}`, (sr) => babble(sr, i * 7 + (team === 'tan' ? 100 : 0) + (scream ? 50 : 0),
      { pitch: scream ? 330 : team === 'tan' ? 112 : 150, scream, syllables: scream ? 2 : undefined }));
    if (radio && !(unit && !unit.isPlayer && dist < 12)) {
      play('squawk', { self: true, bus: 'voice' });
      play('voice', { self: true, buffer: buf, delay: 0.08, bus: 'voice', volume: 0.8 });
      play('squawk_end', { self: true, bus: 'voice', delay: 0.1 + buf.duration });
    } else play('voice', { position: unit.position, buffer: buf, bus: 'voice' });
    speak(text, kind, unit, radio, dist);
  }
  function speak(text, kind, unit, radio, dist) {
    try {
      if (!settings.voice || !text || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
      const now = performance.now() / 1000;
      if (speechSynthesis.speaking || now - lastSpeech < 3) return;
      if (!radio && dist > 18) return;
      lastSpeech = now;
      const u = new SpeechSynthesisUtterance(text.replace(/[*_]/g, ''));
      u.rate = SCREAM_KINDS.has(kind) ? 1.45 : 1.18; u.pitch = SCREAM_KINDS.has(kind) ? 1.8 : unit?.team === 'tan' ? 0.6 : 1.0;
      u.volume = Math.min(1, settings.volume * 0.9);
      speechSynthesis.speak(u); stats.spoken++;
    } catch { /* speech unsupported */ }
  }

  // ---------- event hooks ----------
  const on = (n, f) => game.events.on(n, (p) => { if (ctx) f(p || {}); });
  const isMe = (u) => u && u === game.player?.unit;
  on('weapon:fire', ({ unit, weapon, origin, dir }) => {
    const def = weapon?.def || weapon || {}; const id = def.id;
    if (def.kind === 'flame' || id === 'flamethrower') { flameFire(unit || game); combat += 0.01; return; }
    const name = GUN_SOUND[id] || (def.kind === 'projectile' ? 'bazooka' : def.kind === 'throw' ? 'throw' : 'rifle');
    if (isMe(unit)) { play(name, { self: true, volume: 1.15 }); if (name === 'throw') play('pin', { self: true, volume: 0.6 }); combat += 0.03; return; }
    const pos = origin || unit?.position; if (!pos) return;
    play(name, { position: pos });
    const d = listen(pos, L)[0]; if (d < 40) combat += 0.02;
    // bullet whiz-by: closest approach of the shot ray to the camera
    if (!nativeWhiz && dir && def.kind === 'hitscan' && unit?.team !== game.player?.unit?.team) {
      const e = game.camera.matrixWorld.elements, lx = e[12] - pos.x, ly = e[13] - pos.y, lz = e[14] - pos.z;
      const t = lx * dir.x + ly * dir.y + lz * dir.z;
      if (t > 4 && t < (def.range || 200)) {
        const cx = lx - dir.x * t, cy = ly - dir.y * t, cz = lz - dir.z * t, miss = Math.hypot(cx, cy, cz);
        if (miss < 2.4 && miss > 0.25 && performance.now() - lastWhiz > 70) {
          lastWhiz = performance.now();
          const side = -(cx * e[0] + cy * e[1] + cz * e[2]) / miss; // which side the bullet passed on
          play('whiz', { self: true, pan: side * 0.8, volume: 1 - miss / 2.6 });
        }
      }
    }
  });
  let nativeWhiz = false;
  on('bullet:whizz', ({ point, dist = 1, shooter }) => {
    nativeWhiz = true;
    if (shooter && shooter === game.player?.unit) return;
    if (performance.now() - lastWhiz < 60) return; lastWhiz = performance.now();
    let pan = 0; if (point) { listen(point, L); pan = Math.max(-1, Math.min(1, L[1] * 1.5)); }
    play('whiz', { self: true, pan, volume: Math.max(0.25, 1 - dist / 2) });
  });
  on('projectile:bounce', ({ position, speed = 5 }) => { if (position) play('bounce', { position, volume: Math.min(1, 0.3 + speed / 10) }); });
  on('weapon:reload', ({ unit, weapon }) => {
    const long = (weapon?.def || weapon)?.reload > 2;
    if (isMe(unit)) play(long ? 'reload_long' : 'reload', { self: true }); else if (unit) play('reload', { position: unit.position, volume: 0.6 });
  });
  on('weapon:switch', ({ unit }) => { if (isMe(unit)) play('equip', { self: true }); });
  on('weapon:empty', ({ unit }) => { if (isMe(unit)) play('dryfire', { self: true }); });
  on('impact', ({ point, kind }) => {
    if (!point) return;
    if (kind === 'bounce' || kind === 'grenade') { play('bounce', { position: point }); return; }
    if (kind === 'flesh' || kind === 'unit' || kind === 'plastic') { play('impact_plastic', { position: point }); return; }
    const r = Math.random(); play(r < 0.12 ? 'ricochet' : r < 0.5 ? 'impact_plastic' : 'impact_dirt', { position: point });
  });
  on('projectile:spawn', ({ kind, position }) => { if (kind === 'grenade' && position) play('pin', { position, volume: 0.6 }); });
  on('explosion', ({ point, radius = 5 }) => {
    if (!point) return;
    play('explosion', { position: point, volume: Math.min(1.3, 0.7 + radius * 0.06) });
    const d = listen(point, L)[0];
    if (d < 60) combat += 0.25 * (1 - d / 60);
    if (d < radius * 1.6) { // shell-shock: muffle + ring
      const now = ctx.currentTime, depth = 1 - d / (radius * 1.6);
      sfxLP.frequency.cancelScheduledValues(now); sfxLP.frequency.setValueAtTime(Math.max(350, 4000 * (1 - depth)), now + 0.05);
      sfxLP.frequency.setTargetAtTime(20000, now + 0.5 + depth, 0.5); deafUntil = now + 1.5;
      if (depth > 0.35) play('tinnitus', { self: true, volume: depth });
    }
  });
  on('unit:killed', ({ unit, info }) => {
    if (!unit) return;
    if (info?.type === 'fire') play('sizzle', { position: unit.position, volume: 0.7 });
    else if (Math.random() < 0.6) play('squeak', { position: unit.position });
    if (listen(unit.position, L)[0] < 35) combat += 0.06;
  });
  on('unit:limbLost', ({ unit }) => { if (unit?.position) play('snap', { position: unit.position }); });
  on('unit:ignited', ({ unit }) => { if (unit?.position) play('sizzle', { position: unit.position }); });
  on('bark', onBark);
  on('wave:start', () => { play('horn', { self: true, bus: 'ui' }); waveActive = true; incomingEnd = -1; });
  on('wave:cleared', () => { play('fanfare', { self: true, bus: 'ui' }); waveActive = false; });
  on('wave:incoming', (p) => { if (p.in > 0) { incomingEnd = game.time + p.in; lastBeep = Math.ceil(p.in) + 1; } });
  on('player:hitmarker', ({ kill: k, headshot }) => play(headshot ? 'hit_head' : k ? 'hit_kill' : 'hit', { self: true, bus: 'ui' }));
  on('player:hit', ({ damage = 10 }) => { play('hurt', { self: true, volume: Math.min(1, 0.4 + damage / 60) }); combat += 0.05; });
  on('player:died', () => { play('sad_trombone', { self: true, bus: 'ui' }); });
  on('player:spawn', () => { lastStepPos = null; });
  on('ui:click', () => play('click', { self: true, bus: 'ui' }));
  on('ui:hover', () => play('hover', { self: true, bus: 'ui' }));
  on('ui:stamp', () => play('stamp', { self: true, bus: 'ui' }));
  on('game:start', () => { combat = 0; waveActive = false; music?.setLevel(musicLevel()); });
  on('game:pause', () => { sfx.gain.setTargetAtTime(0, ctx.currentTime, 0.05); music?.setLevel(musicLevel()); for (const f of flames.values()) f.g.gain.value = 0; });
  on('game:resume', () => { sfx.gain.setTargetAtTime(1, ctx.currentTime, 0.05); music?.setLevel(musicLevel()); });
  on('game:over', () => { music?.setLevel(musicLevel()); waveActive = false; });
  on('game:menu', () => { sfx.gain.setTargetAtTime(1, ctx.currentTime, 0.05); music?.setLevel(musicLevel()); });
  game.events.on('settings:changed', () => {
    if (!ctx) return;
    master.gain.setTargetAtTime(settings.volume, ctx.currentTime, 0.05); music?.setLevel(musicLevel(), 0.1);
    if (!settings.voice) try { speechSynthesis?.cancel(); } catch { }
  });

  // ---------- per-frame ----------
  function update(dt) {
    if (!ready()) return;
    const now = ctx.currentTime;
    // battle bed follows the rate of culled/aggregated distant fire
    battleRate = battleRate * Math.exp(-dt / 1.8) + battleAccum; battleAccum = 0;
    if (bedGain) bedGain.gain.setTargetAtTime(Math.min(0.5, Math.sqrt(battleRate) * 0.07), now, 0.4);
    combat = Math.max(0, combat - dt * 0.12); if (combat > 1.5) combat = 1.5;
    music?.setIntensity(0.22 + (waveActive ? 0.2 : 0) + Math.min(0.6, combat * 0.5) + Math.min(0.15, battleRate * 0.004));
    updateFlames();
    // wave countdown beeps
    if (incomingEnd > 0) {
      const rem = incomingEnd - game.time, c = Math.ceil(rem);
      if (c <= 3 && c >= 1 && c < lastBeep) { lastBeep = c; play('beep', { self: true, bus: 'ui' }); }
      if (rem <= 0) incomingEnd = -1;
    }
    // player footsteps + heartbeat
    const u = game.player?.unit;
    if (u?.alive) {
      const p = u.position;
      if (lastStepPos) {
        const dx = p.x - lastStepPos.x, dz = p.z - lastStepPos.z, moved = Math.hypot(dx, dz);
        if (moved < 2 && Math.abs(u.velocity?.y ?? 0) < 1.5) { stepDist += moved; const stride = moved / Math.max(dt, 1e-3) > 6 ? 2.3 : 1.8;
          if (stepDist > stride) { stepDist = 0; play('step', { self: true, volume: u.anim?.state === 'crouch' || u.anim?.state === 'prone' ? 0.4 : 1 }); } }
        lastStepPos.x = p.x; lastStepPos.z = p.z;
      } else lastStepPos = { x: p.x, z: p.z };
      if (u.hp / (u.maxHp || 100) < 0.3) { heartbeatT -= dt; if (heartbeatT <= 0) { heartbeatT = 0.85; play('kick', { self: true, volume: 0.5, bus: 'ui' }); play('kick', { self: true, volume: 0.3, delay: 0.16, bus: 'ui' }); } }
    }
  }
  DEFS.kick = D({ vol: 0.6, limit: 2, pv: 0 });

  return {
    play, bark, update, unlock,
    get ctx() { return ctx; }, get ready() { return ready(); }, stats,
    setIntensity(v) { music?.setIntensity(v); },
    get musicIntensity() { return music?.intensity ?? 0; },
    sounds: Object.keys(DEFS),
  };
}
