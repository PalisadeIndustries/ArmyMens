import * as THREE from 'three';

// Static corpse batching. Settled bodies & severed limbs are baked (positions/normals/vertex colors already
// transformed to world space) into large merged BufferGeometry chunks, bucketed by world cell so each chunk
// frustum-culls well. ~130 corpses per chunk => 1000+ corpses cost a handful of draw calls.
// Records can be removed again (explosions kick corpses back into the simulation); only that chunk rebuilds.

const CELL = 28;
const MAX_V = 160000;
const nm = new THREE.Matrix3();

class Chunk {
  constructor(scene, material, cellKey) {
    this.scene = scene; this.material = material; this.cellKey = cellKey;
    this.records = []; this.vCount = 0; this.iCount = 0;
    this.capV = 0; this.capI = 0; this.geo = null; this.mesh = null;
    this.box = new THREE.Box3();
    this.alloc(12000, 18000);
  }
  alloc(capV, capI) {
    const old = this.geo;
    // compact layout: float positions, int8 normals, uint8 colors (18 bytes/vertex)
    const pos = new Float32Array(capV * 3), nor = new Int8Array(capV * 3), col = new Uint8Array(capV * 3);
    const idx = new Uint32Array(capI);
    if (old) {
      pos.set(old.attributes.position.array.subarray(0, this.vCount * 3));
      nor.set(old.attributes.normal.array.subarray(0, this.vCount * 3));
      col.set(old.attributes.color.array.subarray(0, this.vCount * 3));
      idx.set(old.index.array.subarray(0, this.iCount));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, this.iCount);
    geo.boundingSphere = new THREE.Sphere();
    if (!this.box.isEmpty()) this.box.getBoundingSphere(geo.boundingSphere);
    this.geo = geo; this.capV = capV; this.capI = capI;
    if (!this.mesh) {
      this.mesh = new THREE.Mesh(geo, this.material);
      this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.matrixAutoUpdate = false;
      this.mesh.name = 'corpseChunk';
      this.scene.add(this.mesh);
    } else this.mesh.geometry = geo;
    if (old) old.dispose();
  }
  fits(rec) { return this.vCount + rec.vCount <= MAX_V; }
  add(rec, upload = true) {
    if (this.vCount + rec.vCount > this.capV || this.iCount + rec.iCount > this.capI) {
      let cv = this.capV, ci = this.capI;
      while (this.vCount + rec.vCount > cv) cv *= 2;
      while (this.iCount + rec.iCount > ci) ci *= 2;
      this.alloc(Math.min(Math.max(cv, this.vCount + rec.vCount), MAX_V * 1.2 | 0), ci);
    }
    const g = this.geo, P = g.attributes.position.array, Nn = g.attributes.normal.array, C = g.attributes.color.array, I = g.index.array;
    const v0 = this.vCount, i0 = this.iCount;
    let v = v0, ii = i0;
    const cr = rec.color.r, cg = rec.color.g, cb = rec.color.b;
    for (const part of rec.parts) {
      const src = part.geo, sp = src.attributes.position.array, sn = src.attributes.normal.array, sc = src.attributes.color.array, si = src.index.array;
      const e = part.m.elements;
      nm.getNormalMatrix(part.m); const n = nm.elements;
      const cnt = src.attributes.position.count;
      const tint = part.tint ?? 1;
      for (let k = 0; k < cnt; k++) {
        const x = sp[k * 3], y = sp[k * 3 + 1], z = sp[k * 3 + 2];
        const o = (v + k) * 3;
        P[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
        P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = sn[k * 3], ny = sn[k * 3 + 1], nz = sn[k * 3 + 2];
        let ox = n[0] * nx + n[3] * ny + n[6] * nz, oy = n[1] * nx + n[4] * ny + n[7] * nz, oz = n[2] * nx + n[5] * ny + n[8] * nz;
        const l = 127 / (Math.sqrt(ox * ox + oy * oy + oz * oz) || 1);
        Nn[o] = Math.round(ox * l); Nn[o + 1] = Math.round(oy * l); Nn[o + 2] = Math.round(oz * l);
        const s = sc[k * 3] * tint * 255;
        C[o] = Math.min(255, cr * s); C[o + 1] = Math.min(255, cg * s); C[o + 2] = Math.min(255, cb * s);
      }
      for (let k = 0; k < si.length; k++) I[ii + k] = si[k] + v;
      v += cnt; ii += si.length;
    }
    this.vCount = v; this.iCount = ii;
    rec.chunk = this;
    this.records.push(rec);
    this.box.expandByPoint(rec.boxMin).expandByPoint(rec.boxMax);
    this.box.getBoundingSphere(g.boundingSphere);
    g.setDrawRange(0, this.iCount);
    if (upload) this.markRange(v0, v - v0, i0, ii - i0);
  }
  markRange(v0, vn, i0, inn) {
    const g = this.geo;
    for (const name of ['position', 'normal', 'color']) {
      const a = g.attributes[name]; a.addUpdateRange(v0 * 3, vn * 3); a.needsUpdate = true;
    }
    g.index.addUpdateRange(i0, inn); g.index.needsUpdate = true;
  }
  rebuild() {
    const recs = this.records; this.records = [];
    this.vCount = 0; this.iCount = 0; this.box.makeEmpty();
    for (const r of recs) this.add(r, false);
    const g = this.geo;
    for (const name of ['position', 'normal', 'color']) { g.attributes[name].clearUpdateRanges(); g.attributes[name].needsUpdate = true; }
    g.index.clearUpdateRanges(); g.index.needsUpdate = true;
    g.setDrawRange(0, this.iCount);
    if (!this.box.isEmpty()) this.box.getBoundingSphere(g.boundingSphere);
  }
  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); }
}

export function createBatcher(scene) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0 });
  const cells = new Map(); // key -> Chunk[]
  const chunks = [];
  const dirty = new Set();
  const keyOf = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

  return {
    material,
    chunks,
    add(rec) {
      const key = keyOf(rec.center.x, rec.center.z);
      let list = cells.get(key);
      if (!list) cells.set(key, list = []);
      let ch = list[list.length - 1];
      if (!ch || !ch.fits(rec)) { ch = new Chunk(scene, material, key); list.push(ch); chunks.push(ch); }
      ch.add(rec);
    },
    // Remove a record; its chunk rebuilds at the end of the frame (flush) so several removals batch up.
    remove(rec) {
      const ch = rec.chunk; if (!ch) return;
      const i = ch.records.indexOf(rec);
      if (i >= 0) ch.records.splice(i, 1);
      rec.chunk = null;
      dirty.add(ch);
    },
    flush() {
      if (!dirty.size) return;
      for (const ch of dirty) ch.rebuild();
      dirty.clear();
    },
    // records whose center is within radius of point
    query(point, radius, out = []) {
      const x0 = Math.floor((point.x - radius) / CELL), x1 = Math.floor((point.x + radius) / CELL);
      const z0 = Math.floor((point.z - radius) / CELL), z1 = Math.floor((point.z + radius) / CELL);
      const r2 = radius * radius;
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const list = cells.get(`${x},${z}`); if (!list) continue;
        for (const ch of list) for (const r of ch.records) if (r.center.distanceToSquared(point) <= r2) out.push(r);
      }
      return out;
    },
    clear() {
      for (const ch of chunks) ch.dispose();
      chunks.length = 0; cells.clear(); dirty.clear();
    },
    stats() {
      let v = 0, recs = 0; for (const ch of chunks) { v += ch.vCount; recs += ch.records.length; }
      return { chunks: chunks.length, verts: v, records: recs };
    },
  };
}
