// Weapon definitions. Owned by the combat/player team.
// kind: 'hitscan' | 'projectile' | 'throw' | 'flame'
// AI fields: aiRange (preferred engagement distance), aiBurst (shots per burst), aiSpread (extra radians of inaccuracy).
export const WEAPONS = {
  rifle:   { id: 'rifle', name: 'M1 Plastic', kind: 'hitscan', damage: 34, rpm: 300, mag: 8, reserve: 64, reload: 1.6, spread: 0.008, range: 200, auto: false, aiRange: 40, aiBurst: 2, aiSpread: 0.03 },
  smg:     { id: 'smg', name: 'Tommy Toy', kind: 'hitscan', damage: 18, rpm: 700, mag: 30, reserve: 180, reload: 2.0, spread: 0.03, range: 90, auto: true, aiRange: 22, aiBurst: 5, aiSpread: 0.05 },
  sniper:  { id: 'sniper', name: 'Long Tom', kind: 'hitscan', damage: 110, rpm: 50, mag: 5, reserve: 30, reload: 2.4, spread: 0.0, range: 400, auto: false, aiRange: 80, aiBurst: 1, aiSpread: 0.01 },
  pistol:  { id: 'pistol', name: 'Snub Pistol', kind: 'hitscan', damage: 22, rpm: 400, mag: 10, reserve: 60, reload: 1.2, spread: 0.015, range: 60, auto: false, aiRange: 15, aiBurst: 2, aiSpread: 0.05 },
  bazooka: { id: 'bazooka', name: 'Tube Launcher', kind: 'projectile', damage: 120, radius: 5, speed: 45, rpm: 40, mag: 1, reserve: 12, reload: 2.2, spread: 0.0, range: 200, auto: false, aiRange: 35, aiBurst: 1, aiSpread: 0.03 },
  grenade: { id: 'grenade', name: 'Pineapple', kind: 'throw', damage: 110, radius: 5.5, speed: 18, fuse: 2.5, rpm: 60, mag: 1, reserve: 4, reload: 0.6, spread: 0, range: 30, auto: false, aiRange: 20, aiBurst: 1, aiSpread: 0.05 },
  flamethrower: { id: 'flamethrower', name: 'Hot Glue Gun', kind: 'flame', damage: 9, rpm: 1200, mag: 150, reserve: 300, reload: 2.5, spread: 0.06, range: 12, auto: true, aiRange: 9, aiBurst: 20, aiSpread: 0.08 },
};
