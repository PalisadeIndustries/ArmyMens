import * as THREE from 'three';
import { OFFICERS } from './barks.js';

// Wave director: intermissions, escalating tan waves dripping in from several spawn points, special waves,
// green reinforcements, the flag (objective) hold timer, and per-match stats.

export const SPECIALS = {
  flamerRush:     { title: 'FLAMER RUSH', sub: 'Smell that? Hot glue and bad intentions.', mix: { flamer: 0.55, rifleman: 0.25, grenadier: 0.2 }, order: 'charge', size: 1.0 },
  sniperLine:     { title: 'SNIPER LINE', sub: 'Glints in the grass. Keep your head down.', mix: { sniper: 0.45, rifleman: 0.3, grenadier: 0.15, bazooka: 0.1 }, formation: 'line', size: 0.9 },
  bazookaBarrage: { title: 'BAZOOKA BARRAGE', sub: 'Tubes up. Confetti incoming.', mix: { bazooka: 0.45, rifleman: 0.35, grenadier: 0.2 }, size: 1.0 },
  grenadeParty:   { title: 'PINEAPPLE PARTY', sub: 'Every one of them brought a pineapple.', mix: { grenadier: 0.65, rifleman: 0.35 }, size: 1.05 },
  blitz:          { title: 'BEIGE BLITZ', sub: 'They\'re not stopping. At all.', mix: null, order: 'charge', size: 1.25 },
  boss:           { title: 'OFFICER INBOUND', sub: '', mix: null, size: 1.0, boss: true },
};
const ROTATION = ['flamerRush', 'sniperLine', 'bazookaBarrage', 'grenadeParty'];

export function specialFor(n) {
  if (n % 5 === 0) return 'boss';
  if (n >= 3 && n % 5 === 3) return ROTATION[Math.floor((n - 3) / 5) % ROTATION.length];
  if (n >= 7 && n % 5 === 1) return 'blitz';
  return null;
}

export function createDirector(ctx) {
  const { game } = ctx;
  const tune = ctx.tune;
  const tmp = new THREE.Vector3();
  let spawnRot = 0, greenRot = 0, officerRot = 0;

  const d = {
    wave: 0, phase: 'intermission', timer: tune.firstWaveDelay, lastIncoming: -1,
    total: 0, toSpawn: 0, dripT: 0, special: null, forceCharge: false, waveTime: 0,
    greenDripT: 0, boss: null, objective: { progress: 0, tan: 0, green: 0 }, objectiveThreat: false,
    objEmitT: 0, objBarkT: 0, lost: false,
  };

  const waveTotal = (n) => Math.round((tune.wave1 + (n - 1) * 11 + (n - 1) * (n - 1) * 1.1) * (SPECIALS[specialFor(n)]?.size ?? 1));
  const waveCap = (n) => Math.min(tune.maxTan, 26 + n * 16);
  const greenTarget = (n) => Math.min(tune.maxGreen, 7 + n * 3);

  function pickClass(mix, n) {
    const m = mix || {
      rifleman: Math.max(0.3, 0.55 - n * 0.025), grenadier: 0.16,
      bazooka: n >= 2 ? 0.11 : 0.04, flamer: n >= 2 ? 0.1 : 0.03, sniper: n >= 2 ? 0.1 : 0.05,
    };
    let s = 0; for (const k in m) s += m[k];
    let r = Math.random() * s;
    for (const k in m) { r -= m[k]; if (r <= 0) return k; }
    return 'rifleman';
  }

  function tanSpawnPoint() {
    const pts = game.world?.spawnPoints?.tan;
    if (!pts?.length) return ctx.zero;
    const player = ctx.player();
    for (let tries = 0; tries < pts.length; tries++) {
      const p = pts[spawnRot++ % pts.length];
      if (!player?.alive || Math.hypot(player.position.x - p.x, player.position.z - p.z) > 25) return p;
    }
    return pts[spawnRot++ % pts.length];
  }

  function spawnTanSquad(size, opts = {}) {
    const n = d.wave;
    const sp = opts.at || tanSpawnPoint();
    const spec = SPECIALS[d.special];
    const classes = [];
    for (let i = 0; i < size; i++) classes.push(opts.classId || pickClass(opts.mix ?? spec?.mix, n));
    // leaders are riflemen/grenadiers where possible
    const li = classes.findIndex((c) => c === 'rifleman' || c === 'grenadier');
    if (li > 0) { const t = classes[0]; classes[0] = classes[li]; classes[li] = t; }
    const order = opts.order || (d.forceCharge ? 'charge' : spec?.order) || 'advance';
    return ctx.spawnSquad({ team: 'tan', classes, at: sp, order, formation: opts.formation || spec?.formation, special: d.special, officer: opts.officer });
  }

  function spawnBoss() {
    const o = OFFICERS[officerRot++ % OFFICERS.length];
    const n = d.wave;
    const sp = tanSpawnPoint();
    const sq = ctx.spawnSquad({
      team: 'tan', classes: ['grenadier', 'rifleman', 'rifleman', 'bazooka', 'rifleman', 'grenadier', 'flamer', 'rifleman'],
      at: sp, order: 'advance', special: 'boss',
      officer: { classId: 'grenadier', hp: tune.bossHp + n * tune.bossHpPerWave, scale: 1.45, name: o.name },
    });
    const boss = sq?.officer;
    if (boss) {
      d.boss = boss;
      boss.isBoss = true;
      ctx.stats.bosses++;
      game.events.emit('wave:boss', { unit: boss, name: o.name, title: o.title, sub: o.sub, wave: n });
      ctx.barker.bark(boss, 'boss', { force: true });
    }
    return sq;
  }

  function spawnGreenSquad(size) {
    const pts = game.world?.spawnPoints?.green;
    if (!pts?.length) return null;
    const sp = pts[greenRot++ % pts.length];
    let hold = 0, escort = 0;
    for (const s of ctx.squads.list) if (s.team === 'green') { if (s.order === 'hold') hold++; else if (s.order === 'escort') escort++; }
    const player = ctx.player();
    let order = 'front';
    if (hold < 2) order = 'hold';
    else if (escort < 1 && player?.alive) order = 'escort';
    else if (hold < 4 && Math.random() < 0.35) order = 'hold';
    const classes = [];
    for (let i = 0; i < size; i++) classes.push(pickClass({ rifleman: 0.45, grenadier: 0.18, bazooka: 0.13, sniper: 0.12, flamer: 0.12 }, d.wave));
    if (classes[0] !== 'rifleman') classes[0] = 'rifleman';
    const sq = ctx.spawnSquad({ team: 'green', classes, at: sp, order });
    if (sq?.leader && d.wave > 0) ctx.barker.bark(sq.leader, 'reinforce', { chance: 0.35 });
    return sq;
  }

  function startWave() {
    const n = ++d.wave;
    d.phase = 'active'; d.waveTime = 0; d.forceCharge = false; d.boss = null;
    d.special = specialFor(n);
    d.total = waveTotal(n); d.toSpawn = d.total;
    const spec = SPECIALS[d.special];
    ctx.stats.wave = n;
    const cap = waveCap(n);
    let burst = Math.min(d.toSpawn, Math.round(cap * 0.5));
    if (spec?.boss) { const sq = spawnBoss(); if (sq) { d.toSpawn -= sq.members.length; burst -= sq.members.length; } }
    while (burst > 0 && d.toSpawn > 0) {
      const sz = Math.min(d.toSpawn, squadSize(n));
      spawnTanSquad(sz); d.toSpawn -= sz; burst -= sz;
    }
    d.dripT = 2;
    const title = spec?.boss ? (d.boss ? OFFICERS[(officerRot - 1) % OFFICERS.length].title : spec.title) : spec?.title || null;
    game.events.emit('wave:start', { wave: n, enemies: d.total, special: d.special, title, sub: spec?.boss ? OFFICERS[(officerRot - 1) % OFFICERS.length].sub : spec?.sub || null, cap });
  }

  const squadSize = (n) => Math.min(12, 4 + Math.floor(Math.random() * (3 + n * 0.6)));

  function updateObjective(dt) {
    const obj = game.world?.objective;
    if (!obj?.position) return;
    const O = obj.position, r = obj.radius || 6;
    const tanIn = ctx.grid.count(O.x, O.z, r, 'tan');
    const greenIn = ctx.grid.count(O.x, O.z, r, 'green');
    const o = d.objective;
    const prev = o.progress;
    let rate;
    if (tanIn > 0 && tanIn > greenIn) rate = (1 / tune.objectiveHold) * Math.min(1.6, 0.7 + 0.15 * (tanIn - greenIn));
    else if (tanIn > 0) rate = 0;  // contested: frozen
    else rate = -1 / (tune.objectiveHold * 0.6);
    o.progress = Math.max(0, Math.min(1, o.progress + rate * dt));
    o.tan = tanIn; o.green = greenIn;
    d.objectiveThreat = tanIn > 0 || ctx.grid.count(O.x, O.z, r + 18, 'tan') > 2;
    d.objEmitT -= dt;
    if ((o.progress > 0 || prev > 0 || tanIn > 0) && d.objEmitT <= 0) {
      d.objEmitT = 0.25;
      game.events.emit('objective:contested', { progress: o.progress, tan: tanIn, green: greenIn, contested: tanIn > 0 && greenIn > 0 });
    }
    ctx.stats.objectiveMax = Math.max(ctx.stats.objectiveMax, o.progress);
    if (tanIn > 0 && game.time > d.objBarkT) {
      d.objBarkT = game.time + 6;
      const g = ctx.nearest(O.x, O.z, 60, 'green', ctx.player());
      if (g) ctx.barker.bark(g, 'objective', { force: true });
      const t = ctx.nearest(O.x, O.z, r + 2, 'tan');
      if (t && Math.random() < 0.5) ctx.barker.bark(t, 'objective');
    }
    if (o.progress >= 1 && !d.lost) {
      d.lost = true;
      game.events.emit('objective:lost', { wave: d.wave });
      game.gameOver({ reason: 'objective', wave: d.wave, stats: ctx.stats });
    }
  }

  d.update = function (dt) {
    const tanAlive = ctx.teamCount.tan, greenAlive = ctx.teamCount.green - (ctx.player()?.alive ? 1 : 0);
    // green reinforcements
    d.greenDripT -= dt;
    const gTarget = greenTarget(Math.max(1, d.wave));
    if (d.greenDripT <= 0 && greenAlive < gTarget && ctx.liveAI() < tune.maxLive) {
      const deficit = gTarget - greenAlive;
      spawnGreenSquad(Math.min(deficit, 3 + Math.floor(Math.random() * 3)));
      d.greenDripT = d.phase === 'intermission' || greenAlive < gTarget * 0.5 ? 1.5 : Math.max(3, 7 - d.wave * 0.3);
    }

    if (d.phase === 'intermission') {
      d.timer -= dt;
      const sec = Math.max(0, Math.ceil(d.timer));
      if (sec !== d.lastIncoming) { d.lastIncoming = sec; { const sp = specialFor(d.wave + 1); game.events.emit('wave:incoming', { wave: d.wave + 1, in: sec, special: sp, title: sp === 'boss' ? 'OFFICER INBOUND' : SPECIALS[sp]?.title || null }); } }
      if (d.timer <= 0) startWave();
    } else {
      d.waveTime += dt;
      // reinforcement drip
      d.dripT -= dt;
      const cap = waveCap(d.wave);
      if (d.toSpawn > 0 && d.dripT <= 0) {
        const sz = Math.min(d.toSpawn, squadSize(d.wave));
        if (tanAlive + sz <= cap && ctx.liveAI() + sz <= tune.maxLive) { spawnTanSquad(sz); d.toSpawn -= sz; }
        d.dripT = Math.max(1.0, 3.2 - d.wave * 0.15) * (0.7 + Math.random() * 0.6);
      }
      // mop-up: stragglers charge
      if (!d.forceCharge && d.toSpawn === 0 && (tanAlive <= Math.max(3, Math.ceil(d.total * 0.06)) || d.waveTime > 160 + d.wave * 12)) {
        d.forceCharge = true;
        for (const s of ctx.squads.list) if (s.team === 'tan') s.setOrder('charge');
      }
      // armless stragglers just run around screaming; they don't hold the wave open
      if (d.toSpawn === 0 && (tanAlive === 0 || ctx.teamCount.tanArmed === 0)) {
        d.phase = 'intermission';
        d.timer = tune.intermission + Math.min(6, d.wave * 0.5);
        d.lastIncoming = -1;
        ctx.stats.wavesCleared = d.wave;
        game.events.emit('wave:cleared', { wave: d.wave, time: d.waveTime, kills: ctx.stats.kills.green });
      }
    }
    updateObjective(dt);
  };

  d.reset = function () {
    d.wave = 0; d.phase = 'intermission'; d.timer = tune.firstWaveDelay; d.lastIncoming = -1;
    d.total = 0; d.toSpawn = 0; d.special = null; d.forceCharge = false; d.boss = null; d.lost = false;
    d.objective.progress = 0; d.objective.tan = 0; d.objective.green = 0; d.objectiveThreat = false;
    d.greenDripT = 0.5; d.objBarkT = 0; spawnRot = 0; greenRot = 0;
  };
  d.skipTo = function (n) { d.wave = Math.max(0, n - 1); d.phase = 'intermission'; d.timer = 0.01; };
  d.spawnTanSquad = spawnTanSquad;
  d.spawnBoss = spawnBoss;
  d.waveTotal = waveTotal; d.waveCap = waveCap; d.greenTarget = greenTarget;
  return d;
}
