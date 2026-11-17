import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

// Class special abilities. Usable by the player (Q) and by AI: game.combat.useAbility(unit, {dir?}).
// Cooldown lives on the unit: unit.abilityCd (seconds remaining). Combat ticks it down.

const rand = (a, b) => a + Math.random() * (b - a);

const LINES = {
  rally: ['ON YOUR FEET, PLASTIC!', 'Nobody melts today!', 'Squad, show \'em what injection molding means!', 'For the sandbox!'],
  barrage: ['Fire the whole box!', 'Rockets away — duck, you dimwits!', 'Special delivery!'],
  napalm: ['Hot glue, coming through!', 'Smell that? That\'s victory. And plastic.', 'Light \'em up!'],
  spotter: ['Targets painted!', 'Got eyes on \'em — hit the marks!', 'Spotted. They\'re as good as recycled.'],
  cluster: ['Cluster pineapple, fresh from the fruit stand!', 'One becomes many!', 'Party favors!'],
};
const pick = (a) => a[(Math.random() * a.length) | 0];

export function createAbilities(game, combat, fx, proj) {
  const queue = []; // delayed actions (barrage rockets)
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3(), _t = new THREE.Vector3();
  const tmpList = [];

  // markers above spotted enemies
  const MK = 96;
  const mkMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0).scale(1, 1.6, 1),
    new THREE.MeshBasicMaterial({ color: 0xff3b2f, toneMapped: false, depthTest: false, transparent: true, opacity: 0.9 }), MK);
  mkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mkMesh.frustumCulled = false; mkMesh.count = 0; mkMesh.renderOrder = 20;
  game.scene.add(mkMesh);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0);

  function aimOf(unit, opts) {
    unit.eyePosition(_o);
    if (opts?.dir) _d.copy(opts.dir); else unit.forward(_d);
    _r.set(-_d.z, 0, _d.x).normalize(); // right-hand side (yaw 0 = +z)
    return _d;
  }

  const ABILITIES = {
    rally(unit) {
      unit.eyePosition(_o);
      tmpList.length = 0; for (const u of game.units?.list || []) tmpList.push(u);
      let n = 0;
      for (const u of tmpList) {
        if (!u.alive || u.team !== unit.team) continue;
        if (u.position.distanceToSquared(unit.position) > 16 * 16) continue;
        u.hp = Math.min(u.maxHp, u.hp + 30);
        u.rallyUntil = game.time + 8;
        n++;
        fx.ring(u.position.x, u.position.y, u.position.z, 1.6, 0.6, 0x9cff6a);
      }
      fx.ring(unit.position.x, unit.position.y, unit.position.z, 16, 0.9, 0xb8ff8a);
      for (let k = 0; k < 30; k++) fx.fire.emit(unit.position.x + rand(-1, 1), unit.position.y + 0.2, unit.position.z + rand(-1, 1), rand(-3, 3), rand(3, 7), rand(-3, 3), 0.7, 0.25, 0.05, 0xc8ff90, 0x40a020, 1, 1, -4);
      return n;
    },
    barrage(unit, opts) {
      const owner = unit;
      for (let k = 0; k < 4; k++) queue.push({ t: k * 0.14, fn: () => {
        if (!owner.alive) return;
        aimOf(owner, opts);
        const yaw = (k - 1.5) * 0.045 + rand(-0.01, 0.01);
        _v.copy(_d).applyAxisAngle(_y, yaw); _v.y += 0.015 + rand(-0.01, 0.01); _v.normalize();
        _t.copy(_o).addScaledVector(_r, 0.25).addScaledVector(_v, 0.8); _t.y -= 0.1;
        proj.spawnRocket(owner, _t, _v, WEAPONS.bazooka, { scale: 0.7, speedMul: 1.1 });
        game.events.emit('weapon:fire', { unit: owner, weapon: WEAPONS.bazooka, origin: _t.clone(), dir: _v.clone(), ability: true });
        if (owner.isPlayer) combat.shake(0.18);
      } });
      return 4;
    },
    napalm(unit, opts) {
      aimOf(unit, opts);
      for (let k = 0; k < 5; k++) {
        const yaw = (k - 2) * 0.16 + rand(-0.04, 0.04);
        _v.copy(_d); _v.y = 0; _v.normalize().applyAxisAngle(_y, yaw).multiplyScalar(rand(10, 15));
        _v.y = 4.5 + Math.max(0, _d.y) * 8 + rand(-0.5, 0.5);
        _t.copy(_o).addScaledVector(_d, 0.6);
        proj.spawnGrenade(unit, _t, _v, WEAPONS.grenade, { napalm: true, fuse: 4 });
      }
      fx.muzzle(_o.x + _d.x, _o.y + _d.y, _o.z + _d.z, _d.x, _d.y, _d.z, 3, 0xff8a20);
      return 5;
    },
    spotter(unit, opts) {
      aimOf(unit, opts);
      const cosA = Math.cos(THREE.MathUtils.degToRad(28));
      let n = 0;
      for (const u of game.units?.list || []) {
        if (!u.alive || u.team === unit.team) continue;
        _t.copy(u.position); _t.y += 1.2; _t.sub(_o);
        const dist = _t.length(); if (dist > 160 || dist < 0.1) continue;
        if (_t.dot(_d) / dist < cosA) continue;
        _v.copy(u.position); _v.y += 1.2;
        if (game.world?.hasLineOfSight && !game.world.hasLineOfSight(_o, _v)) continue;
        u.markedUntil = game.time + 10; u.markedBy = unit; n++;
        game.events.emit('unit:marked', { unit: u, by: unit, until: u.markedUntil });
      }
      return n;
    },
    cluster(unit, opts) {
      aimOf(unit, opts);
      _v.copy(_d).multiplyScalar(19); _v.y += 4;
      if (unit.velocity) _v.addScaledVector(unit.velocity, 0.5);
      _t.copy(_o).addScaledVector(_d, 0.5).addScaledVector(_r, 0.2);
      proj.spawnGrenade(unit, _t, _v, WEAPONS.grenade, { cluster: 6, fuse: 1.6, scale: 1.15 });
      return 1;
    },
  };

  const api = {
    ABILITIES,
    // Returns true if the ability fired. opts: { dir } (aim direction override, normalized).
    use(unit, opts = {}) {
      const ab = unit?.cls?.ability; if (!ab || !unit.alive) return false;
      if ((unit.abilityCd || 0) > 0 && !opts.force) return false;
      const fn = ABILITIES[ab.id]; if (!fn) return false;
      const result = fn(unit, opts);
      unit.abilityCd = ab.cooldown;
      game.events.emit('ability:used', { unit, id: ab.id, name: ab.name, result });
      game.events.emit('bark', { unit, kind: 'ability', text: pick(LINES[ab.id] || ['Now!']) });
      return true;
    },
    update(dt) {
      for (let i = queue.length - 1; i >= 0; i--) {
        queue[i].t -= dt;
        if (queue[i].t <= 0) { const q = queue[i]; queue.splice(i, 1); q.fn(); }
      }
      // tick cooldowns + draw marks
      let n = 0;
      const t = game.time;
      for (const u of game.units?.list || []) {
        if (u.abilityCd > 0) u.abilityCd = Math.max(0, u.abilityCd - dt);
        if (u.alive && u.markedUntil > t && n < MK) {
          _t.copy(u.position); _t.y += 2.25 * (u.crouchScale ?? 1) + 0.1 + Math.sin(t * 5 + u.id) * 0.06;
          _q.setFromAxisAngle(_y, t * 3);
          _s.setScalar(1 + Math.min(2.5, game.camera.position.distanceTo(u.position) / 40));
          mkMesh.setMatrixAt(n++, _m.compose(_t, _q, _s));
        }
      }
      mkMesh.count = n;
      if (n) mkMesh.instanceMatrix.needsUpdate = true;
    },
    clear() { queue.length = 0; mkMesh.count = 0; },
  };
  return api;
}
