import * as THREE from 'three';
import { TEAMS } from '../core/config.js';
import { buildSoldierModel, getClassAssets, B, BONE_NAMES, BONE_ZONE, boneParent, PUDDLE_GEO } from './model.js';
import { poseModel } from './pose.js';
import { makeHitTester, nearestZone } from './hit.js';
import { createFx } from './fx.js';
import { createBatcher } from './batch.js';

// Body Damage & Corpses system (see CONTRACTS.md "Bodies").
//
// - Soldiers: one SkinnedMesh each (shared geometry per class, shared material per team).
// - Damage: zone multipliers, per-limb HP, dismemberment (bullets/explosions), plastic melting (fire).
// - Corpses: bullet deaths topple stiffly, explosion deaths tumble, fire deaths melt into a puddle; everything
//   settles and is baked into static merged chunks (a handful of draw calls for 1000+ corpses). Explosions kick
//   baked corpses/limbs back into the simulation.
//
// Fire bookkeeping (shared with combat):
//   * Combat owns ignition (combat.ignite), burn DoT ticks and flame particles. Bodies owns the visuals of burning
//     plastic: melting tint/droop, black smoke wisps, panic pose, melted corpses.
//   * Fallbacks if combat does not provide them: 'fire' damage (not info.dot / weapon:'fire') ignites for 3s and emits
//     unit:ignited; a burning unit with no 'fire' damage for 0.75s gets a fallback tick ({type:'fire', dot:true}).
//   * unit.onFire is decremented once per frame. Bodies decrements it only if nobody else did this frame: either
//     unit._fireDecAt === game.time (set it when you decrement) or the value dropped since bodies last saw it.

const ZONE_MULT = { head: 3.0, torso: 1, larm: 0.6, rarm: 0.6, lleg: 0.7, rleg: 0.7 };
const LIMB_HP_FRAC = { larm: 0.42, rarm: 0.42, lleg: 0.5, rleg: 0.5 };
const LIMB_EXTENT = { head: 0, larm: 0.26, rarm: 0.26, lleg: 0.42, rleg: 0.42 };
const CHAR = new THREE.Color(0x17120e);
const G = 18;
const UP = new THREE.Vector3(0, 1, 0);

export function createBodies(game) {
  const scene = game.scene;
  const fx = createFx(game);
  const batcher = createBatcher(scene);
  const hitTest = makeHitTester(game);

  // ---------- materials ----------
  const teamColor = {};
  const teamMat = {};
  const matFor = (team) => {
    if (!teamMat[team]) {
      teamColor[team] = new THREE.Color(TEAMS[team]?.color ?? 0x888888);
      teamMat[team] = new THREE.MeshStandardMaterial({ color: teamColor[team], vertexColors: true, roughness: 0.38, metalness: 0 });
    }
    return teamMat[team];
  };
  const colorMats = new Map(); // quantized color -> material for flying chunks
  function chunkMat(color) {
    const key = ((color.r * 63) | 0) * 4096 + ((color.g * 63) | 0) * 64 + ((color.b * 63) | 0);
    let m = colorMats.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: color.clone(), vertexColors: true, roughness: 0.42 }); colorMats.set(key, m); }
    return m;
  }
  function bodyColor(team, melt, out = new THREE.Color()) {
    matFor(team);
    return out.copy(teamColor[team]).lerp(CHAR, Math.min(0.85, melt * 0.85));
  }
  // live soldiers that start melting get their own material clone (few at a time)
  function ensureOwnMat(model) {
    if (model.ownMat) return model.ownMat;
    model.ownMat = model.baseMaterial.clone();
    model.mesh.material = model.ownMat;
    return model.ownMat;
  }
  function refreshBurnMat(model, onFire) {
    if (model.melt <= 0 && !onFire) return;
    const m = ensureOwnMat(model);
    bodyColor(model.team, model.melt, m.color);
    if (onFire) m.emissive.setRGB(0.5, 0.13, 0.02).multiplyScalar(0.5 + 0.5 * Math.sin(game.time * 23 + model.time));
    else m.emissive.setRGB(0, 0, 0);
  }

  // ---------- state ----------
  const corpses = [];  // one entry per dead soldier: {team, classId, kind, record|null}
  const dyn = [];      // animating things: topple / launch / melt / rigid chunks
  const limbRecords = { n: 0 };
  const smolders = []; // {x,y,z,t}
  let stats = { kicked: 0 };

  function bodyState(unit) {
    let b = unit.body;
    if (!b) {
      b = unit.body = { limbHp: {}, lastFireAt: -99, igniter: null, killed: false };
      for (const z in LIMB_HP_FRAC) b.limbHp[z] = (unit.maxHp || 100) * LIMB_HP_FRAC[z];
    }
    return b;
  }

  // ---------- snapshots ----------
  const ZONE_BONES = { head: ['head'], larm: ['larm'], rarm: ['rarm'], lleg: ['lleg', 'lknee'], rleg: ['rleg', 'rknee'] };
  function zoneBones(model, zone) {
    const list = ZONE_BONES[zone] || [];
    if (boneParent('weapon', model.classId) === zone) return [...list, 'weapon'];
    return list;
  }
  function boneVisible(model, name) {
    const z = BONE_ZONE[name];
    if (z && model.lost.has(z)) return false;
    if (name === 'weapon') { const pz = BONE_ZONE[boneParent('weapon', model.classId)]; if (pz && model.lost.has(pz)) return false; }
    return true;
  }
  function snapshot(model, names, out = []) {
    for (const name of names) {
      const geo = model.assets.partGeos[name];
      if (!geo || !boneVisible(model, name)) continue;
      out.push({ geo, m: model.bones[B[name]].matrixWorld.clone() });
    }
    return out;
  }

  // ---------- rigid bodies ----------
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
  function floorAt(x, y, z) {
    const w = game.world;
    const f = w?.getFloor ? w.getFloor(x, y, z) : w?.getHeight?.(x, z);
    return Number.isFinite(f) ? f : 0;
  }
  function clampBounds(p) {
    const b = game.world?.bounds; if (!b) return;
    if (p.x < b.minX) p.x = b.minX; else if (p.x > b.maxX) p.x = b.maxX;
    if (p.z < b.minZ) p.z = b.minZ; else if (p.z > b.maxZ) p.z = b.maxZ;
  }
  function newRigid(pos, q, longAxis, extent, thick) {
    return { pos: pos.clone(), q: q.clone(), vel: new THREE.Vector3(), ang: new THREE.Vector3(), longAxis: longAxis.clone().normalize(), extent, thick, rest: 0, age: 0, bounces: 0 };
  }
  // returns true when settled
  function stepRigid(r, dt, onBounce) {
    r.age += dt;
    r.vel.y -= G * dt;
    r.pos.addScaledVector(r.vel, dt);
    clampBounds(r.pos);
    const w = r.ang.length();
    if (w > 1e-4) { _q.setFromAxisAngle(_v.copy(r.ang).multiplyScalar(1 / w), w * dt); r.q.premultiply(_q).normalize(); }
    const lw = _v.copy(r.longAxis).applyQuaternion(r.q);
    const ly = Math.abs(lw.y);
    const lowest = r.pos.y - ly * r.extent - r.thick;
    const floor = floorAt(r.pos.x, r.pos.y + 0.6, r.pos.z);
    if (lowest <= floor) {
      r.pos.y += floor - lowest;
      if (r.vel.y < -2.2) {
        if (onBounce && r.bounces < 3) onBounce(r, -r.vel.y);
        r.bounces++;
        r.vel.y *= -0.32;
        r.ang.multiplyScalar(0.65).addScaledVector(_v2.set(Math.random() - 0.5, 0, Math.random() - 0.5), -r.vel.y * 0.6);
      } else if (r.vel.y < 0) r.vel.y = 0;
      const fr = Math.max(0, 1 - 7 * dt);
      r.vel.x *= fr; r.vel.z *= fr; r.ang.multiplyScalar(Math.max(0, 1 - 6 * dt));
      // topple the long axis toward horizontal (lie down)
      if (r.extent > 0 && ly > 0.02) {
        _v2.crossVectors(lw, UP);
        const l = _v2.length();
        if (l > 1e-4) {
          const ang = -Math.asin(Math.min(1, lw.y)) * Math.min(1, dt * 7);
          _q.setFromAxisAngle(_v2.multiplyScalar(1 / l), ang); r.q.premultiply(_q).normalize();
        } else { // perfectly vertical: tip it any direction
          _q.setFromAxisAngle(_v2.set(1, 0, 0), 0.05); r.q.premultiply(_q);
        }
      }
      const still = r.vel.lengthSq() < 0.2 && r.ang.lengthSq() < 0.6 && (r.extent === 0 || ly < 0.06);
      r.rest = still ? r.rest + dt : 0;
      if (r.rest > 0.2) return true;
    }
    return r.age > 9;
  }

  // ---------- baking ----------
  function makeRecord(parts, color, center, kind, team, longW, extent, thick) {
    let vCount = 0, iCount = 0;
    for (const p of parts) { vCount += p.geo.attributes.position.count; iCount += p.geo.index.count; }
    const ext = Math.max(extent, 0.3) + thick + 0.5;
    return {
      parts, color: color.clone(), center: center.clone(), kind, team, vCount, iCount,
      longAxis: longW.clone(), extent, thick,
      boxMin: new THREE.Vector3(center.x - ext, center.y - ext, center.z - ext),
      boxMax: new THREE.Vector3(center.x + ext, center.y + ext, center.z + ext),
      chunk: null, entry: null,
    };
  }
  function bakeRecord(rec) {
    batcher.add(rec);
    if (rec.kind === 'limb') limbRecords.n++;
  }

  // ---------- flying chunks (limbs, kicked corpses) ----------
  function spawnRigidGroup(parts, color, center, longW, extent, thick, kind, team, entry) {
    const group = new THREE.Group();
    const mat = chunkMat(color);
    for (const p of parts) {
      const mesh = new THREE.Mesh(p.geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(p.m); mesh.matrix.elements[12] -= center.x; mesh.matrix.elements[13] -= center.y; mesh.matrix.elements[14] -= center.z;
      mesh.castShadow = true; mesh.userData.tint = p.tint;
      group.add(mesh);
    }
    group.position.copy(center);
    scene.add(group);
    const r = newRigid(center, group.quaternion, longW, extent, thick);
    const d = { type: 'rigid', group, r, color: color.clone(), kind, team, entry, smoke: 0 };
    dyn.push(d);
    return d;
  }
  function settleRigidGroup(d) {
    d.group.updateMatrixWorld(true);
    const parts = d.group.children.map((c) => ({ geo: c.geometry, m: c.matrixWorld.clone(), tint: c.userData.tint }));
    const lw = _v.copy(d.r.longAxis).applyQuaternion(d.r.q);
    const rec = makeRecord(parts, d.color, d.r.pos, d.kind, d.team, lw, d.r.extent, d.r.thick);
    if (d.entry) { rec.entry = d.entry; d.entry.record = rec; }
    bakeRecord(rec);
    scene.remove(d.group);
  }

  function severLimb(unit, zone, info, model) {
    if (!unit.limbs || unit.limbs[zone] === false) return false;
    unit.limbs[zone] = false;
    model = model || unit.model;
    const dir = info?.dir;
    if (model?.bones) {
      model.root.updateMatrixWorld(true);
      const parts = snapshot(model, zoneBones(model, zone));
      model.lost.add(zone);
      model.bones[B[zone]].scale.setScalar(1e-4);
      if (zone !== 'torso' && boneParent('weapon', model.classId) === zone) model.bones[B.weapon].scale.setScalar(1e-4);
      if (parts.length) {
        const joint = model.bones[B[zone]].getWorldPosition(new THREE.Vector3());
        const m = model.bones[B[zone]].matrixWorld;
        const longW = new THREE.Vector3(-m.elements[4], -m.elements[5], -m.elements[6]).normalize();
        const ext = LIMB_EXTENT[zone] ?? 0.2;
        const center = joint.clone().addScaledVector(longW, ext);
        const color = bodyColor(model.team, model.melt);
        const d = spawnRigidGroup(parts, color, center, longW, ext, zone === 'head' ? 0.15 : 0.085, 'limb', model.team, null);
        const boom = info?.type === 'explosive';
        const f = Math.min(14, (info?.force ?? 4) * (boom ? 0.9 : 0.6));
        if (dir) d.r.vel.set(dir.x * f, 0, dir.z * f);
        d.r.vel.x += (Math.random() - 0.5) * 2.5; d.r.vel.z += (Math.random() - 0.5) * 2.5;
        d.r.vel.y = (boom ? 6 : 3) + Math.random() * (boom ? 6 : 3) + (zone === 'head' ? 2.5 : 0);
        d.r.ang.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 22);
        if (model.melt > 0.3) d.smoke = 3;
        fx.shards(joint, dir, color, boom ? 10 : 8, boom ? 6 : 4);
      }
    }
    game.events.emit('unit:limbLost', { unit, zone, info });
    return true;
  }

  // ---------- deaths ----------
  // Make sure a dying unit has a posable body (the player has no third-person model).
  function ensureCorpseModel(unit) {
    if (unit.model?.bones) return unit.model;
    const model = buildSoldierModel(unit.team, unit.classId || 'rifleman', matFor(unit.team));
    scene.add(model.root);
    model.root.position.copy(unit.position);
    model.root.rotation.y = unit.yaw || 0;
    poseModel(model, unit.anim || { state: 'idle' }, 0.016, null);
    for (const z of ['head', 'larm', 'rarm', 'lleg', 'rleg']) if (unit.limbs?.[z] === false) {
      model.lost.add(z); model.bones[B[z]].scale.setScalar(1e-4);
      if (boneParent('weapon', model.classId) === z) model.bones[B.weapon].scale.setScalar(1e-4);
    }
    if (unit.body?.melt) model.melt = unit.body.melt;
    if (unit.model && unit.model.root && unit.model.root !== model.root) scene.remove(unit.model.root); // foreign model
    unit.model = model;
    return model;
  }

  function spawnCorpse(unit, info = {}) {
    const model = ensureCorpseModel(unit);
    unit.model = null; // the body system owns it now
    model.root.updateMatrixWorld(true);
    const entry = { team: unit.team, classId: unit.classId, kind: 'pending', record: null, unitId: unit.id };
    corpses.push(entry);
    const type = info.type || 'bullet';
    const burning = unit.onFire > 0;
    if (type === 'fire' || (burning && model.melt > 0.3 && type !== 'explosive')) startMelt(model, entry);
    else if (type === 'explosive') startLaunch(model, entry, info, unit);
    else startTopple(model, entry, info, unit);
    if (burning) entry.burning = true;
  }

  function startTopple(model, entry, info, unit) {
    entry.kind = 'topple';
    const dir = _v.copy(info.dir || _v2.set(Math.random() - 0.5, 0, Math.random() - 0.5)); dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    dir.normalize();
    // a little randomness so piles don't look cloned
    dir.applyAxisAngle(UP, (Math.random() - 0.5) * 0.6);
    const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const prone = model.state === 'prone';
    const crouch = model.state === 'crouch';
    dyn.push({
      type: 'topple', model, entry, dir: dir.clone(), axis, theta: 0,
      omega: 0.6 + Math.min(4, (info.force ?? 3) * 0.25) + (info.zone === 'head' ? 0.8 : 0),
      maxTheta: prone ? 0.0 : Math.PI / 2 - (crouch ? 0.15 : 0.02) + (Math.random() - 0.5) * 0.05,
      lift: crouch ? 0.12 : 0.16,
      feet: model.root.position.clone(), baseQ: model.root.quaternion.clone(), bounces: 0, t: 0,
      burning: unit.onFire > 0,
      twitch: Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? 'larm' : 'rarm'),
    });
  }

  function startLaunch(model, entry, info, unit) {
    entry.kind = 'blown';
    const f = Math.min(16, info.force ?? 8);
    const center = new THREE.Vector3(0, 0.9, 0).applyMatrix4(model.root.matrixWorld);
    const r = newRigid(center, model.root.quaternion, UP, 0.75, 0.17);
    const dir = info.dir ? _v.copy(info.dir) : _v.set(0, 0, 0);
    r.vel.set(dir.x * f * 0.9, 4 + f * 0.75 + Math.random() * 2, dir.z * f * 0.9);
    r.ang.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).normalize().multiplyScalar(4 + Math.random() * 8);
    dyn.push({ type: 'launch', model, entry, r, burning: unit.onFire > 0, sc: model.root.scale.x || 1 });
  }

  function startMelt(model, entry) {
    entry.kind = 'melted';
    ensureOwnMat(model);
    const tilt = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const puddle = new THREE.Mesh(PUDDLE_GEO, model.ownMat);
    puddle.position.copy(model.root.position); puddle.rotation.y = Math.random() * 6.28; puddle.scale.setScalar(0.2);
    puddle.receiveShadow = true;
    scene.add(puddle);
    dyn.push({ type: 'melt', model, entry, t: 0, dur: 2.4 + Math.random() * 0.8, startMelt: model.melt, axis: new THREE.Vector3().crossVectors(UP, tilt).normalize(), puddle, sc: model.root.scale.x || 1, baseQ: model.root.quaternion.clone(), feet: model.root.position.clone(), lean: 0.35 + Math.random() * 0.5 });
  }

  function bakeModelCorpse(d, extraParts) {
    const model = d.model;
    model.root.updateMatrixWorld(true);
    const parts = snapshot(model, BONE_NAMES);
    if (extraParts) parts.push(...extraParts);
    const color = bodyColor(model.team, model.melt);
    const center = new THREE.Vector3(0, 0.9, 0).applyMatrix4(model.root.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(model.root.matrixWorld);
    const rec = makeRecord(parts, color, center, 'corpse', model.team, up, d.type === 'melt' ? 0 : 0.75, d.type === 'melt' ? 0.35 : 0.17);
    rec.entry = d.entry; d.entry.record = rec;
    bakeRecord(rec);
    scene.remove(model.root);
    if (model.ownMat) { model.ownMat.dispose(); model.ownMat = null; }
    model.skeleton.boneTexture?.dispose?.();
    if (d.entry.burning || d.type === 'melt') smolders.push({ x: center.x, y: center.y - 0.6, z: center.z, t: 5 + Math.random() * 5 });
  }

  const _q2 = new THREE.Quaternion();
  function updateDyn(dt) {
    for (let i = dyn.length - 1; i >= 0; i--) {
      const d = dyn[i];
      let done = false;
      if (d.type === 'topple') {
        d.t += dt;
        if (d.maxTheta <= 0) done = d.t > 0.25;
        else {
          d.omega += 16 * Math.sin(d.theta + 0.12) * dt;
          d.theta += d.omega * dt;
          if (d.theta >= d.maxTheta) {
            d.theta = d.maxTheta;
            if (d.bounces < 2 && d.omega > 1.2) {
              d.omega *= -0.28; d.bounces++;
              _v.copy(d.feet).addScaledVector(d.dir, 1.0); _v.y += 0.2;
              fx.dust(_v.x, _v.y, _v.z, 0.7);
            } else done = true;
          }
          const m = d.model;
          _q2.setFromAxisAngle(d.axis, d.theta);
          m.root.quaternion.copy(_q2).multiply(d.baseQ);
          const s = Math.sin(d.theta);
          m.root.position.copy(d.feet).addScaledVector(d.dir, 0.12 * s); m.root.position.y += d.lift * s;
          if (d.twitch && d.t < 0.6) m.bones[B[d.twitch]].rotation.x += Math.sin(d.t * 40) * 0.04;
        }
        if (d.burning && Math.random() < dt * 12) burnFx(d.model.root.position, 0.6, true);
        if (done) bakeModelCorpse(d);
      } else if (d.type === 'launch') {
        done = stepRigid(d.r, dt, (r, impact) => { if (impact > 4) fx.dust(r.pos.x, r.pos.y - 0.2, r.pos.z, 0.8); });
        const m = d.model;
        m.root.quaternion.copy(d.r.q);
        m.root.position.set(0, -0.9 * d.sc, 0).applyQuaternion(d.r.q).add(d.r.pos);
        if (d.burning && Math.random() < dt * 10) burnFx(d.r.pos, 0.5, true);
        if (done) bakeModelCorpse(d);
      } else if (d.type === 'melt') {
        d.t += dt;
        const p = Math.min(1, d.t / d.dur), e = p * p * (3 - 2 * p);
        const m = d.model;
        m.melt = Math.max(d.startMelt, Math.min(1, 0.4 + p * 0.6));
        refreshBurnMat(m, p < 0.7);
        poseModel(m, { state: 'idle', phase: 0, aimPitch: -0.5 }, dt, null);
        _q2.setFromAxisAngle(d.axis, d.lean * e);
        m.root.quaternion.copy(_q2).multiply(d.baseQ);
        m.root.scale.set((1 + 0.3 * e) * d.sc, (1 - 0.62 * e) * d.sc, (1 + 0.3 * e) * d.sc);
        d.puddle.scale.set((0.2 + 0.8 * e) * d.sc, d.sc, (0.2 + 0.8 * e) * d.sc);
        if (Math.random() < dt * (p < 0.7 ? 22 : 6)) burnFx(d.feet, 1.5 * (1 - e * 0.6), p < 0.7);
        if (p >= 1) {
          d.puddle.updateMatrixWorld(true);
          bakeModelCorpse(d, [{ geo: PUDDLE_GEO, m: d.puddle.matrixWorld.clone() }]);
          scene.remove(d.puddle);
          done = true;
        }
      } else if (d.type === 'rigid') {
        done = stepRigid(d.r, dt);
        d.group.position.copy(d.r.pos); d.group.quaternion.copy(d.r.q);
        if (d.smoke > 0) { d.smoke -= dt; if (Math.random() < dt * 8) fx.smoke(d.r.pos.x, d.r.pos.y, d.r.pos.z, 0.5); }
        if (done) settleRigidGroup(d);
      }
      if (done) { dyn[i] = dyn[dyn.length - 1]; dyn.pop(); }
    }
  }

  function burnFx(pos, h, flames) {
    const x = pos.x + (Math.random() - 0.5) * 0.4, z = pos.z + (Math.random() - 0.5) * 0.4, y = pos.y + Math.random() * h;
    if (flames) fx.flame(x, y, z, 0.9);
    fx.smoke(x, y + 0.2, z, 0.8);
  }

  // ---------- explosions kick corpses ----------
  const kickTmp = [];
  function onExplosion({ point, radius }) {
    if (!point || !radius) return;
    const R = radius * 1.15;
    // live rigid bodies get shoved
    for (const d of dyn) {
      const r = d.r; if (!r) continue;
      _v.copy(r.pos).sub(point); const dist = _v.length();
      if (dist > R) continue;
      const f = (1 - dist / R) * 14;
      _v.y = Math.max(_v.y, 0.5); _v.normalize();
      r.vel.addScaledVector(_v, f); r.vel.y += f * 0.4;
      r.ang.x += (Math.random() - 0.5) * f * 1.5; r.ang.z += (Math.random() - 0.5) * f * 1.5;
      r.rest = 0; r.age = Math.min(r.age, 5);
    }
    // baked corpses & limbs come back to life
    kickTmp.length = 0;
    batcher.query(point, R, kickTmp);
    if (!kickTmp.length) return;
    kickTmp.sort((a, b) => a.center.distanceToSquared(point) - b.center.distanceToSquared(point));
    const n = Math.min(kickTmp.length, 24);
    for (let i = 0; i < n; i++) {
      const rec = kickTmp[i];
      batcher.remove(rec);
      if (rec.kind === 'limb') limbRecords.n--;
      const d = spawnRigidGroup(rec.parts, rec.color, rec.center, rec.longAxis, rec.extent, rec.thick, rec.kind, rec.team, rec.entry);
      _v.copy(rec.center).sub(point); const dist = _v.length();
      const f = (1 - Math.min(1, dist / R)) * (rec.kind === 'limb' ? 13 : 10) + 2;
      _v.y = 0; _v.normalize();
      d.r.vel.set(_v.x * f, 3 + f * 0.7 + Math.random() * 2, _v.z * f);
      d.r.ang.set((Math.random() - 0.5) * f * 1.6, (Math.random() - 0.5) * f, (Math.random() - 0.5) * f * 1.6);
      stats.kicked++;
    }
    batcher.flush();
  }
  game.events.on('explosion', onExplosion);

  // ---------- damage ----------
  function applyDamage(unit, info = {}) {
    if (!unit || !unit.alive) return { damage: 0, killed: false, limbLost: null, limbsLost: [] };
    const bs = bodyState(unit);
    const type = info.type || 'bullet';
    const model = unit.model?.bones ? unit.model : null;
    const amount = Math.max(0, +info.amount || 0);
    let zone = info.zone;
    if (!zone && (type === 'bullet' || type === 'melee')) zone = nearestZone(unit, info.point);
    if (zone && unit.limbs?.[zone] === false) zone = 'torso';
    const mult = zone && (type === 'bullet' || type === 'melee') ? (ZONE_MULT[zone] ?? 1) : 1;
    const dmg = amount * mult;
    unit.hp -= dmg;
    const lose = [];
    let killed = unit.hp <= 0;
    const canSever = !!model; // the player keeps their limbs while alive (first-person); the corpse loses them

    if ((type === 'bullet' || type === 'melee') && zone in LIMB_HP_FRAC) {
      bs.limbHp[zone] -= amount * (type === 'melee' ? 0.7 : 1);
      if (bs.limbHp[zone] <= 0 && (canSever || killed)) lose.push(zone);
    }
    if (type === 'bullet' && killed && zone === 'head' && amount >= 40 && Math.random() < 0.85) lose.push('head');
    if (type === 'explosive') {
      const f = amount / (unit.maxHp || 100);
      const cand = ['larm', 'rarm', 'lleg', 'rleg'].filter((z) => unit.limbs?.[z] !== false);
      // nearest limbs to the blast go first
      if (info.point && model) {
        model.root.updateMatrixWorld(true);
        const dist = {};
        for (const z of cand) dist[z] = model.bones[B[z]].getWorldPosition(_v).distanceToSquared(info.point) + Math.random() * 0.6;
        cand.sort((a, b) => dist[a] - dist[b]);
      } else cand.sort(() => Math.random() - 0.5);
      let n = 0;
      if (killed) n = 1 + Math.floor(Math.random() * Math.min(4, f * 3.2));
      else if (canSever && Math.random() < (f - 0.3) * 0.8) n = 1;
      for (let i = 0; i < n && i < cand.length; i++) lose.push(cand[i]);
      if (killed && f > 0.9 && Math.random() < 0.35) lose.push('head');
    }
    if (type === 'fire') {
      bs.lastFireAt = game.time;
      if (info.source) bs.igniter = info.source;
      bs.melt = Math.min(1, (bs.melt || 0) + amount / (unit.maxHp || 100) * 0.9);
      if (model) model.melt = Math.max(model.melt, bs.melt * 0.8);
      if (!info.dot && info.weapon !== 'fire' && typeof game.combat?.ignite !== 'function') {
        const was = unit.onFire || 0;
        unit.onFire = Math.max(was, 3);
        if (was <= 0) game.events.emit('unit:ignited', { unit });
      }
    }
    if (lose.includes('head')) killed = true;

    // hit feedback: plastic chips
    if (info.point && type === 'bullet') fx.shards(info.point, info.dir, bodyColor(unit.team, bs.melt || 0, _hitCol), 4, 3.5);

    game.events.emit('unit:damaged', { unit, info, damage: dmg });
    const lostZones = [];
    let sevModel = model;
    if (lose.length && killed && !sevModel) sevModel = ensureCorpseModel(unit); // player: pop limbs off the corpse
    for (const z of lose) if (severLimb(unit, z, info, sevModel)) lostZones.push(z);
    if (killed) killUnit(unit, info);
    return { damage: dmg, killed, limbLost: lostZones[0] || null, limbsLost: lostZones };
  }
  const _hitCol = new THREE.Color();

  function killUnit(unit, info) {
    const bs = bodyState(unit);
    if (bs.killed) return;
    bs.killed = true;
    unit.alive = false;
    if (unit.hp > 0) unit.hp = 0;
    spawnCorpse(unit, info);
    game.events.emit('unit:killed', { unit, killer: info.source || null, info });
  }

  // ---------- per frame ----------
  function update(dt) {
    const list = game.units?.list || [];
    const now = game.time;
    const ownFlames = typeof game.combat?.ignite !== 'function'; // combat draws flames on burning units itself
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (!u.alive) continue;
      const m = u.model?.bones ? u.model : null;
      if (u.onFire > 0) {
        const seen = u._bodyFireSeen;
        if (u._fireDecAt !== now && !(seen !== undefined && u.onFire < seen - 1e-6)) u.onFire = Math.max(0, u.onFire - dt);
        u._fireDecAt = now; u._bodyFireSeen = u.onFire;
        const bs = bodyState(u);
        bs.melt = Math.min(0.75, (bs.melt || 0) + dt * 0.1);
        if (m) m.melt = Math.max(m.melt, bs.melt);
        if (now - bs.lastFireAt > 0.75) applyDamage(u, { amount: 6, type: 'fire', dot: true, source: bs.igniter, point: u.position });
        if (!u.alive) continue;
        const cs = u.crouchScale ?? 1;
        // flames & black smoke licking off the body
        if (Math.random() < dt * (ownFlames ? 30 : 5)) { const p = u.position; fx.flame(p.x + (Math.random() - 0.5) * 0.45, p.y + (0.3 + Math.random() * 1.3) * cs, p.z + (Math.random() - 0.5) * 0.45, 1); }
        if (Math.random() < dt * 9) { const p = u.position; fx.smoke(p.x, p.y + 1.5 * cs, p.z, 0.9); }
        if (m) refreshBurnMat(m, true);
      } else if (m && m.ownMat) refreshBurnMat(m, false);
    }
    updateDyn(dt);
    batcher.flush();
    for (let i = smolders.length - 1; i >= 0; i--) {
      const s = smolders[i]; s.t -= dt;
      if (Math.random() < dt * 3) fx.smoke(s.x, s.y, s.z, 0.6);
      if (s.t <= 0) { smolders[i] = smolders[smolders.length - 1]; smolders.pop(); }
    }
    fx.update(dt);
  }

  function reset() {
    for (const d of dyn) {
      if (d.model) scene.remove(d.model.root);
      if (d.group) scene.remove(d.group);
      if (d.puddle) scene.remove(d.puddle);
    }
    dyn.length = 0; corpses.length = 0; smolders.length = 0; limbRecords.n = 0;
    batcher.clear(); fx.clear();
  }
  game.events.on('game:start', reset);

  const api = {
    corpses,
    get corpseCount() { return corpses.length; },
    get limbCount() { return limbRecords.n; },
    get dynamicCount() { return dyn.length; },
    createSoldierModel(team, classId) { return buildSoldierModel(team, classId || 'rifleman', matFor(team)); },
    poseModel,
    hitTest,
    applyDamage,
    spawnCorpse(unit, info) { spawnCorpse(unit, info); },
    severLimb(unit, zone, info) { return severLimb(unit, zone, info); },
    fx,
    update,
    reset,
    // ---- debug / tests ----
    stats() {
      return { corpses: corpses.length, limbs: limbRecords.n, dynamic: dyn.length, kicked: stats.kicked, batch: batcher.stats(), fx: fx.counts,
        vertsPerSoldier: Object.fromEntries(['rifleman', 'bazooka', 'flamer', 'sniper', 'grenadier'].map((c) => [c, getClassAssets(c).verts])) };
    },
    debugKillAll(type = 'bullet', team = null) {
      const list = (game.units?.list || []).filter((u) => u.alive && !u.isPlayer && (!team || u.team === team));
      for (const u of list) {
        const dir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        const point = u.position.clone().addScaledVector(dir, -1); point.y += 0.5;
        applyDamage(u, { amount: 9999, type, zone: type === 'bullet' ? 'torso' : undefined, dir, point, force: type === 'explosive' ? 12 : 4 });
      }
      return list.length;
    },
    // spawn n dead bodies directly (no AI) around a point to stress the corpse batcher
    debugSpawnCorpses(n = 100, type = 'bullet', center = null, spread = 30) {
      const c = center || game.world?.objective?.position || new THREE.Vector3();
      const ids = ['rifleman', 'bazooka', 'flamer', 'sniper', 'grenadier'];
      for (let i = 0; i < n; i++) {
        const team = Math.random() < 0.5 ? 'green' : 'tan', classId = ids[i % ids.length];
        const pos = new THREE.Vector3(c.x + (Math.random() - 0.5) * spread, 0, c.z + (Math.random() - 0.5) * spread);
        pos.y = floorAt(pos.x, 5, pos.z);
        const fake = { id: -1 - i, team, classId, position: pos, yaw: Math.random() * 6.28, crouchScale: 1, maxHp: 100, hp: 100, alive: true, anim: { state: Math.random() < 0.5 ? 'run' : 'aim', phase: Math.random() * 6, aimPitch: 0 }, limbs: { head: true, torso: true, larm: true, rarm: true, lleg: true, rleg: true }, onFire: 0 };
        fake.model = buildSoldierModel(team, classId, matFor(team));
        scene.add(fake.model.root); fake.model.root.position.copy(pos); fake.model.root.rotation.y = fake.yaw;
        poseModel(fake.model, fake.anim, 0.016, null);
        const t = type === 'mixed' ? ['bullet', 'explosive', 'fire'][i % 3] : type;
        const dir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        applyDamage(fake, { amount: 9999, type: t, zone: 'torso', dir, point: pos.clone().addScaledVector(dir, -1), force: 10 });
      }
    },
  };
  return api;
}
