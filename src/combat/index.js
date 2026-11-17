import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

// SKELETON combat system. The Combat team replaces this with projectiles, explosions, flames, tracers.
// Contract (see CONTRACTS.md).
export function createCombat(game) {
  const tmpV = new THREE.Vector3();
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });

  function addTracer(a, b) {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(g, tracerMat); game.scene.add(l); tracers.push({ l, t: 0.06 });
  }

  const api = {
    WEAPONS,
    createWeaponState(id) {
      const def = WEAPONS[id];
      return { id, def, ammo: def.mag, reserve: def.reserve, cooldown: 0, reloading: 0 };
    },
    // Ticks a weapon state's timers. Units/player call this every frame for their active weapon.
    tickWeapon(ws, dt) {
      ws.cooldown = Math.max(0, ws.cooldown - dt);
      if (ws.reloading > 0) {
        ws.reloading -= dt;
        if (ws.reloading <= 0) { const n = Math.min(ws.def.mag - ws.ammo, ws.reserve); ws.ammo += n; ws.reserve -= n; ws.reloading = 0; }
      }
    },
    reload(ws) {
      if (ws.reloading > 0 || ws.ammo >= ws.def.mag || ws.reserve <= 0) return false;
      ws.reloading = ws.def.reload; return true;
    },
    // Attempts to fire. origin/dir in world space (dir normalized). opts: { spreadMul }. Returns true if fired.
    tryFire(shooter, ws, origin, dir, opts = {}) {
      if (ws.cooldown > 0 || ws.reloading > 0) return false;
      if (ws.ammo <= 0) { api.reload(ws); return false; }
      ws.ammo--; ws.cooldown = 60 / ws.def.rpm;
      const spread = (ws.def.spread + (opts.extraSpread || 0)) * (opts.spreadMul ?? 1);
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * 2 * spread; d.y += (Math.random() - 0.5) * 2 * spread; d.z += (Math.random() - 0.5) * 2 * spread; d.normalize();
      game.events.emit('weapon:fire', { unit: shooter, weapon: ws.def, origin: origin.clone(), dir: d.clone() });
      const def = ws.def;
      if (def.kind === 'hitscan' || true) { // skeleton: everything is hitscan
        const hit = api.hitscan(shooter, origin, d, def.range);
        const end = hit ? hit.point : origin.clone().addScaledVector(d, def.range);
        addTracer(origin.clone().addScaledVector(d, 0.6), end);
        if (hit?.unit) hit.unit.takeDamage({ amount: def.damage, type: 'bullet', zone: hit.zone, point: hit.point, dir: d, force: 3, source: shooter });
        if (def.radius && hit) api.explode(hit.point, def.radius, def.damage, shooter);
        if (hit && !hit.unit) game.events.emit('impact', { point: hit.point, normal: hit.normal, kind: 'bullet' });
      }
      if (ws.ammo <= 0) api.reload(ws);
      return true;
    },
    // Ray vs world + units. Returns { point, normal?, dist, unit?, zone? } or null.
    hitscan(shooter, origin, dir, maxDist) {
      const w = game.world.raycast(origin, dir, maxDist);
      let best = w ? { point: w.point, normal: w.normal, dist: w.dist } : null;
      const u = api.raycastUnits(origin, dir, best ? best.dist : maxDist, shooter);
      if (u) best = u;
      return best;
    },
    // Ray vs living units only. ignore: unit to skip. Returns { unit, zone, point, dist } or null.
    raycastUnits(origin, dir, maxDist, ignore) {
      let best = null;
      for (const u of game.units.list) {
        if (!u.alive || u === ignore) continue;
        tmpV.copy(u.position).sub(origin);
        const t = tmpV.dot(dir);
        if (t < -1 || t > maxDist + 1) continue;
        if (tmpV.lengthSq() - t * t > 2.5) continue; // broad phase
        const h = game.bodies.hitTest(u, origin, dir, best ? best.dist : maxDist);
        if (h && (!best || h.dist < best.dist)) best = { unit: u, zone: h.zone, point: h.point, dist: h.dist };
      }
      return best;
    },
    // Radial damage with falloff. Emits 'explosion'.
    explode(point, radius, damage, source, opts = {}) {
      game.events.emit('explosion', { point: point.clone(), radius, source });
      for (const u of game.units.list) {
        if (!u.alive) continue;
        const d = u.position.distanceTo(point);
        if (d > radius) continue;
        const f = 1 - d / radius;
        u.takeDamage({ amount: damage * f, type: 'explosive', point: point.clone(), dir: u.position.clone().sub(point).normalize(), force: 12 * f, source });
      }
    },
    update(dt) {
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].t -= dt;
        if (tracers[i].t <= 0) { game.scene.remove(tracers[i].l); tracers[i].l.geometry.dispose(); tracers.splice(i, 1); }
      }
    },
  };
  return api;
}
