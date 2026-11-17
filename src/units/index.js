import * as THREE from 'three';
import { Soldier } from './soldier.js';
import { TEAMS } from '../core/config.js';
import { CLASS_IDS } from '../core/classes.js';

// SKELETON units/AI/waves. The Units team replaces this with squads, cover, flanking, huge waves.
export function createUnits(game) {
  const list = [];
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  let wave = 0, waveTimer = 3, waveActive = false;

  const api = {
    list,
    get wave() { return wave; },
    spawn(opts) { const s = new Soldier(game, opts); list.push(s); game.events.emit('unit:spawned', { unit: s }); return s; },
    // Living units within radius of pos, optional filter.
    query(pos, radius, filter) {
      const out = [], r2 = radius * radius;
      for (const u of list) if (u.alive && u.position.distanceToSquared(pos) <= r2 && (!filter || filter(u))) out.push(u);
      return out;
    },
    nearestEnemy(unit, maxDist = 150) {
      let best = null, bd = maxDist * maxDist;
      for (const u of list) {
        if (!u.alive || u.team === unit.team) continue;
        const d = u.position.distanceToSquared(unit.position);
        if (d < bd) { bd = d; best = u; }
      }
      return best;
    },
    countAlive(team) { let n = 0; for (const u of list) if (u.alive && u.team === team) n++; return n; },
    reset() {
      for (const u of list) if (u.model) game.scene.remove(u.model.root);
      list.length = 0; wave = 0; waveTimer = 3; waveActive = false;
    },
    update(dt) {
      if (!waveActive) {
        waveTimer -= dt;
        if (waveTimer <= 0) startWave(++wave);
      } else if (api.countAlive('tan') === 0) {
        waveActive = false; waveTimer = 6; game.events.emit('wave:cleared', { wave });
      }
      for (const u of list) {
        if (!u.alive || u.isPlayer) continue;
        think(u, dt);
        u.syncModel(dt);
      }
      // drop dead units from the active list (bodies system owns corpses)
      for (let i = list.length - 1; i >= 0; i--) if (!list[i].alive && !list[i].isPlayer) list.splice(i, 1);
    },
  };

  function startWave(n) {
    waveActive = true;
    const tanCount = 6 + n * 4, greenCount = 4 + n;
    for (let i = 0; i < tanCount; i++) {
      const sp = game.world.spawnPoints.tan[i % game.world.spawnPoints.tan.length];
      api.spawn({ team: 'tan', classId: CLASS_IDS[i % CLASS_IDS.length], position: sp.clone().add(tmp.set((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 6)) });
    }
    const greens = api.countAlive('green');
    for (let i = greens; i < greenCount; i++) {
      const sp = game.world.spawnPoints.green[i % game.world.spawnPoints.green.length];
      api.spawn({ team: 'green', classId: CLASS_IDS[i % CLASS_IDS.length], position: sp.clone().add(tmp.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 4)) });
    }
    game.events.emit('wave:start', { wave: n, enemies: tanCount });
  }

  function think(u, dt) {
    const ai = u.ai || (u.ai = { target: null, retarget: 0, burst: 0 });
    ai.retarget -= dt;
    if (ai.retarget <= 0 || !ai.target?.alive) { ai.target = api.nearestEnemy(u); ai.retarget = 0.5 + Math.random() * 0.5; }
    const ws = u.weapon; game.combat.tickWeapon(ws, dt);
    const goal = ai.target ? ai.target.position : (u.team === 'tan' ? game.world.objective.position : null);
    let moving = false;
    if (goal) {
      tmp.copy(goal).sub(u.position); tmp.y = 0; const dist = tmp.length();
      u.yaw = Math.atan2(tmp.x, tmp.z);
      if (dist > ws.def.aiRange * 0.8) {
        tmp.normalize(); u.position.addScaledVector(tmp, u.cls.speed * 0.8 * dt); moving = true;
        game.world.resolveCircle(u.position, u.radius);
      }
      if (ai.target && dist < ws.def.aiRange * 1.4) {
        const eye = u.eyePosition(tmp2);
        const aim = ai.target.position.clone(); aim.y += 1.2;
        const d = aim.sub(eye).normalize();
        u.pitch = Math.asin(d.y);
        if (game.world.hasLineOfSight(eye, ai.target.eyePosition())) game.combat.tryFire(u, ws, eye, d, { extraSpread: ws.def.aiSpread });
      }
    }
    u.anim.state = moving ? 'run' : 'aim';
    u.anim.phase += dt * (moving ? 10 : 0);
  }

  game.events.on('game:start', () => api.reset());
  return api;
}
