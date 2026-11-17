// The backyard props, seen from toy-soldier scale (1 unit ~ 2.8 cm real). All procedural, chunky toy look.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { T } from './batch.js';
import * as TX from './textures.js';
import { windPatch } from './grass.js';

const PI = Math.PI;

export function buildProps(ctx) {
  const { batch, scene, getHeight, addCollider, rand, hoseColliders } = ctx;
  const out = { flagSite: null, hoseCurve: null, blanketRect: [-22, 24, 22, 58], sandRect: [-28, -101, 28, -67], dynamic: [] };

  // ---------- materials ----------
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const M = {
    plastic: std({ roughness: 0.42, metalness: 0 }),
    plasticDS: std({ roughness: 0.45, metalness: 0, side: THREE.DoubleSide }),
    wood: std({ roughness: 0.85, map: TX.woodTexture() }),
    paint: std({ roughness: 0.7 }),
    metal: std({ roughness: 0.32, metalness: 0.8 }),
    clay: std({ roughness: 0.92 }),
    stone: std({ roughness: 0.95, flatShading: true }),
    sand: std({ roughness: 1 }),
    paper: std({ roughness: 0.9 }),
    rubber: std({ roughness: 0.38 }),
    plant: std({ roughness: 0.7, side: THREE.DoubleSide }),
    dandelion: windPatch(std({ roughness: 0.8, side: THREE.DoubleSide }), 0.01),
    canvas: std({ roughness: 0.95 }),
    foliage: std({ roughness: 0.9, flatShading: true }),
  };
  const blockAtlas = new THREE.MeshStandardMaterial({ map: TX.blockAtlasTexture(), transparent: false, alphaTest: 0.5, roughness: 0.5, vertexColors: true });
  const spineMat = new THREE.MeshStandardMaterial({ map: TX.spineAtlasTexture(), alphaTest: 0.4, roughness: 0.6, vertexColors: true });
  const canMats = [0, 1, 2].map((k) => new THREE.MeshStandardMaterial({ map: TX.canLabelTexture(k), roughness: 0.28, metalness: 0.55, vertexColors: true }));
  out.materials = M;

  // ---------- geometry cache ----------
  const gc = new Map();
  const cached = (key, f) => { let g = gc.get(key); if (!g) gc.set(key, g = f()); return g; };
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const rbox = (w, h, d, r = 0.15, s = 2) => cached(`rb${w},${h},${d},${r},${s}`, () => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)));
  const cyl = (rt, rb, h, seg = 20, open = false) => cached(`cy${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
  const sph = (r, ws = 16, hs = 12) => cached(`sp${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
  const tor = (R, r, rs = 8, ts = 24, arc = PI * 2) => cached(`to${R},${r},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc));
  const add = (g, m, mat, col, opt) => batch.add(g, m, mat, col, opt);
  const box = (x, y, z, w, h, d, mat, col, ry = 0, opt) => add(BOX, T(x, y, z, 0, ry, 0, w, h, d), mat, col, opt);

  const footY = (x, z, hw, hd) => Math.min(getHeight(x, z), getHeight(x - hw, z - hd), getHeight(x + hw, z - hd), getHeight(x - hw, z + hd), getHeight(x + hw, z + hd)) - 0.05;
  const solid = (x0, z0, x1, z1, y0, y1, tag, extra) => addCollider(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), tag, extra);

  // A plane with a sub-rectangle of an atlas.
  const atlasPlane = (w, h, u0, v0, u1, v1) => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    return g;
  };

  // =====================================================================================
  // SANDBOX FORT (green HQ)
  // =====================================================================================
  {
    const [x0, z0, x1, z1] = out.sandRect;
    const H = 2.5, Tk = 1.2;
    const boardCol = [0xc79a62, 0xbf8f58, 0xcda36c];
    const segX = (z, a, b, i) => {
      const y0 = footY((a + b) / 2, z, (b - a) / 2, Tk / 2) - 0.2, y1 = getHeight((a + b) / 2, z) + H;
      add(rbox(b - a, y1 - y0, Tk, 0.2), T((a + b) / 2, (y0 + y1) / 2, z), M.wood, boardCol[i % 3]);
      add(rbox(b - a + 0.3, 0.35, Tk + 0.5, 0.12), T((a + b) / 2, y1 + 0.1, z), M.wood, 0xd8ad78);
      solid(a, z - Tk / 2, b, z + Tk / 2, y0, y1 + 0.25, 'cover');
    };
    const segZ = (x, a, b, i) => {
      const y0 = footY(x, (a + b) / 2, Tk / 2, (b - a) / 2) - 0.2, y1 = getHeight(x, (a + b) / 2) + H;
      add(rbox(Tk, y1 - y0, b - a, 0.2), T(x, (y0 + y1) / 2, (a + b) / 2), M.wood, boardCol[i % 3]);
      add(rbox(Tk + 0.5, 0.35, b - a + 0.3, 0.12), T(x, y1 + 0.1, (a + b) / 2), M.wood, 0xd8ad78);
      solid(x - Tk / 2, a, x + Tk / 2, b, y0, y1 + 0.25, 'cover');
    };
    // front (facing the enemy) with three entrances
    [[x0, -22], [-14, -4], [4, 14], [22, x1]].forEach(([a, b], i) => segX(z1, a, b, i));
    segX(z0, x0, x1, 1);
    [[z0, -90], [-82, z1]].forEach(([a, b], i) => { segZ(x0, a, b, i); segZ(x1, a, b, i + 1); });
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [-22, z1], [-14, z1], [-4, z1], [4, z1], [14, z1], [22, z1]]) {
      const y = getHeight(px, pz);
      add(rbox(1.7, H + 1.2, 1.7, 0.25), T(px, y + (H + 1.2) / 2 - 0.3, pz), M.wood, 0xb5844f);
    }
    // sand castle behind the flag
    const cx = 0, cz = -94, gy = getHeight(cx, cz) - 0.1, sc = 0xd9b779;
    add(cyl(3.4, 3.9, 1.6, 24), T(cx, gy + 0.8, cz), M.sand, sc);
    add(cyl(2.3, 2.6, 1.4, 20), T(cx, gy + 2.3, cz), M.sand, 0xdcbd80);
    add(cyl(1.15, 1.3, 1.6, 16), T(cx, gy + 3.8, cz), M.sand, sc);
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; add(BOX, T(cx + Math.cos(a) * 1.0, gy + 4.8, cz + Math.sin(a) * 1.0, 0, -a, 0, 0.45, 0.5, 0.45), M.sand, sc); }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * PI * 2 + PI / 4, tx = cx + Math.cos(a) * 3.5, tz = cz + Math.sin(a) * 3.5;
      add(cyl(0.8, 0.95, 2.6, 14), T(tx, gy + 1.3, tz), M.sand, 0xd2ae6e);
      add(cyl(0.01, 0.95, 1.1, 14), T(tx, gy + 3.1, tz), M.sand, 0xd2ae6e);
    }
    add(BOX, T(cx, gy + 5.3, cz, 0, 0, 0, 0.06, 1.2, 0.06), M.paint, 0x6b4b2a);
    add(BOX, T(cx + 0.35, gy + 5.65, cz, 0, 0, 0, 0.7, 0.45, 0.04), M.canvas, 0xe8d35a);
    solid(cx - 3.9, cz - 3.9, cx + 3.9, cz + 3.9, gy, gy + 1.6, 'cover');
    solid(cx - 2.6, cz - 2.6, cx + 2.6, cz + 2.6, gy, gy + 3.0, 'prop');
    solid(cx - 1.3, cz - 1.3, cx + 1.3, cz + 1.3, gy, gy + 4.6, 'prop');
    // sand heaps
    for (const [hx, hz, r] of [[-12, -96, 3], [14, -97, 2.5], [-20, -80, 2.2], [20, -78, 2.6], [8, -72, 1.6]]) add(sph(1, 14, 10), T(hx, getHeight(hx, hz) - 0.1, hz, 0, 0, 0, r, 0.45, r * 0.8), M.sand, 0xddbd84, { cast: false });
    // toy shovel stuck in the sand
    {
      const sx = 17, sz = -91, y = getHeight(sx, sz);
      add(cyl(0.22, 0.22, 7, 10), T(sx, y + 3, sz, 0.35, 0, -0.25), M.plastic, 0xd8352a);
      add(rbox(1.9, 0.5, 0.5, 0.2), T(sx + 1.6, y + 6.2, sz + 1.1, 0.35, 0, -0.25), M.plastic, 0xd8352a);
      add(rbox(2.2, 2.4, 0.18, 0.08), T(sx - 0.25, y + 0.2, sz - 0.3, 0.35, 0, -0.25), M.plastic, 0x2a7fd8);
      solid(sx - 1.2, sz - 0.8, sx + 1.2, sz + 0.4, y - 0.5, y + 1.4, 'prop');
    }
    // little pail in the fort (good cover)
    {
      const px = -18, pz = -92, y = getHeight(px, pz) - 0.1;
      add(cyl(1.9, 1.5, 3.4, 22, true), T(px, y + 1.7, pz), M.plasticDS, 0x2a86e0);
      add(cyl(1.5, 1.5, 0.1, 22), T(px, y + 0.05, pz), M.plastic, 0x2a86e0);
      add(tor(1.9, 0.14, 6, 24), T(px, y + 3.4, pz, PI / 2), M.plastic, 0x2378c8);
      add(cyl(1.75, 1.75, 0.2, 22), T(px, y + 3.0, pz), M.sand, 0xd9b779, { cast: false });
      add(tor(1.95, 0.08, 6, 20, PI), T(px, y + 3.3, pz, 0, 0.6, 0), M.plastic, 0xf0d040);
      solid(px - 1.75, pz - 1.75, px + 1.75, pz + 1.75, y, y + 3.4, 'cover');
    }
  }

  // =====================================================================================
  // SANDBAG WALLS
  // =====================================================================================
  const sandbagRun = (xa, za, xb, zb) => {
    const len = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.round(len / 1.45)), ang = Math.atan2(xb - xa, zb - za);
    const ux = (xb - xa) / len, uz = (zb - za) / len;
    const cols = [0xa99567, 0x9d8a5c, 0xb3a070, 0x948255];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = xa + (xb - xa) * t, z = za + (zb - za) * t, gy = getHeight(x, z) - 0.05;
      for (let row = 0; row < 3; row++) {
        const off = (row % 2) * 0.5 * (len / n);
        if (row % 2 && i === n - 1) continue;
        const bx = x + ux * off, bz = z + uz * off;
        const j = (i * 7 + row * 3) % 4;
        add(rbox(0.8, 0.46, 1.42, 0.2, 1), T(bx, gy + 0.23 + row * 0.41, bz, 0, ang + (j - 1.5) * 0.04, (j - 1.5) * 0.03), M.canvas, cols[j]);
      }
    }
    // colliders: chunked into ~3-unit pieces
    const pieces = Math.max(1, Math.round(len / 3));
    for (let i = 0; i < pieces; i++) {
      const a = i / pieces, b = (i + 1) / pieces;
      const pxa = xa + (xb - xa) * a, pza = za + (zb - za) * a, pxb = xa + (xb - xa) * b, pzb = za + (zb - za) * b;
      const gy = Math.min(getHeight(pxa, pza), getHeight(pxb, pzb)) - 0.05;
      solid(Math.min(pxa, pxb) - 0.4, Math.min(pza, pzb) - 0.4, Math.max(pxa, pxb) + 0.4, Math.max(pza, pzb) + 0.4, gy, gy + 1.28, 'cover', { sandbag: true });
    }
  };
  for (const [a, b, c, d] of [
    [-12, -60, -4, -60], [4, -60, 12, -60], [-38, -59, -27, -59], [27, -59, 38, -59],
    [-10, -76, -3.5, -76], [3.5, -76, 10, -76], [-11, -82, -11, -76.6], [11, -82, 11, -76.6],
    [-47, -80, -47, -70], [47, -80, 47, -70], [-24, -48, -16, -48], [16, -48, 24, -48],
  ]) sandbagRun(a, b, c, d);

  // =====================================================================================
  // FLOWER POTS
  // =====================================================================================
  const flowerPot = (x, z, r, h, kind) => {
    const gy = footY(x, z, r, r) - 0.1;
    add(cyl(r, r * 0.78, h, 28), T(x, gy + h / 2, z), M.clay, 0xc4673e);
    add(cyl(r * 1.1, r * 1.1, h * 0.16, 28), T(x, gy + h * 0.92, z), M.clay, 0xcf7448);
    add(cyl(r * 0.98, r * 0.98, 0.1, 24), T(x, gy + h * 0.97, z), M.clay, 0x4a3221, { cast: false });
    solid(x - r * 0.92, z - r * 0.92, x + r * 0.92, z + r * 0.92, gy, gy + h, 'cover', { pot: true });
    const top = gy + h;
    const stemH = kind === 'sun' ? 16 : 10;
    add(cyl(0.22, 0.3, stemH, 8), T(x, top + stemH / 2, z, 0.04, 0, 0.03), M.plant, 0x3f7a2a);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4, hy = top + 1.5 + i * (stemH * 0.15);
      add(sph(1, 10, 6), T(x + Math.cos(a) * 1.4, hy, z + Math.sin(a) * 1.4, 0, -a, 0.5, 2.2, 0.12, 0.8), M.plant, i % 2 ? 0x4c8f33 : 0x3f7f2c);
    }
    const fy = top + stemH;
    if (kind === 'sun') {
      add(cyl(1.6, 1.6, 0.7, 20), T(x, fy, z + 0.3, PI / 2 - 0.35, 0, 0), M.plant, 0x5a3818);
      for (let i = 0; i < 14; i++) { const a = i / 14 * PI * 2; add(sph(1, 8, 6), T(x + Math.cos(a) * 2.4, fy + Math.sin(a) * 2.4 * 0.94, z + 0.2 - Math.sin(a) * 0.8, 0.35, 0, a, 1.3, 0.55, 0.15), M.plant, 0xf4c01e); }
    } else {
      for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; add(sph(1, 10, 8), T(x + Math.cos(a) * 0.7, fy + 0.9, z + Math.sin(a) * 0.7, 0, -a, 0.35, 0.55, 1.5, 0.9), M.plant, kind === 'red' ? 0xd8263a : 0xb84dd6); }
      add(sph(0.5, 8, 6), T(x, fy + 0.6, z), M.plant, 0xf2d24a);
    }
  };
  flowerPot(-52, -48, 3.6, 6.2, 'red');
  flowerPot(52, -44, 3.3, 5.6, 'sun');
  flowerPot(-58, -40, 2.3, 4.0, 'purple');
  // toppled pot spilling soil (center-right)
  {
    const x = 26, z = -40, r = 2.3, L = 4.6, gy = getHeight(x, z);
    add(cyl(r, r * 0.78, L, 24, true), T(x, gy + r * 0.9, z, 0, 0, PI / 2 - 0.05), M.clay, 0xc4673e);
    add(cyl(r * 0.78, r * 0.78, 0.15, 24), T(x - L / 2, gy + r * 0.9, z, 0, 0, PI / 2), M.clay, 0xb85e37);
    add(sph(1, 14, 8), T(x + 3.5, gy - 0.15, z + 0.4, 0, 0.3, 0, 3.4, 0.6, 2.5), M.clay, 0x4b3322, { cast: false });
    add(cyl(0.18, 0.18, 7, 6), T(x + 6, gy + 0.4, z + 1, 0, 0.5, PI / 2 - 0.08), M.plant, 0x3f7a2a);
    for (let i = 0; i < 6; i++) add(sph(0.6, 8, 6), T(x + 9.3 + Math.cos(i) * 0.6, gy + 0.6, z + 2.6 + Math.sin(i) * 0.6, 0, 0, 0, 0.6, 1.4, 1), M.plant, 0xe8e0f0);
    solid(x - L / 2, z - r, x + L / 2, z + r, gy - 0.2, gy + r * 1.9, 'cover');
  }

  // =====================================================================================
  // FALLEN WATERING CAN (left/center divider)
  // =====================================================================================
  {
    const x = -36, z = -28, R = 3, L = 9, gy = getHeight(x, z) - 0.2, cy = gy + R;
    const col = 0x9fb3bb;
    add(cyl(R, R, L, 30), T(x, cy, z, PI / 2, 0, 0), M.metal, col);
    for (const e of [-1, 1]) add(tor(R, 0.22, 8, 30), T(x, cy, z + e * L / 2, 0, 0, 0), M.metal, 0x8a9ea6);
    for (let i = -1; i <= 1; i++) add(tor(R + 0.02, 0.1, 6, 30), T(x, cy, z + i * 2.2, 0, 0, 0), M.metal, 0x88a0a8);
    // cap/top opening on the far end
    add(cyl(1.2, 1.2, 0.8, 18), T(x + 1.6, cy + 0.2, z - L / 2 - 0.2, PI / 2, 0, 0), M.metal, 0x8396a0);
    // spout (lying out toward +z)
    const sp = new THREE.Vector3(x + 0.6, gy + 1.1, z + L / 2 - 0.5), ep = new THREE.Vector3(x + 2.8, gy + 1.3, z + L / 2 + 7.5);
    const mid = sp.clone().add(ep).multiplyScalar(0.5), dir = ep.clone().sub(sp), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    add(cyl(0.3, 0.55, len, 12), new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), M.metal, col);
    add(cyl(1.1, 0.4, 1.0, 18), new THREE.Matrix4().compose(ep.clone().addScaledVector(dir, 0.4), q, new THREE.Vector3(1, 1, 1)), M.metal, 0x7f939b);
    // handle arching out on the +x side (plane contains the can's axis)
    const hm = new THREE.Matrix4().set(0, 1, 0, x + R - 0.2, 0, 0, 1, cy, 1, 0, 0, z, 0, 0, 0, 1);
    add(tor(3.0, 0.35, 8, 20, PI), hm, M.metal, 0x8fa3ab);
    solid(x - R, z - L / 2 - 0.6, x + R, z + L / 2, gy, gy + 2 * R, 'cover');
    solid(x + R, z - 3.0, x + R + 3.1, z + 3.0, gy + 2, gy + 4, 'prop', { noFloor: true });
    ctx.puddles.push([x + 3.2, z + L / 2 + 9, 3.2]);
  }

  // =====================================================================================
  // SODA CANS
  // =====================================================================================
  const sodaCan = (x, z, kind, lying = false, rotY = 0) => {
    const r = 1.22, h = 4.4, gy = getHeight(x, z) - 0.05;
    const m = lying ? (lx, ly, lz, extra = new THREE.Matrix4()) => T(x, gy + r, z, 0, rotY, PI / 2).multiply(T(lx, ly, lz)).multiply(extra)
                    : (lx, ly, lz, extra = new THREE.Matrix4()) => T(x, gy + h / 2, z, 0, rotY, 0).multiply(T(lx, ly, lz)).multiply(extra);
    add(cyl(r, r, h * 0.8, 32, true), m(0, 0, 0), canMats[kind], 0xffffff);
    add(cyl(r * 0.98, r * 0.88, h * 0.1, 32, true), m(0, h * 0.45, 0), M.metal, 0xd2d6db);
    add(cyl(r * 0.88, r * 0.98, h * 0.1, 32, true), m(0, -h * 0.45, 0), M.metal, 0xd2d6db);
    add(cyl(r * 0.88, r * 0.88, 0.05, 32), m(0, h * 0.47, 0), M.metal, 0xc0c5ca);
    add(cyl(r * 0.86, r * 0.86, 0.05, 32), m(0, -h * 0.5, 0), M.metal, 0xc0c5ca);
    add(tor(r * 0.86, 0.07, 6, 32), m(0, h * 0.5, 0, T(0, 0, 0, PI / 2)), M.metal, 0xd8dce0);
    add(rbox(0.5, 0.06, 0.9, 0.03), m(0, h * 0.5, 0.25), M.metal, 0xb5babf);
    if (lying) {
      const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
      const hx = (h / 2) * c + r * s, hz = (h / 2) * s + r * c;
      solid(x - hx, z - hz, x + hx, z + hz, gy, gy + 2 * r, 'cover');
    } else solid(x - r * 0.9, z - r * 0.9, x + r * 0.9, z + r * 0.9, gy, gy + h, 'cover', { can: true });
  };
  sodaCan(12, -27, 0); sodaCan(-14, -14, 1); sodaCan(-11.5, -17, 0, false, 1); sodaCan(18, -6, 2, true, 0.15); sodaCan(-58, 64, 1, true, 1.3);
  sodaCan(46, 66, 2); sodaCan(-4, 88, 0, true, 0.6);
  // crushed can
  {
    const x = -26, z = 4, gy = getHeight(x, z);
    add(cyl(1.3, 1.25, 4.4, 14, true), T(x, gy + 0.6, z, PI / 2, 0.7, 0, 1.05, 1, 0.42), canMats[2], 0xdddddd);
    solid(x - 2, z - 2, x + 2, z + 2, gy - 0.1, gy + 1.1, 'cover');
  }

  // =====================================================================================
  // TOY BLOCKS
  // =====================================================================================
  const BS = 1.7;
  const bcols = [0xd8392b, 0x2f66d0, 0xf0b51e, 0x8e44c4, 0xef7a22, 0x22a596, 0xe2e2d8];
  let bseed = 0;
  const block = (x, z, lvl, rot, baseY) => {
    const col = bcols[(bseed * 5 + 3) % bcols.length];
    const y = baseY + BS / 2 + lvl * BS;
    const base = T(x, y, z, 0, rot, 0);
    add(rbox(BS, BS, BS, 0.14, 1), base, M.plastic, col);
    for (let f = 0; f < 5; f++) {
      const g = (bseed * 3 + f * 5) % 16, u0 = (g % 4) / 4, v1 = 1 - Math.floor(g / 4) / 4;
      const pl = cached(`bl${g}`, () => atlasPlane(BS * 0.86, BS * 0.86, u0, v1 - 0.25, u0 + 0.25, v1));
      const fm = f < 4 ? T(0, 0, 0, 0, f * PI / 2, 0).multiply(T(0, 0, BS / 2 + 0.012)) : T(0, BS / 2 + 0.012, 0, -PI / 2, 0, 0);
      add(pl, base.clone().multiply(fm), blockAtlas, 0xffffff, { cast: false });
    }
    bseed++;
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot)), he = (BS / 2) * (c + s) * 0.97;
    solid(x - he, z - he, x + he, z + he, y - BS / 2 - (lvl ? 0 : 0.3), y + BS / 2, 'cover', { block: true });
  };
  const cluster = (cx, cz, list) => {
    const baseY = footY(cx, cz, 2, 2) + 0.02;
    for (const [dx, dz, lvl, r = (rand() - 0.5) * 0.35] of list) block(cx + dx * BS, cz + dz * BS, lvl, lvl ? r * 0.3 : r, baseY);
  };
  cluster(-17, 17, [[0, 0, 0, 0.1], [1.05, 0, 0, 0], [0.5, 0, 1, 0.05], [-0.4, 1.4, 0]]);
  cluster(22, 12, [[0, 0, 0, 0], [0, 1.05, 0, 0], [0, 0, 1, 0.2], [1.7, -0.6, 0]]);
  cluster(8, -52, [[0, 0, 0, 0], [1.05, 0, 0, 0], [2.1, 0, 0, 0], [0.5, 0, 1, 0], [1.55, 0, 1, 0], [1.05, 0, 2, 0.2]]);
  cluster(-73, 47, [[0, 0, 0], [0, 1.05, 0, 0], [0, 0, 1, 0]]);
  cluster(66, 40, [[0, 0, 0, 0], [1.05, 0.15, 0, 0], [0.5, 0.1, 1, 0.1]]);
  cluster(-8, 74, [[0, 0, 0], [1.1, 0.2, 0]]);
  cluster(38, 82, [[0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 2, 0.15], [1.15, 0.35, 0]]);
  cluster(62, -28, [[0, 0, 0, 0], [1.05, 0, 0, 0], [0.5, 0, 1, 0.1]]);
  cluster(-75, -14, [[0, 0, 0, 0], [0, 0, 1, 0.2]]);
  cluster(-30, 86, [[0, 0, 0], [1.2, 0.5, 0]]);
  cluster(70, 74, [[0, 0, 0, 0], [0, 1.05, 0, 0]]);
  cluster(-74, 24, [[0, 0, 0]]);
  cluster(-24, -36, [[0, 0, 0], [0.9, 0.7, 0]]);
  cluster(32, 18, [[0, 0, 0]]);

  // =====================================================================================
  // PICNIC BLANKET PLAIN + snacks
  // =====================================================================================
  {
    const [bx0, bz0, bx1, bz1] = out.blanketRect, W = bx1 - bx0, D = bz1 - bz0;
    const g = new THREE.PlaneGeometry(W, D, W, D);
    g.rotateX(-PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + (bx0 + bx1) / 2, z = p.getZ(i) + (bz0 + bz1) / 2;
      const edge = Math.min(x - bx0, bx1 - x, z - bz0, bz1 - z);
      const wr = Math.sin(x * 0.35 + z * 0.12) * 0.06 + Math.sin(z * 0.5 - x * 0.2) * 0.05 + (edge < 1 ? -0.1 * (1 - edge) : 0);
      p.setXYZ(i, x, getHeight(x, z) + 0.2 + wr, z);
    }
    g.computeVertexNormals();
    const t = TX.ginghamTexture(); t.repeat.set(W / 7, D / 7);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    m.receiveShadow = true; m.name = 'blanket';
    scene.add(m);
    // a folded corner flap
    add(BOX, T(bx1 - 2.5, getHeight(bx1 - 2.5, bz1 - 2.5) + 0.22, bz1 - 2.5, 0, PI / 4, 0, 6.5, 0.1, 3.2), M.canvas, 0xd9a4a0, { cast: false });
  }
  { // paper plate with crumbs
    const x = -9, z = 47, gy = getHeight(x, z) + 0.1;
    add(cyl(4.2, 3.6, 0.25, 32), T(x, gy + 0.12, z), M.paper, 0xf7f4ec);
    add(tor(4.0, 0.25, 6, 40), T(x, gy + 0.3, z, PI / 2), M.paper, 0xefeadc);
    for (let i = 0; i < 9; i++) add(rbox(0.5, 0.3, 0.4, 0.1), T(x + (rand() - 0.5) * 5, gy + 0.35, z + (rand() - 0.5) * 5, 0, rand() * 3, 0), M.paper, 0xc9954a);
    add(rbox(4.2, 1.2, 4.2, 0.4), T(x + 0.8, gy + 0.9, z - 0.5, 0, 0.4, 0), M.paper, 0xe9c78a); // sandwich
    add(BOX, T(x + 0.8, gy + 0.85, z - 0.5, 0, 0.4, 0, 4.6, 0.25, 4.6), M.plant, 0x6fbf3a); // lettuce
    add(BOX, T(x + 0.8, gy + 1.1, z - 0.5, 0, 0.4, 0, 4.3, 0.2, 4.3), M.plant, 0xd9442f); // tomato-ish
    solid(x - 4.2, z - 4.2, x + 4.2, z + 4.2, gy - 0.3, gy + 0.4, 'low');
    solid(x - 2.2, z - 3.3, x + 3.8, z + 2.3, gy, gy + 1.6, 'cover');
  }
  { // cookie
    const x = -13, z = 32, gy = getHeight(x, z) + 0.1;
    add(cyl(1.8, 1.8, 0.55, 22), T(x, gy + 0.27, z), M.paper, 0xbd8443);
    for (let i = 0; i < 7; i++) { const a = i * 2.3, d = 0.4 + (i % 3) * 0.45; add(sph(0.22, 6, 4), T(x + Math.cos(a) * d, gy + 0.55, z + Math.sin(a) * d), M.paper, 0x3b2112); }
    solid(x - 1.6, z - 1.6, x + 1.6, z + 1.6, gy - 0.2, gy + 0.5, 'low');
  }
  { // tipped plastic cup
    const x = 8, z = 40, gy = getHeight(x, z) + 0.05;
    add(cyl(2.0, 1.45, 5.6, 28, true), T(x, gy + 1.75, z, 0, 0, PI / 2 + 0.1), M.plasticDS, 0xd42a35);
    add(cyl(1.45, 1.45, 0.08, 28), T(x - 2.78, gy + 1.47, z, 0, 0, PI / 2 + 0.1), M.plastic, 0xd42a35);
    add(tor(2.0, 0.12, 6, 28), T(x + 2.78, gy + 2.03, z, 0, PI / 2, 0.1), M.plastic, 0xf2f2f2);
    solid(x - 2.9, z - 1.9, x + 2.9, z + 1.9, gy - 0.1, gy + 3.7, 'cover');
    ctx.puddles.push([x + 5.5, z + 0.5, 2.6, 0xc85a2a]);
  }
  { // juice box with straw
    const x = 15, z = 30, gy = getHeight(x, z);
    add(rbox(2.6, 4.2, 1.7, 0.12), T(x, gy + 2.1, z, 0, 0.3, 0), M.paper, 0xf08a1c);
    add(BOX, T(x, gy + 2.2, z, 0, 0.3, 0, 2.65, 1.4, 1.75), M.paper, 0xfff1cc);
    add(cyl(0.12, 0.12, 2.6, 6), T(x + 0.6, gy + 5.1, z, 0, 0.3, 0.3), M.plastic, 0xf2f2f2);
    solid(x - 1.6, z - 1.3, x + 1.6, z + 1.3, gy - 0.1, gy + 4.2, 'cover');
  }
  { // apple
    const x = -17, z = 53, gy = getHeight(x, z);
    add(sph(2.2, 20, 14), T(x, gy + 1.9, z, 0, 0, 0, 1, 0.9, 1), M.plastic, 0xc4202a);
    add(cyl(0.12, 0.16, 1.2, 6), T(x + 0.1, gy + 4.0, z, 0, 0, 0.2), M.plant, 0x5a3b1a);
    add(sph(1, 8, 6), T(x + 0.7, gy + 4.1, z, 0, 0.3, 0.5, 0.9, 0.08, 0.45), M.plant, 0x4c9a2a);
    solid(x - 1.9, z - 1.9, x + 1.9, z + 1.9, gy - 0.1, gy + 3.8, 'cover');
  }

  // =====================================================================================
  // BOOK STACK CLIFF (left/center divider, stair-stepped toward the center lane)
  // =====================================================================================
  {
    const books = [[8.2, 1.1, 11.5, 0x2f4a8c], [7.8, 1.0, 11.0, 0x8c2f3a], [7.6, 1.25, 10.6, 0x2f7a4c], [7.2, 0.95, 10.2, 0xd19a2a], [6.9, 1.15, 9.8, 0x5a3a7a], [6.4, 1.0, 9.2, 0x1f6f8c]];
    let y = footY(-34, 40, 5, 6) + 0.02;
    books.forEach(([w, t, d, col], i) => {
      const maxX = -29.5 - i * 1.25, cx = maxX - w / 2, cz = 40 + (i % 2 ? 0.4 : -0.3);
      const page = 0xf1e7cc;
      add(rbox(w, 0.16, d, 0.06, 1), T(cx, y + 0.08, cz), M.paper, col);
      add(rbox(w, 0.16, d, 0.06, 1), T(cx, y + t - 0.08, cz), M.paper, col);
      add(BOX, T(cx - 0.12, y + t / 2, cz, 0, 0, 0, w - 0.4, t - 0.3, d - 0.35), M.paper, page);
      add(rbox(0.3, t, d, 0.12, 2), T(maxX - 0.15, y + t / 2, cz), M.paper, col); // spine faces +x
      const row = i % 8;
      const sp = cached(`sp${row},${d},${t}`, () => atlasPlane(d * 0.92, Math.max(0.5, t * 0.8), 0, 1 - (row + 1) / 8, 1, 1 - row / 8));
      add(sp, T(maxX + 0.005, y + t / 2, cz, 0, PI / 2, 0), spineMat, 0xffffff, { cast: false });
      solid(maxX - w, cz - d / 2, maxX, cz + d / 2, y - (i ? 0 : 0.4), y + t, 'cliff', { book: true });
      y += t;
    });
    // a bookmark ribbon dangling off the top
    add(BOX, T(-38.5, y - 2.5, 45.2, 0, 0, 0.05, 0.6, 5, 0.04), M.canvas, 0xc02030, { cast: false });
  }

  // =====================================================================================
  // GIANT SNEAKER (center/right divider)
  // =====================================================================================
  {
    const x = 36, z = 42, gy = getHeight(x, z) - 0.1;
    const upper = 0x2f5fb8, accent = 0xf2f2ee, sole = 0xeeeae0;
    add(rbox(5.4, 1.1, 13.4, 0.5, 3), T(x, gy + 0.55, z), M.rubber, sole);
    add(rbox(5.5, 0.35, 13.5, 0.15, 2), T(x, gy + 0.2, z), M.rubber, 0x9a3b2a);
    add(rbox(4.8, 2.6, 10.8, 1.0, 3), T(x, gy + 2.3, z + 0.6), M.canvas, upper);
    add(sph(1, 20, 12), T(x, gy + 1.5, z - 5.0, 0, 0, 0, 2.4, 1.55, 2.4), M.rubber, accent); // toe cap
    add(rbox(4.6, 2.4, 4.6, 0.9, 3), T(x, gy + 4.0, z + 4.2), M.canvas, upper); // ankle collar
    add(rbox(4.75, 0.7, 4.75, 0.3, 2), T(x, gy + 5.2, z + 4.2), M.canvas, 0x1f3f80);
    add(cyl(1.7, 1.7, 0.3, 20), T(x, gy + 5.45, z + 4.4, 0, 0, 0, 1, 1, 1.2), M.canvas, 0x1a1a1a, { cast: false });
    add(rbox(2.6, 0.5, 5.2, 0.2), T(x, gy + 4.0, z - 0.3, -0.5, 0, 0), M.canvas, 0x2a55a8); // tongue
    for (let i = 0; i < 5; i++) add(cyl(0.16, 0.16, 3.0, 6), T(x, gy + 3.55 + i * 0.25, z - 2.6 + i * 1.0, 0.0, 0, PI / 2), M.paper, 0xffffff);
    for (const s of [-1, 1]) add(rbox(0.12, 1.4, 6.5, 0.05), T(x + s * 2.42, gy + 2.2, z + 0.8, 0, 0, s * 0.05), M.canvas, accent); // side stripe
    // loose lace snaking on the ground
    const pts = []; for (let i = 0; i <= 10; i++) { const lx = x - 2.6 - i * 0.9, lz = z - 2 + Math.sin(i * 0.9) * 1.6; pts.push(new THREE.Vector3(lx, getHeight(lx, lz) + 0.16, lz)); }
    pts.unshift(new THREE.Vector3(x - 2.4, gy + 3.6, z - 2.0));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.16, 6), new THREE.Matrix4(), M.paper, 0xffffff);
    solid(x - 2.7, z - 6.7, x + 2.7, z + 6.7, gy - 0.2, gy + 3.7, 'cover', { shoe: true });
    solid(x - 2.4, z + 1.9, x + 2.4, z + 6.5, gy + 3.5, gy + 5.5, 'prop', { noFloor: true });
  }

  // =====================================================================================
  // TIPPED BUCKET (tan staging area) + spilled sand
  // =====================================================================================
  {
    const x = -50, z = 80, gy = getHeight(x, z), L = 8, rTop = 4.0, rBot = 3.1;
    const cy = gy + 3.55, rot = T(x, cy, z, 0, 0, -PI / 2 + 0.11);
    add(cyl(rTop, rBot, L, 32, true), rot, M.plasticDS, 0x2f7fd8);
    add(cyl(rBot, rBot, 0.12, 32), rot.clone().multiply(T(0, -L / 2, 0)), M.plastic, 0x2a72c4);
    add(tor(rTop, 0.3, 8, 32), rot.clone().multiply(T(0, L / 2, 0, PI / 2)), M.plastic, 0x2a72c4);
    add(tor(rTop * 0.95, 0.16, 6, 24, PI), T(x + 1, gy + 0.2, z, PI / 2, 0, 0), M.plastic, 0xf0d040);
    add(sph(1, 16, 10), T(x + 6, gy - 0.25, z, 0, 0.2, 0, 4.5, 0.85, 3.6), M.sand, 0xddbd84, { cast: false });
    solid(x - L / 2, z - rTop, x + L / 2, z + rTop, gy - 0.3, gy + 7.6, 'cover');
  }

  // =====================================================================================
  // GARDEN HOSE (snaking trench line) — colliders low enough to step over
  // =====================================================================================
  {
    const ctrl = [[72, -110], [73, -102], [76, -86], [70, -68], [75, -50], [69, -30], [62, -12], [48, 0], [33, -5], [18, 4], [2, 11], [-14, 5], [-30, 12], [-46, 20], [-60, 13], [-69, 4], [-73, -6]];
    const base = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const pts = base.getSpacedPoints(260);
    const R = 0.34;
    for (const p of pts) p.y = getHeight(p.x, p.z) + R * 0.8;
    // rise up to the spigot on the house wall
    const sp = [new THREE.Vector3(72, 12, -111.3), new THREE.Vector3(72, 7, -111), new THREE.Vector3(72, 2, -110.6), new THREE.Vector3(72, R, -109)];
    const curve = new THREE.CatmullRomCurve3([...sp, ...pts.slice(3)], false, 'centripetal');
    out.hoseCurve = curve;
    add(new THREE.TubeGeometry(curve, 700, R, 10), new THREE.Matrix4(), M.rubber, 0x2b8a4a);
    // stripe
    // brass nozzle at the end
    const end = curve.getPoint(1), tan = curve.getTangent(1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    add(cyl(0.45, 0.42, 1.2, 14), new THREE.Matrix4().compose(end.clone().addScaledVector(tan, 0.5), q, new THREE.Vector3(1, 1, 1)), M.metal, 0xc8a03c);
    add(cyl(0.3, 0.45, 1.6, 14), new THREE.Matrix4().compose(end.clone().addScaledVector(tan, 1.8), q, new THREE.Vector3(1, 1, 1)), M.metal, 0xd6b04a);
    ctx.puddles.push([end.x + tan.x * 4, end.z + tan.z * 4, 4.2]);
    // colliders: short segments along the ground part
    const spaced = curve.getSpacedPoints(300);
    for (let i = 0; i < spaced.length - 1; i += 2) {
      const a = spaced[i], b = spaced[Math.min(i + 2, spaced.length - 1)];
      if (a.y > R * 2.5 + getHeight(a.x, a.z)) continue;
      const gy = Math.min(getHeight(a.x, a.z), getHeight(b.x, b.z));
      hoseColliders.push(solid(Math.min(a.x, b.x) - R, Math.min(a.z, b.z) - R, Math.max(a.x, b.x) + R, Math.max(a.z, b.z) + R, gy - 0.2, Math.max(a.y, b.y) + R * 0.5, 'hose'));
    }
  }

  // =====================================================================================
  // MID-FIELD TOYS: tennis balls, frisbee, rubber duck, dice, trowel, forward sandbag nests
  // =====================================================================================
  {
    const tennis = (x, z, r) => {
      const gy = getHeight(x, z) - 0.15, ry = rand() * 6;
      add(sph(r, 24, 16), T(x, gy + r, z, 0, ry, 0), M.canvas, 0xd5e83a);
      add(tor(r * 1.002, 0.09, 6, 40), T(x, gy + r, z, 0.5, ry, 0.3), M.canvas, 0xf4f4ec, { cast: false });
      add(tor(r * 1.002, 0.09, 6, 40), T(x, gy + r, z, -0.5, ry + 1.6, -0.3), M.canvas, 0xf4f4ec, { cast: false });
      const h = r * 0.82; solid(x - h, z - h, x + h, z + h, gy, gy + 2 * r, 'cover');
    };
    tennis(-46, 52, 2.4); tennis(47, -21, 2.4); tennis(-79, -70, 2.4);
    { // frisbee (walkable low platform)
      const x = 42, z = 8, gy = getHeight(x, z);
      add(cyl(4.4, 4.6, 0.45, 36), T(x, gy + 0.22, z), M.plastic, 0xf06a1c);
      add(tor(4.4, 0.25, 8, 40), T(x, gy + 0.42, z, PI / 2), M.plastic, 0xe05a12);
      add(tor(2.6, 0.08, 6, 30), T(x, gy + 0.46, z, PI / 2), M.plastic, 0xffa060, { cast: false });
      solid(x - 4.3, z - 4.3, x + 4.3, z + 4.3, gy - 0.2, gy + 0.5, 'low');
    }
    { // rubber duck
      const x = 26, z = 62, gy = getHeight(x, z) - 0.1, y = 0xf6cf1c;
      add(sph(1, 22, 14), T(x, gy + 2.0, z, 0, 0, 0, 3.0, 2.1, 2.4), M.plastic, y);
      add(sph(1.55, 20, 14), T(x - 1.6, gy + 4.6, z), M.plastic, y);
      add(sph(1, 12, 8), T(x - 3.1, gy + 4.3, z, 0, 0, 0, 0.9, 0.35, 0.7), M.plastic, 0xf07a1a);
      for (const s of [-1, 1]) add(sph(0.22, 8, 6), T(x - 2.6, gy + 5.0, z + s * 0.75), M.plastic, 0x111111);
      add(sph(1, 12, 8), T(x + 2.7, gy + 2.9, z, 0, 0, 0.6, 0.9, 0.4, 0.9), M.plastic, y); // tail
      solid(x - 3.4, z - 2.3, x + 3.2, z + 2.3, gy, gy + 3.9, 'cover');
      solid(x - 3.2, z - 1.5, x, z + 1.5, gy + 3.9, gy + 6.1, 'prop', { noFloor: true });
    }
    // giant dice
    const pipGeo = cached('pip', () => { const g = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12); g.rotateX(PI / 2); return g; });
    const die = (x, z, rot, red) => {
      const S = 2.4, gy = getHeight(x, z) - 0.05, base = T(x, gy + S / 2, z, 0, rot, 0);
      add(rbox(S, S, S, 0.35, 3), base, M.plastic, red ? 0xc8202a : 0xf4f1e8);
      const pc = red ? 0xffffff : 0x1a1a1a;
      const faces = [[1, [[0, 0]]], [2, [[-.5, -.5], [.5, .5]]], [3, [[-.5, -.5], [0, 0], [.5, .5]]], [4, [[-.5, -.5], [.5, .5], [-.5, .5], [.5, -.5]]], [5, [[-.5, -.5], [.5, .5], [-.5, .5], [.5, -.5], [0, 0]]], [6, [[-.5, -.6], [-.5, 0], [-.5, .6], [.5, -.6], [.5, 0], [.5, .6]]]];
      const orient = [T(0, 0, 0), T(0, 0, 0, 0, PI / 2, 0), T(0, 0, 0, 0, PI, 0), T(0, 0, 0, 0, -PI / 2, 0), T(0, 0, 0, -PI / 2, 0, 0), T(0, 0, 0, PI / 2, 0, 0)];
      faces.forEach(([, pips], fi) => { for (const [u, v] of pips) add(pipGeo, base.clone().multiply(orient[fi]).multiply(T(u * S * 0.55, v * S * 0.55, S / 2 + 0.01)), M.plastic, pc, { cast: false }); });
      const c = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot)), he = S / 2 * (c + sn) * 0.95;
      solid(x - he, z - he, x + he, z + he, gy - 0.2, gy + S, 'cover');
    };
    die(-7, -33, 0.4, false); die(-4.5, -36.5, 1.1, true); die(52, 84, 0.2, false);
    { // trowel stuck in the lawn
      const x = -48, z = -8, gy = getHeight(x, z);
      add(rbox(2.6, 4.2, 0.2, 0.08), T(x, gy + 1.2, z, 0.15, 0.3, 0.1), M.metal, 0xa8b0b4);
      add(cyl(0.3, 0.3, 1.6, 10), T(x - 0.25, gy + 3.9, z - 0.3, 0.15, 0.3, 0.1), M.metal, 0x8a9296);
      add(cyl(0.55, 0.45, 5, 12), T(x - 0.6, gy + 6.9, z - 0.8, 0.15, 0.3, 0.1), M.wood, 0x3d7a3a);
      solid(x - 1.4, z - 0.6, x + 1.4, z + 0.6, gy - 0.3, gy + 3.2, 'cover');
    }
  }
  for (const [a, b, c, d] of [[-30, -1, -22, -1], [20, -15, 28, -15], [-50, 30, -42, 30], [48, 30, 54, 30], [-12, 62, -6, 62], [10, 60, 16, 60]]) sandbagRun(a, b, c, d);
  cluster(-42, 26, [[0, 0, 0, 0], [1.05, 0, 0, 0.1]]);
  cluster(44, 22, [[0, 0, 0, 0], [0, 1.05, 0, 0], [0.5, 0.5, 1, 0.3]]);

  // =====================================================================================
  // ROCKS
  // =====================================================================================
  {
    const rockGeos = [0, 1, 2, 3].map((s) => {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position, r2 = TX.rng(100 + s);
      const map = new Map();
      for (let i = 0; i < p.count; i++) {
        const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        if (!map.has(k)) map.set(k, 0.8 + r2() * 0.4);
        const f = map.get(k); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.75, p.getZ(i) * f);
      }
      g.computeVertexNormals();
      return g;
    });
    const spots = [[-80, 60, 1.6], [-78, -50, 1.4], [80, 10, 1.8], [78, -70, 1.2], [-44, 6, 0.9], [44, -18, 1.1], [-6, -8, 0.7], [5, 60, 0.6],
      [-70, 92, 1.5], [74, 96, 1.3], [-36, -70, 0.9], [36, -72, 1.0], [56, 58, 1.2], [-52, 32, 1.0], [24, 70, 0.8], [-20, -20, 0.6], [64, 18, 0.9], [-78, 16, 1.2],
      [12, 20, 0.5], [-28, 64, 0.7], [84, -40, 1.6], [-84, -88, 1.5], [60, -94, 1.0]];
    spots.forEach(([x, z, s], i) => {
      const gy = getHeight(x, z) - s * 0.25, ry = rand() * 6;
      add(rockGeos[i % 4], T(x, gy + s * 0.5, z, 0, ry, 0, s * 1.3, s, s * 1.15), M.stone, [0x8c8778, 0x9a9384, 0x7d7a70, 0xa59e8c][i % 4]);
      if (s >= 0.8) solid(x - s * 1.1, z - s * 1.0, x + s * 1.1, z + s * 1.0, gy, gy + s * 1.15, 'cover');
    });
    // pebble scatter (no colliders)
    for (let i = 0; i < 120; i++) {
      const x = (rand() - 0.5) * 176, z = -100 + rand() * 205, s = 0.12 + rand() * 0.25;
      add(rockGeos[i % 4], T(x, getHeight(x, z) + s * 0.2, z, 0, rand() * 6, 0, s * 1.2, s, s), M.stone, 0x9a9384, { cast: false });
    }
  }

  // =====================================================================================
  // PICKET FENCE (edges) & NEIGHBOUR TREES
  // =====================================================================================
  {
    const FH = 42, W = 3.3, TK = 0.8, gap = 1.1, paint = [0xf1ede2, 0xe8e2d4, 0xf5f2ea];
    const tip = cached('tip', () => { const g = new THREE.ConeGeometry(W / Math.SQRT2, 2.4, 4); g.rotateY(PI / 4); return g; });
    const picketsX = (x, z0, z1, side) => {
      let i = 0;
      for (let z = z0; z <= z1; z += W + gap, i++) {
        const tilt = (Math.sin(z * 1.7) * 0.012);
        add(BOX, T(x, FH / 2 - 1, z, tilt, 0, 0, TK, FH, W), M.paint, paint[i % 3]);
        add(tip, T(x, FH - 1 + 1.2, z, 0, 0, 0, TK / W * Math.SQRT2 * 0.71, 1, 1), M.paint, paint[i % 3]);
      }
      for (const ry of [8, 30]) add(BOX, T(x + side * (TK / 2 + 0.6), ry, (z0 + z1) / 2, 0, 0, 0, 1.2, 2.6, z1 - z0 + 4), M.paint, 0xd9d2c0);
      for (let z = z0 + 10; z < z1; z += 48) add(BOX, T(x + side * 2.4, FH / 2 - 2, z, 0, 0, 0, 3, FH - 2, 3), M.paint, 0xd9d2c0);
    };
    const picketsZ = (z, x0, x1, side) => {
      let i = 0;
      for (let x = x0; x <= x1; x += W + gap, i++) {
        add(BOX, T(x, FH / 2 - 1, z, 0, 0, Math.sin(x * 1.3) * 0.012, W, FH, TK), M.paint, paint[i % 3]);
        add(tip, T(x, FH - 1 + 1.2, z, 0, 0, 0, 1, 1, TK / W * Math.SQRT2 * 0.71), M.paint, paint[i % 3]);
      }
      for (const ry of [8, 30]) add(BOX, T((x0 + x1) / 2, ry, z + side * (TK / 2 + 0.6), 0, 0, 0, x1 - x0 + 4, 2.6, 1.2), M.paint, 0xd9d2c0);
    };
    picketsX(-93, -111, 118, -1); picketsX(93, -111, 118, 1); picketsZ(119, -93, 93, 1);
    solid(-96, -125, -92.6, 122, -2, FH, 'wall'); solid(92.6, -125, 96, 122, -2, FH, 'wall'); solid(-96, 118.6, 96, 122, -2, FH, 'wall');
    // neighbour trees towering beyond the fence
    const tree = (x, z, s) => {
      add(cyl(6 * s, 9 * s, 140 * s, 14), T(x, 70 * s - 2, z), M.foliage, 0x5e4630, { cast: false });
      const r3 = TX.rng(x * 7 + z);
      for (let i = 0; i < 7; i++) add(cached('ico', () => new THREE.IcosahedronGeometry(1, 1)), T(x + (r3() - 0.5) * 70 * s, 140 * s + (r3() - 0.3) * 40 * s, z + (r3() - 0.5) * 70 * s, r3(), r3(), 0, 45 * s, 34 * s, 45 * s), M.foliage, [0x3f6b2e, 0x4a7a34, 0x365e28][i % 3], { cast: false });
    };
    tree(-190, 40, 1.1); tree(185, -60, 1.0); tree(80, 260, 1.3); tree(-120, 250, 0.9); tree(210, 140, 1.2);
    // hedge row behind far fence
    for (let x = -200; x <= 200; x += 22) add(cached('ico', () => new THREE.IcosahedronGeometry(1, 1)), T(x, 12, 150 + Math.sin(x) * 6, x, 0, 0, 20, 26, 14), M.foliage, 0x3b6a2c, { cast: false });
  }

  // =====================================================================================
  // HOUSE WALL with back door (looming at the green end)
  // =====================================================================================
  {
    const zW = -112;
    const sid = TX.sidingTexture(); sid.repeat.set(9, 7);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(320, 200, 8), new THREE.MeshStandardMaterial({ map: sid, roughness: 0.85 }));
    wall.position.set(0, 98, zW - 4); wall.receiveShadow = true; wall.castShadow = false; wall.name = 'houseWall';
    scene.add(wall);
    solid(-160, zW - 8, 160, zW, -2, 198, 'wall');
    box(0, 4, zW + 0.6, 320, 9, 1.4, M.stone, 0xa8a49a); // foundation
    // door
    const dx = 0, dw = 34, dh = 78;
    box(dx, 9 + dh / 2, zW + 0.4, dw, dh, 1.0, M.paint, 0x8f2b22);
    for (const [px, py, ph] of [[-8, 26, 22], [8, 26, 22], [-8, 62, 26], [8, 62, 26]]) {
      box(dx + px, py, zW + 1.05, 12, ph, 0.5, M.paint, 0x9c3329);
      box(dx + px, py, zW + 1.25, 10, ph - 2, 0.3, M.paint, 0x922e25);
    }
    for (const s of [-1, 1]) box(dx + s * (dw / 2 + 1.5), 9 + dh / 2 + 1, zW + 0.9, 3, dh + 2, 1.8, M.paint, 0xf0ece0);
    box(dx, 9 + dh + 2, zW + 0.9, dw + 6, 3, 1.8, M.paint, 0xf0ece0);
    add(sph(1.8, 18, 12), T(dx + 12, 42, zW + 3.0), M.metal, 0xd8b14a);
    add(cyl(1.4, 1.4, 1.6, 18), T(dx + 12, 42, zW + 1.6, PI / 2, 0, 0), M.metal, 0xc9a03e);
    box(dx, 13, zW + 1.1, dw - 4, 6, 0.3, M.metal, 0xc9a03e);
    // concrete step + mat
    box(dx, 3.5, zW + 3, dw + 12, 9, 6, M.stone, 0xb5b1a6);
    solid(dx - (dw + 12) / 2, zW, dx + (dw + 12) / 2, zW + 6, -1, 8, 'wall');
    {
      const mt = TX.matTexture();
      const mat = new THREE.Mesh(new THREE.BoxGeometry(28, 0.35, 4.6), [M.canvas, M.canvas, new THREE.MeshStandardMaterial({ map: mt, roughness: 1 }), M.canvas, M.canvas, M.canvas]);
      mat.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(mat.geometry.attributes.position.count * 3).fill(0.3), 3));
      mat.position.set(0, getHeight(0, -104) + 0.12, -104); mat.receiveShadow = true; scene.add(mat);
    }
    // window
    const wx = 60;
    box(wx, 72, zW + 0.6, 44, 56, 1.0, M.paint, 0xf0ece0);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(38, 50, 0.4), new THREE.MeshStandardMaterial({ color: 0x23344a, roughness: 0.05, metalness: 0.9 }));
    glass.position.set(wx, 72, zW + 1.2); scene.add(glass);
    box(wx, 72, zW + 1.6, 1.6, 50, 0.8, M.paint, 0xf0ece0); box(wx, 72, zW + 1.6, 38, 1.6, 0.8, M.paint, 0xf0ece0);
    box(wx, 44, zW + 2.0, 48, 2.2, 4, M.paint, 0xe8e2d4);
    // porch lamp
    box(-24, 60, zW + 1.2, 4, 7, 2.4, M.metal, 0x2b2b2b);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffc860, emissiveIntensity: 1.4 }));
    lamp.position.set(-24, 59, zW + 2.6); scene.add(lamp);
    // downspout
    box(-118, 98, zW + 2, 4, 196, 3, M.metal, 0xd8d4c8);
    // spigot (hose bib)
    add(cyl(0.9, 0.9, 3, 14), T(72, 12, zW + 1.4, PI / 2, 0, 0), M.metal, 0xc9a03e);
    add(cyl(0.6, 0.6, 2.4, 10), T(72, 14.2, zW + 2.6), M.metal, 0xc9a03e);
    add(tor(1.5, 0.3, 6, 16), T(72, 15.4, zW + 2.6, PI / 2, 0, 0), M.metal, 0xb03a2a);
    // eaves shadow band high up
    box(0, 196, zW + 6, 330, 8, 14, M.paint, 0xf0ece0);
  }

  // =====================================================================================
  // DANDELIONS & CLOVER (no colliders)
  // =====================================================================================
  {
    let n = 0;
    for (let tries = 0; n < 46 && tries < 600; tries++) {
      const x = -86 + rand() * 172, z = -60 + rand() * 165;
      if (!ctx.isOpenLawn(x, z, 3)) continue;
      const h = 3 + rand() * 3.5, gy = getHeight(x, z), lean = (rand() - 0.5) * 0.2, rot = rand() * 6;
      const top = new THREE.Vector3(Math.sin(rot) * lean * h, h, Math.cos(rot) * lean * h);
      add(cyl(0.07, 0.1, h, 5), T(x + top.x / 2, gy + h / 2, z + top.z / 2, Math.cos(rot) * lean, 0, -Math.sin(rot) * lean), M.dandelion, 0x6c9a3a, { cast: true });
      if (rand() < 0.45) add(sph(0.85, 12, 8), T(x + top.x, gy + h + 0.4, z + top.z), M.dandelion, 0xf7f5ee);
      else { add(cyl(0.65, 0.3, 0.45, 12), T(x + top.x, gy + h + 0.15, z + top.z), M.dandelion, 0xf6c21c); add(sph(0.45, 8, 6), T(x + top.x, gy + h + 0.35, z + top.z, 0, 0, 0, 1, 0.5, 1), M.dandelion, 0xf2b10f); }
      for (let i = 0; i < 5; i++) { const a = rot + i * 1.26; add(sph(1, 8, 4), T(x + Math.cos(a) * 1.0, gy + 0.08, z + Math.sin(a) * 1.0, 0, -a, 0, 1.3, 0.06, 0.35), M.plant, 0x3f7a2a, { cast: false }); }
      n++;
    }
    for (let k = 0; k < 70; k++) { // clover patches
      const x = -86 + rand() * 172, z = -95 + rand() * 200;
      if (!ctx.isOpenLawn(x, z, 1.5)) continue;
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + k; add(sph(0.35, 8, 4), T(x + Math.cos(a) * 0.35, getHeight(x, z) + 0.55, z + Math.sin(a) * 0.35, 0, 0, 0, 1, 0.12, 1), M.plant, 0x4f8f34, { cast: false }); }
      add(cyl(0.04, 0.04, 0.55, 4), T(x, getHeight(x, z) + 0.27, z), M.plant, 0x4f8f34, { cast: false });
    }
  }
  return out;
}
