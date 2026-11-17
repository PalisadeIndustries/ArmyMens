// Heightfield terrain: gentle lawn undulations baked into a grid (bilinear lookups), a matching mesh with
// vertex-coloured lawn (mowing stripes, worn dirt lanes, sandbox sand) and a fast ray march for bullets.
import * as THREE from 'three';

export function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) { return valueNoise(x, z) * 0.55 + valueNoise(x * 2.1 + 5.2, z * 2.1 - 1.3) * 0.3 + valueNoise(x * 4.3 - 2.7, z * 4.3 + 9.1) * 0.15; }

export function createTerrain({ extent, cell = 1.25, heightFn, colorFn }) {
  const nx = Math.ceil((extent.maxX - extent.minX) / cell) + 1;
  const nz = Math.ceil((extent.maxZ - extent.minZ) / cell) + 1;
  const minX = extent.minX, minZ = extent.minZ;
  const maxX = minX + (nx - 1) * cell, maxZ = minZ + (nz - 1) * cell;
  const H = new Float32Array(nx * nz);
  let hMin = 0, hMax = 0;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const h = heightFn(minX + i * cell, minZ + k * cell);
    H[k * nx + i] = h; if (h < hMin) hMin = h; if (h > hMax) hMax = h;
  }
  const inv = 1 / cell;

  function getHeight(x, z) {
    let fx = (x - minX) * inv, fz = (z - minZ) * inv;
    if (fx < 0 || fz < 0 || fx > nx - 1 || fz > nz - 1) return 0;
    let i = Math.floor(fx), k = Math.floor(fz);
    if (i >= nx - 1) i = nx - 2; if (k >= nz - 1) k = nz - 2;
    fx -= i; fz -= k;
    const o = k * nx + i;
    const a = H[o], b = H[o + 1], c = H[o + nx], d = H[o + nx + 1];
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  }
  function normalAt(x, z, out = new THREE.Vector3()) {
    const e = cell * 0.5;
    return out.set(getHeight(x - e, z) - getHeight(x + e, z), 2 * e, getHeight(x, z - e) - getHeight(x, z + e)).normalize();
  }
  // March a ray through the band [hMin, hMax]; returns distance or -1.
  function raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const lo = hMin - 0.01, hi = hMax + 0.01;
    let t0 = 0, t1 = maxDist;
    if (Math.abs(dy) < 1e-9) { if (oy > hi) return -1; }
    else {
      let a = (hi - oy) / dy, b = (lo - oy) / dy; if (a > b) { const q = a; a = b; b = q; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
      if (oy < lo && dy <= 0) return -1; // starts below everything (shouldn't happen)
    }
    if (t0 > t1) return -1;
    const step = 0.6;
    let tp = t0, fp = oy + dy * t0 - getHeight(ox + dx * t0, oz + dz * t0);
    if (fp <= 0) return t0 <= maxDist ? t0 : -1;
    for (let t = t0 + step; ; t += step) {
      const tc = t > t1 ? t1 : t;
      const f = oy + dy * tc - getHeight(ox + dx * tc, oz + dz * tc);
      if (f <= 0) {
        let a = tp, b = tc;
        for (let n = 0; n < 7; n++) { const m = (a + b) * 0.5; if (oy + dy * m - getHeight(ox + dx * m, oz + dz * m) > 0) a = m; else b = m; }
        return b;
      }
      tp = tc; fp = f;
      if (tc >= t1) return -1;
    }
  }

  function buildMesh(material) {
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    const c = new THREE.Color();
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const o = k * nx + i, x = minX + i * cell, z = minZ + k * cell, h = H[o];
      pos[o * 3] = x; pos[o * 3 + 1] = h; pos[o * 3 + 2] = z;
      colorFn(x, z, h, c);
      col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
      uv[o * 2] = x / 7; uv[o * 2 + 1] = z / 7;
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let p = 0;
    for (let k = 0; k < nz - 1; k++) for (let i = 0; i < nx - 1; i++) {
      const a = k * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx[p++] = a; idx[p++] = d; idx[p++] = b; idx[p++] = b; idx[p++] = d; idx[p++] = e;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    m.name = 'terrain';
    return m;
  }

  return { getHeight, normalAt, raycast, buildMesh, hMin, hMax, extent: { minX, minZ, maxX, maxZ } };
}
