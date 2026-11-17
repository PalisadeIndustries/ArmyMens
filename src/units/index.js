import * as THREE from 'three';
import { Soldier } from './soldier.js';
import { SpatialGrid } from './grid.js';
import { createBarker } from './barks.js';
import { createCover } from './cover.js';
import { createSquads } from './squads.js';
import { createAI } from './ai.js';
import { createDirector } from './waves.js';

// Units, AI & Waves. See CONTRACTS.md (Units) plus the additions documented at the bottom of this file.
export function createUnits(game) {
  const list = [];
  const tune = {
    wave1: 20, maxTan: 150, maxGreen: 45, maxLive: 230,
    firstWaveDelay: 8, intermission: 12, objectiveHold: 15,
    bossHp: 800, bossHpPerWave: 120,
    maxPlayerAttackers: 6, playerSpread: 0.022, playerHeatSpread: 0.0012, tanFireDelay: 1.0,
    losPerFrame: 40, raysPerFrame: 14, ffPerFrame: 10, coverPerFrame: 6, maxThinksPerFrame: 70,
  };
  const grid = new SpatialGrid(4);
  const ctx = {
    game, grid, tune,
    zero: new THREE.Vector3(),
    threatAxis: new THREE.Vector3(0, 0, 1),
    budget: { los: 0, rays: 0, ff: 0, cover: 0 },
    perf: { updateMs: 0, thinks: 0, los: 0, rays: 0, shots: 0, frames: 0, maxMs: 0 },
    teamCount: { green: 0, tan: 0 },
    teamAcc: { green: 1.0, tan: 1.15 },
    playerAttackers: 0,
    playerHeat: 0,      // recent damage dealt to the player; AI aim at the player loosens as it rises (fairness)
    teamLists: { green: [], tan: [] },
    stats: null,
  };
  // Nearest living unit of `team` to (x,z). Linear scan over the team list is cheaper than ring-searching the grid
  // for the army sizes we run (<= ~250 per side); falls back to the grid for bigger crowds.
  ctx.nearest = (x, z, maxDist, team, skip = null, skip2 = null) => {
    const arr = ctx.teamLists[team];
    if (!arr) return null;
    if (arr.length > 300) return grid.nearest(x, z, maxDist, team, skip, skip2);
    let best = null, bd = maxDist * maxDist;
    for (let i = 0; i < arr.length; i++) {
      const u = arr[i];
      if (u === skip || u === skip2 || !u.alive) continue;
      const dx = u.position.x - x, dz = u.position.z - z, d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = u; }
    }
    return best;
  };
  ctx.barker = createBarker(game);
  ctx.cover = createCover(game);
  ctx.squads = createSquads(ctx);
  ctx.player = () => game.player?.unit || null;
  ctx.liveAI = () => list.length - (ctx.player() ? 1 : 0);
  const ai = createAI(ctx);
  ctx.director = createDirector(ctx);
  const director = ctx.director, squads = ctx.squads, cover = ctx.cover, barker = ctx.barker;

  const tmp = new THREE.Vector3();
  const scratch = [];
  const spawnCentroids = { green: new THREE.Vector3(), tan: new THREE.Vector3() };
  let lanesSrc = undefined, lanes = [];

  function newStats() {
    return {
      wave: 0, wavesCleared: 0, kills: { green: 0, tan: 0 }, deaths: { green: 0, tan: 0 }, spawned: { green: 0, tan: 0 },
      limbsLost: 0, ignited: 0, bosses: 0, bossKills: 0, peakAlive: 0, objectiveMax: 0, playerKills: 0,
    };
  }
  ctx.stats = newStats();

  // ---------- world helpers ----------
  ctx.clampToBounds = (v) => {
    const b = game.world?.bounds; if (!b) return v;
    v.x = Math.max(b.minX + 1, Math.min(b.maxX - 1, v.x)); v.z = Math.max(b.minZ + 1, Math.min(b.maxZ - 1, v.z));
    return v;
  };
  function refreshWorldInfo() {
    const sp = game.world?.spawnPoints;
    for (const team of ['green', 'tan']) {
      const pts = sp?.[team]; const c = spawnCentroids[team].set(0, 0, 0);
      if (pts?.length) { for (const p of pts) c.add(p.position || p); c.divideScalar(pts.length); }
    }
    const O = game.world?.objective?.position;
    if (O) {
      ctx.threatAxis.set(spawnCentroids.tan.x - O.x, 0, spawnCentroids.tan.z - O.z);
      if (ctx.threatAxis.lengthSq() < 1e-4) ctx.threatAxis.set(0, 0, 1);
      ctx.threatAxis.normalize();
    }
  }
  ctx.spawnCentroid = (team) => spawnCentroids[team];
  ctx.greenPost = (order) => {
    const O = game.world?.objective?.position || ctx.zero;
    const ax = ctx.threatAxis;
    const out = new THREE.Vector3();
    const dp = game.world?.defensePoints;
    if ((order === 'hold' || order === 'retreat') && dp?.length && Math.random() < 0.8) {
      // world-authored defensive spots near the flag (sandbags, fort walls)
      for (let tries = 0; tries < 8; tries++) {
        const p = dp[(Math.random() * dp.length) | 0];
        if (Math.hypot(p.x - O.x, p.z - O.z) < 30) return out.set(p.x, 0, p.z);
      }
    }
    if (order === 'hold' || order === 'retreat') {
      const ang = Math.atan2(ax.x, ax.z) + (Math.random() - 0.5) * 2.4;
      const r = 6 + Math.random() * 10;
      out.set(O.x + Math.sin(ang) * r, 0, O.z + Math.cos(ang) * r);
    } else {
      const span = Math.hypot(spawnCentroids.tan.x - O.x, spawnCentroids.tan.z - O.z) || 100;
      const dd = span * (0.2 + Math.random() * 0.22), lat = (Math.random() - 0.5) * 50;
      out.set(O.x + ax.x * dd + ax.z * lat, 0, O.z + ax.z * dd - ax.x * lat);
    }
    return ctx.clampToBounds(out);
  };
  function getLanes() {
    const w = game.world, O = w?.objective?.position;
    if (w?.lanes === lanesSrc) return lanes;
    lanesSrc = w?.lanes; lanes = [];
    const src = Array.isArray(lanesSrc) ? lanesSrc : (lanesSrc?.tan || lanesSrc?.all || null);
    if (!src || !O) return lanes;
    for (const l of src) {
      const pts = (Array.isArray(l) ? l : (l?.points || l?.waypoints || [])).map((p) => new THREE.Vector3(p.x, p.y || 0, p.z));
      if (pts.length < 1) continue;
      if (pts.length > 1 && pts[0].distanceToSquared(O) < pts[pts.length - 1].distanceToSquared(O)) pts.reverse();
      lanes.push(pts);
    }
    return lanes;
  }
  function laneFor(at) {
    const ls = getLanes();
    const O = game.world?.objective?.position || ctx.zero;
    if (ls.length) {
      // pick among the two lanes starting nearest this spawn
      const sorted = ls.map((l) => [l, l[0].distanceToSquared(at)]).sort((a, b) => a[1] - b[1]);
      return sorted[Math.min(sorted.length - 1, Math.random() < 0.7 ? 0 : 1)][0];
    }
    // synthetic lane: bend around the middle of the yard
    const dx = O.x - at.x, dz = O.z - at.z, l = Math.hypot(dx, dz) || 1;
    const off = (Math.random() - 0.5) * Math.min(60, l * 0.6);
    const mid = ctx.clampToBounds(new THREE.Vector3(at.x + dx * 0.45 + dz / l * off, 0, at.z + dz * 0.45 - dx / l * off));
    const near = ctx.clampToBounds(new THREE.Vector3(at.x + dx * 0.78 + dz / l * off * 0.35, 0, at.z + dz * 0.78 - dx / l * off * 0.35));
    return [mid, near];
  }
  function floorAt(x, z, y = 0.5) {
    const w = game.world;
    return w?.getFloor ? w.getFloor(x, y, z) : (w?.getHeight?.(x, z) ?? 0);
  }

  // ---------- spawning ----------
  function spawnAI(opts) {
    const u = api.spawn(opts);
    ai.initBrain(u);
    return u;
  }
  ctx.spawnSquad = ({ team, classes, at, order, formation, special, officer }) => {
    const sq = squads.create(team, order);
    sq.special = special || null;
    sq.formation = formation || (order === 'charge' ? 'line' : (Math.random() < 0.6 ? 'wedge' : 'column'));
    const base = at?.position || at || ctx.zero;
    const O = game.world?.objective?.position || ctx.zero;
    let idx = 0;
    const place = (i) => {
      const a = i * 2.39996, r = 1.3 * Math.sqrt(i + 0.5) + Math.random() * 0.4;
      tmp.set(base.x + Math.sin(a) * r, 0, base.z + Math.cos(a) * r);
      game.world?.resolveCircle?.(tmp, 0.45);
      ctx.clampToBounds(tmp);
      tmp.y = floorAt(tmp.x, tmp.z);
      return tmp;
    };
    if (officer) {
      const u = spawnAI({ team, classId: officer.classId || 'rifleman', position: place(idx++), rank: 'sergeant', scale: officer.scale || 1.4, hp: officer.hp, name: officer.name });
      sq.officer = u; sq.add(u, 0);
    }
    for (const c of classes) {
      if (ctx.liveAI() >= tune.maxLive + 20) break;
      const u = spawnAI({ team, classId: c, position: place(idx++) });
      sq.add(u);
    }
    if (!sq.members.length) return sq;
    sq.leader = sq.officer || sq.members[0];
    sq.members.forEach((m, i) => { if (m.ai) m.ai.slot = i; });
    if (team === 'tan') { sq.lane = laneFor(base); sq.wp = 0; }
    sq.goal.copy(team === 'tan' ? (sq.lane?.[0] || O) : base);
    tmp.set(O.x - base.x, 0, O.z - base.z); if (tmp.lengthSq() > 1) sq.heading.copy(tmp.normalize());
    for (const m of sq.members) m.yaw = Math.atan2(sq.heading.x, sq.heading.z);
    sq.thinkT = 0;
    return sq;
  };

  // ---------- event listeners (suppression, stats, barks) ----------
  const AIonly = (u) => u && u.ai && u.alive && !u.isPlayer;
  game.events.on('impact', ({ point } = {}) => {
    if (!point || game.state !== 'playing') return;
    grid.queryInto(scratch, point.x, point.z, 2.5);
    for (const u of scratch) if (AIonly(u)) u.suppression = Math.min(1.5, u.suppression + 0.1);
  });
  game.events.on('explosion', ({ point, radius = 5 } = {}) => {
    if (!point || game.state !== 'playing') return;
    const R = radius * 2.2;
    grid.queryInto(scratch, point.x, point.z, R);
    let barked = false;
    for (const u of scratch) {
      if (!AIonly(u)) continue;
      const d = Math.hypot(u.position.x - point.x, u.position.z - point.z);
      u.suppression = Math.min(1.5, u.suppression + 0.8 * (1 - d / R));
      if (!barked && d > radius) barked = !!barker.bark(u, Math.random() < 0.5 ? 'suppressed' : 'cover', { chance: 0.3 });
    }
  });
  game.events.on('weapon:fire', ({ unit, weapon, origin, dir } = {}) => {
    if (!unit || !origin || !dir || game.state !== 'playing') return;
    const def = weapon?.def || weapon || {};
    if (def.kind === 'flame' || def.kind === 'throw') return;
    const now = game.time;
    if ((unit._suppT ?? -1) > now) return;
    unit._suppT = now + (unit.isPlayer ? 0.08 : 0.25);
    const et = unit.team === 'tan' ? 'green' : 'tan';
    grid.rayInto(scratch, origin.x, origin.z, dir.x, dir.z, Math.min(def.range || 80, 90), 1.8, et);
    const add = def.id === 'sniper' ? 0.35 : def.kind === 'projectile' ? 0.3 : unit.isPlayer ? 0.18 : 0.1;
    for (const u of scratch) if (AIonly(u)) u.suppression = Math.min(1.5, u.suppression + add);
  });
  game.events.on('unit:damaged', ({ unit, info, damage } = {}) => {
    if (unit?.isPlayer) { ctx.playerHeat += damage || 0; return; }
    if (!AIonly(unit)) return;
    unit.suppression = Math.min(1.5, unit.suppression + 0.25 + (damage || 0) / 120);
    unit.ai.hurtT = game.time;
    const src = info?.source;
    if (src && src.team !== unit.team && src.alive) unit.ai.lastAttacker = src;
    if ((damage || 0) > 8 && unit.hp > 0) barker.bark(unit, 'hit', { chance: 0.12 });
  });
  game.events.on('unit:killed', ({ unit, killer } = {}) => {
    if (!unit) return;
    const st = ctx.stats;
    st.deaths[unit.team] = (st.deaths[unit.team] || 0) + 1;
    const kt = killer && killer.team !== unit.team ? killer.team : (unit.team === 'tan' ? 'green' : 'tan');
    if (!killer || killer.team !== unit.team) st.kills[kt] = (st.kills[kt] || 0) + 1;
    if (killer?.isPlayer && killer.team !== unit.team) st.playerKills++;
    if (killer && !killer.isPlayer && killer !== unit) {
      killer.kills++;
      if (killer.alive && killer.team !== unit.team) barker.bark(killer, 'kill', { chance: unit.isBoss ? 1 : 0.3, force: unit.isBoss });
    }
    if (unit.ai) cover.release(unit);
    if (unit.isBoss) {
      st.bossKills++;
      game.events.emit('wave:bossDown', { unit, killer, name: unit.name });
      if (director.boss === unit) director.boss = null;
    }
    // squadmates react
    grid.queryInto(scratch, unit.position.x, unit.position.z, 14, unit.team, unit);
    let told = false;
    for (const u of scratch) {
      if (!AIonly(u)) continue;
      u.suppression = Math.min(1.5, u.suppression + 0.2);
      if (!told) told = !!barker.bark(u, 'mandown', { chance: 0.45, vars: { name: unit.name } });
    }
  });
  game.events.on('unit:limbLost', ({ unit, zone } = {}) => {
    ctx.stats.limbsLost++;
    if (!AIonly(unit)) return;
    const L = unit.limbs;
    if (zone === 'rarm') barker.bark(unit, 'unarmed', { force: true });
    else if ((zone === 'lleg' || zone === 'rleg') && L.lleg === false && L.rleg === false) barker.bark(unit, 'crawl', { force: true });
    else barker.bark(unit, 'limb', { force: true });
    unit.ai.thinkT = 0;
  });
  game.events.on('unit:ignited', ({ unit } = {}) => {
    ctx.stats.ignited++;
    if (AIonly(unit)) { barker.bark(unit, 'burning', { force: true }); unit.ai.thinkT = 0; }
  });
  game.events.on('game:start', () => api.reset());

  // ---------- public api ----------
  let frame = 0;
  const api = {
    list,
    grid,
    tune,
    stats: ctx.stats,
    perf: ctx.perf,
    profile: false,   // set true to fill perf.thinkMs / steerMs / syncMs
    director,
    squads: squads.list,
    barker,
    cover,
    get wave() { return director.wave; },
    get phase() { return director.phase; },
    get objective() { return director.objective; },
    get boss() { return director.boss; },
    get toSpawn() { return director.toSpawn; },
    get intermission() { return director.phase === 'intermission' ? Math.max(0, director.timer) : 0; },
    spawn(opts) {
      const s = new Soldier(game, opts);
      list.push(s);
      if (!opts.isPlayer) ctx.stats.spawned[s.team] = (ctx.stats.spawned[s.team] || 0) + 1;
      game.events.emit('unit:spawned', { unit: s });
      return s;
    },
    // Living units within radius of pos, optional filter. (Contract; allocates the result array.)
    query(pos, radius, filter) {
      const out = [];
      grid.queryInto(scratch, pos.x, pos.z, radius);
      for (const u of scratch) if ((!filter || filter(u)) && Math.abs(u.position.y - pos.y) <= radius + 2) out.push(u);
      return out;
    },
    // Allocation-free variants for hot paths: fill `out` with living units near (x,z) [of team].
    queryInto(out, x, z, radius, team = null, exclude = null) { return grid.queryInto(out, x, z, radius, team, exclude); },
    // Broad phase for rays: units whose XZ position lies within `pad` of the ray. out is filled.
    rayCandidates(out, origin, dir, maxDist, pad = 1.2) { return grid.rayInto(out, origin.x, origin.z, dir.x, dir.z, maxDist, pad); },
    countNear(x, z, radius, team = null) { return grid.count(x, z, radius, team); },
    nearestEnemy(unit, maxDist = 150) {
      const et = unit.team === 'tan' ? 'green' : 'tan';
      return ctx.nearest(unit.position.x, unit.position.z, maxDist, et, unit);
    },
    countAlive(team) { let n = 0; for (const u of list) if (u.alive && u.team === team) n++; return n; },
    bark(unit, kind, opts) { return barker.bark(unit, kind, opts); },
    reset() {
      for (const u of list) if (u.model) game.scene.remove(u.model.root);
      list.length = 0;
      squads.reset(); director.reset(); barker.reset(); cover.reset();
      grid.clear();
      Object.assign(ctx.stats, newStats());
      lanesSrc = undefined; ctx.playerHeat = 0; ctx.playerAttackers = 0; ctx._worldInit = false;
      refreshWorldInfo();
    },
    // ---- debug / test hooks ----
    // Spawns n soldiers instantly (squads of 8 around the spawn points), ignoring wave caps. Returns count spawned.
    debugSpawn(n = 100, team = 'tan', classId = null) {
      const pts = game.world?.spawnPoints?.[team] || [ctx.zero];
      let made = 0, k = 0;
      while (made < n) {
        const sz = Math.min(8, n - made);
        const classes = [];
        for (let i = 0; i < sz; i++) classes.push(classId || ['rifleman', 'rifleman', 'grenadier', 'bazooka', 'flamer', 'sniper'][(Math.random() * 6) | 0]);
        const sp = pts[k++ % pts.length];
        const at = tmp.copy(sp.position || sp); at.x += (Math.random() - 0.5) * 30; at.z += (Math.random() - 0.5) * 10;
        ctx.clampToBounds(at);
        const sq = ctx.spawnSquad({ team, classes, at: at.clone(), order: team === 'tan' ? 'advance' : 'front' });
        made += sq.members.length || sz;
        if (!sq.members.length) break;
      }
      return made;
    },
    debugSkipToWave(n) { for (const u of list) if (!u.isPlayer && u.team === 'tan' && u.alive && u.model) { game.scene.remove(u.model.root); u.alive = false; } director.skipTo(n); },
    debugKillAll(team = 'tan') {
      for (const u of [...list]) if (u.alive && !u.isPlayer && u.team === team) u.takeDamage({ amount: 99999, type: 'explosive', source: null });
    },
    debugBoss() { return director.spawnBoss()?.officer || null; },
    update(dt) {
      const t0 = performance.now();
      const prof0 = api.profile;
      frame++;
      cover.ensure();
      if (!ctx._worldInit) { ctx._worldInit = true; refreshWorldInfo(); }
      // rebuild spatial grid + team counts
      grid.clear();
      const tl = ctx.teamLists; tl.green.length = 0; tl.tan.length = 0;
      let g = 0, t = 0, ta = 0;
      const player = ctx.player();
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (!u.alive) continue;
        grid.insert(u);
        if (u.team === 'tan') { t++; tl.tan.push(u); if (u.limbs.rarm !== false) ta++; } else { g++; tl.green.push(u); }
      }
      ctx.teamCount.green = g; ctx.teamCount.tan = t; ctx.teamCount.tanArmed = ta;
      ctx.stats.peakAlive = Math.max(ctx.stats.peakAlive, g + t);
      let pa = 0;
      if (player?.alive) for (let i = 0; i < list.length; i++) if (list[i].ai?.target === player) pa++;
      ctx.playerAttackers = pa;
      ctx.playerHeat = Math.max(0, ctx.playerHeat - dt * 22);
      ctx.teamAcc.tan = Math.max(0.8, 1.2 - director.wave * 0.03);
      const b = ctx.budget;
      b.los = tune.losPerFrame; b.rays = tune.raysPerFrame; b.ff = tune.ffPerFrame; b.cover = tune.coverPerFrame;
      const pf = ctx.perf; pf.los = 0; pf.rays = 0; pf.shots = 0;

      const tA = prof0 ? performance.now() : 0;
      director.update(dt);
      const tB = prof0 ? performance.now() : 0;
      squads.update(dt);
      if (prof0) { const tC = performance.now(); pf.preMs = tA - t0; pf.dirMs = tB - tA; pf.sqMs = tC - tB; }

      // AI: staggered think + per-frame steer + model sync (pose LOD by camera distance)
      const cam = game.camera.position;
      let thinks = 0, thinkMs = 0, steerMs = 0, syncMs = 0;
      const prof = api.profile;
      const now = game.time;
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (!u.alive || u.isPlayer || !u.ai) continue;
        const a = u.ai;
        const dx = u.position.x - cam.x, dz = u.position.z - cam.z;
        const cd2 = dx * dx + dz * dz;
        a.thinkT -= dt;
        let p0 = prof ? performance.now() : 0;
        if (a.thinkT <= 0 && thinks < tune.maxThinksPerFrame) {
          thinks++;
          const tdt = Math.min(1, now - a.lastThink);
          a.lastThink = now;
          ai.think(u, tdt);
          a.thinkT = (cd2 > 100 * 100 ? 0.3 : 0.12) + Math.random() * 0.08;
        }
        if (prof) { const p1 = performance.now(); thinkMs += p1 - p0; p0 = p1; }
        if (!u.alive) continue;
        ai.steer(u, dt);
        if (prof) { const p1 = performance.now(); steerMs += p1 - p0; p0 = p1; }
        const pose = cd2 < 60 * 60 ? true : cd2 < 120 * 120 ? ((frame + u.id) & 1) === 0 : ((frame + u.id) & 3) === 0;
        u.syncModel(dt, pose);
        if (prof) syncMs += performance.now() - p0;
      }
      pf.thinks = thinks;
      if (prof) { pf.thinkMs = thinkMs; pf.steerMs = steerMs; pf.syncMs = syncMs; }

      // drop dead units from the active list (bodies system owns corpses)
      let w = 0;
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (u.alive || u.isPlayer) list[w++] = u;
        else if (u.ai?.cover) cover.release(u);
      }
      list.length = w;

      const ms = performance.now() - t0;
      pf.updateMs = pf.updateMs * 0.95 + ms * 0.05;
      pf.maxMs = Math.max(pf.maxMs * 0.995, ms);
      pf.frames++;
    },
  };
  return api;
}
