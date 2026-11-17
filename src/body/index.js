import * as THREE from 'three';
import { TEAMS } from '../core/config.js';

// SKELETON body system. The Body/Damage team replaces this with dismemberment, melting, persistent corpses.
// Contract (see CONTRACTS.md): createSoldierModel, poseModel, hitTest, applyDamage, update.

const ZONE_MULT = { head: 2.5, torso: 1, larm: 0.6, rarm: 0.6, lleg: 0.7, rleg: 0.7 };

export function createBodies(game) {
  const matCache = new Map();
  const mat = (team) => {
    if (!matCache.has(team)) matCache.set(team, new THREE.MeshStandardMaterial({ color: TEAMS[team].color, roughness: 0.45, metalness: 0.0 }));
    return matCache.get(team);
  };
  const geo = {
    head: new THREE.SphereGeometry(0.15, 10, 8),
    torso: new THREE.BoxGeometry(0.44, 0.6, 0.26),
    arm: new THREE.BoxGeometry(0.12, 0.55, 0.12),
    leg: new THREE.BoxGeometry(0.15, 0.8, 0.15),
  };
  const corpses = [];

  function part(g, m, x, y, z, root, name) {
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.name = name;
    const pivot = new THREE.Group(); pivot.position.set(x, y, z); pivot.name = name;
    pivot.add(mesh); root.add(pivot); return { pivot, mesh };
  }

  return {
    corpses,
    // Returns { root: Group, parts: { head, torso, larm, rarm, lleg, rleg } (each a pivot Group), weaponMount: Object3D }
    createSoldierModel(team, classId) {
      const root = new THREE.Group();
      const m = mat(team);
      const parts = {};
      const torso = part(geo.torso, m, 0, 1.15, 0, root, 'torso'); parts.torso = torso.pivot;
      const head = part(geo.head, m, 0, 1.6, 0, root, 'head'); parts.head = head.pivot;
      const la = part(geo.arm, m, -0.3, 1.42, 0, root, 'larm'); la.mesh.position.y = -0.27; parts.larm = la.pivot;
      const ra = part(geo.arm, m, 0.3, 1.42, 0, root, 'rarm'); ra.mesh.position.y = -0.27; parts.rarm = ra.pivot;
      const ll = part(geo.leg, m, -0.11, 0.82, 0, root, 'lleg'); ll.mesh.position.y = -0.4; parts.lleg = ll.pivot;
      const rl = part(geo.leg, m, 0.11, 0.82, 0, root, 'rleg'); rl.mesh.position.y = -0.4; parts.rleg = rl.pivot;
      const weaponMount = new THREE.Group(); weaponMount.position.set(0, -0.5, 0.1); parts.rarm.add(weaponMount);
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.7), m); gun.position.z = 0.25; weaponMount.add(gun);
      return { root, parts, weaponMount, team, classId };
    },
    // anim: { state: 'idle'|'run'|'aim'|'crouch'|'prone', phase: number, aimPitch: radians }
    poseModel(model, anim) {
      const s = Math.sin(anim.phase || 0) * (anim.state === 'run' ? 0.8 : 0);
      model.parts.lleg.rotation.x = s; model.parts.rleg.rotation.x = -s;
      model.parts.larm.rotation.x = -1.2; model.parts.rarm.rotation.x = -1.3 - (anim.aimPitch || 0);
    },
    // Ray vs unit body zones. Returns { zone, point, dist } or null. Coarse in skeleton: capsule-ish boxes.
    hitTest(unit, origin, dir, maxDist) {
      const p = unit.position;
      const zones = [
        ['head', 1.6, 0.2], ['torso', 1.15, 0.32], ['lleg', 0.45, 0.25],
      ];
      let best = null;
      const v = new THREE.Vector3();
      for (const [zone, y, r] of zones) {
        v.set(p.x, p.y + y * (unit.crouchScale ?? 1), p.z).sub(origin);
        const t = v.dot(dir);
        if (t < 0 || t > maxDist) continue;
        const d2 = v.lengthSq() - t * t;
        if (d2 < r * r && (!best || t < best.dist)) best = { zone, dist: t, point: origin.clone().addScaledVector(dir, t) };
      }
      return best;
    },
    // info: { amount, type: 'bullet'|'explosive'|'fire'|'melee', zone?, point?, dir?, force?, source? }
    // Returns { damage, killed, limbLost: zone|null }
    applyDamage(unit, info) {
      if (!unit.alive) return { damage: 0, killed: false, limbLost: null };
      const dmg = info.amount * (info.zone ? ZONE_MULT[info.zone] ?? 1 : 1);
      unit.hp -= dmg;
      game.events.emit('unit:damaged', { unit, info, damage: dmg });
      if (unit.hp <= 0) {
        unit.alive = false;
        this.spawnCorpse(unit, info);
        game.events.emit('unit:killed', { unit, killer: info.source || null, info });
        return { damage: dmg, killed: true, limbLost: null };
      }
      return { damage: dmg, killed: false, limbLost: null };
    },
    // Called when a unit dies: take ownership of unit.model.root and leave it in the world as a corpse.
    spawnCorpse(unit, info) {
      const root = unit.model?.root; if (!root) return;
      root.rotation.x = -Math.PI / 2; root.position.y = 0.15;
      corpses.push({ root });
      unit.model = null; // units system must not touch the model after death
    },
    update(dt) {},
  };
}
