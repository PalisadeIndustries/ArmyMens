// Weapon definitions. Owned by the combat/player team.
// kind: 'hitscan' | 'projectile' | 'throw' | 'flame'
// AI fields: aiRange (preferred engagement distance), aiBurst (shots per burst), aiSpread (extra radians of inaccuracy).
// Player feel fields (optional): recoil (rad of pitch kick per shot), recoilYaw, bloom (spread added per shot),
//   bloomMax, adsFov (camera fov while aiming), adsSpread (spread multiplier while aiming), adsTime (s to aim in),
//   scope (true => full-screen scope overlay while aimed), falloff [startDist, endDist, minMul], tracer (0..1 chance),
//   tracerColor, force (ragdoll push), pellets (shots per trigger pull), headMul (extra headshot multiplier).
export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'M1 Plastic', kind: 'hitscan', damage: 38, rpm: 330, mag: 8, reserve: 80, reload: 1.7,
    spread: 0.006, range: 220, auto: false, aiRange: 40, aiBurst: 2, aiSpread: 0.03,
    recoil: 0.032, recoilYaw: 0.008, bloom: 0.006, bloomMax: 0.03, adsFov: 52, adsSpread: 0.25, adsTime: 0.18,
    falloff: [60, 160, 0.65], tracer: 1, tracerColor: 0xffe2a0, force: 4, headMul: 1.0,
  },
  smg: {
    id: 'smg', name: 'Tommy Toy', kind: 'hitscan', damage: 17, rpm: 720, mag: 32, reserve: 192, reload: 2.0,
    spread: 0.022, range: 100, auto: true, aiRange: 22, aiBurst: 5, aiSpread: 0.05,
    recoil: 0.012, recoilYaw: 0.01, bloom: 0.004, bloomMax: 0.05, adsFov: 60, adsSpread: 0.5, adsTime: 0.14,
    falloff: [20, 60, 0.5], tracer: 0.5, tracerColor: 0xffd27a, force: 2,
  },
  sniper: {
    id: 'sniper', name: 'Long Tom', kind: 'hitscan', damage: 115, rpm: 48, mag: 5, reserve: 35, reload: 2.4,
    spread: 0.0, hipSpread: 0.05, range: 450, auto: false, aiRange: 80, aiBurst: 1, aiSpread: 0.01,
    recoil: 0.09, recoilYaw: 0.015, bloom: 0, bloomMax: 0, adsFov: 18, adsSpread: 0, adsTime: 0.28, scope: true,
    tracer: 1, tracerColor: 0xbfe8ff, force: 9, headMul: 1.3, pierce: 2,
  },
  pistol: {
    id: 'pistol', name: 'Snub Pistol', kind: 'hitscan', damage: 24, rpm: 420, mag: 10, reserve: 70, reload: 1.2,
    spread: 0.012, range: 70, auto: false, aiRange: 15, aiBurst: 2, aiSpread: 0.05,
    recoil: 0.024, recoilYaw: 0.01, bloom: 0.008, bloomMax: 0.04, adsFov: 62, adsSpread: 0.45, adsTime: 0.12,
    falloff: [15, 45, 0.6], tracer: 0.6, tracerColor: 0xffe2a0, force: 2,
  },
  bazooka: {
    id: 'bazooka', name: 'Tube Launcher', kind: 'projectile', damage: 130, radius: 5.5, speed: 48, rpm: 40, mag: 1,
    reserve: 14, reload: 2.2, spread: 0.0, range: 220, auto: false, aiRange: 35, aiBurst: 1, aiSpread: 0.03,
    recoil: 0.07, recoilYaw: 0.02, adsFov: 55, adsSpread: 0.5, adsTime: 0.25, gravity: 1.2, force: 14,
  },
  grenade: {
    id: 'grenade', name: 'Pineapple', kind: 'throw', damage: 115, radius: 6, speed: 19, fuse: 2.6, rpm: 60, mag: 1,
    reserve: 4, reload: 0.6, spread: 0, range: 30, auto: false, aiRange: 20, aiBurst: 1, aiSpread: 0.05,
    recoil: 0, adsFov: 70, adsTime: 0.2, force: 12,
  },
  flamethrower: {
    id: 'flamethrower', name: 'Hot Glue Gun', kind: 'flame', damage: 7, rpm: 1200, mag: 160, reserve: 320,
    reload: 2.5, spread: 0.07, range: 13, auto: true, aiRange: 9, aiBurst: 20, aiSpread: 0.08,
    recoil: 0.0015, recoilYaw: 0.002, adsFov: 68, adsSpread: 0.7, adsTime: 0.15, burn: 4.5, cone: 0.24,
  },
};
