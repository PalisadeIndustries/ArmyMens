import * as THREE from 'three';

// SKELETON world: a lawn with a few box obstacles. The World team replaces this.
// Contract (see CONTRACTS.md): getHeight, raycast, colliders, resolveCircle, spawn points, bounds.
export function createWorld(game) {
  const scene = game.scene;
  scene.background = new THREE.Color(0x9cc8ee);
  scene.fog = new THREE.Fog(0x9cc8ee, 80, 260);

  const hemi = new THREE.HemisphereLight(0xdfefff, 0x4a6b2a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
  sun.position.set(40, 80, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 250 });
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x5f8f3a }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // colliders: axis-aligned boxes { min: Vector3, max: Vector3, mesh? }
  const colliders = [];
  function addBox(x, z, w, h, d, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
    m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m);
    const box = new THREE.Box3().setFromObject(m);
    colliders.push({ min: box.min, max: box.max, mesh: m });
  }
  for (let i = 0; i < 18; i++) {
    const x = (Math.random() - 0.5) * 120, z = (Math.random() - 0.5) * 100;
    if (Math.abs(z) > 40) continue;
    addBox(x, z, 2 + Math.random() * 4, 1 + Math.random() * 2, 2 + Math.random() * 4, 0x8a5a3a);
  }

  const bounds = { minX: -100, maxX: 100, minZ: -80, maxZ: 80 };
  const ray = new THREE.Ray();
  const tmp = new THREE.Vector3();

  return {
    bounds,
    colliders,
    // green spawns at -z, tan at +z. Each: { position: Vector3, team }
    spawnPoints: {
      green: [new THREE.Vector3(-10, 0, -60), new THREE.Vector3(0, 0, -62), new THREE.Vector3(10, 0, -60)],
      tan: [new THREE.Vector3(-30, 0, 70), new THREE.Vector3(0, 0, 72), new THREE.Vector3(30, 0, 70)],
    },
    // Objective the tan army is trying to reach / green must defend.
    objective: { position: new THREE.Vector3(0, 0, -55), radius: 6 },
    getHeight(x, z) { return 0; },
    // Static geometry raycast. Returns { point, normal, dist, object } or null.
    raycast(origin, dir, maxDist = 500) {
      let best = null;
      ray.set(origin, dir);
      // ground plane y=0
      if (dir.y < -1e-6) {
        const t = -origin.y / dir.y;
        if (t >= 0 && t <= maxDist) best = { point: origin.clone().addScaledVector(dir, t), normal: new THREE.Vector3(0, 1, 0), dist: t, object: ground };
      }
      for (const c of colliders) {
        const hit = ray.intersectBox(c, tmp);
        if (!hit) continue;
        const d = hit.distanceTo(origin);
        if (d <= maxDist && (!best || d < best.dist)) {
          const p = hit.clone();
          const n = new THREE.Vector3();
          const eps = 1e-3;
          if (Math.abs(p.x - c.min.x) < eps) n.set(-1, 0, 0); else if (Math.abs(p.x - c.max.x) < eps) n.set(1, 0, 0);
          else if (Math.abs(p.z - c.min.z) < eps) n.set(0, 0, -1); else if (Math.abs(p.z - c.max.z) < eps) n.set(0, 0, 1);
          else n.set(0, 1, 0);
          best = { point: p, normal: n, dist: d, object: c.mesh };
        }
      }
      return best;
    },
    // Push a circle (x,z,radius) at feet height y out of colliders. Mutates pos (Vector3). Returns true if collided.
    resolveCircle(pos, radius, height = 1.8) {
      let hit = false;
      for (const c of colliders) {
        if (pos.y >= c.max.y - 0.05 || pos.y + height <= c.min.y) continue;
        const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          hit = true;
          if (d2 > 1e-8) { const d = Math.sqrt(d2); pos.x = cx + dx / d * radius; pos.z = cz + dz / d * radius; }
          else { pos.x += radius; }
        }
      }
      pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, pos.x));
      pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, pos.z));
      return hit;
    },
    // Line of sight between two points (static geometry only).
    hasLineOfSight(a, b) {
      const dir = tmp.copy(b).sub(a); const len = dir.length(); dir.divideScalar(len || 1);
      const h = this.raycast(a, dir.clone(), len);
      return !h || h.dist >= len - 0.05;
    },
    // Ground height under a point that may be on top of a prop (walkable top surfaces).
    getFloor(x, y, z) {
      let f = 0;
      for (const c of colliders) if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z && c.max.y <= y + 0.6) f = Math.max(f, c.max.y);
      return f;
    },
    update(dt) {},
    idleUpdate(dt) {},
  };
}
