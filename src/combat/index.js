import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { createFX } from './fx.js';
import { createProjectiles } from './projectiles.js';
import { createAbilities } from './abilities.js';

// Combat system: hitscan with pooled tracers, physical rockets & grenades, flamethrower cones that set toys ablaze,
// burn damage over time, napalm fire zones, juicy explosions with camera shake. Friendly fire is OFF.
// Contract: see CONTRACTS.md. Extra API is documented inline (shake, ignite, napalm, useAbility, fx, projectiles).

const rand = (a, b) => a + Math.random() * (b - a);
const BURN_DPS = 14;
const BURN_TICK = 0.25;

export function createCombat(game) {
  const fx = createFX(game);
  const _d = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3();
  const _p = new THREE.Vector3(), _w = new THREE.Vector3();
  const unitScratch = [];
  const snapshot = () => { unitScratch.length = 0; const l = game.units?.list; if (l) for (let i = 0; i < l.length; i++) unitScratch.push(l[i]); return unitScratch; };

  let trauma = 0, shakeT = 0, whizzCd = 0;
  const zones = []; // napalm fire zones
  for (let i = 0; i < 24; i++) zones.push({ active: false, p: new THREE.Vector3(), r: 0, t: 0, owner: null, team: null, tick: 0 });

  // Fallback zone test for model-less units (the first-person player has no body model).
  const ZT = [['head', 1.6, 0.2], ['torso', 1.15, 0.3], ['torso', 0.85, 0.3], ['lleg', 0.45, 0.25]];
  function simpleHitTest(u, origin, dir, maxDist) {
    let best = null; const cs = u.crouchScale ?? 1;
    for (let i = 0; i < ZT.length; i++) {
      const z = ZT[i];
      const cx = u.position.x - origin.x, cy = u.position.y + z[1] * cs - origin.y, cz = u.position.z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < 0 || t > maxDist) continue;
      const d2 = cx * cx + cy * cy + cz * cz - t * t;
      if (d2 < z[2] * z[2] && (!best || t < best.dist)) best = { zone: z[0], dist: t, point: origin.clone().addScaledVector(dir, t) };
    }
    return best;
  }


  // Apply damage with combat-side modifiers (spotter mark, rally buff). Returns body result.
  function deal(unit, info) {
    if (!unit?.alive) return null;
    if (unit.markedUntil > game.time) info.amount *= 1.5;
    if (info.source?.rallyUntil > game.time) info.amount *= 1.2;
    return unit.takeDamage(info);
  }

  const api = {
    WEAPONS,
    fx,
    get trauma() { return trauma; },
    friendlyFire: false,

    createWeaponState(id) {
      const def = WEAPONS[id] || WEAPONS.rifle;
      return { id: def.id, def, ammo: def.mag, reserve: def.reserve, cooldown: 0, reloading: 0, shots: 0, bloom: 0 };
    },
    // Ticks a weapon state's timers. Units/player call this every frame for their active weapon.
    tickWeapon(ws, dt) {
      ws.cooldown = Math.max(0, ws.cooldown - dt);
      if (ws.bloom) ws.bloom = Math.max(0, ws.bloom - dt * 0.12);
      if (ws.reloading > 0) {
        ws.reloading -= dt;
        if (ws.reloading <= 0) { const n = Math.min(ws.def.mag - ws.ammo, ws.reserve); ws.ammo += n; ws.reserve -= n; ws.reloading = 0; }
      }
    },
    reload(ws, unit) {
      if (!ws || ws.reloading > 0 || ws.ammo >= ws.def.mag || ws.reserve <= 0) return false;
      ws.reloading = ws.def.reload;
      if (unit) game.events.emit('weapon:reload', { unit, weapon: ws.def });
      return true;
    },

    // Attempts to fire. origin/dir in world space (dir normalized). Returns true if fired.
    // opts: { spreadMul, extraSpread, spread (absolute override), visualOrigin (tracer/muzzle start), noMuzzle,
    //         throwVel (Vector3, 'throw' only), fuse ('throw' only), target (unit, AI lob target), cluster }
    tryFire(shooter, ws, origin, dir, opts = {}) {
      if (!ws || ws.cooldown > 0 || ws.reloading > 0) return false;
      const def = ws.def;
      if (shooter && !shooter.isPlayer && ws.reserve < def.mag) ws.reserve = def.reserve; // AI: endless reserve
      if (ws.ammo <= 0) { api.reload(ws, shooter); return false; }
      const rally = shooter?.rallyUntil > game.time;
      ws.ammo--; ws.shots = (ws.shots || 0) + 1;
      ws.cooldown = (60 / def.rpm) * (rally ? 0.75 : 1);
      let spread = opts.spread ?? ((def.spread + (opts.extraSpread || 0)) * (opts.spreadMul ?? 1));
      if (rally) spread *= 0.6;
      _d.copy(dir);
      if (spread > 0) {
        // uniform-ish disc jitter perpendicular to dir
        _v.set(Math.abs(_d.y) < 0.9 ? 0 : 1, Math.abs(_d.y) < 0.9 ? 1 : 0, 0).cross(_d).normalize();
        _w.crossVectors(_d, _v);
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
        _d.addScaledVector(_v, Math.cos(a) * r).addScaledVector(_w, Math.sin(a) * r).normalize();
      }
      _o.copy(origin);
      game.events.emit('weapon:fire', { unit: shooter, weapon: def, origin: _o.clone(), dir: _d.clone() });
      switch (def.kind) {
        case 'hitscan': fireHitscan(shooter, def, _o, _d, opts); break;
        case 'projectile': {
          const vo = opts.visualOrigin || _c.copy(_o).addScaledVector(_d, 0.9);
          proj.spawnRocket(shooter, vo, _d, def, opts);
          if (shooter?.isPlayer) api.shake(0.25);
          break;
        }
        case 'throw': fireThrow(shooter, def, _o, _d, opts); break;
        case 'flame': fireFlame(shooter, def, _o, _d, opts); break;
      }
      if (ws.ammo <= 0) api.reload(ws, shooter);
      return true;
    },

    // Ray vs world + units. Returns { point, normal?, dist, unit?, zone? } or null.
    hitscan(shooter, origin, dir, maxDist) {
      const w = game.world?.raycast?.(origin, dir, maxDist);
      let best = w ? { point: w.point, normal: w.normal, dist: w.dist, object: w.object } : null;
      const u = api.raycastUnits(origin, dir, best ? best.dist : maxDist, shooter, api.friendlyFire ? null : shooter?.team);
      if (u) best = u;
      return best;
    },
    // Ray vs living units only. ignore: unit to skip; skipTeam: team id to pass through (friendly fire off).
    // Returns { unit, zone, point, dist } or null.
    raycastUnits(origin, dir, maxDist, ignore, skipTeam) {
      let best = null, bestDist = maxDist;
      const list = game.units?.list; if (!list) return null;
      const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (!u.alive || u === ignore || (skipTeam && u.team === skipTeam)) continue;
        const cx = u.position.x - ox, cy = u.position.y + 0.9 * (u.crouchScale ?? 1) - oy, cz = u.position.z - oz;
        const t = cx * dx + cy * dy + cz * dz;
        if (t < -1.2 || t > bestDist + 1.2) continue;
        if (cx * cx + cy * cy + cz * cz - t * t > 1.5) continue; // broad phase
        const h = u.model ? game.bodies?.hitTest?.(u, origin, dir, bestDist) : simpleHitTest(u, origin, dir, bestDist);
        if (h && h.dist <= bestDist) { best = { unit: u, zone: h.zone, point: h.point, dist: h.dist }; bestDist = h.dist; }
      }
      return best;
    },

    // Radial damage with falloff + the full FX package. opts: { kind, scale, force, noFx, noShake, ignite }
    explode(point, radius, damage, source, opts = {}) {
      const p = point.clone();
      game.events.emit('explosion', { point: p, radius, source, kind: opts.kind || 'explosion' });
      const vis = THREE.MathUtils.clamp(radius / 5.5, 0.45, 1.8);
      if (!opts.noFx) fx.explosion(p.x, p.y, p.z, radius, vis);
      game.world?.addScorch?.(p, radius * 0.55);
      if (!opts.noShake) {
        const d = game.camera.position.distanceTo(p);
        const s = THREE.MathUtils.clamp(1.1 * vis * (1 - d / (radius * 7)), 0, 0.9);
        if (s > 0.02) api.shake(s);
      }
      const force = opts.force ?? 12;
      _e.copy(p); _e.y += 0.4;
      for (const u of snapshot()) {
        if (!u.alive) continue;
        let mult = 1;
        if (u === source) mult = u.isPlayer ? 0.4 : 0.3;
        else if (source && u.team === source.team && !api.friendlyFire) continue;
        _c.copy(u.position); _c.y += 0.9 * (u.crouchScale ?? 1);
        const d = _c.distanceTo(p);
        if (d > radius) continue;
        let f = 1 - d / radius; f = Math.pow(f, 0.75);
        if (d > 1 && game.world?.hasLineOfSight && !game.world.hasLineOfSight(_e, _c)) f *= 0.3;
        const dir = _c.clone().sub(p); dir.y = Math.max(dir.y, 0.3) + 0.4; dir.normalize();
        deal(u, { amount: damage * f * mult, type: 'explosive', point: p.clone(), dir, force: force * (0.4 + f), source, weapon: opts.kind || 'explosion' });
        if (opts.ignite && u.alive) api.ignite(u, opts.ignite, source);
      }
    },

    // Set a unit on fire for `seconds`. Friendly fire rules apply. Emits unit:ignited on first ignition.
    ignite(unit, seconds, source) {
      if (!unit?.alive) return;
      if (source && source !== unit && source.team === unit.team && !api.friendlyFire) return;
      const was = unit.onFire > 0;
      unit.onFire = Math.max(unit.onFire || 0, seconds);
      if (source) unit.fireSource = source;
      if (!was) game.events.emit('unit:ignited', { unit, source });
    },

    // Create a burning napalm patch on the ground.
    napalm(point, radius, owner, duration = 7) {
      let z = zones.find((q) => !q.active);
      if (!z) z = zones.reduce((a, b) => (a.t < b.t ? a : b));
      z.active = true; z.p.copy(point); z.p.y = (game.world?.getFloor?.(point.x, point.y + 0.5, point.z) ?? 0) + 0.05;
      z.r = radius; z.t = duration; z.owner = owner; z.team = owner?.team ?? null; z.tick = 0;
      fx.fireball(z.p.x, z.p.y + 0.3, z.p.z, radius * 0.5, 0.3);
      fx.flash(z.p.x, z.p.y, z.p.z, 40, 0.3, 0xff7a20);
      for (let k = 0; k < 24; k++) fx.fire.emit(z.p.x, z.p.y + 0.2, z.p.z, rand(-6, 6), rand(2, 6), rand(-6, 6), rand(0.4, 0.8), rand(0.6, 1.2), 0.2, 0xfff0a0, 0xff3a00, 1.2, 2, -4);
      game.world?.addScorch?.(z.p, radius);
      game.events.emit('explosion', { point: z.p.clone(), radius, source: owner, kind: 'napalm' });
      return z;
    },

    // Camera shake. amount ~0..1 (trauma; adds up, decays).
    shake(amount) { trauma = Math.min(1, trauma + amount); },

    // Class special ability (Q for the player, AI may call it). See abilities.js.
    useAbility(unit, opts) { return abilities.use(unit, opts); },

    // Melee bash: short cone in front of `unit`. Returns hit unit or null.
    melee(unit, origin, dir, { damage = 55, range = 2.2 } = {}) {
      let best = null, bd = range;
      for (const u of game.units?.list || []) {
        if (!u.alive || u === unit || (u.team === unit.team && !api.friendlyFire)) continue;
        _c.copy(u.position); _c.y += 1.1 * (u.crouchScale ?? 1); _c.sub(origin);
        const d = _c.length(); if (d > range + 0.5) continue;
        if (_c.dot(dir) / (d || 1) < 0.55) continue;
        if (d < bd + 0.5) { best = u; bd = d; }
      }
      if (best) {
        _c.copy(best.position); _c.y += 1.2;
        const zone = dir.y > 0.25 ? 'head' : 'torso';
        deal(best, { amount: damage, type: 'melee', zone, point: _c.clone(), dir: dir.clone(), force: 9, source: unit, weapon: 'melee' });
        fx.impact(_c.x, _c.y, _c.z, -dir.x, -dir.y, -dir.z, 'unit');
        game.events.emit('impact', { point: _c.clone(), normal: dir.clone().negate(), kind: 'melee', unit: best });
        api.shake(0.12);
      }
      return best;
    },

    update(dt) {
      proj.update(dt);
      abilities.update(dt);
      whizzCd -= dt;

      // burning units: damage over time + flames licking off them
      const t = game.time;
      for (const u of snapshot()) {
        if (!(u.onFire > 0)) continue;
        if (!u.alive) { u.onFire = 0; continue; }
        const prone = (u.crouchScale ?? 1) < 0.45;
        u.onFire -= dt * (prone ? 2.5 : 1); // stop, drop and roll
        u._fireDecAt = t; // tells bodies we already decremented this frame
        u._burnAcc = (u._burnAcc || 0) + dt;
        if (u._burnAcc >= BURN_TICK) {
          u._burnAcc -= BURN_TICK;
          deal(u, { amount: BURN_DPS * BURN_TICK, type: 'fire', zone: 'torso', point: u.position.clone(), source: u.fireSource || null, weapon: 'fire', dot: true });
        }
        if (Math.random() < 0.55) {
          const h = (u.crouchScale ?? 1) * rand(0.2, 1.7);
          fx.fire.emit(u.position.x + rand(-0.25, 0.25), u.position.y + h, u.position.z + rand(-0.25, 0.25), rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3), rand(0.25, 0.5), rand(0.35, 0.6), 0.1, 0xffe080, 0xff3000, 1.1, 1, 1);
        }
        if (Math.random() < 0.12) fx.smoke.emit(u.position.x, u.position.y + 1.8, u.position.z, rand(-0.3, 0.3), rand(1, 2), rand(-0.3, 0.3), rand(1, 1.8), 0.3, 1.2, 0x302820, 0x605850, 0.5, 0.5, 0.6);
        if (u.onFire <= 0) u.onFire = 0;
      }

      // napalm zones
      for (const z of zones) {
        if (!z.active) continue;
        z.t -= dt; z.tick -= dt;
        if (z.t <= 0) { z.active = false; continue; }
        const life = Math.min(1, z.t / 1.5);
        const nEmit = Math.ceil(z.r * z.r * 0.8 * life);
        for (let k = 0; k < nEmit; k++) {
          if (Math.random() > 0.5) continue;
          const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * z.r;
          fx.fire.emit(z.p.x + Math.cos(a) * r, z.p.y + 0.1, z.p.z + Math.sin(a) * r, rand(-0.3, 0.3), rand(1.5, 3.5), rand(-0.3, 0.3), rand(0.3, 0.7), rand(0.5, 1.0) * life, 0.15, 0xffd070, 0xff2a00, 1.1, 1, 1.5);
        }
        if (Math.random() < 0.15 * life) fx.smoke.emit(z.p.x + rand(-z.r, z.r) * 0.6, z.p.y + 1, z.p.z + rand(-z.r, z.r) * 0.6, rand(-0.3, 0.3), rand(1.5, 2.5), rand(-0.3, 0.3), rand(2, 3), 0.8, 3, 0x2a2420, 0x6a645c, 0.45, 0.4, 0.5);
        if (z.tick <= 0) {
          z.tick = 0.25;
          for (const u of snapshot()) {
            if (!u.alive) continue;
            if (z.team && u.team === z.team && u !== z.owner && !api.friendlyFire) continue;
            const dx = u.position.x - z.p.x, dz = u.position.z - z.p.z;
            if (dx * dx + dz * dz > z.r * z.r || Math.abs(u.position.y - z.p.y) > 1.5) continue;
            if (u === z.owner) { api.ignite(u, 1.5, null); continue; } // your own napalm still stings
            deal(u, { amount: 6, type: 'fire', zone: 'lleg', point: u.position.clone(), source: z.owner, weapon: 'napalm' });
            api.ignite(u, 3.5, z.owner);
          }
        }
      }

      fx.update(dt);

      // camera shake (player already placed the camera this frame; combat runs after player)
      if (trauma > 0) {
        shakeT += dt * 38;
        const s = trauma * trauma;
        const cam = game.camera;
        cam.position.x += Math.sin(shakeT * 1.13) * 0.18 * s;
        cam.position.y += Math.sin(shakeT * 1.71 + 1.3) * 0.14 * s;
        cam.position.z += Math.sin(shakeT * 0.93 + 2.1) * 0.18 * s;
        cam.rotation.x += Math.sin(shakeT * 1.37 + 0.4) * 0.03 * s;
        cam.rotation.z += Math.sin(shakeT * 1.05 + 2.4) * 0.05 * s;
        trauma = Math.max(0, trauma - dt * 1.3);
      }
    },

    reset() { proj.clear(); abilities.clear(); fx.clear(); for (const z of zones) z.active = false; trauma = 0; },
  };

  // ------------------------------------------------------------------ weapon kinds
  function fireHitscan(shooter, def, origin, dir, opts) {
    const team = api.friendlyFire ? null : shooter?.team;
    let remaining = def.range, pierce = def.pierce || 1, ignore = shooter, endDist = def.range, lastUnitHit = false;
    _p.copy(origin);
    const w = game.world?.raycast?.(origin, dir, def.range);
    const wallDist = w ? w.dist : def.range;
    let traveled = 0;
    while (pierce-- > 0) {
      const u = api.raycastUnits(_p, dir, wallDist - traveled, ignore, team);
      if (!u) { endDist = wallDist; lastUnitHit = false; break; }
      const dist = traveled + u.dist;
      let amount = def.damage;
      if (def.falloff) {
        const [a, b, m] = def.falloff;
        if (dist > a) amount *= dist >= b ? m : 1 - (1 - m) * (dist - a) / (b - a);
      }
      if (u.zone === 'head' && def.headMul) amount *= def.headMul;
      deal(u.unit, { amount, type: 'bullet', zone: u.zone, point: u.point, dir: dir.clone(), force: def.force ?? 3, source: shooter, weapon: def.id });
      fx.impact(u.point.x, u.point.y, u.point.z, -dir.x, -dir.y, -dir.z, 'unit');
      endDist = dist; lastUnitHit = true;
      if (pierce > 0) { traveled = dist + 0.05; _p.copy(origin).addScaledVector(dir, traveled); ignore = u.unit; }
    }
    if (w && !lastUnitHit) {
      fx.impact(w.point.x, w.point.y, w.point.z, w.normal.x, w.normal.y, w.normal.z, w.normal.y > 0.7 ? 'dirt' : 'prop');
      game.events.emit('impact', { point: w.point, normal: w.normal, kind: 'bullet', object: w.object, unit: shooter });
      game.world?.addDecal?.(w.point, w.normal, 'bullet');
    }
    // tracer + muzzle
    const vo = opts.visualOrigin;
    let sx, sy, sz;
    if (vo) { sx = vo.x; sy = vo.y; sz = vo.z; }
    else { sx = origin.x + dir.x * 0.7; sy = origin.y + dir.y * 0.7 - 0.12; sz = origin.z + dir.z * 0.7; }
    if (!opts.noMuzzle) fx.muzzle(sx, sy, sz, dir.x, dir.y, dir.z, def.id === 'sniper' ? 1.6 : 1);
    if (Math.random() < (def.tracer ?? 1)) {
      const ex = origin.x + dir.x * endDist, ey = origin.y + dir.y * endDist, ez = origin.z + dir.z * endDist;
      const sniper = def.id === 'sniper';
      fx.tracer(sx, sy, sz, ex, ey, ez, def.tracerColor ?? 0xffe2a0, sniper ? 0.05 : 0.03, sniper ? 600 : 380, sniper ? 14 : 6);
      if (sniper) for (let k = 0; k < Math.min(endDist, 60); k += 2) fx.smoke.emit(sx + dir.x * k, sy + dir.y * k, sz + dir.z * k, 0, 0.1, 0, rand(0.6, 1.0), 0.05, 0.25, 0xe8f0ff, 0xc8d0e0, 0.25, 0.5, 0.2);
    }
    // near miss on the player
    const pl = game.player?.unit;
    if (pl && pl.alive && shooter && shooter !== pl && shooter.team !== pl.team && whizzCd <= 0) {
      const cam = game.camera.position;
      _c.copy(cam).sub(origin); const t = _c.dot(dir);
      if (t > 2 && t < endDist) {
        const d2 = _c.lengthSq() - t * t;
        if (d2 < 3) { whizzCd = 0.07; game.events.emit('bullet:whizz', { point: origin.clone().addScaledVector(dir, t), dist: Math.sqrt(d2), shooter }); }
      }
    }
  }

  function fireThrow(shooter, def, origin, dir, opts) {
    const vel = new THREE.Vector3();
    if (opts.throwVel) vel.copy(opts.throwVel);
    else {
      const target = opts.target || (!shooter?.isPlayer ? shooter?.ai?.target : null);
      const speed = def.speed || 18, g = 18;
      if (target?.position) {
        _c.copy(target.position).sub(origin); const H = _c.y; _c.y = 0;
        const D = Math.max(1, _c.length()); _c.divideScalar(D);
        // lob angle (low arc), clamp to reachable
        const v2 = speed * speed, disc = v2 * v2 - g * (g * D * D + 2 * H * v2);
        let ang, sp = speed;
        if (disc >= 0) ang = Math.atan((v2 - Math.sqrt(disc)) / (g * D));
        else { ang = Math.PI / 4; sp = Math.sqrt(g * D) * 1.02; }
        ang = Math.max(ang, 0.25);
        const err = (def.aiSpread || 0.05) + (opts.extraSpread || 0);
        const yaw = rand(-err, err);
        const cs = Math.cos(yaw), sn = Math.sin(yaw);
        const hx = _c.x * cs - _c.z * sn, hz = _c.x * sn + _c.z * cs;
        sp *= rand(0.93, 1.05);
        vel.set(hx * Math.cos(ang) * sp, Math.sin(ang) * sp, hz * Math.cos(ang) * sp);
      } else {
        vel.copy(dir).multiplyScalar(speed); vel.y += 3;
        if (shooter?.velocity) vel.addScaledVector(shooter.velocity, 0.5);
      }
    }
    const start = opts.visualOrigin || _c.copy(origin).addScaledVector(dir, 0.5);
    proj.spawnGrenade(shooter, start, vel, def, { fuse: opts.fuse, cluster: opts.cluster, napalm: opts.napalm, scale: opts.scale });
  }

  function fireFlame(shooter, def, origin, dir, opts) {
    const range = def.range;
    const w = game.world?.raycast?.(origin, dir, range);
    const reach = w ? Math.max(0.5, w.dist) : range;
    const vo = opts.visualOrigin;
    const sx = vo ? vo.x : origin.x + dir.x * 0.8, sy = vo ? vo.y : origin.y + dir.y * 0.8 - 0.15, sz = vo ? vo.z : origin.z + dir.z * 0.8;
    const sv = shooter?.velocity;
    for (let k = 0; k < 3; k++) {
      const sp = rand(17, 22), sprd = def.spread * 1.6;
      const vx = (dir.x + rand(-sprd, sprd)) * sp + (sv ? sv.x * 0.6 : 0);
      const vy = (dir.y + rand(-sprd, sprd)) * sp + 0.6;
      const vz = (dir.z + rand(-sprd, sprd)) * sp + (sv ? sv.z * 0.6 : 0);
      const life = (reach / sp) * rand(0.85, 1.15) + 0.08;
      fx.fire.emit(sx, sy, sz, vx, vy, vz, life, rand(0.15, 0.3), rand(1.3, 2.0) * Math.min(1, reach / 6 + 0.3), 0xfff4b0, 0xff3200, 1.0, 0.6, 2.5);
    }
    if (Math.random() < 0.25) fx.smoke.emit(sx + dir.x * reach * 0.7, sy + dir.y * reach * 0.7 + 0.5, sz + dir.z * reach * 0.7, dir.x * 2, rand(1.5, 2.5), dir.z * 2, rand(1.2, 2), 0.6, 2.4, 0x3a3028, 0x7a746a, 0.4, 0.8, 0.8);
    if (w) {
      if (Math.random() < 0.35) fx.fire.emit(w.point.x, w.point.y + 0.1, w.point.z, rand(-2, 2), rand(1, 3), rand(-2, 2), rand(0.3, 0.6), rand(0.6, 1.1), 0.2, 0xffe080, 0xff3000, 1, 1, 1);
      if (Math.random() < 0.04) game.world?.addScorch?.(w.point, 0.9);
    }
    // cone damage
    const cone = def.cone || 0.22, tanC = Math.tan(cone);
    for (const u of snapshot()) {
      if (!u.alive || u === shooter || (shooter && u.team === shooter.team && !api.friendlyFire)) continue;
      _c.copy(u.position); _c.y += 0.9 * (u.crouchScale ?? 1); _c.sub(origin);
      const along = _c.dot(dir);
      if (along < 0 || along > reach + 0.6) continue;
      const lat2 = _c.lengthSq() - along * along;
      const allow = Math.max(0.9, along * tanC + 0.5);
      if (lat2 > allow * allow) continue;
      const f = 1 - 0.45 * (along / range);
      _v.copy(u.position); _v.y += 1;
      deal(u, { amount: def.damage * f, type: 'fire', zone: 'torso', point: _v.clone(), dir: dir.clone(), force: 0.5, source: shooter, weapon: def.id });
      api.ignite(u, def.burn || 4, shooter);
    }
  }

  const proj = createProjectiles(game, api, fx);
  const abilities = createAbilities(game, api, fx, proj);
  api.projectiles = proj;
  api.abilities = abilities;

  game.events.on('game:start', () => api.reset());
  return api;
}
