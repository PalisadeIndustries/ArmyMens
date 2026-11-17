import { B, HOLD } from './model.js';

// Procedural posing. Each pose slot is smoothed exponentially toward a target computed from anim.state,
// so state changes blend for free. No allocations; ~60 flops per soldier.
const S = {
  pelvisY: 0, pelvisZ: 1, pelvisRX: 2, pelvisRZ: 3, torsoRX: 4, torsoRY: 5, torsoRZ: 6, headRX: 7, headRY: 8, headRZ: 9,
  larmRX: 10, larmRY: 11, larmRZ: 12, rarmRX: 13, rarmRY: 14, rarmRZ: 15, llegRX: 16, llegRZ: 17, lkneeRX: 18,
  rlegRX: 19, rlegRZ: 20, rkneeRX: 21, wpnPitch: 22, pelvisRY: 23, torsoSY: 24, weaponScale: 25,
};
const N = 26;
const T = new Float32Array(N);
const HPI = Math.PI / 2;

function base() {
  T.fill(0);
  T[S.pelvisY] = 0.98; T[S.torsoSY] = 1; T[S.weaponScale] = 1;
}

function stanceLegs(spread = 1) {
  T[S.llegRX] = -0.1; T[S.rlegRX] = 0.14; T[S.lkneeRX] = 0.1; T[S.rkneeRX] = 0.05;
  T[S.llegRZ] = 0.05 * spread; T[S.rlegRZ] = -0.05 * spread;
}

function runLegs(ph, amp = 0.8, lean = 0.18) {
  const s = Math.sin(ph), c = Math.cos(ph);
  T[S.llegRX] = s * amp; T[S.rlegRX] = -s * amp;
  T[S.lkneeRX] = 0.2 + 1.05 * Math.max(0, -c); T[S.rkneeRX] = 0.2 + 1.05 * Math.max(0, c);
  T[S.llegRZ] = 0.03; T[S.rlegRZ] = -0.03;
  T[S.pelvisY] = 0.93 + 0.06 * Math.abs(c);
  T[S.torsoRX] = lean; T[S.torsoRY] = s * 0.12; T[S.pelvisRY] = -s * 0.08;
}

function holdArms(hold, state, pitch, ph, t) {
  if (hold === 'shoulder') { // bazooka on the shoulder
    const p = state === 'aim' || state === 'crouch' || state === 'prone' ? pitch : 0.05;
    T[S.rarmRX] = -1.2 - p * 0.6; T[S.rarmRZ] = 0.22; T[S.larmRX] = -1.3 - p * 0.6; T[S.larmRZ] = -0.42;
    T[S.wpnPitch] = p;
    if (state === 'run') { T[S.rarmRX] += Math.sin(ph) * 0.06; T[S.wpnPitch] = 0.12; }
    return;
  }
  if (hold === 'hip') { // flamethrower wand at the hip
    const p = state === 'idle' || state === 'run' ? -0.15 : pitch;
    T[S.rarmRX] = -0.7 - p * 0.55; T[S.rarmRZ] = 0.15; T[S.larmRX] = -1.05 - p * 0.55; T[S.larmRZ] = -0.45; T[S.larmRY] = -0.2;
    T[S.wpnPitch] = p;
    if (state === 'run') T[S.rarmRX] += Math.sin(ph) * 0.1;
    return;
  }
  // rifle-ish
  if (state === 'aim' || state === 'crouch') {
    T[S.rarmRX] = -HPI - pitch * 0.92 + 0.32; T[S.rarmRZ] = 0.12; T[S.rarmRY] = 0.0;
    T[S.larmRX] = -HPI - pitch * 0.92 + 0.12; T[S.larmRZ] = -0.62; T[S.larmRY] = -0.1;
    T[S.wpnPitch] = pitch; T[S.headRZ] = -0.08; T[S.headRY] = -0.12;
  } else if (state === 'run') {
    T[S.rarmRX] = -0.55 + Math.sin(ph) * 0.08; T[S.rarmRZ] = 0.18; T[S.larmRX] = -1.15 + Math.sin(ph) * 0.08; T[S.larmRZ] = -0.6;
    T[S.wpnPitch] = 0.7;
  } else { // idle: low ready
    T[S.rarmRX] = -0.45 + Math.sin(t * 1.7) * 0.02; T[S.rarmRZ] = 0.14; T[S.larmRX] = -0.85; T[S.larmRZ] = -0.6;
    T[S.wpnPitch] = -0.35;
  }
}

export function poseModel(model, anim, dt, unit) {
  if (!model?.bones) return;
  const bones = model.bones, P = model.pose;
  dt = Math.min(dt || 0.016, 0.1);
  model.time += dt;
  let state = anim?.state || 'idle';
  if (unit && unit.onFire > 0 && unit.alive !== false) state = 'panic';
  if (state !== model.state) { model.state = state; model.stateTime = 0; } else model.stateTime += dt;
  const t = model.time, st = model.stateTime, ph = anim?.phase || 0;
  const pitch = Math.max(-1.2, Math.min(1.2, anim?.aimPitch || 0));
  const hold = HOLD[model.classId] || 'rifle';
  base();
  let k = 12;

  switch (state) {
    case 'run':
      runLegs(ph); holdArms(hold, 'run', pitch, ph, t);
      T[S.headRX] = -0.12;
      break;
    case 'crouch': // kneeling on the right knee
      T[S.pelvisY] = 0.56; T[S.torsoRX] = 0.12;
      T[S.llegRX] = -1.45; T[S.lkneeRX] = 1.42; T[S.llegRZ] = 0.08;
      T[S.rlegRX] = 0.12; T[S.rkneeRX] = 1.5; T[S.rlegRZ] = -0.06;
      holdArms(hold, 'crouch', pitch, ph, t);
      T[S.headRX] = -pitch * 0.6 - 0.1;
      break;
    case 'prone': {
      const crawl = Math.sin(ph) * 0.25;
      T[S.pelvisY] = 0.2; T[S.pelvisRX] = 1.5; T[S.pelvisZ] = -0.2; T[S.torsoRX] = -0.22;
      T[S.headRX] = -1.05 - pitch * 0.4;
      T[S.llegRZ] = 0.14; T[S.rlegRZ] = -0.14; T[S.llegRX] = crawl * 0.3; T[S.rlegRX] = -crawl * 0.3;
      T[S.lkneeRX] = 0.08 + Math.max(0, crawl); T[S.rkneeRX] = 0.08 + Math.max(0, -crawl);
      T[S.rarmRX] = -2.62 - pitch * 0.3; T[S.rarmRZ] = 0.15; T[S.larmRX] = -2.55 - pitch * 0.3 + crawl * 0.2; T[S.larmRZ] = -0.45;
      T[S.wpnPitch] = pitch * 0.6;
      break;
    }
    case 'throw': {
      stanceLegs(1.4); k = 26;
      T[S.llegRX] = -0.35; T[S.rlegRX] = 0.3;
      if (st < 0.22) { // wind up
        const f = st / 0.22;
        T[S.rarmRX] = -0.6 - 2.9 * f; T[S.torsoRY] = 0.45 * f; T[S.torsoRX] = -0.12 * f;
      } else if (st < 0.42) { // hurl
        const f = (st - 0.22) / 0.2;
        T[S.rarmRX] = -3.5 + 2.6 * f; T[S.torsoRY] = 0.45 - 0.8 * f; T[S.torsoRX] = -0.12 + 0.35 * f;
      } else { T[S.rarmRX] = -0.9; T[S.torsoRY] = -0.35; T[S.torsoRX] = 0.23; }
      T[S.larmRX] = -1.5; T[S.larmRZ] = 0.3; T[S.wpnPitch] = -0.8; T[S.rarmRZ] = 0.1;
      break;
    }
    case 'panic': { // burning: run in circles flailing
      const fp = t * 13;
      runLegs(fp, 0.9, -0.05);
      T[S.larmRX] = -2.7 + Math.sin(t * 17) * 0.7; T[S.larmRZ] = 0.5 + Math.sin(t * 11) * 0.45;
      T[S.rarmRX] = -2.6 + Math.sin(t * 15 + 1) * 0.7; T[S.rarmRZ] = -0.5 - Math.sin(t * 12) * 0.45;
      T[S.headRY] = Math.sin(t * 19) * 0.45; T[S.headRX] = -0.35; T[S.torsoRZ] = Math.sin(t * 9) * 0.15;
      T[S.wpnPitch] = 1.0; k = 20;
      break;
    }
    case 'aim':
      stanceLegs(1.3); T[S.llegRX] = -0.22; T[S.rlegRX] = 0.2; T[S.torsoRX] = 0.05;
      holdArms(hold, 'aim', pitch, ph, t);
      T[S.headRX] = -pitch * 0.65;
      T[S.pelvisY] = 0.96;
      break;
    default: // idle
      stanceLegs(1);
      holdArms(hold, 'idle', pitch, ph, t);
      T[S.torsoRX] = 0.02 + Math.sin(t * 1.9) * 0.015;
      T[S.headRY] = Math.sin(t * 0.37) * 0.35; T[S.headRX] = -pitch * 0.5;
  }

  // lost limbs change posture
  const lost = model.lost;
  if (lost.size) {
    const noL = lost.has('lleg'), noR = lost.has('rleg');
    if (noL && noR) { T[S.pelvisY] = 0.16; T[S.pelvisRX] = state === 'prone' ? 1.5 : 1.1; T[S.torsoRX] = -0.4; T[S.headRX] = -0.8; }
    else if (noL || noR) { T[S.pelvisRZ] = noL ? 0.12 : -0.12; T[S.pelvisY] -= 0.03; T[noL ? S.rlegRX : S.llegRX] *= 0.4; }
  }
  // melting plastic droops
  const melt = model.melt;
  if (melt > 0) {
    T[S.torsoRX] += melt * 0.35; T[S.headRX] += melt * 0.55; T[S.headRZ] += melt * 0.35;
    T[S.torsoSY] = 1 - melt * 0.22; T[S.pelvisY] -= melt * 0.1; T[S.larmRZ] += melt * 0.3; T[S.rarmRZ] -= melt * 0.3;
  }

  // smooth toward target
  if (!model.poseInit) { P.set(T); model.poseInit = true; }
  else {
    const a = 1 - Math.exp(-dt * k);
    for (let i = 0; i < N; i++) P[i] += (T[i] - P[i]) * a;
  }

  // apply to bones
  const pel = bones[B.pelvis], tor = bones[B.torso], hd = bones[B.head];
  pel.position.y = P[S.pelvisY]; pel.position.z = P[S.pelvisZ];
  pel.rotation.set(P[S.pelvisRX], P[S.pelvisRY], P[S.pelvisRZ]);
  tor.rotation.set(P[S.torsoRX], P[S.torsoRY], P[S.torsoRZ]);
  tor.scale.y = model.lost.has('torso') ? 1e-4 : P[S.torsoSY];
  hd.rotation.set(P[S.headRX], P[S.headRY], P[S.headRZ]);
  bones[B.larm].rotation.set(P[S.larmRX], P[S.larmRY], P[S.larmRZ]);
  bones[B.rarm].rotation.set(P[S.rarmRX], P[S.rarmRY], P[S.rarmRZ]);
  bones[B.lleg].rotation.set(P[S.llegRX], 0, P[S.llegRZ]);
  bones[B.rleg].rotation.set(P[S.rlegRX], 0, P[S.rlegRZ]);
  bones[B.lknee].rotation.x = P[S.lkneeRX];
  bones[B.rknee].rotation.x = P[S.rkneeRX];
  // weapon: counter-rotate so the barrel points at the desired world pitch regardless of arm swing
  const w = bones[B.weapon];
  if (hold === 'shoulder') w.rotation.x = -P[S.wpnPitch] - P[S.pelvisRX] - P[S.torsoRX];
  else w.rotation.x = -P[S.wpnPitch] - P[S.pelvisRX] - P[S.torsoRX] - P[S.rarmRX];
  model.dirty = true;
}
