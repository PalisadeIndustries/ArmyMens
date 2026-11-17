// "Moxie director": match stats, killstreak announcer logic, auto radio chatter, and fallback bridges that
import { pickBark } from '../audio/barks.js';
// synthesize player:hitmarker / player:hit from unit:damaged when the combat/player teams don't emit them.
const STREAKS = { 3: 'PLASTIC SURGEON', 5: 'TOY STORY!', 7: 'MELTDOWN!', 10: 'RECALL NOTICE!', 13: 'CHOKING HAZARD!', 16: 'SOME ASSEMBLY REQUIRED',
  20: 'BATTERIES NOT INCLUDED', 25: 'FACTORY RESET', 30: 'LIMITED EDITION', 40: 'COLLECTOR\'S ITEM', 50: 'ONE-MAN TOY BOX' };
const STREAK_SUBS = ['KILLING SPREE', 'STILL MOLDED', 'UNSTOPPABLE', 'NOT DISHWASHER SAFE', 'BEIGE BEWARE'];
const MULTI = { 2: 'DOUBLE TAP!', 3: 'TRIPLE PACK!', 4: 'FAMILY SIZE!', 5: 'BULK DISCOUNT!', 6: 'CLEARANCE SALE!', 8: 'EVERYTHING MUST GO!' };

export function createMoxie(game, hooks) {
  const ev = game.events;
  const pu = () => game.player?.unit;
  const stats = {};
  function resetStats() {
    Object.assign(stats, { kills: 0, headshots: 0, limbs: 0, limbsTotal: 0, melted: 0, meltedTotal: 0, exploded: 0, deaths: 0, shots: 0, hits: 0,
      bestStreak: 0, streak: 0, wavesCleared: 0, maxWave: 0, startTime: game.time, killsTotal: 0, multi: 0, lastKillT: -99 });
  }
  resetStats();

  const bark = (unit, kind, text) => game.audio?.bark ? game.audio.bark(unit, kind, text) : ev.emit('bark', { unit, kind, text: text || pickBark(kind, unit?.team) });
  let lastAuto = -99, nextChatter = 8, selfEmit = false, externalT = -99;
  // units team runs its own soldier barker; if it's active we only add radio/HQ chatter, not soldier lines
  ev.on('bark', () => { if (!selfEmit) externalT = game.time; });
  function autoBark(unit, kind, minGap = 1.2, chance = 1) {
    if (unit && game.time - externalT < 30) return;
    if (game.time - lastAuto < minGap || Math.random() > chance) return;
    lastAuto = game.time; selfEmit = true; try { bark(unit, kind); } finally { selfEmit = false; }
  }
  const radioBark = (kind) => { selfEmit = true; try { bark(null, kind); } finally { selfEmit = false; } };
  const distToPlayer = (u) => { const p = pu(); if (!p || !u?.position) return 1e9; return p.position.distanceTo(u.position); };

  // ---- bridges (only active until the owning team emits the real event) ----
  let nativeHitmarker = false, nativeHit = false, pendingMarker = null, pendingHit = null;
  ev.on('player:hitmarker', (p) => { if (!p?.synthetic) { nativeHitmarker = true; pendingMarker = null; } stats.hits++; });
  ev.on('player:hit', (p) => { if (!p?.synthetic) { nativeHit = true; pendingHit = null; } });
  ev.on('unit:damaged', ({ unit, info, damage }) => {
    const me = pu(); if (!me || !unit) return;
    if (!nativeHitmarker && info?.source === me && unit !== me) {
      const kill = !unit.alive || unit.hp <= 0, headshot = info.zone === 'head';
      if (!pendingMarker) queueMicrotask(flushMarker);
      pendingMarker = { kill: kill || pendingMarker?.kill, headshot: headshot || pendingMarker?.headshot, synthetic: true };
    }
    if (!nativeHit && unit === me) {
      let fromDir = null; const src = info?.source?.position || info?.point;
      if (info?.source?.position) fromDir = src.clone().sub(me.position).setY(0);
      else if (info?.dir) fromDir = info.dir.clone().multiplyScalar(-1).setY(0);
      if (fromDir && fromDir.lengthSq() > 1e-6) fromDir.normalize();
      if (!pendingHit) queueMicrotask(flushHit);
      pendingHit = { unit: me, damage: (pendingHit?.damage || 0) + (damage ?? info?.amount ?? 0), fromDir, synthetic: true };
    }
  });
  function flushMarker() { if (pendingMarker && !nativeHitmarker) ev.emit('player:hitmarker', pendingMarker); pendingMarker = null; }
  function flushHit() { if (pendingHit && !nativeHit) ev.emit('player:hit', pendingHit); pendingHit = null; }

  // ---- stats & streaks ----
  ev.on('game:start', () => { resetStats(); nextChatter = 8; });
  ev.on('weapon:fire', ({ unit }) => { if (unit && unit === pu()) stats.shots++; });
  ev.on('unit:killed', ({ unit, killer, info }) => {
    const me = pu(); if (!unit) return;
    stats.killsTotal++;
    if (info?.type === 'fire') stats.meltedTotal++;
    const byMe = me && (killer === me || info?.source === me) && unit !== me;
    if (byMe && !nativeHitmarker) { if (pendingMarker) pendingMarker.kill = true; else { pendingMarker = { kill: true, headshot: info?.zone === 'head', synthetic: true }; queueMicrotask(flushMarker); } }
    if (!byMe || unit.team === me.team) {
      if (unit !== me && distToPlayer(unit) < 30) {
        if (info?.type === 'fire') autoBark(unit, 'burning', 2, 0.25);
        else autoBark(unit, 'death', 2.5, 0.15);
      }
      return;
    }
    stats.kills++; stats.streak++; stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    if (info?.zone === 'head') stats.headshots++;
    if (info?.type === 'fire') stats.melted++;
    if (info?.type === 'explosive') stats.exploded++;
    stats.multi = game.time - stats.lastKillT < 3.2 ? stats.multi + 1 : 1; stats.lastKillT = game.time;
    const s = STREAKS[stats.streak], m = MULTI[Math.min(stats.multi, 8)] || (stats.multi > 8 ? MULTI[8] : null);
    if (s) hooks.streak(s, `${stats.streak} ${STREAK_SUBS[(stats.streak / 3 | 0) % STREAK_SUBS.length]}`, true);
    else if (m) hooks.streak(m, `${stats.multi}x MULTI-KILL`, false);
    else if (info?.type === 'fire') hooks.streak('EXTRA CRISPY', '', false, true);
    else if (info?.zone === 'head' && Math.random() < 0.5) hooks.streak('POP TOP!', 'HEADSHOT', false, true);
    if (s || m) ev.emit('ui:streak', { count: stats.streak, multi: stats.multi, title: s || m });
    // a buddy cheers
    if (Math.random() < 0.2) { const buddy = game.units?.list?.find((u) => u.alive && !u.isPlayer && u.team === me.team && distToPlayer(u) < 25); if (buddy) autoBark(buddy, 'kill', 3); }
    else if (Math.random() < 0.25 && distToPlayer(unit) < 30) autoBark(unit, info?.type === 'fire' ? 'burning' : 'death', 2);
  });
  ev.on('unit:limbLost', ({ unit, info }) => {
    stats.limbsTotal++;
    if (info?.source && info.source === pu()) stats.limbs++;
    if (unit?.alive && distToPlayer(unit) < 35) autoBark(unit, 'limb', 1.5, 0.6);
  });
  ev.on('unit:ignited', ({ unit }) => { if (unit?.alive && distToPlayer(unit) < 40) autoBark(unit, 'burning', 1, 0.8); });
  ev.on('player:died', () => { stats.deaths++; stats.streak = 0; stats.multi = 0; setTimeout(() => radioBark('player_death'), 600); });
  ev.on('player:spawn', () => { if (game.time > 1) radioBark('player_spawn'); });
  ev.on('wave:start', ({ wave }) => { stats.maxWave = Math.max(stats.maxWave, wave || 0); setTimeout(() => radioBark('wave_start'), 1200); });
  ev.on('wave:cleared', () => { stats.wavesCleared++; setTimeout(() => radioBark('wave_clear'), 900); });
  let lastObjBark = -99;
  ev.on('objective:contested', () => { if (game.time - lastObjBark > 14) { lastObjBark = game.time; radioBark('objective'); } });
  let lowHpBarked = -99;

  return {
    stats,
    update(dt) {
      if (game.state !== 'playing') return;
      const me = pu();
      if (me?.alive && me.hp / (me.maxHp || 100) < 0.3 && game.time - lowHpBarked > 25) { lowHpBarked = game.time; selfEmit = true; try { bark(me, 'low_hp'); } finally { selfEmit = false; } }
      nextChatter -= dt;
      if (nextChatter <= 0 && me) {
        nextChatter = 6 + Math.random() * 8;
        const list = game.units?.list || []; let best = null, n = 0;
        for (const u of list) { if (!u.alive || u.isPlayer) continue; const d = distToPlayer(u); if (d < 40 && Math.random() < 1 / ++n) best = u; }
        if (best) {
          const kinds = best.team === me.team ? ['spotted', 'charge', 'cover', 'flank', 'taunt', 'idle'] : ['taunt', 'charge', 'spotted', 'panic'];
          autoBark(best, kinds[(Math.random() * kinds.length) | 0], 1.5);
        }
      }
    },
  };
}
