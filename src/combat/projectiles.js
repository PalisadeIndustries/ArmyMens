import * as THREE from 'three';

// Pooled physical projectiles: rockets (straight-ish, smoke trail, impact fuse) and grenades (arcing, bouncing,
// timed fuse, optional cluster split). Meshes are pooled and shared-geometry; no allocations in steady state
// except what world.raycast returns.

const rand = (a, b) => a + Math.random() * (b - a);

export function createProjectiles(game, combat, fx) {
  const scene = game.scene;
  const _dir = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3();
  const _fwd = new THREE.Vector3(0, 0, 1);

  // ---- shared meshes
  const olive = new THREE.MeshStandardMaterial({ color: 0x4b5d2e, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e3326, roughness: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffc060, toneMapped: false });
  const rocketGeo = {
    body: new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8).rotateX(Math.PI / 2),
    nose: new THREE.ConeGeometry(0.07, 0.22, 8).rotateX(Math.PI / 2).translate(0, 0, 0.38),
    fin: new THREE.BoxGeometry(0.28, 0.02, 0.12).translate(0, 0, -0.24),
    flame: new THREE.SphereGeometry(0.08, 6, 4).translate(0, 0, -0.3),
  };
  const grenGeo = {
    body: new THREE.SphereGeometry(0.11, 10, 8).scale(1, 1.25, 1),
    cap: new THREE.CylinderGeometry(0.04, 0.05, 0.08, 6).translate(0, 0.15, 0),
    lever: new THREE.BoxGeometry(0.03, 0.14, 0.02).translate(0.05, 0.1, 0),
  };
  function makeRocket() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(rocketGeo.body, olive), new THREE.Mesh(rocketGeo.nose, dark), new THREE.Mesh(rocketGeo.flame, glow));
    const f1 = new THREE.Mesh(rocketGeo.fin, dark); const f2 = f1.clone(); f2.rotation.z = Math.PI / 2; g.add(f1, f2);
    g.visible = false; scene.add(g); return g;
  }
  function makeGrenade(mat) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(grenGeo.body, mat); b.castShadow = true;
    g.add(b, new THREE.Mesh(grenGeo.cap, dark), new THREE.Mesh(grenGeo.lever, dark));
    g.visible = false; scene.add(g); return g;
  }

  const ROCKETS = 48, GRENADES = 72;
  const rockets = [], grenades = [];
  const grenMats = {
    green: new THREE.MeshStandardMaterial({ color: 0x45702c, roughness: 0.45 }),
    tan: new THREE.MeshStandardMaterial({ color: 0xb59a62, roughness: 0.45 }),
    napalm: new THREE.MeshBasicMaterial({ color: 0xff8a20, toneMapped: false }),
  };
  for (let i = 0; i < ROCKETS; i++) rockets.push({ active: false, mesh: makeRocket(), pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, owner: null, def: null, scale: 1, trailT: 0, gravity: 0 });
  for (let i = 0; i < GRENADES; i++) grenades.push({ active: false, mesh: makeGrenade(grenMats.green), pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0, owner: null, def: null, cluster: 0, napalm: false, impact: false, rest: false, spin: new THREE.Vector3(), bounces: 0, scale: 1 });

  function grab(pool) {
    for (const p of pool) if (!p.active) return p;
    // pool exhausted: recycle the one closest to dying
    let best = pool[0];
    for (const p of pool) if ((p.life ?? p.fuse) < (best.life ?? best.fuse)) best = p;
    return best;
  }

  const api = {
    rockets, grenades,
    get activeCount() { let n = 0; for (const r of rockets) n += r.active; for (const g of grenades) n += g.active; return n; },

    // opts: { scale (size/damage multiplier), speedMul }
    spawnRocket(owner, origin, dir, def, opts = {}) {
      const r = grab(rockets);
      r.active = true; r.owner = owner; r.team = owner?.team ?? null; r.def = def; r.scale = opts.scale ?? 1;
      r.pos.copy(origin); r.vel.copy(dir).multiplyScalar((def.speed || 45) * (opts.speedMul ?? 1));
      r.life = (def.range || 200) / (def.speed || 45) + 0.5; r.trailT = 0; r.gravity = def.gravity ?? 1;
      r.age = 0;
      r.mesh.visible = true; r.mesh.scale.setScalar(r.scale); r.mesh.position.copy(origin);
      r.mesh.quaternion.setFromUnitVectors(_fwd, dir);
      // launch puff + backblast
      fx.muzzle(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 2.2);
      for (let k = 0; k < 8; k++) fx.smoke.emit(origin.x - dir.x * 0.8, origin.y - dir.y * 0.8, origin.z - dir.z * 0.8,
        -dir.x * rand(4, 9) + rand(-1.5, 1.5), -dir.y * rand(4, 9) + rand(0, 1.5), -dir.z * rand(4, 9) + rand(-1.5, 1.5), rand(0.8, 1.6), 0.4, 1.8, 0xd8d4cc, 0xa8a49c, 0.55, 2.4, 0.5);
      game.events.emit('projectile:spawn', { kind: 'rocket', position: origin.clone(), unit: owner });
      return r;
    },

    // opts: { fuse, cluster (bomblet count), napalm (bool: bursts into fire, impact fuse), impact (explode on hit), scale }
    spawnGrenade(owner, origin, vel, def, opts = {}) {
      const g = grab(grenades);
      g.active = true; g.owner = owner; g.team = owner?.team ?? null; g.def = def;
      g.pos.copy(origin); g.vel.copy(vel);
      g.fuse = opts.fuse ?? def.fuse ?? 2.5; g.cluster = opts.cluster || 0; g.napalm = !!opts.napalm; g.impact = !!opts.impact || g.napalm;
      g.scale = opts.scale ?? 1; g.rest = false; g.bounces = 0; g.age = 0;
      g.spin.set(rand(-12, 12), rand(-6, 6), rand(-12, 12));
      g.mesh.children[0].material = g.napalm ? grenMats.napalm : (grenMats[owner?.team] || grenMats.green);
      g.mesh.visible = true; g.mesh.scale.setScalar(g.scale); g.mesh.position.copy(origin);
      game.events.emit('projectile:spawn', { kind: g.napalm ? 'napalm' : 'grenade', position: origin.clone(), unit: owner });
      return g;
    },

    update(dt) {
      const world = game.world;
      // ---------------- rockets
      for (const r of rockets) {
        if (!r.active) continue;
        r.age += dt;
        r.life -= dt;
        r.vel.y -= r.gravity * dt;
        const speed = r.vel.length();
        const step = speed * dt;
        _dir.copy(r.vel).divideScalar(speed || 1);
        let hitPoint = null, hitNormal = null;
        const w = world?.raycast?.(r.pos, _dir, step + 0.2);
        if (w) { hitPoint = w.point; hitNormal = w.normal; }
        const u = combat.raycastUnits(r.pos, _dir, w ? w.dist : step + 0.2, r.owner, r.team);
        if (u) { hitPoint = u.point; hitNormal = null; r.directHit = u.unit; } else r.directHit = null;
        // smoke trail (dense, a puff every ~0.25m)
        r.trailT += step;
        while (r.trailT > 0.25) {
          r.trailT -= 0.25;
          const back = r.trailT;
          const x = r.pos.x - _dir.x * (0.35 + back), y = r.pos.y - _dir.y * (0.35 + back), z = r.pos.z - _dir.z * (0.35 + back);
          fx.smoke.emit(x, y, z, rand(-0.3, 0.3), rand(0.1, 0.6), rand(-0.3, 0.3), rand(1.2, 2.2), 0.22 * r.scale, rand(0.9, 1.5) * r.scale, 0xeeeae2, 0xb0aca4, 0.5, 0.8, 0.25);
        }
        fx.fire.emit(r.pos.x - _dir.x * 0.4, r.pos.y - _dir.y * 0.4, r.pos.z - _dir.z * 0.4, -_dir.x * 4, -_dir.y * 4, -_dir.z * 4, 0.07, 0.35 * r.scale, 0.1, 0xfff0c0, 0xff7020, 1.3, 0, 0);
        if (hitPoint || r.life <= 0 || r.pos.y < -2) {
          const p = hitPoint || r.pos;
          if (hitNormal) _p.copy(p).addScaledVector(hitNormal, 0.25); else _p.copy(p);
          r.active = false; r.mesh.visible = false;
          if (r.directHit) r.directHit.takeDamage?.({ amount: r.def.damage * 0.35 * r.scale, type: 'explosive', zone: 'torso', point: _p.clone(), dir: _dir.clone(), force: 18, source: r.owner });
          combat.explode(_p, r.def.radius * Math.sqrt(r.scale), r.def.damage * r.scale, r.owner, { kind: 'rocket', scale: r.scale, force: r.def.force });
          continue;
        }
        r.pos.addScaledVector(r.vel, dt);
        r.mesh.position.copy(r.pos);
        r.mesh.quaternion.setFromUnitVectors(_fwd, _dir);
      }

      // ---------------- grenades
      for (const g of grenades) {
        if (!g.active) continue;
        g.age += dt;
        g.fuse -= dt;
        if (!g.rest) {
          g.vel.y -= 18 * dt;
          const speed = g.vel.length();
          const step = speed * dt;
          if (speed > 0.001) {
            _dir.copy(g.vel).divideScalar(speed);
            const w = world?.raycast?.(g.pos, _dir, step + 0.1);
            if (w) {
              // bounce
              _n.copy(w.normal);
              g.pos.copy(w.point).addScaledVector(_n, 0.12);
              const vn = g.vel.dot(_n);
              g.vel.addScaledVector(_n, -(1.0 + 0.38) * vn); // restitution 0.38
              // tangential friction
              _v.copy(_n).multiplyScalar(g.vel.dot(_n));
              g.vel.sub(_v).multiplyScalar(0.62).add(_v);
              g.spin.multiplyScalar(0.6);
              g.bounces++;
              if (Math.abs(vn) > 2) {
                game.events.emit('projectile:bounce', { kind: g.napalm ? 'napalm' : 'grenade', position: g.pos, speed: Math.abs(vn), unit: g.owner });
                fx.smoke.emit(g.pos.x, g.pos.y, g.pos.z, rand(-0.5, 0.5), 0.6, rand(-0.5, 0.5), 0.5, 0.15, 0.5, 0x8a6a40, 0x6e5a40, 0.5, 2, -1);
              }
              if (g.impact && g.age > 0.05) g.fuse = 0;
              if (_n.y > 0.6 && g.vel.lengthSq() < 0.6) { g.rest = true; g.vel.set(0, 0, 0); }
            } else {
              g.pos.addScaledVector(g.vel, dt);
            }
            // direct unit hit for impact grenades (napalm)
            if (g.impact && g.age > 0.08 && g.fuse > 0) {
              const u = combat.raycastUnits(g.pos, _dir, step + 0.3, g.owner, g.team);
              if (u) g.fuse = 0;
            }
            const floor = world?.getFloor ? world.getFloor(g.pos.x, g.pos.y + 0.2, g.pos.z) : 0;
            if (g.pos.y < floor + 0.1) {
              g.pos.y = floor + 0.1;
              if (g.vel.y < 0) g.vel.y *= -0.3;
              g.vel.x *= 0.8; g.vel.z *= 0.8;
              if (g.impact && g.age > 0.05) g.fuse = 0;
              if (g.vel.lengthSq() < 0.5) { g.rest = true; g.vel.set(0, 0, 0); }
            }
          }
          g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt;
        }
        g.mesh.position.copy(g.pos);
        // fuse sparkle so players can see live grenades
        if (!g.napalm && Math.random() < 0.5) fx.fire.emit(g.pos.x, g.pos.y + 0.18 * g.scale, g.pos.z, rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5), 0.15, 0.06, 0.02, 0xffe080, 0xff6010, 1, 0, 0);
        if (g.napalm) fx.fire.emit(g.pos.x, g.pos.y, g.pos.z, rand(-0.5, 0.5), rand(0.3, 1), rand(-0.5, 0.5), 0.25, 0.35, 0.15, 0xffd070, 0xff3a00, 1, 1, 1.5);
        if (g.fuse <= 0) {
          g.active = false; g.mesh.visible = false;
          if (g.napalm) {
            combat.napalm(g.pos, 3.2, g.owner);
          } else {
            combat.explode(g.pos, (g.def.radius || 5) * Math.sqrt(g.scale), (g.def.damage || 100) * g.scale, g.owner, { kind: g.cluster ? 'cluster' : 'grenade', scale: g.scale, force: g.def.force });
            if (g.cluster > 0) {
              for (let k = 0; k < g.cluster; k++) {
                const a = (k / g.cluster) * Math.PI * 2 + rand(-0.3, 0.3), s = rand(5, 9);
                _v.set(Math.cos(a) * s, rand(5, 9), Math.sin(a) * s);
                _p.copy(g.pos); _p.y += 0.3;
                api.spawnGrenade(g.owner, _p, _v, g.def, { fuse: rand(0.7, 1.3), scale: 0.6 });
              }
            }
          }
        }
      }
    },
    clear() {
      for (const r of rockets) { r.active = false; r.mesh.visible = false; }
      for (const g of grenades) { g.active = false; g.mesh.visible = false; }
    },
  };
  return api;
}
