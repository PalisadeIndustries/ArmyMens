// Static collision: AABB colliders in a uniform 2D (xz) grid + heightfield terrain.
// Fast raycast via 2D DDA through grid cells with per-query mailboxing (no allocations in the hot path).
import * as THREE from 'three';

const STEP_HEIGHT = 0.55; // walk-up height for low props (hose, plates, mats)

export class CollisionWorld {
  constructor(colliders, terrain, extent, cellSize = 6) {
    this.colliders = colliders;
    this.terrain = terrain;
    this.cell = cellSize;
    this.minX = extent.minX; this.minZ = extent.minZ;
    this.nx = Math.ceil((extent.maxX - extent.minX) / cellSize);
    this.nz = Math.ceil((extent.maxZ - extent.minZ) / cellSize);
    this.maxX = this.minX + this.nx * cellSize; this.maxZ = this.minZ + this.nz * cellSize;
    this.cells = new Array(this.nx * this.nz);
    this.stamp = 1;
    this.indexed = 0;
    this.hit = { dist: 0, nx: 0, ny: 0, nz: 0, collider: null }; // scratch result
    this._near = [];
    this.rebuild();
  }

  rebuild() {
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    for (const c of this.colliders) this._insert(c);
    this.indexed = this.colliders.length;
  }

  _insert(c) {
    c._stamp = 0;
    const i0 = this._cx(c.min.x), i1 = this._cx(c.max.x), k0 = this._cz(c.min.z), k1 = this._cz(c.max.z);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) this.cells[k * this.nx + i].push(c);
  }

  _sync() { // colliders pushed by other systems after creation get indexed lazily
    if (this.colliders.length !== this.indexed) {
      if (this.colliders.length > this.indexed) { for (let i = this.indexed; i < this.colliders.length; i++) this._insert(this.colliders[i]); this.indexed = this.colliders.length; }
      else this.rebuild();
    }
  }

  _cx(x) { return Math.max(0, Math.min(this.nx - 1, Math.floor((x - this.minX) / this.cell))); }
  _cz(z) { return Math.max(0, Math.min(this.nz - 1, Math.floor((z - this.minZ) / this.cell))); }

  // Colliders overlapping an xz rectangle (deduplicated). Returns a shared scratch array.
  near(minx, minz, maxx, maxz) {
    this._sync();
    const out = this._near; out.length = 0;
    const s = ++this.stamp;
    const i0 = this._cx(minx), i1 = this._cx(maxx), k0 = this._cz(minz), k1 = this._cz(maxz);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const cell = this.cells[k * this.nx + i];
      for (let j = 0; j < cell.length; j++) { const c = cell[j]; if (c._stamp !== s) { c._stamp = s; out.push(c); } }
    }
    return out;
  }

  // Ray vs colliders (+ terrain if withGround). Fills this.hit; returns true on hit.
  cast(ox, oy, oz, dx, dy, dz, maxDist, withGround = true) {
    this._sync();
    let best = maxDist, bestC = null, bnx = 0, bny = 0, bnz = 0, found = false;
    if (withGround) {
      const t = this.terrain.raycast(ox, oy, oz, dx, dy, dz, maxDist);
      if (t >= 0) { best = t; found = true; const n = this.terrain.normalAt(ox + dx * t, oz + dz * t, _n); bnx = n.x; bny = n.y; bnz = n.z; }
    }
    const s = ++this.stamp;
    // clip the ray's xz projection to the grid rectangle
    const idx = Math.abs(dx) > 1e-12 ? 1 / dx : Infinity, idz = Math.abs(dz) > 1e-12 ? 1 / dz : Infinity;
    let t0 = 0, t1 = best;
    if (idx === Infinity) { if (ox < this.minX || ox > this.maxX) return this._done(found, best, bestC, bnx, bny, bnz); }
    else { let a = (this.minX - ox) * idx, b = (this.maxX - ox) * idx; if (a > b) { const q = a; a = b; b = q; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
    if (idz === Infinity) { if (oz < this.minZ || oz > this.maxZ) return this._done(found, best, bestC, bnx, bny, bnz); }
    else { let a = (this.minZ - oz) * idz, b = (this.maxZ - oz) * idz; if (a > b) { const q = a; a = b; b = q; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
    if (t0 > t1) return this._done(found, best, bestC, bnx, bny, bnz);

    const cs = this.cell;
    const sx = ox + dx * t0, sz = oz + dz * t0;
    let i = this._cx(sx), k = this._cz(sz);
    const stepI = dx > 0 ? 1 : -1, stepK = dz > 0 ? 1 : -1;
    const tdx = Math.abs(cs * idx), tdz = Math.abs(cs * idz);
    let tmx = idx === Infinity ? Infinity : ((this.minX + (i + (dx > 0 ? 1 : 0)) * cs) - ox) * idx;
    let tmz = idz === Infinity ? Infinity : ((this.minZ + (k + (dz > 0 ? 1 : 0)) * cs) - oz) * idz;
    for (let guard = 0; guard < 512; guard++) {
      const cell = this.cells[k * this.nx + i];
      for (let j = 0; j < cell.length; j++) {
        const c = cell[j];
        if (c._stamp === s) continue;
        c._stamp = s;
        // slab test
        let tn = 0, tf = best, ax = -1, sgn = 0;
        const mn = c.min, mx = c.max;
        if (idx === Infinity) { if (ox < mn.x || ox > mx.x) continue; }
        else {
          let a = (mn.x - ox) * idx, b = (mx.x - ox) * idx, sg = -1;
          if (a > b) { const q = a; a = b; b = q; sg = 1; }
          if (a > tn) { tn = a; ax = 0; sgn = sg; } if (b < tf) tf = b; if (tn > tf) continue;
        }
        if (Math.abs(dy) < 1e-12) { if (oy < mn.y || oy > mx.y) continue; }
        else {
          const iy = 1 / dy;
          let a = (mn.y - oy) * iy, b = (mx.y - oy) * iy, sg = -1;
          if (a > b) { const q = a; a = b; b = q; sg = 1; }
          if (a > tn) { tn = a; ax = 1; sgn = sg; } if (b < tf) tf = b; if (tn > tf) continue;
        }
        if (idz === Infinity) { if (oz < mn.z || oz > mx.z) continue; }
        else {
          let a = (mn.z - oz) * idz, b = (mx.z - oz) * idz, sg = -1;
          if (a > b) { const q = a; a = b; b = q; sg = 1; }
          if (a > tn) { tn = a; ax = 2; sgn = sg; } if (b < tf) tf = b; if (tn > tf) continue;
        }
        if (ax < 0) continue; // origin inside the box: ignore (forgiving for muzzles poking into cover)
        if (tn < best) {
          best = tn; bestC = c; found = true;
          bnx = ax === 0 ? sgn : 0; bny = ax === 1 ? sgn : 0; bnz = ax === 2 ? sgn : 0;
        }
      }
      // advance to next cell
      if (tmx < tmz) { if (tmx > best || tmx > t1) break; i += stepI; tmx += tdx; if (i < 0 || i >= this.nx) break; }
      else { if (tmz > best || tmz > t1) break; k += stepK; tmz += tdz; if (k < 0 || k >= this.nz) break; }
    }
    return this._done(found, best, bestC, bnx, bny, bnz);
  }

  _done(found, best, c, nx, ny, nz) {
    if (!found) return false;
    const h = this.hit; h.dist = best; h.collider = c; h.nx = nx; h.ny = ny; h.nz = nz;
    return true;
  }

  resolveCircle(pos, radius, height, bounds) {
    let hit = false;
    const list = this.near(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      for (let j = 0; j < list.length; j++) {
        const c = list[j];
        if (pos.y >= c.max.y - STEP_HEIGHT || pos.y + height <= c.min.y) continue;
        const cx = pos.x < c.min.x ? c.min.x : pos.x > c.max.x ? c.max.x : pos.x;
        const cz = pos.z < c.min.z ? c.min.z : pos.z > c.max.z ? c.max.z : pos.z;
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        hit = moved = true;
        if (d2 > 1e-10) { const d = Math.sqrt(d2); pos.x = cx + dx / d * radius; pos.z = cz + dz / d * radius; }
        else { // centre inside the box: push out through the nearest side
          const l = pos.x - c.min.x, r = c.max.x - pos.x, b = pos.z - c.min.z, f = c.max.z - pos.z;
          const m = Math.min(l, r, b, f);
          if (m === l) pos.x = c.min.x - radius; else if (m === r) pos.x = c.max.x + radius;
          else if (m === b) pos.z = c.min.z - radius; else pos.z = c.max.z + radius;
        }
      }
      if (!moved) break;
    }
    if (bounds) {
      if (pos.x < bounds.minX) pos.x = bounds.minX; else if (pos.x > bounds.maxX) pos.x = bounds.maxX;
      if (pos.z < bounds.minZ) pos.z = bounds.minZ; else if (pos.z > bounds.maxZ) pos.z = bounds.maxZ;
    }
    return hit;
  }

  getFloor(x, y, z) {
    let f = this.terrain.getHeight(x, z);
    const list = this.near(x, z, x, z);
    for (let j = 0; j < list.length; j++) {
      const c = list[j];
      if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z && c.max.y <= y + 0.6 && c.max.y > f && !c.noFloor) f = c.max.y;
    }
    return f;
  }

  // true if an xz circle at feet height y overlaps any collider taller than the step height
  blocked(x, y, z, radius) {
    const list = this.near(x - radius, z - radius, x + radius, z + radius);
    for (const c of list) {
      if (y >= c.max.y - STEP_HEIGHT) continue;
      const cx = Math.max(c.min.x, Math.min(x, c.max.x)), cz = Math.max(c.min.z, Math.min(z, c.max.z));
      if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return true;
    }
    return false;
  }
}

const _n = new THREE.Vector3();
export { STEP_HEIGHT };
