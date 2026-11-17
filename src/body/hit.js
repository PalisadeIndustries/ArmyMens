import * as THREE from 'three';
import { B } from './model.js';

// Per-zone ray tests against capsules attached to the posed bones (world space; respects yaw, crouch,
// prone, throw, lost limbs). Units without a model (the player) use an analytic capsule rig.

// [boneIndex, zone, ax, ay, az, bx, by, bz, radius] in bone-local space
const CAPS = [
  [B.head, 'head', 0, 0.09, 0.01, 0, 0.2, 0, 0.15],
  [B.torso, 'torso', 0, 0.02, 0, 0, 0.44, 0, 0.21],
  [B.pelvis, 'torso', 0, -0.1, 0, 0, 0.0, 0, 0.17],
  [B.larm, 'larm', 0, -0.02, 0, 0, -0.52, 0.01, 0.075],
  [B.rarm, 'rarm', 0, -0.02, 0, 0, -0.52, 0.01, 0.075],
  [B.lleg, 'lleg', 0, -0.02, 0, 0, -0.45, 0, 0.095],
  [B.lknee, 'lleg', 0, 0, 0, 0, -0.38, 0.03, 0.085],
  [B.rleg, 'rleg', 0, -0.02, 0, 0, -0.45, 0, 0.095],
  [B.rknee, 'rleg', 0, 0, 0, 0, -0.38, 0.03, 0.085],
];

const A = new THREE.Vector3(), Bv = new THREE.Vector3(), tmp = new THREE.Vector3();

// Closest approach between ray o + t*d (t in [0,maxT], |d| = 1) and segment a-b.
// Returns entry distance t along the ray if within radius r, else -1.
function rayCapsule(o, d, maxT, ax, ay, az, bx, by, bz, r) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = o.x - ax, wy = o.y - ay, wz = o.z - az;
  const a = 1, b = d.x * ux + d.y * uy + d.z * uz, c = ux * ux + uy * uy + uz * uz;
  const dd = d.x * wx + d.y * wy + d.z * wz, e = ux * wx + uy * wy + uz * wz;
  const den = a * c - b * b;
  let sc, tc;
  if (den < 1e-8) { sc = 0; tc = c > 1e-8 ? e / c : 0; }
  else { sc = (b * e - c * dd) / den; tc = (a * e - b * dd) / den; }
  if (tc < 0) { tc = 0; sc = -dd; } else if (tc > 1) { tc = 1; sc = b - dd; }
  if (sc < 0) sc = 0; else if (sc > maxT) sc = maxT;
  const px = wx + sc * d.x - tc * ux, py = wy + sc * d.y - tc * uy, pz = wz + sc * d.z - tc * uz;
  const d2 = px * px + py * py + pz * pz;
  if (d2 > r * r) return -1;
  const t = sc - Math.sqrt(r * r - d2);
  return t < 0 ? (sc >= 0 ? 0 : -1) : t;
}

export function makeHitTester(game) {
  return function hitTest(unit, origin, dir, maxDist) {
    if (!unit || !origin || !dir) return null;
    const p = unit.position, us = unit.scale || 1;
    // broad phase: sphere around the body (scaled for big units)
    tmp.set(p.x - origin.x, p.y + 0.8 * us - origin.y, p.z - origin.z);
    const along = tmp.dot(dir);
    if (along < -2 * us || along > maxDist + 2 * us) return null;
    if (tmp.lengthSq() - along * along > 3.6 * us * us) return null; // ~1.9m
    const model = unit.model;
    let best = -1, bestZone = null;
    if (model?.bones) {
      if (model.dirty || model.root.matrixWorldNeedsUpdate) {
        // syncModel moved the root and posed bones this frame; refresh matrices once, lazily
        model.root.updateMatrixWorld(true); model.dirty = false;
      }
      const lost = model.lost;
      for (let i = 0; i < CAPS.length; i++) {
        const c = CAPS[i];
        if (lost.size && lost.has(c[1])) continue;
        const m = model.bones[c[0]].matrixWorld;
        A.set(c[2], c[3], c[4]).applyMatrix4(m); Bv.set(c[5], c[6], c[7]).applyMatrix4(m);
        const t = rayCapsule(origin, dir, best >= 0 ? best : maxDist, A.x, A.y, A.z, Bv.x, Bv.y, Bv.z, c[8]);
        if (t >= 0 && (best < 0 || t < best)) { best = t; bestZone = c[1]; }
      }
    } else {
      // analytic rig (player / modelless units): vertical capsules scaled by crouchScale; prone lies along forward
      const cs = (unit.crouchScale ?? 1) * us, sy = Math.sin(unit.yaw || 0), cy = Math.cos(unit.yaw || 0);
      const prone = (unit.crouchScale ?? 1) < 0.45;
      const L = unit.limbs || {};
      const seg = (zone, side, fwd, y0, y1, r) => {
        if (L[zone] === false) return;
        let ax, ay, az, bx, by, bz;
        side *= us; fwd *= us; r *= us;
        const ox = p.x + cy * side, oz = p.z - sy * side; // side offset along the soldier's left (+x local)
        if (prone) {
          ax = ox + sy * (fwd + (y0 - 0.9) * us); az = oz + cy * (fwd + (y0 - 0.9) * us); ay = p.y + 0.2 * us;
          bx = ox + sy * (fwd + (y1 - 0.9) * us); bz = oz + cy * (fwd + (y1 - 0.9) * us); by = p.y + 0.2 * us;
        } else {
          ax = bx = ox + sy * fwd; az = bz = oz + cy * fwd; ay = p.y + y0 * cs; by = p.y + y1 * cs;
        }
        const t = rayCapsule(origin, dir, best >= 0 ? best : maxDist, ax, ay, az, bx, by, bz, r);
        if (t >= 0 && (best < 0 || t < best)) { best = t; bestZone = zone; }
      };
      seg('head', 0, 0, 1.6, 1.72, 0.15);
      seg('torso', 0, 0, 0.85, 1.45, 0.22);
      seg('larm', 0.27, 0.1, 0.95, 1.42, 0.08);
      seg('rarm', -0.27, 0.1, 0.95, 1.42, 0.08);
      seg('lleg', 0.1, 0, 0.05, 0.9, 0.1);
      seg('rleg', -0.1, 0, 0.05, 0.9, 0.1);
    }
    if (best < 0) return null;
    return { zone: bestZone, dist: best, point: new THREE.Vector3().copy(origin).addScaledVector(dir, best) };
  };
}

// Nearest zone to a world point (for damage that arrives without a zone, e.g. melee).
export function nearestZone(unit, point) {
  const model = unit.model;
  if (!model?.bones || !point) {
    if (!point) return 'torso';
    const h = (point.y - unit.position.y) / (unit.crouchScale || 1);
    return h > 1.52 ? 'head' : h > 0.85 ? 'torso' : (Math.random() < 0.5 ? 'lleg' : 'rleg');
  }
  if (model.dirty) { model.root.updateMatrixWorld(true); model.dirty = false; }
  let bestD = Infinity, zone = 'torso';
  for (const c of CAPS) {
    if (model.lost.has(c[1])) continue;
    const m = model.bones[c[0]].matrixWorld;
    A.set((c[2] + c[5]) / 2, (c[3] + c[6]) / 2, (c[4] + c[7]) / 2).applyMatrix4(m);
    const d = A.distanceToSquared(point);
    if (d < bestD) { bestD = d; zone = c[1]; }
  }
  return zone;
}
