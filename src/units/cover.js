import * as THREE from 'three';

// Cover points for the AI. Uses world.coverPoints ({position, normal}) when the world provides them, else samples
// spots hugging the sides of colliders. normal = direction from the cover object out toward where the soldier stands,
// so a point protects against threats roughly in the -normal direction.
export function createCover(game) {
  let points = [];
  let builtFrom = null, builtCount = -1;
  const cs = 8, inv = 1 / cs;
  const cells = new Map();
  const key = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
  const tmp = new THREE.Vector3();

  function add(x, y, z, nx, nz, h) {
    const p = { position: new THREE.Vector3(x, y, z), normal: new THREE.Vector3(nx, 0, nz).normalize(), height: h, occupant: null, until: 0 };
    points.push(p);
    const k = key(Math.floor(x * inv), Math.floor(z * inv));
    let a = cells.get(k); if (!a) { a = []; cells.set(k, a); } a.push(p);
  }

  function build() {
    const w = game.world;
    points = []; cells.clear();
    builtFrom = w; builtCount = (w?.coverPoints?.length ?? 0) * 100000 + (w?.colliders?.length ?? 0);
    if (!w) return;
    if (w.coverPoints?.length) {
      for (const c of w.coverPoints) {
        const p = c.position || c; const n = c.normal || { x: 0, z: 1 };
        add(p.x, p.y ?? 0, p.z, n.x, n.z, c.height ?? 1.2);
      }
      return;
    }
    const b = w.bounds;
    for (const c of w.colliders || []) {
      const h = c.max.y - c.min.y;
      const sx = c.max.x - c.min.x, sz = c.max.z - c.min.z;
      if (h < 0.7 || c.min.y > 0.6 || sx > 60 || sz > 60 || sx < 0.3 || sz < 0.3) continue;
      const off = 0.75;
      const sides = [
        [c.min.x - off, null, -1, 0, sz], [c.max.x + off, null, 1, 0, sz],
        [null, c.min.z - off, 0, -1, sx], [null, c.max.z + off, 0, 1, sx],
      ];
      for (const [fx, fz, nx, nz, len] of sides) {
        const n = Math.max(1, Math.min(6, Math.floor(len / 2.5)));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const x = fx ?? (c.min.x + (c.max.x - c.min.x) * t);
          const z = fz ?? (c.min.z + (c.max.z - c.min.z) * t);
          if (b && (x < b.minX + 1 || x > b.maxX - 1 || z < b.minZ + 1 || z > b.maxZ - 1)) continue;
          tmp.set(x, 0, z);
          // reject points inside other colliders
          let inside = false;
          for (const o of w.colliders) if (o !== c && x > o.min.x - 0.4 && x < o.max.x + 0.4 && z > o.min.z - 0.4 && z < o.max.z + 0.4 && o.min.y < 1) { inside = true; break; }
          if (inside) continue;
          const y = w.getFloor ? w.getFloor(x, 0.3, z) : (w.getHeight?.(x, z) ?? 0);
          add(x, y, z, nx, nz, h);
          if (points.length > 1500) return;
        }
      }
    }
  }

  const api = {
    get points() { return points; },
    ensure() {
      const w = game.world;
      const c = (w?.coverPoints?.length ?? 0) * 100000 + (w?.colliders?.length ?? 0);
      if (w !== builtFrom || c !== builtCount) build();
    },
    // Best free cover for unit u against a threat at (tx,tz), within maxDist. advX/advZ: preferred progress direction
    // (unit wants cover that also moves it forward). Returns a cover point or null.
    find(u, tx, tz, maxDist, advX = 0, advZ = 0, minThreatDist = 5) {
      const x = u.position.x, z = u.position.z, now = game.time;
      const x0 = Math.floor((x - maxDist) * inv), x1 = Math.floor((x + maxDist) * inv);
      const z0 = Math.floor((z - maxDist) * inv), z1 = Math.floor((z + maxDist) * inv);
      let best = null, bs = Infinity; const md2 = maxDist * maxDist;
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const a = cells.get(key(cx, cz)); if (!a) continue;
        for (const p of a) {
          if (p.occupant && p.occupant !== u && p.occupant.alive && p.until > now) continue;
          const dx = p.position.x - x, dz = p.position.z - z;
          const d2 = dx * dx + dz * dz; if (d2 > md2) continue;
          let ttx = tx - p.position.x, ttz = tz - p.position.z;
          const tl = Math.hypot(ttx, ttz); if (tl < minThreatDist) continue;
          ttx /= tl; ttz /= tl;
          const prot = -(p.normal.x * ttx + p.normal.z * ttz); // 1 = threat squarely behind the obstacle
          if (prot < 0.35) continue;
          const d = Math.sqrt(d2);
          const score = d - prot * 4 - (dx * advX + dz * advZ) * 0.35 + (p.height < 1.0 ? 2 : 0);
          if (score < bs) { bs = score; best = p; }
        }
      }
      return best;
    },
    claim(p, u, seconds) { if (p) { p.occupant = u; p.until = game.time + seconds; } },
    release(u) { const p = u.ai?.cover; if (p && p.occupant === u) { p.occupant = null; p.until = 0; } if (u.ai) u.ai.cover = null; },
    reset() { for (const p of points) { p.occupant = null; p.until = 0; } },
  };
  return api;
}
