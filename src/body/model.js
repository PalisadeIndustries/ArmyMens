import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural classic plastic army man. Every soldier is ONE SkinnedMesh (rigid skinning, 1 bone per vertex)
// sharing one geometry per class and one material per team => 1 draw call (+1 shadow) per soldier.
// Each body part is also kept as a separate bone-local geometry (PART_GEOS) for severed chunks and corpse baking.
//
// Model space: feet at y=0, facing +z, the soldier's RIGHT side is -x.

export const BONE_NAMES = ['root', 'base', 'pelvis', 'torso', 'head', 'larm', 'rarm', 'weapon', 'lleg', 'lknee', 'rleg', 'rknee'];
export const B = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));
// Which contract zone each bone belongs to (bones of a lost zone are collapsed / severed together)
export const BONE_ZONE = { head: 'head', larm: 'larm', rarm: 'rarm', lleg: 'lleg', lknee: 'lleg', rleg: 'rleg', rknee: 'rleg', torso: 'torso', pelvis: 'torso', weapon: null, base: null, root: null };

const REST = {
  root: [0, 0, 0], base: [0, 0, 0], pelvis: [0, 0.98, 0], torso: [0, 0.04, 0], head: [0, 0.5, 0],
  larm: [0.235, 0.42, 0], rarm: [-0.235, 0.42, 0],
  lleg: [0.1, -0.03, 0], lknee: [0, -0.45, 0], rleg: [-0.1, -0.03, 0], rknee: [0, -0.45, 0],
};
const WEAPON_REST = {
  hand: { parent: 'rarm', pos: [0, -0.5, 0.03], rotX: Math.PI / 2 },
  shoulder: { parent: 'torso', pos: [-0.2, 0.53, -0.03], rotX: 0 },
};
export const HOLD = { rifleman: 'rifle', sniper: 'rifle', grenadier: 'rifle', bazooka: 'shoulder', flamer: 'hip' };
export function boneParent(name, classId) {
  if (name === 'weapon') return (HOLD[classId] === 'shoulder' ? WEAPON_REST.shoulder : WEAPON_REST.hand).parent;
  return { base: 'root', pelvis: 'root', torso: 'pelvis', head: 'torso', larm: 'torso', rarm: 'torso', lleg: 'pelvis', lknee: 'lleg', rleg: 'pelvis', rknee: 'rleg' }[name] || null;
}

// ---------- primitive helpers ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function prim(geo, pos, rot, scl, shade = 1) {
  pos = pos || [0, 0, 0]; rot = rot || [0, 0, 0]; scl = scl || [1, 1, 1];
  geo.deleteAttribute('uv');
  _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(scl[0], scl[1], scl[2]));
  geo.applyMatrix4(_m);
  const n = geo.attributes.position.count, c = new Float32Array(n * 3);
  c.fill(shade);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
const box = (w, h, d, pos, rot, shade) => prim(new THREE.BoxGeometry(w, h, d), pos, rot, [1, 1, 1], shade);
const cyl = (rt, rb, h, seg, pos, rot, scl, shade, open = false) => prim(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), pos, rot, scl, shade);
const sph = (r, ws, hs, pos, scl, shade, thetaLen = Math.PI) => prim(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, thetaLen), pos, [0, 0, 0], scl, shade);
const cone = (r, h, seg, pos, rot, shade) => prim(new THREE.ConeGeometry(r, h, seg), pos, rot, [1, 1, 1], shade);
const HALF_PI = Math.PI / 2;

// ---------- part builders (bone-local coordinates) ----------
function buildHead(classId) {
  const g = [
    cyl(0.05, 0.055, 0.1, 6, [0, 0.04, 0], 0, 0, 0.92, true),                // neck
    sph(0.105, 8, 6, [0, 0.15, 0.005], [0.95, 1.05, 1], 1.0),                  // head
    box(0.035, 0.045, 0.04, [0, 0.135, 0.105], 0, 1.0),                         // nose
    box(0.13, 0.025, 0.03, [0, 0.085, 0.09], [0.2, 0, 0], 0.93),                // chin/jaw
  ];
  if (classId === 'sniper') {
    // soft boonie hat with floppy brim + a sprig of molded foliage
    g.push(sph(0.12, 8, 4, [0, 0.19, 0], [1, 0.8, 1], 0.95, HALF_PI));
    g.push(cyl(0.2, 0.2, 0.018, 10, [0, 0.19, 0], [0.08, 0, 0], 0, 0.9));
    g.push(cone(0.03, 0.12, 4, [0.07, 0.27, -0.03], [0, 0, -0.4], 0.95));
    g.push(cone(0.025, 0.1, 4, [-0.05, 0.27, -0.06], [0.3, 0, 0.5], 0.95));
  } else {
    // classic dome helmet with a flared brim + chin strap
    g.push(sph(0.145, 9, 5, [0, 0.165, -0.005], [1, 0.95, 1.06], 1.04, HALF_PI));
    g.push(cyl(0.16, 0.175, 0.03, 10, [0, 0.16, -0.005], [0.05, 0, 0], [1, 1, 1.08], 0.98));
    g.push(box(0.012, 0.11, 0.014, [0.1, 0.1, 0.04], [0, 0, 0.12], 0.86));
    g.push(box(0.012, 0.11, 0.014, [-0.1, 0.1, 0.04], [0, 0, -0.12], 0.86));
  }
  return g;
}

function buildTorso(classId) {
  const g = [
    cyl(0.215, 0.175, 0.46, 8, [0, 0.25, 0], 0, [1, 1, 0.62], 1.0),             // chest (oval)
    sph(0.215, 8, 3, [0, 0.47, 0], [1, 0.32, 0.62], 1.0, HALF_PI),              // shoulder slope
    cyl(0.19, 0.19, 0.07, 8, [0, 0.03, 0], 0, [1, 1, 0.68], 0.78, true),       // web belt
    box(0.06, 0.05, 0.03, [0, 0.03, 0.13], 0, 0.7),                             // buckle
    box(0.09, 0.07, 0.05, [0.11, 0.035, 0.11], [0, -0.35, 0], 0.82),            // ammo pouches
    box(0.09, 0.07, 0.05, [-0.11, 0.035, 0.11], [0, 0.35, 0], 0.82),
    box(0.1, 0.012, 0.012, [0.065, 0.34, 0.125], 0, 0.85),                       // breast pocket flaps
    box(0.1, 0.012, 0.012, [-0.065, 0.34, 0.125], 0, 0.85),
    box(0.03, 0.42, 0.012, [0.115, 0.24, 0.11], [0, 0, 0.12], 0.86),             // suspenders
    box(0.03, 0.42, 0.012, [-0.115, 0.24, 0.11], [0, 0, -0.12], 0.86),
    box(0.012, 0.36, 0.01, [0, 0.24, 0.135], 0, 0.9),                            // button placket (mold seam)
  ];
  switch (classId) {
    case 'rifleman':
      g.push(box(0.26, 0.24, 0.1, [0, 0.3, -0.16], 0, 0.88));                    // pack
      g.push(cyl(0.22, 0.22, 0.05, 6, [0, 0.45, -0.17], [0, 0, HALF_PI], [0.3, 1, 0.35], 0.82)); // rolled blanket
      g.push(cyl(0.045, 0.045, 0.1, 6, [0.17, 0.0, -0.06], 0, 0, 0.84));        // canteen
      break;
    case 'bazooka':
      g.push(box(0.24, 0.3, 0.12, [0, 0.27, -0.17], 0, 0.86));                   // rocket bag
      g.push(cone(0.04, 0.14, 6, [0.06, 0.47, -0.17], 0, 0.95));
      g.push(cone(0.04, 0.14, 6, [-0.06, 0.47, -0.17], 0, 0.95));
      break;
    case 'flamer':
      g.push(cyl(0.075, 0.075, 0.44, 8, [0.085, 0.26, -0.2], 0, 0, 0.95));       // twin fuel tanks
      g.push(cyl(0.075, 0.075, 0.44, 8, [-0.085, 0.26, -0.2], 0, 0, 0.95));
      g.push(sph(0.075, 8, 3, [0.085, 0.48, -0.2], [1, 0.6, 1], 0.95, HALF_PI));
      g.push(sph(0.075, 8, 3, [-0.085, 0.48, -0.2], [1, 0.6, 1], 0.95, HALF_PI));
      g.push(cyl(0.035, 0.035, 0.06, 6, [0, 0.42, -0.2], [0, 0, HALF_PI], 0, 0.8)); // valve
      g.push(cyl(0.02, 0.02, 0.4, 5, [-0.15, 0.05, -0.08], [0.9, 0, 0.6], 0, 0.75)); // hose
      g.push(box(0.28, 0.04, 0.03, [0, 0.36, -0.12], 0, 0.75));                  // straps
      break;
    case 'sniper':
      g.push(cyl(0.06, 0.06, 0.34, 7, [0, 0.47, -0.15], [0, 0, HALF_PI], 0, 0.86)); // bedroll
      g.push(box(0.2, 0.2, 0.08, [0, 0.26, -0.15], 0, 0.88));
      g.push(box(0.05, 0.08, 0.04, [0.16, 0.05, 0.02], 0, 0.8));                  // binocular case
      break;
    case 'grenadier':
      g.push(box(0.04, 0.6, 0.02, [0, 0.25, 0.125], [0, 0, 0.72], 0.8));         // bandolier
      for (let i = 0; i < 4; i++) {
        const t = -0.18 + i * 0.12;
        g.push(sph(0.042, 6, 5, [t * 0.95 + 0.0, 0.25 - t * 0.85, 0.14], [1, 1.25, 1], 0.92)); // pineapples
      }
      g.push(box(0.22, 0.2, 0.09, [0, 0.3, -0.15], 0, 0.88));
      break;
  }
  return g;
}

function buildPelvis() {
  return [
    cyl(0.18, 0.15, 0.2, 8, [0, -0.05, 0], 0, [1, 1, 0.72], 0.97),
    box(0.012, 0.16, 0.01, [0, -0.06, 0.11], 0, 0.9),                           // fly seam
  ];
}

function buildArm(side, classId) {
  const sx = side; // +1 left, -1 right
  const g = [
    sph(0.075, 6, 4, [0, -0.01, 0], [1, 1, 1], 1.0),                            // shoulder
    cyl(0.068, 0.06, 0.28, 7, [0, -0.15, 0], 0, 0, 1.0, true),                   // sleeve
    box(0.05, 0.05, 0.012, [0.07 * sx, -0.07, 0], [0, HALF_PI, 0], 0.88),        // shoulder patch
    cyl(0.055, 0.048, 0.22, 6, [0, -0.38, 0], 0, 0, 0.98, true),                 // forearm
    cyl(0.064, 0.064, 0.03, 7, [0, -0.29, 0], 0, 0, 0.9, true),                  // cuff
    sph(0.052, 5, 4, [0, -0.51, 0.01], [0.9, 1.1, 1], 1.0),                      // fist
  ];
  if (classId === 'grenadier' && side > 0) g.push(sph(0.04, 5, 4, [0.07, -0.18, 0.02], [1, 1.2, 1], 0.92));
  return g;
}

function buildThigh() {
  return [cyl(0.088, 0.072, 0.47, 7, [0, -0.22, 0], 0, [1, 1, 0.95], 1.0, true), sph(0.088, 7, 4, [0, 0, 0], [1, 0.6, 0.95], 1.0, HALF_PI)];
}
function buildShin() {
  return [
    sph(0.072, 5, 3, [0, 0, 0], [1, 1, 1], 0.98),                               // knee
    cyl(0.07, 0.06, 0.36, 7, [0, -0.19, 0], 0, 0, 0.98, true),
    cyl(0.07, 0.068, 0.13, 7, [0, -0.3, 0], 0, 0, 0.86, true),                   // gaiter
    box(0.12, 0.08, 0.22, [0, -0.39, 0.035], 0, 0.8),                            // boot
    box(0.125, 0.025, 0.24, [0, -0.425, 0.035], 0, 0.72),                         // sole
  ];
}
function buildBase() {
  // the iconic slightly-oval plastic base plate
  return [cyl(0.3, 0.34, 0.05, 12, [0, 0.025, 0], 0, [1, 1, 0.78], 0.95)];
}

function buildWeapon(classId) {
  const Z = [HALF_PI, 0, 0]; // rotate cylinders to lie along +z
  switch (classId) {
    case 'bazooka':
      return [
        cyl(0.07, 0.07, 1.15, 10, [0, 0, 0.02], Z, 0, 0.92, true),
        cyl(0.085, 0.085, 0.06, 10, [0, 0, 0.56], Z, 0, 0.85),                   // muzzle ring
        cyl(0.095, 0.08, 0.12, 10, [0, 0, -0.55], Z, 0, 0.85, true),             // flared back
        cyl(0.078, 0.078, 0.05, 10, [0, 0, 0.1], Z, 0, 0.8),
        box(0.035, 0.12, 0.05, [0, -0.11, 0.12], [0.2, 0, 0], 0.85),             // grip
        box(0.035, 0.1, 0.05, [0, -0.1, -0.1], [0.2, 0, 0], 0.85),
        box(0.02, 0.06, 0.08, [0.08, 0.05, 0.25], 0, 0.85),                       // sight
      ];
    case 'flamer':
      return [
        box(0.05, 0.1, 0.06, [0, -0.02, 0], 0, 0.85),                             // grip
        cyl(0.03, 0.03, 0.62, 7, [0, 0.04, 0.17], Z, 0, 0.92),                    // wand
        cyl(0.045, 0.03, 0.12, 8, [0, 0.04, 0.5], Z, 0, 0.82),                    // nozzle
        box(0.04, 0.09, 0.05, [0, -0.02, 0.28], 0, 0.85),                         // fore grip
        cyl(0.018, 0.018, 0.12, 5, [0, 0.09, 0.4], Z, 0, 0.8),                    // igniter
      ];
    case 'sniper':
      return [
        box(0.045, 0.1, 0.26, [0, -0.025, -0.36], 0, 0.88),                       // stock
        box(0.05, 0.065, 0.42, [0, 0, -0.05], 0, 0.92),
        cyl(0.014, 0.017, 0.62, 6, [0, 0.01, 0.46], Z, 0, 0.92),                  // long barrel
        cyl(0.028, 0.028, 0.26, 7, [0, 0.08, -0.05], Z, 0, 0.85),                 // scope
        cyl(0.036, 0.03, 0.05, 7, [0, 0.08, 0.1], Z, 0, 0.8),
        box(0.02, 0.05, 0.02, [0, 0.045, -0.05], 0, 0.85),
        box(0.006, 0.12, 0.02, [0.02, -0.08, 0.18], [0.5, 0, 0], 0.8),            // bipod
        box(0.006, 0.12, 0.02, [-0.02, -0.08, 0.18], [0.5, 0, 0], 0.8),
      ];
    case 'grenadier':
      return [
        box(0.045, 0.085, 0.22, [0, -0.02, -0.3], 0, 0.88),                       // stock
        box(0.055, 0.08, 0.34, [0, 0, -0.04], 0, 0.92),                           // receiver
        cyl(0.075, 0.075, 0.05, 10, [0, -0.07, 0.02], [0, 0, HALF_PI], 0, 0.85),  // drum mag
        cyl(0.03, 0.03, 0.2, 7, [0, 0.01, 0.22], Z, 0, 0.85),                     // finned barrel
        cyl(0.014, 0.014, 0.08, 5, [0, 0.01, 0.36], Z, 0, 0.9),
        box(0.035, 0.08, 0.04, [0, -0.06, 0.13], 0, 0.85),                        // fore grip
      ];
    default: // rifleman
      return [
        box(0.045, 0.095, 0.25, [0, -0.025, -0.36], 0, 0.88),                     // stock
        box(0.05, 0.07, 0.36, [0, 0, -0.07], 0, 0.92),                            // receiver / handguard
        cyl(0.015, 0.016, 0.42, 6, [0, 0.01, 0.3], Z, 0, 0.92),                   // barrel
        box(0.03, 0.06, 0.06, [0, -0.06, -0.06], 0, 0.85),                        // clip
        box(0.008, 0.03, 0.16, [0, -0.015, 0.56], 0, 0.95),                       // bayonet
        box(0.006, 0.12, 0.012, [0, -0.04, -0.16], [0.9, 0, 0], 0.8),             // sling
      ];
  }
}

// Melted-puddle blob used under fire corpses (model space, at feet)
function buildPuddle() {
  const g = new THREE.CylinderGeometry(0.5, 0.56, 0.035, 14, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(z, x);
    const k = 1 + 0.18 * Math.sin(a * 3 + 1.3) + 0.1 * Math.sin(a * 5 + 0.4);
    pos.setX(i, x * k); pos.setZ(i, z * k * 0.9);
  }
  g.computeVertexNormals();
  return prim(g, [0, 0.018, 0], 0, [1, 1, 1], 0.55);
}

// ---------- per-class caches ----------
const classCache = new Map();
export let PUDDLE_GEO = null;

function bonePartDefs(classId) {
  return {
    base: buildBase(), pelvis: buildPelvis(), torso: buildTorso(classId), head: buildHead(classId),
    larm: buildArm(1, classId), rarm: buildArm(-1, classId), weapon: buildWeapon(classId),
    lleg: buildThigh(), lknee: buildShin(), rleg: buildThigh(), rknee: buildShin(),
  };
}

function makeBones(classId) {
  const bones = BONE_NAMES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
  for (let i = 1; i < bones.length; i++) {
    const n = BONE_NAMES[i];
    bones[B[boneParent(n, classId)]].add(bones[i]);
    if (n === 'weapon') {
      const w = HOLD[classId] === 'shoulder' ? WEAPON_REST.shoulder : WEAPON_REST.hand;
      bones[i].position.set(...w.pos); bones[i].rotation.x = w.rotX; bones[i].userData.restRotX = w.rotX;
    } else bones[i].position.set(...REST[n]);
  }
  return bones;
}

export function getClassAssets(classId) {
  if (classCache.has(classId)) return classCache.get(classId);
  if (!PUDDLE_GEO) PUDDLE_GEO = buildPuddle();
  const defs = bonePartDefs(classId);
  const partGeos = {};
  const bones = makeBones(classId);
  bones[0].updateMatrixWorld(true);
  const boneInverses = bones.map((b) => b.matrixWorld.clone().invert());
  const skinParts = [];
  for (const name of Object.keys(defs)) {
    const geo = mergeGeometries(defs[name], false);
    geo.computeBoundingSphere();
    partGeos[name] = geo;
    const g2 = geo.clone().applyMatrix4(bones[B[name]].matrixWorld);
    const n = g2.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = B[name]; sw[i * 4] = 1; }
    g2.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g2.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    skinParts.push(g2);
  }
  const skinGeo = mergeGeometries(skinParts, false);
  // generous static bounds that cover every pose (standing, prone, throwing) so frustum culling is cheap & safe
  skinGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0.2), 1.75);
  skinGeo.boundingBox = new THREE.Box3(new THREE.Vector3(-1.2, -0.2, -1.4), new THREE.Vector3(1.2, 2.3, 1.8));
  let verts = 0; for (const k in partGeos) verts += partGeos[k].attributes.position.count;
  const assets = { classId, partGeos, skinGeo, boneInverses, verts };
  classCache.set(classId, assets);
  return assets;
}

const IDENTITY = new THREE.Matrix4();
const _sphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0.2), 1.75);

// Build a soldier instance. Returns the contract model {root, parts, weaponMount, team, classId} + internals.
export function buildSoldierModel(team, classId, material) {
  const a = getClassAssets(classId);
  const root = new THREE.Group(); root.name = `soldier_${team}_${classId}`;
  const bones = makeBones(classId);
  const skeleton = new THREE.Skeleton(bones, a.boneInverses);
  const mesh = new THREE.SkinnedMesh(a.skinGeo, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.boundingSphere = _sphere; mesh.boundingBox = a.skinGeo.boundingBox;
  mesh.add(bones[0]);
  mesh.bind(skeleton, IDENTITY);
  root.add(mesh);
  const parts = { head: bones[B.head], torso: bones[B.torso], larm: bones[B.larm], rarm: bones[B.rarm], lleg: bones[B.lleg], rleg: bones[B.rleg] };
  return {
    root, parts, weaponMount: bones[B.weapon], team, classId,
    mesh, bones, skeleton, assets: a, baseMaterial: material,
    lost: new Set(),     // severed zones
    melt: 0,             // 0..1 plastic melting
    pose: new Float32Array(32), poseInit: false, state: 'idle', stateTime: 0, time: Math.random() * 10,
    dirty: true,
  };
}
