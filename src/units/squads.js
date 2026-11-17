import * as THREE from 'three';

// Squads: a leader + members moving in formation under a shared order.
// Tan orders:   'advance' (follow lane toward the flag), 'flank', 'charge', 'retreat'.
// Green orders: 'hold' (dig in around the flag), 'front' (forward line), 'escort' (tag along with the player), 'retreat'.
let nextSquadId = 1;

export class Squad {
  constructor(team, order = 'advance') {
    this.id = nextSquadId++;
    this.team = team;
    this.members = [];
    this.leader = null;
    this.officer = null;
    this.order = order;
    this.orderT = 0;
    this.goal = new THREE.Vector3();
    this.heading = new THREE.Vector3(0, 0, team === 'tan' ? -1 : 1);
    this.formation = 'wedge';
    this.lane = null;
    this.wp = 0;
    this.initial = 0;
    this.flankSide = Math.random() < 0.5 ? -1 : 1;
    this.flanked = false;
    this.retreated = false;
    this.engagedT = 0;
    this.thinkT = Math.random() * 0.5;
    this.post = null;     // green: defensive post
    this.special = null;  // wave special id
    this.dead = false;
    this.spread = 2.2;
  }
  add(u, index) { this.members.push(u); u.squad = this; u.ai && (u.ai.slot = index ?? this.members.length - 1); this.initial++; }
  setOrder(o) { if (this.order !== o) { this.order = o; this.orderT = 0; } }
  get strength() { return this.initial ? this.members.length / this.initial : 0; }
}

// Formation slot offset for member index i (leader = 0): returns [lateral, back].
export function slotOffset(formation, i, spread) {
  if (i === 0) return [0, 0];
  if (formation === 'line') { const k = Math.ceil(i / 2), s = i % 2 ? -1 : 1; return [s * k * spread * 1.3, 0.5 * (i % 3)]; }
  if (formation === 'column') return [(i % 2 ? -0.6 : 0.6), i * spread * 0.9];
  // wedge
  const row = Math.ceil(i / 2), side = i % 2 ? -1 : 1;
  return [side * row * spread, row * spread * 0.85];
}

export function createSquads(ctx) {
  const { game } = ctx;
  const squads = [];
  const tmp = new THREE.Vector3();

  function objective() { return game.world?.objective?.position || ctx.zero; }

  function promote(sq) {
    const prev = sq.leader;
    let best = null;
    if (sq.officer?.alive) best = sq.officer;
    else for (const m of sq.members) {
      if (!m.alive) continue;
      const ok = m.limbs.rarm !== false && (m.limbs.lleg !== false || m.limbs.rleg !== false);
      if (!best || (ok && !best._okLead)) { best = m; best._okLead = ok; }
    }
    sq.leader = best;
    if (best) {
      // re-slot members so the formation closes up
      let k = 1; for (const m of sq.members) if (m !== best && m.ai) m.ai.slot = k++;
      if (best.ai) best.ai.slot = 0;
      if (prev && sq.members.length >= 2) ctx.barker.bark(best, 'promote', { chance: 0.6 });
    }
  }

  function engaged(sq) {
    for (const m of sq.members) if (m.ai?.target && m.ai.los) return true;
    return false;
  }

  function laneGoal(sq, out) {
    const O = objective();
    const L = sq.leader.position;
    if (sq.lane && sq.wp < sq.lane.length) {
      const p = sq.lane[sq.wp];
      const dl = Math.hypot(p.x - L.x, p.z - L.z);
      // advance when close, or when already nearer the flag than this waypoint
      const dO = Math.hypot(O.x - L.x, O.z - L.z), dpO = Math.hypot(O.x - p.x, O.z - p.z);
      if (dl < 7 || dO < dpO - 3) sq.wp++;
      if (sq.wp < sq.lane.length) return out.copy(sq.lane[sq.wp]);
    }
    return out.copy(O);
  }

  function thinkTan(sq, dt) {
    const O = objective();
    const L = sq.leader.position;
    const dO = Math.hypot(O.x - L.x, O.z - L.z);
    const officerUp = sq.officer?.alive;
    if (sq.order === 'retreat') {
      if (sq.orderT > (sq.retreatDur || 6)) {
        sq.setOrder('charge');
        ctx.barker.bark(sq.leader, 'charge', { force: true });
      }
    } else if (ctx.director?.forceCharge && sq.order !== 'charge') {
      sq.setOrder('charge'); ctx.barker.bark(sq.leader, 'charge', { chance: 0.6 });
    } else if (sq.strength < 0.35 && sq.initial >= 4 && !sq.retreated && !officerUp && sq.order !== 'charge' && Math.random() < 0.5) {
      sq.setOrder('retreat'); sq.retreated = true; sq.retreatDur = 4 + Math.random() * 4;
      ctx.barker.bark(sq.leader, 'retreat', { force: true });
    } else if (dO < 30 && sq.order !== 'charge') {
      sq.setOrder('charge'); ctx.barker.bark(sq.leader, 'charge', { chance: 0.7 });
    } else if (sq.order === 'flank') {
      const dg = Math.hypot(sq.goal.x - L.x, sq.goal.z - L.z);
      if (sq.orderT > 14 || dg < 6) sq.setOrder(Math.random() < 0.6 ? 'charge' : 'advance');
    } else if (sq.order === 'advance' && sq.engagedT > 5 && sq.members.length >= 4 && !sq.flanked && Math.random() < 0.08) {
      // swing wide around the fight
      const t = sq.leader.ai?.target;
      const fx = (t ? t.position.x : O.x) - L.x, fz = (t ? t.position.z : O.z) - L.z;
      const fl = Math.hypot(fx, fz) || 1;
      const rx = fz / fl * sq.flankSide, rz = -fx / fl * sq.flankSide;
      const off = 18 + Math.random() * 10;
      sq.goal.set(L.x + fx * 0.75 + rx * off, 0, L.z + fz * 0.75 + rz * off);
      ctx.clampToBounds(sq.goal);
      sq.flanked = true; sq.setOrder('flank');
      ctx.barker.bark(sq.leader, 'flank', { chance: 0.8 });
    }
    if (sq.order === 'advance' || sq.order === 'charge') {
      if (sq.order === 'charge' && dO < 40) sq.goal.copy(O); else laneGoal(sq, sq.goal);
    } else if (sq.order === 'retreat') {
      const sp = ctx.spawnCentroid('tan');
      tmp.set(sp.x - L.x, 0, sp.z - L.z); const l = tmp.length() || 1;
      sq.goal.set(L.x + tmp.x / l * 20, 0, L.z + tmp.z / l * 20); ctx.clampToBounds(sq.goal);
    }
  }

  function thinkGreen(sq, dt) {
    const O = objective();
    const L = sq.leader.position;
    const player = game.player?.unit;
    if (sq.order === 'retreat') {
      if (sq.orderT > 9) { sq.setOrder('hold'); sq.post = ctx.greenPost('hold'); }
      sq.goal.copy(O);
    } else if (sq.order === 'escort') {
      if (!player?.alive) { sq.setOrder('hold'); sq.post = ctx.greenPost('hold'); }
      else {
        const yaw = player.yaw;
        sq.goal.set(player.position.x - Math.sin(yaw) * 5, 0, player.position.z - Math.cos(yaw) * 5);
        ctx.clampToBounds(sq.goal);
      }
    } else {
      if (sq.strength < 0.3 && sq.initial >= 3 && sq.order === 'front' && !sq.retreated) {
        sq.setOrder('retreat'); sq.retreated = true; ctx.barker.bark(sq.leader, 'retreat', { force: true });
      }
      // flag under threat: everybody near falls back to it
      if (ctx.director?.objectiveThreat && sq.order === 'front' && Math.hypot(O.x - L.x, O.z - L.z) < 60 && Math.random() < 0.25) {
        sq.setOrder('hold'); sq.post = ctx.greenPost('hold');
      }
      if (!sq.post) sq.post = ctx.greenPost(sq.order);
      sq.goal.copy(sq.post);
    }
  }

  const api = {
    list: squads,
    create(team, order) { const s = new Squad(team, order); squads.push(s); return s; },
    update(dt) {
      for (let i = squads.length - 1; i >= 0; i--) {
        const sq = squads[i];
        // prune members every frame (cheap), think twice a second
        let w = 0;
        for (let j = 0; j < sq.members.length; j++) { const m = sq.members[j]; if (m.alive) sq.members[w++] = m; else if (m.squad === sq) m.squad = null; }
        sq.members.length = w;
        if (w === 0) { sq.dead = true; squads.splice(i, 1); continue; }
        if (!sq.leader?.alive || sq.leader.squad !== sq) promote(sq);
        sq.orderT += dt;
        sq.thinkT -= dt;
        if (sq.thinkT > 0) continue;
        sq.thinkT = 0.5;
        sq.engagedT = engaged(sq) ? sq.engagedT + 0.5 : Math.max(0, sq.engagedT - 1);
        if (sq.team === 'tan') thinkTan(sq, 0.5); else thinkGreen(sq, 0.5);
        const L = sq.leader.position;
        const hx = sq.goal.x - L.x, hz = sq.goal.z - L.z, hl = Math.hypot(hx, hz);
        if (hl > 2) sq.heading.set(hx / hl, 0, hz / hl);
      }
    },
    // World-space formation slot for a member.
    slotPosition(sq, u, out) {
      const i = u.ai?.slot ?? 0;
      if (sq.post && (sq.order === 'hold' || sq.order === 'front')) {
        // spread individually around the post, perpendicular to the threat axis
        const [lat, back] = slotOffset('line', i, 2.6);
        const h = ctx.threatAxis;
        return out.set(sq.post.x + h.z * lat - h.x * back * 0.3, 0, sq.post.z - h.x * lat - h.z * back * 0.3);
      }
      if (u === sq.leader) return out.copy(sq.goal);
      const [lat, back] = slotOffset(sq.formation, i, sq.spread);
      const L = sq.leader.position, h = sq.heading;
      return out.set(L.x + h.z * lat - h.x * back, 0, L.z - h.x * lat - h.z * back);
    },
    reset() { for (const s of squads) s.dead = true; squads.length = 0; },
  };
  return api;
}
