// WORLD — "The Backyard": a giant lawn seen from toy-soldier scale.
// Green HQ (sandbox fort + flag) at -z in front of the looming house wall; the tan army attacks from +z
// across three lanes split by a book-stack cliff and a giant sneaker, with a garden-hose trench line mid-field.
// See CONTRACTS.md (World). Extra API documented at the bottom of this file.
import * as THREE from 'three';
import { createTerrain, fbm, valueNoise } from './terrain.js';
import { CollisionWorld } from './collision.js';
import { createAtmosphere, detectQuality } from './atmosphere.js';
import { createGrass, wind } from './grass.js';
import { createDecals } from './decals.js';
import { Batcher } from './batch.js';
import { buildProps } from './props.js';
import { grassDetailTexture, flagTexture, rng } from './textures.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------
const BOUNDS = { minX: -89, maxX: 89, minZ: -106, maxZ: 110 };
const SAND = [-28, -101, 28, -67];
const OBJ = V(0, -84);
const LANES_XZ = [
  [[-62, 104], [-64, 62], [-62, 24], [-66, -20], [-66, -56], [-42, -66], [-18, -64], [-18, -72], [-15, -84], [-5, -86]],
  [[0, 104], [2, 70], [0, 62], [-1, 22], [0, -4], [0, -40], [0, -56], [0, -68], [0, -73], [0, -80]],
  [[62, 104], [64, 62], [58, 24], [56, -10], [58, -50], [42, -64], [18, -64], [18, -72], [15, -84], [5, -86]],
];
const TAN_SPAWNS = [[-64, 100, 0], [-40, 98, 0], [-12, 102, 1], [12, 102, 1], [40, 98, 2], [64, 100, 2]];
const GREEN_SPAWNS = [[-12, -97], [0, -79], [12, -97], [-22, -86], [22, -86], [-50, -92], [50, -92]];

function smooth01(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
function rectDist(x, z, r) { const dx = Math.max(r[0] - x, 0, x - r[2]), dz = Math.max(r[1] - z, 0, z - r[3]); return Math.hypot(dx, dz); }
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  let t = l2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
function laneDist(x, z) {
  let d = Infinity;
  for (const l of LANES_XZ) for (let i = 0; i < l.length - 1; i++) d = Math.min(d, segDist(x, z, l[i][0], l[i][1], l[i + 1][0], l[i + 1][1]));
  return d;
}
const mound = (x, z, cx, cz, r, h) => { const d = Math.hypot(x - cx, z - cz) / r; return d >= 1 ? 0 : h * (1 - d * d) * (1 - d * d); };

function heightFn(x, z) {
  let h = 0.42 * Math.sin(x * 0.043 + 0.3) * Math.cos(z * 0.037 - 0.7) + 0.26 * Math.sin(x * 0.09 + z * 0.061 + 1.1)
    + 0.14 * Math.sin(z * 0.13 - x * 0.05 + 1.3) + (fbm(x * 0.05 + 3, z * 0.05 - 7) - 0.5) * 0.5;
  h += mound(x, z, -64, 40, 20, 1.5) + mound(x, z, 62, 8, 18, 1.1) + mound(x, z, 30, 72, 16, 0.8) - mound(x, z, 2, 2, 14, 0.45) + mound(x, z, -40, -6, 14, 0.6);
  // flatten: sandbox fort, spawns, base approaches
  let flat = 1 - smooth01((rectDist(x, z, [SAND[0] - 2, SAND[1] - 8, SAND[2] + 2, SAND[3] + 2])) / 8);
  for (const [sx, sz] of TAN_SPAWNS) flat = Math.max(flat, 1 - smooth01((Math.hypot(x - sx, z - sz) - 8) / 8));
  for (const [sx, sz] of GREEN_SPAWNS) flat = Math.max(flat, 1 - smooth01((Math.hypot(x - sx, z - sz) - 5) / 6));
  const inSand = rectDist(x, z, SAND) <= 0 ? 0.15 : 0.0;
  h = h * (1 - flat) + inSand * flat;
  // fade to 0 at the fence and house
  const edge = Math.min(BOUNDS.maxX + 4 - Math.abs(x), 120 - z, z + 108);
  return h * smooth01(edge / 6);
}

const C = (h) => new THREE.Color(h);
const LAWN_A = C(0x76ad45), LAWN_B = C(0x669b3c), DRY = C(0xb0ad62), DIRT = C(0x977552), SANDC = C(0xe6c98c), SAND_WET = C(0xcfb075), MULCH = C(0x5a3f2a);
const _t = new THREE.Color();
function colorFn(x, z, h, c) {
  const n = fbm(x * 0.07, z * 0.07), n2 = valueNoise(x * 0.7, z * 0.7);
  c.copy(Math.floor((x + 700) / 14) % 2 ? LAWN_A : LAWN_B);
  c.lerp(_t.copy(LAWN_B).multiplyScalar(0.8), smooth01((0.45 - n) * 3) * 0.6);
  c.lerp(DRY, smooth01((n - 0.6) * 3) * 0.6);
  c.multiplyScalar(0.92 + h * 0.06 + n2 * 0.08);
  const ld = laneDist(x, z);
  if (ld < 3.2 && z > -66) c.lerp(DIRT, (1 - ld / 3.2) * (0.35 + 0.35 * n2));
  const sd = rectDist(x, z, SAND) - (n2 - 0.5) * 1.2;
  if (sd <= 0) c.copy(SANDC).lerp(SAND_WET, n * 0.5).multiplyScalar(0.94 + n2 * 0.1);
  else if (sd < 2.5) c.lerp(SANDC, (1 - sd / 2.5) * 0.7);
  if (z < -104) c.lerp(MULCH, smooth01((-104 - z) / 2));
}

// ---------------------------------------------------------------------------------------------
export function createWorld(game) {
  const scene = game.scene;
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const rand = rng(1337);
  const quality = detectQuality(game.renderer);
  const atmo = createAtmosphere(game, quality);

  // terrain
  const terrain = createTerrain({ extent: { minX: -100, maxX: 100, minZ: -112, maxZ: 125 }, cell: 1.25, heightFn, colorFn });
  const getHeight = terrain.getHeight;
  const detail = grassDetailTexture();
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.96, metalness: 0 });
  const ground = terrain.buildMesh(groundMat);
  root.add(ground);
  { // outer lawn beyond the terrain (with a hole where the terrain is)
    const e = terrain.extent, shape = new THREE.Shape();
    shape.moveTo(-900, -900); shape.lineTo(900, -900); shape.lineTo(900, 900); shape.lineTo(-900, 900); shape.lineTo(-900, -900);
    const hole = new THREE.Path(); hole.moveTo(e.minX + 0.05, e.minZ + 0.05); hole.lineTo(e.minX + 0.05, e.maxZ - 0.05); hole.lineTo(e.maxX - 0.05, e.maxZ - 0.05); hole.lineTo(e.maxX - 0.05, e.minZ + 0.05); hole.lineTo(e.minX + 0.05, e.minZ + 0.05);
    shape.holes.push(hole);
    const g = new THREE.ShapeGeometry(shape); g.rotateX(Math.PI / 2);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 7, p.getZ(i) / 7);
    const col = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { col[i * 3] = LAWN_A.r * 0.92; col[i * 3 + 1] = LAWN_A.g * 0.92; col[i * 3 + 2] = LAWN_A.b * 0.92; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const outer = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.96, side: THREE.DoubleSide }));
    outer.receiveShadow = true; outer.name = 'outerLawn'; root.add(outer);
  }

  // colliders + props
  const colliders = [];
  const addCollider = (x0, y0, z0, x1, y1, z1, tag = 'prop', extra) => {
    const c = { min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1), mesh: ground, tag, ...(extra || {}) };
    colliders.push(c); return c;
  };
  const batch = new Batcher(70);
  const puddles = [];
  const hoseColliders = [];
  const isOpenLawn = (x, z, r) => {
    if (rectDist(x, z, SAND) < r + 1 || rectDist(x, z, [-22, 24, 22, 58]) < r || laneDist(x, z) < r + 2 || Math.abs(x) > 88 || z > 108 || z < -100) return false;
    for (const c of colliders) if (x > c.min.x - r && x < c.max.x + r && z > c.min.z - r && z < c.max.z + r) return false;
    return true;
  };
  const props = buildProps({ batch, scene: root, getHeight, addCollider, rand, hoseColliders, puddles, isOpenLawn });
  const propMeshes = batch.build(root);
  for (const c of colliders) c.mesh = propMeshes[0] || ground; // generic static-geometry tag for hit objects

  const coll = new CollisionWorld(colliders, terrain, { minX: -170, maxX: 170, minZ: -130, maxZ: 130 }, 6);

  // puddles (shiny water / juice)
  for (const [x, z, r, col] of puddles) {
    const g = new THREE.CircleGeometry(r, 24); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position; for (let i = 1; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const s = 0.8 + 0.25 * Math.sin(a * 3 + x) + 0.1 * Math.sin(a * 7); p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s); }
    for (let i = 0; i < p.count; i++) p.setY(i, getHeight(x + p.getX(i), z + p.getZ(i)) + 0.05);
    g.translate(x, 0, z);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col ?? 0x7c9fbf, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true; m.renderOrder = 1; root.add(m);
  }

  // grass
  const grass = createGrass(root, {
    count: quality === 'low' ? 5000 : 14000, rand, getHeight,
    extent: { minX: -98, maxX: 98, minZ: -106, maxZ: 124 },
    accept: (x, z) => {
      if (rectDist(x, z, SAND) < 1.2 || rectDist(x, z, props.blanketRect) < 0.4) return 0;
      if (z < -104) return 0.08;
      if (coll.blocked(x, getHeight(x, z) + 0.2, z, 0.3)) return 0;
      const ld = laneDist(x, z);
      const base = 0.45 + 0.55 * fbm(x * 0.06, z * 0.06);
      if (Math.abs(x) > 92 || z > 119) return 0.6;
      if (ld < 1.4 && z > -66) return 0.12;
      if (ld < 3 && z > -66) return base * 0.5;
      return base;
    },
  });

  // flag (objective)
  const objective = { position: OBJ.clone(), radius: 7, flag: null, progress: 0 };
  objective.position.y = getHeight(OBJ.x, OBJ.z);
  const flag = buildFlag(root, objective.position);
  objective.flag = flag.group;
  addCollider(OBJ.x - 0.3, objective.position.y - 0.2, OBJ.z - 0.3, OBJ.x + 0.3, objective.position.y + 9, OBJ.z + 0.3, 'pole', { noFloor: true });

  // decals
  const decals = createDecals(root);
  const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

  // spawn points, lanes
  const onGround = ([x, z]) => new THREE.Vector3(x, getHeight(x, z), z);
  const spawnPoints = { green: GREEN_SPAWNS.map(onGround), tan: TAN_SPAWNS.map(onGround) };
  const lanes = LANES_XZ.map((l) => l.map(onGround));

  // cover points
  const coverPoints = [];
  for (const c of colliders) {
    if (c.tag !== 'cover' && c.tag !== 'cliff') continue;
    const gy = getHeight((c.min.x + c.max.x) / 2, (c.min.z + c.max.z) / 2);
    const ht = c.max.y - gy;
    if (ht < 0.9) continue;
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [nx, nz] of sides) {
      const along = nx ? c.max.z - c.min.z : c.max.x - c.min.x;
      const n = Math.max(1, Math.floor(along / 2.6));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = nx ? (nx > 0 ? c.max.x + 0.75 : c.min.x - 0.75) : c.min.x + (c.max.x - c.min.x) * t;
        const z = nz ? (nz > 0 ? c.max.z + 0.75 : c.min.z - 0.75) : c.min.z + (c.max.z - c.min.z) * t;
        if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) continue;
        const y = getHeight(x, z);
        if (coll.blocked(x, y, z, 0.45)) continue;
        coverPoints.push({ position: new THREE.Vector3(x, y, z), normal: new THREE.Vector3(nx, 0, nz), height: Math.min(ht, 3), collider: c, low: ht < 1.5 });
      }
    }
  }

  // defensive positions for green: cover points behind sandbags/fort walls facing +z threats
  const defensePoints = coverPoints.filter((cp) => cp.normal.z < -0.5 && cp.position.z < -55 && cp.position.z > -100).map((cp) => cp.position);

  // ---------------------------------------------------------------------------------------------
  let orbitT = 0.6;
  const lookTarget = new THREE.Vector3();
  function animate(dt) {
    wind.uTime.value += dt;
    flag.update(dt, objective.progress);
    atmo.update(dt, game.camera);
  }

  const api = {
    bounds: { ...BOUNDS },
    quality,
    colliders,
    spawnPoints,
    objective,
    lanes,
    laneNames: ['left', 'center', 'right'],
    spawnLanes: { tan: TAN_SPAWNS.map((s) => s[2]) },
    coverPoints,
    defensePoints,
    terrain: ground,
    sun: atmo.sun,
    decals,

    getHeight,
    getNormal(x, z, out = new THREE.Vector3()) { return terrain.normalAt(x, z, out); },
    getFloor(x, y, z) { return coll.getFloor(x, y, z); },

    raycast(origin, dir, maxDist = 500) {
      if (!coll.cast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist)) return null;
      const h = coll.hit;
      return {
        point: new THREE.Vector3(origin.x + dir.x * h.dist, origin.y + dir.y * h.dist, origin.z + dir.z * h.dist),
        normal: new THREE.Vector3(h.nx, h.ny, h.nz), dist: h.dist,
        object: h.collider ? h.collider.mesh : ground, collider: h.collider,
        surface: h.collider ? (h.collider.tag || 'prop') : 'ground',
      };
    },
    // Allocation-free variant: returns hit distance or -1.
    raycastDist(ox, oy, oz, dx, dy, dz, maxDist = 500) { return coll.cast(ox, oy, oz, dx, dy, dz, maxDist) ? coll.hit.dist : -1; },
    resolveCircle(pos, radius, height = 1.8) { return coll.resolveCircle(pos, radius, height, api.bounds); },
    hasLineOfSight(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-6) return true;
      const il = 1 / len;
      return !coll.cast(a.x, a.y, a.z, dx * il, dy * il, dz * il, len) || coll.hit.dist >= len - 0.05;
    },
    // Is the xz circle blocked by a collider taller than step height at feet height y?
    isBlocked(x, y, z, radius = 0.4) { return coll.blocked(x, y, z, radius); },

    // Best cover near `pos` that shields from `threat` (Vector3). Returns a coverPoint or null.
    findCover(pos, threat, maxDist = 18, exclude) {
      let best = null, bestScore = Infinity;
      const md2 = maxDist * maxDist;
      for (const cp of coverPoints) {
        const p = cp.position, dx = p.x - pos.x, dz = p.z - pos.z, d2 = dx * dx + dz * dz;
        if (d2 > md2 || (exclude && exclude.has?.(cp))) continue;
        let tx = threat.x - p.x, tz = threat.z - p.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const facing = cp.normal.x * tx + cp.normal.z * tz; // want the cover between us and the threat => normal points away
        if (facing > -0.35) continue;
        const score = Math.sqrt(d2) + facing * 4 + (cp.low ? 1.5 : 0) + (cp.claimed ? 25 : 0);
        if (score < bestScore) { bestScore = score; best = cp; }
      }
      return best;
    },
    // Nearest lane index for a position, and the next waypoint index along it toward the objective.
    nearestLane(pos) {
      let bi = 0, bd = Infinity;
      LANES_XZ.forEach((l, li) => { for (let i = 0; i < l.length - 1; i++) { const d = segDist(pos.x, pos.z, l[i][0], l[i][1], l[i + 1][0], l[i + 1][1]); if (d < bd) { bd = d; bi = li; } } });
      return bi;
    },
    nextWaypoint(laneIndex, pos) {
      const l = lanes[laneIndex] || lanes[1];
      let bi = 0, bd = Infinity;
      for (let i = 0; i < l.length - 1; i++) { const d = segDist(pos.x, pos.z, l[i].x, l[i].z, l[i + 1].x, l[i + 1].z); if (d < bd) { bd = d; bi = i; } }
      return Math.min(bi + 1, l.length - 1);
    },

    addScorch(point, radius = 2) {
      _p.copy(point); _p.y = Math.max(point.y, getHeight(point.x, point.z)) + 1.5;
      _d.set(0, -1, 0);
      let n = _up;
      if (coll.cast(_p.x, _p.y, _p.z, 0, -1, 0, 6)) { _p.y -= coll.hit.dist; n = _n.set(coll.hit.nx, coll.hit.ny, coll.hit.nz); }
      else { _p.y = getHeight(point.x, point.z); n = terrain.normalAt(point.x, point.z, _n); }
      decals.add('scorch', _p, n, radius * 2.2, scorchTint());
    },
    // kind: 'bullet' | 'crater' | 'scorch' | 'melt' | 'splat'. size optional (world units), color optional (tint).
    addDecal(point, normal, kind = 'bullet', size, color) {
      const sz = size ?? ({ bullet: 0.32, crater: 3.2, scorch: 4, melt: 1.4, splat: 1.2 }[kind] ?? 1);
      decals.add(kind, point, normal || _up, sz, color);
    },
    clearDecals() { decals.clear(); },
    autoDecals: true,

    update(dt) { animate(dt); },
    idleUpdate(dt) {
      animate(dt);
      if (game.state !== 'menu') return;
      orbitT += dt * 0.035;
      const cam = game.camera, R = 88;
      cam.position.set(Math.sin(orbitT) * R, 24 + Math.sin(orbitT * 0.7) * 7, -12 + Math.cos(orbitT) * R * 0.95);
      cam.position.y = Math.max(cam.position.y, getHeight(cam.position.x, cam.position.z) + 6);
      lookTarget.set(Math.sin(orbitT * 0.5) * 10, 3, -18);
      cam.lookAt(lookTarget);
    },
  };

  function scorchTint() { const v = 0.85 + Math.random() * 0.15; return new THREE.Color(v, v, v); }

  // Automatic marks from combat events (Combat can disable via world.autoDecals = false).
  game.events?.on?.('explosion', (e) => {
    if (!api.autoDecals || !e?.point) return;
    const r = e.radius ?? 3;
    const gy = getHeight(e.point.x, e.point.z);
    if (e.point.y - gy < r * 0.8) {
      _p.set(e.point.x, gy, e.point.z);
      decals.add('crater', _p, terrain.normalAt(e.point.x, e.point.z, _n), Math.min(6, r * 0.9), null);
    }
    api.addScorch(e.point, r * 0.9);
  });
  let impactBudget = 0;
  game.events?.on?.('impact', (e) => {
    if (!api.autoDecals || !e?.point || !e.normal) return;
    if (e.kind && !/bullet|world|ground|prop|static|hit|default/i.test(e.kind)) return;
    if (impactBudget > 60) return; impactBudget++;
    // only mark static geometry: short probe back into the surface
    const n = e.normal;
    _p.copy(e.point).addScaledVector(n, 0.15);
    if (!coll.cast(_p.x, _p.y, _p.z, -n.x, -n.y, -n.z, 0.4)) return;
    decals.add('bullet', e.point, n, 0.25 + Math.random() * 0.15, null);
  });
  setInterval(() => { impactBudget = 0; }, 1000);
  game.events?.on?.('game:start', () => { decals.clear(); objective.progress = 0; });
  game.events?.on?.('objective:contested', (e) => { objective.progress = Math.max(0, Math.min(1, e?.progress ?? 0)); });
  game.events?.on?.('objective:lost', () => { objective.progress = 1; });

  // initial menu camera
  api.idleUpdate(0);
  if (typeof window !== 'undefined') window.__world = api;
  return api;
}

// ---------------------------------------------------------------------------------------------
function buildFlag(parent, base) {
  const group = new THREE.Group(); group.position.copy(base); parent.add(group);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.35 });
  const POLE = 9;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, POLE, 10), poleMat); pole.position.y = POLE / 2; pole.castShadow = true; group.add(pole);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd8b14a, metalness: 0.8, roughness: 0.3 })); ball.position.y = POLE + 0.2; ball.castShadow = true; group.add(ball);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd9b779, roughness: 1 }));
  mound.scale.set(1.6, 0.5, 1.6); mound.receiveShadow = true; group.add(mound);
  const W = 3.6, H = 2.3, SX = 18, SY = 10;
  const g = new THREE.PlaneGeometry(W, H, SX, SY); g.translate(W / 2, 0, 0);
  const rest = Float32Array.from(g.attributes.position.array);
  const cloth = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.85 }));
  cloth.castShadow = true; cloth.position.set(0.12, POLE - H / 2 - 0.2, 0);
  group.add(cloth);
  let t = 0, h = POLE - H / 2 - 0.2;
  return {
    group, cloth,
    update(dt, progress) {
      t += dt;
      const target = (POLE - H / 2 - 0.2) - progress * (POLE - H - 0.6);
      h += (target - h) * Math.min(1, dt * 2);
      cloth.position.y = h;
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = rest[i * 3], y = rest[i * 3 + 1], k = x / W;
        p.setZ(i, Math.sin(x * 1.6 - t * 5.5 + y * 0.4) * 0.32 * k + Math.sin(x * 3.1 - t * 8.3) * 0.08 * k);
        p.setY(i, y - k * k * 0.25 + Math.sin(x * 2 - t * 4) * 0.04 * k);
      }
      p.needsUpdate = true;
      g.computeVertexNormals();
      cloth.rotation.y = -0.3 + Math.sin(t * 0.4) * 0.25; // flag points roughly downwind (-x / -z)
    },
  };
}
