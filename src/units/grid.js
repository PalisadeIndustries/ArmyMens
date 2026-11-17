// Uniform spatial hash over the XZ plane for fast neighbour / nearest / ray-candidate queries.
// Rebuilt every frame from the live unit list (cheap: one Map lookup per unit, no allocations once warm).
export class SpatialGrid {
  constructor(cellSize = 4) {
    this.cs = cellSize;
    this.inv = 1 / cellSize;
    this.cells = new Map();   // key -> Soldier[] (arrays are kept and reused)
    this.active = [];         // arrays that hold something this frame
    this._stamp = 0;
  }
  key(cx, cz) { return (cx + 4096) * 8192 + (cz + 4096); }
  clear() {
    for (let i = 0; i < this.active.length; i++) this.active[i].length = 0;
    this.active.length = 0;
  }
  insert(u) {
    const k = this.key(Math.floor(u.position.x * this.inv), Math.floor(u.position.z * this.inv));
    let a = this.cells.get(k);
    if (!a) { a = []; this.cells.set(k, a); }
    if (a.length === 0) this.active.push(a);
    a.push(u);
  }
  cell(cx, cz) { return this.cells.get(this.key(cx, cz)); }

  // Push living units within radius of (x,z) into out (cleared first). team: optional team filter, exclude: unit to skip.
  queryInto(out, x, z, r, team = null, exclude = null) {
    out.length = 0;
    const inv = this.inv, r2 = r * r;
    const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
    const z0 = Math.floor((z - r) * inv), z1 = Math.floor((z + r) * inv);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const a = this.cells.get(this.key(cx, cz));
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const u = a[i];
        if (!u.alive || u === exclude || (team && u.team !== team)) continue;
        const dx = u.position.x - x, dz = u.position.z - z;
        if (dx * dx + dz * dz <= r2) out.push(u);
      }
    }
    return out;
  }

  // Count living units of `team` within r of (x,z).
  count(x, z, r, team = null, exclude = null) {
    const inv = this.inv, r2 = r * r;
    const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
    const z0 = Math.floor((z - r) * inv), z1 = Math.floor((z + r) * inv);
    let n = 0;
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const a = this.cells.get(this.key(cx, cz));
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const u = a[i];
        if (!u.alive || u === exclude || (team && u.team !== team)) continue;
        const dx = u.position.x - x, dz = u.position.z - z;
        if (dx * dx + dz * dz <= r2) n++;
      }
    }
    return n;
  }

  // Nearest living unit of `team` to (x,z) within maxDist, via expanding rings. skip: optional unit to ignore,
  // skip2: second unit/predicate-free exclusion (used for load-balancing away from the player).
  nearest(x, z, maxDist, team, skip = null, skip2 = null) {
    const inv = this.inv, cs = this.cs;
    const cx0 = Math.floor(x * inv), cz0 = Math.floor(z * inv);
    const maxRing = Math.ceil(maxDist * inv) + 1;
    let best = null, bd = maxDist * maxDist;
    for (let r = 0; r <= maxRing; r++) {
      if (best && (r - 1) * cs > Math.sqrt(bd)) break;
      if ((r - 1) * cs > maxDist) break;
      for (let i = -r; i <= r; i++) {
        best = this._scanCell(cx0 + i, cz0 - r, x, z, team, skip, skip2, best, bd);
        if (best && best._d2 < bd) bd = best._d2;
        if (r > 0) {
          best = this._scanCell(cx0 + i, cz0 + r, x, z, team, skip, skip2, best, bd);
          if (best && best._d2 < bd) bd = best._d2;
        }
      }
      for (let j = -r + 1; j <= r - 1; j++) {
        best = this._scanCell(cx0 - r, cz0 + j, x, z, team, skip, skip2, best, bd);
        if (best && best._d2 < bd) bd = best._d2;
        best = this._scanCell(cx0 + r, cz0 + j, x, z, team, skip, skip2, best, bd);
        if (best && best._d2 < bd) bd = best._d2;
      }
    }
    return best;
  }
  _scanCell(cx, cz, x, z, team, skip, skip2, best, bd) {
    const a = this.cells.get(this.key(cx, cz));
    if (!a) return best;
    for (let i = 0; i < a.length; i++) {
      const u = a[i];
      if (!u.alive || u.team !== team || u === skip || u === skip2) continue;
      const dx = u.position.x - x, dz = u.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = u; u._d2 = d2; }
    }
    return best;
  }

  // Candidate units whose cells a ray (XZ projection) passes through, padded by `pad` metres.
  // Pushes into out (cleared first); each unit at most once. Cheap broad phase for hitscan / suppression.
  rayInto(out, ox, oz, dx, dz, maxDist, pad = 1, team = null, exclude = null) {
    out.length = 0;
    const len = Math.hypot(dx, dz);
    const stamp = ++this._stamp;
    if (len < 1e-6) { // vertical ray
      this.queryInto(out, ox, oz, pad, team, exclude); return out;
    }
    const nx = dx / len, nz = dz / len;
    const horiz = maxDist * len; // dir may be 3D-normalised; horizontal length scales
    const step = this.cs * 0.5;
    const pad2 = pad * pad;
    for (let t = 0; t <= horiz + step; t += step) {
      const px = ox + nx * Math.min(t, horiz), pz = oz + nz * Math.min(t, horiz);
      const x0 = Math.floor((px - pad) * this.inv), x1 = Math.floor((px + pad) * this.inv);
      const z0 = Math.floor((pz - pad) * this.inv), z1 = Math.floor((pz + pad) * this.inv);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const a = this.cells.get(this.key(cx, cz));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const u = a[i];
          if (u._rayStamp === stamp || !u.alive || u === exclude || (team && u.team !== team)) continue;
          // perpendicular distance from the XZ ray
          const rx = u.position.x - ox, rz = u.position.z - oz;
          const along = rx * nx + rz * nz;
          if (along < -pad || along > horiz + pad) continue;
          const px2 = rx - nx * along, pz2 = rz - nz * along;
          if (px2 * px2 + pz2 * pz2 > pad2) continue;
          u._rayStamp = stamp;
          out.push(u);
        }
      }
    }
    return out;
  }
}
