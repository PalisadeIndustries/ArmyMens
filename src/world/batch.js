// Static geometry batcher: merges many small prop pieces into a few meshes per (material, spatial chunk).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
export class Batcher {
  constructor(chunk = 70) { this.chunk = chunk; this.groups = new Map(); this.meshes = []; }

  // add(geom, matrix, material, color): geom is a shared source geometry (not modified). color: hex/Color or null (white).
  add(geom, matrix, material, color = 0xffffff, { cast = true, receive = true } = {}) {
    const g = geom.index ? geom.clone() : geom.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    _c.set(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!matrix?.elements) throw new Error('Batcher.add: bad matrix ' + new Error().stack.split('\n')[2]);
    g.applyMatrix4(matrix);
    if (!g.index) { const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
    g.clearGroups();
    const e = matrix.elements;
    const key = material.uuid + '|' + (cast ? 1 : 0) + (receive ? 1 : 0) + '|' + Math.floor(e[12] / this.chunk) + ',' + Math.floor(e[14] / this.chunk);
    let grp = this.groups.get(key);
    if (!grp) this.groups.set(key, grp = { material, cast, receive, geoms: [] });
    grp.geoms.push(g);
    return g;
  }

  build(parent) {
    for (const grp of this.groups.values()) {
      // convert any 16-bit indices so merge works
      for (const g of grp.geoms) if (!(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
      const merged = mergeGeometries(grp.geoms, false);
      if (!merged) { console.warn('[world] merge failed'); continue; }
      merged.computeBoundingSphere(); merged.computeBoundingBox();
      const m = new THREE.Mesh(merged, grp.material);
      m.castShadow = grp.cast; m.receiveShadow = grp.receive; m.name = 'props';
      m.matrixAutoUpdate = false; m.updateMatrix();
      parent.add(m); this.meshes.push(m);
      for (const g of grp.geoms) g.dispose();
    }
    this.groups.clear();
    return this.meshes;
  }
}

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function T(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
