import * as THREE from 'three';
import { GRAVITY } from '../core/config.js';

// Per-soldier brain. Two halves:
//   think(u, dt)  — staggered decision tick (~6-8 Hz, slower when far from the camera): targeting, LOS, cover,
//                   orders, grenades, bursts. Budgeted raycasts.
//   steer(u, dt)  — every frame: timers, stance, steering + separation, collision, floor, facing, trigger pulls, anim.

const SIGHT = { sniper: 160, bazooka: 95, flamer: 70, rifleman: 90, grenadier: 80 };

export function createAI(ctx) {
  const { game, grid, cover, barker, squads } = ctx;
  const eye = new THREE.Vector3(), aimP = new THREE.Vector3(), dir = new THREE.Vector3(), slot = new THREE.Vector3();
  const near = [];

  const enemyOf = (team) => (team === 'tan' ? 'green' : 'tan');
  const rnd = (a, b) => a + Math.random() * (b - a);

  function initBrain(u) {
    u.ai = {
      mode: 'follow', order: null,
      goal: u.position.clone(), arrive: 0.9, speedMul: 1, stance: 'stand', crawling: false,
      target: null, retargetT: 0, los: false, losT: -9, dist: Infinity,
      thinkT: Math.random() * 0.25, lastThink: game.time, interval: 0.14,
      fire: false, burst: 0, burstDelay: rnd(0.4, 1.4), aimHold: 0, wasReloading: false,
      throwT: 0, throwIdx: -1, thrown: false, nadeCd: rnd(4, 10), throwAt: new THREE.Vector3(),
      cover: null, coverT: 0, coverCd: 0,
      sidestepT: 0, sideX: 0, sideZ: 0, avoidT: 0, avoidX: 0, avoidZ: 0,
      stuckT: 0, lastX: u.position.x, lastZ: u.position.z,
      panicT: 0, engageT: 0, engageMove: 'hold',
      vy: 0, fx: 1e9, fz: 1e9, floorY: u.position.y,
      hurtT: -9, lastAttacker: null, medicT: 0, tauntT: game.time + rnd(5, 20),
      slot: 0, speedNow: 0, jx: rnd(-3, 3), jz: rnd(-3, 3),
    };
    if (u.cls?.ability && !(u.abilityCd > 0)) u.abilityCd = rnd(15, 45);
    return u.ai;
  }

  // ---------- perception ----------
  function checkLos(u, t) {
    const ai = u.ai;
    if (game.time - ai.losT < 0.35) return ai.los;
    if (ctx.budget.los <= 0) return ai.los;
    ctx.budget.los--; ctx.perf.los++;
    ai.losT = game.time;
    eye.set(u.position.x, u.position.y + 1.55 * u.scale, u.position.z);
    t.eyePosition(aimP); aimP.y -= 0.3;
    const w = game.world;
    ai.los = w?.hasLineOfSight ? !!w.hasLineOfSight(eye, aimP) : true;
    return ai.los;
  }

  function pickTarget(u) {
    const ai = u.ai, et = enemyOf(u.team);
    if (!ctx.teamCount[et]) return null;
    const range = (SIGHT[u.classId] || 85) * (u.team === 'green' ? 1.1 : 1);
    const x = u.position.x, z = u.position.z;
    let best = ctx.nearest(x, z, range, et);
    // retaliate against whoever just shot us
    const la = ai.lastAttacker;
    if (la?.alive && la.team === et && game.time - ai.hurtT < 3) {
      const d = Math.hypot(la.position.x - x, la.position.z - z);
      if (d < range * 1.3) best = la;
    }
    // don't let the whole tan army dogpile the player
    const player = ctx.player();
    if (best && best === player && ai.target !== player && ctx.playerAttackers >= ctx.tune.maxPlayerAttackers) {
      const alt = ctx.nearest(x, z, range, et, player);
      if (alt) {
        const dp = Math.hypot(player.position.x - x, player.position.z - z);
        const da = Math.hypot(alt.position.x - x, alt.position.z - z);
        if (da < dp * 2 + 12) best = alt;
      }
    }
    // bazookas want the juiciest cluster
    if (best && u.classId === 'bazooka') {
      grid.queryInto(near, x, z, Math.min(range, 75), et);
      let bs = -1e9;
      const n = Math.min(near.length, 10);
      for (let i = 0; i < n; i++) {
        const c = near[(Math.random() * near.length) | 0];
        const d = Math.hypot(c.position.x - x, c.position.z - z);
        if (d < 10) continue;
        const s = grid.count(c.position.x, c.position.z, 4.5, et) * 10 - d * 0.12 + (c.isPlayer ? 4 : 0);
        if (s > bs) { bs = s; best = c; }
      }
    }
    if (best && !ai.target && Math.random() < 0.15) barker.bark(u, 'spotted', { chance: 0.5 });
    return best;
  }

  // ---------- think ----------
  function think(u, dt) {
    const ai = u.ai, now = game.time, L = u.limbs;
    const armed = L.rarm !== false;
    const legs = (L.lleg !== false ? 1 : 0) + (L.rleg !== false ? 1 : 0);
    ai.crawling = legs === 0;
    ai.speedMul = legs === 2 ? 1 : legs === 1 ? 0.45 : 0.18;
    ai.arrive = 0.9;
    const ws0 = u.weapons[0];
    // AI never runs dry (but still reloads)
    for (const ws of u.weapons) if (ws.reserve < ws.def.mag * 2) ws.reserve += ws.def.mag * 4;

    // --- on fire: flail and run about screaming
    if (u.onFire > 0) {
      if (ai.mode !== 'panic') { ai.mode = 'panic'; cover.release(u); ai.burst = 0; ai.throwT = 0; barker.bark(u, 'burning', { force: true }); }
      else barker.bark(u, 'burning', { chance: 0.2 });
      if (now > ai.panicT) {
        const a = Math.random() * Math.PI * 2, r = rnd(3, 8);
        ai.goal.set(u.position.x + Math.sin(a) * r, 0, u.position.z + Math.cos(a) * r); ctx.clampToBounds(ai.goal);
        ai.panicT = now + rnd(0.35, 0.8);
      }
      ai.speedMul *= 1.3; ai.stance = legs ? 'stand' : 'prone'; ai.fire = false;
      return;
    }
    if (ai.mode === 'panic') ai.mode = 'follow';

    // --- lost the trigger arm: can't shoot, runs around screaming
    if (!armed) {
      if (ai.mode !== 'unarmed') { ai.mode = 'unarmed'; cover.release(u); ai.burst = 0; ai.throwT = 0; }
      ai.fire = false; ai.target = null;
      if (now > ai.panicT) {
        const e = ctx.nearest(u.position.x, u.position.z, 40, enemyOf(u.team));
        let ax, az;
        if (e) { ax = u.position.x - e.position.x; az = u.position.z - e.position.z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; }
        else { const a = Math.random() * Math.PI * 2; ax = Math.sin(a); az = Math.cos(a); }
        const sw = rnd(-0.9, 0.9), c = Math.cos(sw), s = Math.sin(sw);
        const r = rnd(5, 12);
        ai.goal.set(u.position.x + (ax * c - az * s) * r, 0, u.position.z + (ax * s + az * c) * r); ctx.clampToBounds(ai.goal);
        ai.panicT = now + rnd(0.8, 1.6);
        barker.bark(u, 'unarmed', { chance: 0.35 });
      }
      ai.speedMul *= 1.15; ai.stance = legs ? 'stand' : 'prone';
      return;
    }
    if (ai.mode === 'unarmed') ai.mode = 'follow';

    // --- targeting
    ai.retargetT -= dt;
    if (!ai.target?.alive || ai.retargetT <= 0) {
      const prev = ai.target;
      ai.target = pickTarget(u);
      ai.retargetT = rnd(0.7, 1.3);
      if (ai.target !== prev) { ai.losT = -9; ai.los = false; ai.burst = 0; }
    }
    const t = ai.target;
    let dist = Infinity, los = false;
    if (t) { dist = Math.hypot(t.position.x - u.position.x, t.position.z - u.position.z); los = checkLos(u, t); }
    ai.dist = dist;

    const sq = u.squad;
    const order = sq?.order ?? (u.team === 'tan' ? 'charge' : 'hold');
    ai.order = order;
    const def = ws0.def;
    const isSniper = u.classId === 'sniper', isFlamer = u.classId === 'flamer', isBaz = u.classId === 'bazooka';
    const fireRange = isFlamer ? def.range * 0.95 : isSniper ? 220 : def.aiRange * (isBaz ? 2.2 : 1.7);

    // --- weapon choice: sidearm when something gets in our face
    const side = u.weapons[1];
    const sideOk = side && side.def.kind === 'hitscan';
    if (ai.throwT <= 0) {
      if (sideOk && t && ((isBaz && dist < 9) || (isSniper && dist < 12))) u.weaponIndex = 1;
      else u.weaponIndex = 0;
    }
    const ws = u.weapon;

    // --- grenades at clusters / at enemies hiding behind cover
    ai.nadeCd -= dt;
    if (t && ai.throwT <= 0 && ai.nadeCd <= 0 && dist > 8 && dist < 27 && legs > 0) {
      let gi = -1;
      for (let i = 0; i < u.weapons.length; i++) if (u.weapons[i].def.kind === 'throw') { gi = i; break; }
      if (gi >= 0) {
        const g = u.weapons[gi].def;
        const et = enemyOf(u.team);
        const cluster = grid.count(t.position.x, t.position.z, 4.5, et);
        const need = u.classId === 'grenadier' ? 2 : 3;
        if (cluster >= need || (!los && dist < 22 && Math.random() < 0.4)) {
          if (grid.count(t.position.x, t.position.z, (g.radius || 5) + 1.5, u.team, u) === 0) {
            ai.throwT = 0.6; ai.throwIdx = gi; ai.thrown = false; ai.throwAt.copy(t.position);
            barker.bark(u, 'grenade', { chance: 0.85 });
          }
        }
        ai.nadeCd = u.classId === 'grenadier' ? rnd(4, 8) : rnd(9, 16);
      }
    }

    // --- class abilities (rarely; AI cooldowns are stretched)
    const ab = u.cls.ability;
    if (ab && t && los && ai.throwT <= 0 && !(u.abilityCd > 0) && game.combat?.useAbility && legs > 0) {
      const et = enemyOf(u.team), tp = t.position;
      let use = false;
      if (ab.id === 'rally') use = (u.rank === 'sergeant' || u.squad?.leader === u) && grid.count(u.position.x, u.position.z, 16, u.team) >= 4 && (u.suppression > 0.4 || u.hp < u.maxHp * 0.6 || u.rank === 'sergeant');
      else if (ab.id === 'barrage') use = dist > 15 && dist < 70 && grid.count(tp.x, tp.z, 5, et) >= 3 && grid.count(tp.x, tp.z, 7, u.team) === 0;
      else if (ab.id === 'napalm') use = dist > 7 && dist < 15 && grid.count(tp.x, tp.z, 4, et) >= 2 && grid.count(tp.x, tp.z, 6, u.team, u) === 0;
      else if (ab.id === 'cluster') use = dist > 12 && dist < 24 && grid.count(tp.x, tp.z, 5, et) >= 3 && grid.count(tp.x, tp.z, 9, u.team, u) === 0;
      if (use) {
        u.eyePosition(eye); aimP.set(tp.x, tp.y + 0.8, tp.z);
        dir.subVectors(aimP, eye).normalize();
        if (ab.id === 'cluster' || ab.id === 'napalm') { dir.y = Math.max(dir.y, 0.05); dir.normalize(); }
        u.yaw = Math.atan2(dir.x, dir.z); u.pitch = Math.asin(dir.y);
        if (game.combat.useAbility(u, { dir: dir.clone() })) u.abilityCd = (ab.cooldown || 20) * rnd(2, 3.5);
      }
    }

    // --- cover decisions
    const supp = u.suppression;
    let advX = 0, advZ = 0;
    if (sq) { advX = sq.heading.x; advZ = sq.heading.z; }
    const digIn = !t && order === 'hold' && !isFlamer;
    if (ai.cover) {
      ai.coverT -= dt;
      const atC = Math.hypot(ai.cover.position.x - u.position.x, ai.cover.position.z - u.position.z) < 0.9;
      const holdOk = order === 'hold' && (!t || dist > 8);
      if ((ai.coverT <= 0 && supp < 0.35 && !holdOk) || order === 'charge' || order === 'retreat' || (t && dist < 6) ||
        (!t && !holdOk && ai.coverT < -2) || (!atC && ai.coverT < -1) || (holdOk && ai.coverT < -20)) {
        cover.release(u); ai.coverCd = now + rnd(2, 4);
      } else cover.claim(ai.cover, u, 2);
    } else if ((t || digIn) && order !== 'charge' && order !== 'retreat' && order !== 'flank' && now > ai.coverCd && !isFlamer && !ai.crawling &&
      (digIn || supp > 0.5 || (u.hp < u.maxHp * 0.45 && Math.random() < 0.4) || (isSniper && los) || (los && dist < fireRange && Math.random() < 0.25))) {
      ai.coverCd = now + rnd(1.5, 3);
      if (ctx.budget.cover > 0) {
        ctx.budget.cover--;
        let tx, tz;
        if (t) { tx = t.position.x; tz = t.position.z; }
        else { const O = game.world?.objective?.position || ctx.zero; tx = O.x + ctx.threatAxis.x * 45; tz = O.z + ctx.threatAxis.z * 45; }
        // holders look for cover around their post, everyone else around themselves
        const p = cover.find(u, tx, tz, digIn ? 9 : isSniper ? 18 : 12, advX, advZ, 5);
        if (p) {
          cover.claim(p, u, 8); ai.cover = p; ai.coverT = digIn || order === 'hold' ? rnd(20, 40) : isSniper ? rnd(10, 18) : rnd(3, 7);
          if (supp > 0.5) barker.bark(u, Math.random() < 0.5 ? 'cover' : 'suppressed', { chance: 0.5 });
        }
      }
    }

    // --- movement goal & stance
    ai.stance = ai.crawling ? 'prone' : 'stand';
    let mode = order;
    if (sq) squads.slotPosition(sq, u, slot); else slot.copy(game.world?.objective?.position || ctx.zero);
    const isLeader = sq?.leader === u;
    if (ai.cover) {
      mode = 'cover';
      ai.goal.copy(ai.cover.position); ai.arrive = 0.3;
      const at = Math.hypot(ai.cover.position.x - u.position.x, ai.cover.position.z - u.position.z) < 0.7;
      if (at) ai.stance = ai.crawling ? 'prone' : ((ai.burst > 0 || ai.aimHold > 0) ? 'stand' : 'crouch');
      else ai.speedMul *= 1.15;
    } else if (order === 'retreat') {
      ai.goal.copy(isLeader || !sq ? (sq?.goal ?? slot) : slot);
      ai.speedMul *= 1.15;
    } else if (order === 'charge') {
      if (t && (dist < 22 || isFlamer && dist < 35)) ai.goal.set(t.position.x, 0, t.position.z);
      else if (isLeader || !sq) ai.goal.copy(sq?.goal ?? slot);
      else ai.goal.copy(slot);
      if (!t || dist > 22) { ai.goal.x += ai.jx; ai.goal.z += ai.jz; }
      ai.speedMul *= 1.12; ai.arrive = isFlamer ? 4 : 1.5;
    } else if (order === 'flank') {
      ai.goal.copy(isLeader ? sq.goal : slot);
      ai.speedMul *= 1.1;
    } else {
      // advance / hold / front / escort
      ai.goal.copy(slot);
      if (isLeader && order === 'advance' && sq.members.length > 1) ai.speedMul *= 0.88;
      if (order === 'advance' && sq && sq.engagedT === 0) ai.speedMul *= 1.12; // double-time while nobody's shooting
      if (!isLeader && sq) {
        const ds = Math.hypot(slot.x - u.position.x, slot.z - u.position.z);
        if (ds > 6) ai.speedMul *= 1.12;
      }
      const engaging = t && los && dist < fireRange;
      if (engaging) {
        mode = 'engage';
        ai.engageT -= dt;
        if (ai.engageT <= 0) { ai.engageT = rnd(1.5, 3.5); ai.engageMove = Math.random() < (u.team === 'tan' ? 0.4 : 0.15) ? 'push' : 'hold'; }
        if (isFlamer) {
          if (dist > 6) ai.goal.set(t.position.x, 0, t.position.z); else ai.goal.copy(u.position);
          ai.arrive = 5;
        } else if (isSniper) {
          if (dist < 30) { // too close — back off
            const ax = u.position.x - t.position.x, az = u.position.z - t.position.z, l = Math.hypot(ax, az) || 1;
            ai.goal.set(u.position.x + ax / l * 10, 0, u.position.z + az / l * 10);
          } else { ai.goal.copy(u.position); ai.stance = ai.burst > 0 || ai.aimHold > 0 ? 'crouch' : (u.id % 3 === 0 ? 'prone' : 'crouch'); }
        } else if (isBaz) {
          if (dist < 12) { const ax = u.position.x - t.position.x, az = u.position.z - t.position.z, l = Math.hypot(ax, az) || 1; ai.goal.set(u.position.x + ax / l * 6, 0, u.position.z + az / l * 6); }
          else ai.goal.copy(u.position);
        } else if (order === 'hold' || order === 'front') {
          // stay on the post, fight from there
          if (supp > 0.3) ai.stance = 'crouch';
        } else if (ai.engageMove === 'push' && dist > def.aiRange * 0.5) {
          const k = Math.max(0, (dist - def.aiRange * 0.5) / dist);
          ai.goal.set(u.position.x + (t.position.x - u.position.x) * k, 0, u.position.z + (t.position.z - u.position.z) * k);
          ai.speedMul *= 0.6;
        } else {
          ai.goal.copy(u.position);
          if (supp > 0.3 || u.id % 4 === 0) ai.stance = 'crouch';
        }
      } else if (isSniper && u.team === 'tan') {
        // snipers hang back: stop well short of the flag
        const O = game.world?.objective?.position;
        if (O) {
          const dO = Math.hypot(O.x - u.position.x, O.z - u.position.z);
          if (dO < 70) { ai.goal.copy(u.position); ai.stance = 'crouch'; }
        }
      }
    }
    if (ai.crawling) ai.stance = 'prone';
    ai.mode = mode;

    // --- firing decisions
    ai.fire = !!t && los && dist < (ws === ws0 ? fireRange : side.def.aiRange * 2) && !(order === 'flank' && dist > 18) && !(order === 'retreat' && Math.random() < 0.5);
    if (ai.fire && ai.burst <= 0 && ai.burstDelay <= 0 && ai.throwT <= 0) {
      let blocked = false;
      if (ctx.budget.ff > 0 && game.combat?.raycastUnits && game.combat.friendlyFire !== false && dist < 120) {
        ctx.budget.ff--;
        u.eyePosition(eye); t.eyePosition(aimP); aimP.y -= 0.3;
        dir.subVectors(aimP, eye); const dl = dir.length(); dir.divideScalar(dl || 1);
        const h = game.combat.raycastUnits(eye, dir, Math.max(0, dl - 0.8), u);
        if (h?.unit && h.unit.team === u.team) blocked = true;
      }
      if (blocked) {
        ai.burstDelay = 0.4;
        const a = (u.id % 2 ? 1 : -1);
        dir.set(t.position.x - u.position.x, 0, t.position.z - u.position.z).normalize();
        ai.sideX = dir.z * a; ai.sideZ = -dir.x * a; ai.sidestepT = 0.7;
      } else {
        const wd = ws.def;
        ai.burst = Math.max(1, Math.round(wd.aiBurst * rnd(0.7, 1.3)));
        if (isSniper && ws === ws0) ai.aimHold = rnd(0.7, 1.4) * (1 + supp);
        else if (isBaz && ws === ws0) ai.aimHold = rnd(0.4, 0.8);
        else ai.aimHold = rnd(0.05, 0.25);
        if (u.rank === 'sergeant') ai.aimHold *= 0.5;
      }
    }

    // --- obstacle probe & stuck detection
    const gx = ai.goal.x - u.position.x, gz = ai.goal.z - u.position.z, gd = Math.hypot(gx, gz);
    const moved = Math.hypot(u.position.x - ai.lastX, u.position.z - ai.lastZ);
    ai.lastX = u.position.x; ai.lastZ = u.position.z;
    if (gd > 2 && dt > 0) {
      if (moved < u.cls.speed * ai.speedMul * dt * 0.25) ai.stuckT += dt; else ai.stuckT = Math.max(0, ai.stuckT - dt);
      if (ai.stuckT > 1.0) {
        ai.stuckT = 0; const s = Math.random() < 0.5 ? -1 : 1;
        ai.sideX = gz / gd * s; ai.sideZ = -gx / gd * s; ai.sidestepT = rnd(0.8, 1.5);
      }
      const w = game.world;
      if (ai.avoidT <= 0 && ctx.budget.rays > 0 && w?.raycast) {
        ctx.budget.rays--; ctx.perf.rays++;
        eye.set(u.position.x, u.position.y + 0.6, u.position.z);
        dir.set(gx / gd, 0, gz / gd);
        const h = w.raycast(eye, dir, Math.min(2.5, gd));
        if (h && h.normal && Math.abs(h.normal.y) < 0.6) {
          const dn = dir.x * h.normal.x + dir.z * h.normal.z;
          let tx = dir.x - h.normal.x * dn, tz = dir.z - h.normal.z * dn; let tl = Math.hypot(tx, tz);
          if (tl < 0.2) { const s = u.id % 2 ? 1 : -1; tx = -h.normal.z * s; tz = h.normal.x * s; tl = 1; }
          ai.avoidX = tx / tl; ai.avoidZ = tz / tl; ai.avoidT = 0.8;
        }
      }
    } else ai.stuckT = 0;

    // --- chatter
    if (u.hp < u.maxHp * 0.35 && now > ai.medicT) { ai.medicT = now + 12; barker.bark(u, 'medic', { chance: 0.6 }); }
    if (t && los && now > ai.tauntT) {
      ai.tauntT = now + (u.rank === 'sergeant' ? rnd(6, 10) : rnd(15, 40));
      barker.bark(u, u.rank === 'sergeant' ? 'boss' : 'taunt', { chance: u.rank === 'sergeant' ? 1 : 0.25 });
    }
    if (ai.crawling && Math.random() < 0.03) barker.bark(u, 'crawl', { chance: 0.5 });
  }

  // ---------- steer (every frame) ----------
  function lobDir(from, to, speed, out) {
    let dx = to.x - from.x, dz = to.z - from.z;
    const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const h = to.y - from.y, v2 = speed * speed, g = GRAVITY;
    const disc = v2 * v2 - g * (g * d * d + 2 * h * v2);
    const th = disc >= 0 ? Math.atan((v2 - Math.sqrt(disc)) / (g * d)) : Math.PI / 4;
    const c = Math.cos(th);
    return out.set(dx * c, Math.sin(th), dz * c);
  }

  function aimAt(u, t, ws, out) {
    // aim point: chest (or feet for splash weapons), with lead for slow projectiles
    const def = ws.def;
    const cs = t.crouchScale ?? 1, sc = t.scale ?? 1;
    if (def.radius && def.kind === 'projectile') out.set(t.position.x, t.position.y + 0.4, t.position.z);
    else out.set(t.position.x, t.position.y + (t.isPlayer ? 1.25 : 1.15) * cs * sc, t.position.z);
    if (def.kind === 'projectile' && def.speed) {
      const d = Math.hypot(t.position.x - u.position.x, t.position.z - u.position.z);
      const lt = d / def.speed * 0.8;
      out.x += (t.velocity?.x || 0) * lt; out.z += (t.velocity?.z || 0) * lt;
    }
    return out;
  }

  function fireShot(u, ws, t) {
    const ai = u.ai;
    u.eyePosition(eye);
    aimAt(u, t, ws, aimP);
    dir.subVectors(aimP, eye).normalize();
    u.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const def = ws.def;
    const moving = ai.speedNow > 1;
    let spread = (def.aiSpread ?? 0.04) * (ctx.teamAcc[u.team] ?? 1) * (1 + u.suppression * 1.5) * (moving ? 1.6 : 1) * (u.crouchScale < 0.8 ? 0.8 : 1);
    if (u.rank === 'sergeant') spread *= 0.7;
    if (ai.order === 'charge') spread *= 1.3;
    if (t.isPlayer) spread += ctx.tune.playerSpread + Math.min(0.09, ctx.playerHeat * ctx.tune.playerHeatSpread);
    const origin = eye.clone().addScaledVector(dir, 0.35);
    const fired = game.combat?.tryFire?.(u, ws, origin, dir.clone(), { extraSpread: spread });
    if (fired) {
      ai.burst--; ctx.perf.shots++;
      if (ai.burst <= 0) {
        ai.burst = 0;
        ai.burstDelay = (def.auto ? rnd(0.5, 1.3) : rnd(0.35, 1.1)) * (1 + u.suppression * 1.5) * (u.team === 'tan' ? ctx.tune.tanFireDelay : 1);
        if (def.kind === 'projectile') barker.bark(u, 'rocket', { chance: 0.3 });
      }
    }
    return fired;
  }

  function steer(u, dt) {
    const ai = u.ai, now = game.time;
    // timers
    u.suppression = Math.max(0, u.suppression - dt * 0.35);
    if (ai.burst <= 0) ai.burstDelay -= dt;
    ai.aimHold -= dt; ai.sidestepT -= dt; ai.avoidT -= dt;
    const combat = game.combat;
    for (let i = 0; i < u.weapons.length; i++) combat?.tickWeapon?.(u.weapons[i], dt);

    // stance
    const tcs = ai.stance === 'prone' ? 0.3 : ai.stance === 'crouch' ? 0.65 : 1;
    u.crouchScale += (tcs - u.crouchScale) * Math.min(1, dt * 7);

    // steering
    const px = u.position.x, pz = u.position.z;
    let gx = ai.goal.x - px, gz = ai.goal.z - pz;
    const gd = Math.hypot(gx, gz);
    let spd = 0, dx = 0, dz = 0;
    if (gd > ai.arrive) {
      dx = gx / gd; dz = gz / gd;
      const stanceMul = ai.stance === 'crouch' ? 0.55 : 1;
      spd = u.cls.speed * ai.speedMul * stanceMul * Math.min(1, (gd - ai.arrive) / 1.2 + 0.3);
    }
    if (ai.throwT > 0) spd *= 0.2;
    if (ai.avoidT > 0 && spd > 0) { dx = dx * 0.35 + ai.avoidX; dz = dz * 0.35 + ai.avoidZ; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    if (ai.sidestepT > 0) {
      dx = dx * 0.3 + ai.sideX; dz = dz * 0.3 + ai.sideZ; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      spd = Math.max(spd, u.cls.speed * ai.speedMul * 0.7);
    }
    let vx = dx * spd, vz = dz * spd;
    // separation
    const R = u.radius * 2 + 0.35;
    grid.queryInto(near, px, pz, R, null, u);
    let sx = 0, sz = 0;
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      let ox = px - o.position.x, oz = pz - o.position.z;
      let d = Math.hypot(ox, oz);
      const rr = u.radius + o.radius + 0.3;
      if (d >= rr) continue;
      if (d < 1e-4) { ox = (u.id % 7) - 3; oz = (u.id % 5) - 2; d = Math.hypot(ox, oz) || 1; }
      const p = (rr - d) / rr;
      sx += ox / d * p; sz += oz / d * p;
    }
    vx += sx * 4; vz += sz * 4;
    const k = 1 - Math.exp(-dt * 9);
    u.velocity.x += (vx - u.velocity.x) * k;
    u.velocity.z += (vz - u.velocity.z) * k;
    const sp2 = u.velocity.x * u.velocity.x + u.velocity.z * u.velocity.z;
    ai.speedNow = Math.sqrt(sp2);
    const w = game.world;
    if (sp2 > 1e-4) {
      u.position.x += u.velocity.x * dt; u.position.z += u.velocity.z * dt;
      w?.resolveCircle?.(u.position, u.radius, u.height * u.crouchScale);
    }
    // floor / gravity
    if (Math.abs(u.position.x - ai.fx) + Math.abs(u.position.z - ai.fz) > 0.1 || ai.vy !== 0) {
      ai.fx = u.position.x; ai.fz = u.position.z;
      ai.floorY = w?.getFloor ? w.getFloor(u.position.x, u.position.y, u.position.z) : (w?.getHeight?.(u.position.x, u.position.z) ?? 0);
    }
    if (u.position.y <= ai.floorY + 0.02) { u.position.y = ai.floorY; ai.vy = 0; }
    else { ai.vy -= GRAVITY * dt; u.position.y = Math.max(ai.floorY, u.position.y + ai.vy * dt); if (u.position.y === ai.floorY) ai.vy = 0; }
    u.velocity.y = ai.vy;

    // facing
    const t = ai.target;
    let wantYaw = u.yaw, turn = 8;
    if (ai.mode === 'panic' || ai.mode === 'unarmed') {
      if (ai.speedNow > 0.3) wantYaw = Math.atan2(u.velocity.x, u.velocity.z);
      wantYaw += Math.sin(now * 9 + u.id) * 0.5; turn = 12;
    } else if (t?.alive && (ai.fire || ai.throwT > 0)) {
      wantYaw = Math.atan2(t.position.x - px, t.position.z - pz);
    } else if (ai.speedNow > 0.4) wantYaw = Math.atan2(u.velocity.x, u.velocity.z);
    let dy = wantYaw - u.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const mx = turn * dt;
    u.yaw += Math.max(-mx, Math.min(mx, dy));
    if (!(ai.fire && t)) u.pitch *= 1 - Math.min(1, dt * 4);

    // throwing
    if (ai.throwT > 0) {
      ai.throwT -= dt;
      if (!ai.thrown && ai.throwT <= 0.2) {
        ai.thrown = true;
        const ws = u.weapons[ai.throwIdx];
        if (ws && combat?.tryFire) {
          const prev = u.weaponIndex; u.weaponIndex = ai.throwIdx;
          ws.cooldown = 0; ws.reloading = 0; if (ws.ammo <= 0) { ws.ammo = 1; if (ws.reserve > 0) ws.reserve--; }
          u.eyePosition(eye);
          if (t?.alive) ai.throwAt.lerp(t.position, 0.5);
          ai.throwAt.x += rnd(-1.5, 1.5); ai.throwAt.z += rnd(-1.5, 1.5);
          lobDir(eye, ai.throwAt, ws.def.speed || 18, dir);
          u.pitch = Math.asin(dir.y);
          combat.tryFire(u, ws, eye.clone(), dir.clone(), { extraSpread: 0.02, target: { position: ai.throwAt } });
          u.weaponIndex = prev;
        }
      }
      if (ai.throwT <= 0) ai.throwT = 0;
    } else if (ai.fire && ai.burst > 0 && t?.alive && ai.aimHold <= 0 && Math.abs(dy) < 0.35) {
      fireShot(u, u.weapon, t);
    }
    const ws = u.weapon;
    if (ws && ws.reloading > 0 && !ai.wasReloading) barker.bark(u, 'reload', { chance: 0.12 });
    ai.wasReloading = !!(ws && ws.reloading > 0);

    // anim
    const an = u.anim;
    let st;
    if (ai.mode === 'panic' || (ai.mode === 'unarmed' && ai.speedNow > 1)) st = 'panic';
    else if (ai.crawling || ai.stance === 'prone') st = 'prone';
    else if (ai.throwT > 0) st = 'throw';
    else if (ai.speedNow > 0.8) st = 'run';
    else if (ai.stance === 'crouch') st = 'crouch';
    else if (t && ai.fire) st = 'aim';
    else st = 'idle';
    if (st !== an.state) { an.state = st; if (st === 'throw') an.phase = 0; }
    if (st === 'run') an.phase += dt * ai.speedNow * 1.9;
    else if (st === 'prone') an.phase += dt * (0.5 + ai.speedNow * 4);
    else if (st === 'panic') an.phase += dt * 14;
    else if (st === 'throw') an.phase = Math.min(1, an.phase + dt / 0.6);
    else an.phase += dt * 1.5;
    an.throwT = ai.throwT;
  }

  return { initBrain, think, steer, pickTarget, lobDir };
}
