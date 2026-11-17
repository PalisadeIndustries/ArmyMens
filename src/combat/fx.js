import * as THREE from 'three';

// Pooled, allocation-free visual effects for combat: particles (fire/smoke), tracers, debris, shockwave rings,
// fireball cores and light flashes. Everything is preallocated; spawning only writes into typed arrays.

const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------------------------------------------
// Particle system: one THREE.Points with a soft round sprite shader. Size is in world meters.
class Particles {
  constructor(scene, max, { additive, fog }) {
    this.max = max; this.count = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3); this.col1 = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    this.outCol = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.outCol, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha);
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 400 } }]);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fog: !!fog,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
        uniform float uScale; varying vec4 vC;
        #include <fog_pars_vertex>
        void main(){
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          vC = vec4(aColor, aAlpha);
          #include <fog_vertex>
        }`,
      fragmentShader: additive ? `
        varying vec4 vC;
        void main(){
          vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
          float a = clamp(1.0 - d, 0.0, 1.0); a *= a;
          gl_FragColor = vec4(vC.rgb * a * vC.a, 1.0);
        }` : `
        varying vec4 vC;
        #include <fog_pars_fragment>
        void main(){
          vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
          float a = smoothstep(1.0, 0.35, d);
          gl_FragColor = vec4(vC.rgb, vC.a * a);
          #include <fog_fragment>
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 10;
    scene.add(this.points);
  }
  // color c0 -> c1 over life (hex ints). size s0 -> s1. alpha starts at a and fades out (with fade-in for smoke).
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a, drag, grav) {
    let i = this.count;
    if (i >= this.max) i = (Math.random() * this.max) | 0; // overwrite a random particle when full
    else this.count++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = ((c0 >> 16) & 255) / 255; this.col[i3 + 1] = ((c0 >> 8) & 255) / 255; this.col[i3 + 2] = (c0 & 255) / 255;
    this.col1[i3] = ((c1 >> 16) & 255) / 255; this.col1[i3 + 1] = ((c1 >> 8) & 255) / 255; this.col1[i3 + 2] = (c1 & 255) / 255;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a;
    this.drag[i] = drag; this.grav[i] = grav; this.size[i] = s0; this.alpha[i] = 0;
  }
  update(dt, scaleUniform) {
    this.uniforms.uScale.value = scaleUniform;
    let n = this.count;
    const P = this.pos, V = this.vel, L = this.life;
    for (let i = 0; i < n; i++) {
      L[i] -= dt;
      if (L[i] <= 0) { // swap-remove
        n--;
        if (i !== n) this._move(n, i);
        i--; continue;
      }
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      V[i3] *= dr; V[i3 + 1] = V[i3 + 1] * dr + this.grav[i] * dt; V[i3 + 2] *= dr;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      if (P[i3 + 1] < 0.02) { P[i3 + 1] = 0.02; V[i3 + 1] *= -0.2; }
      const t = 1 - L[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fadeIn = Math.min(1, t * 12);
      this.alpha[i] = this.a0[i] * fadeIn * (1 - t) * (1 - t * 0.3);
      const C = this.col, C1 = this.col1, O = this.outCol;
      O[i3] = C[i3] + (C1[i3] - C[i3]) * t; O[i3 + 1] = C[i3 + 1] + (C1[i3 + 1] - C[i3 + 1]) * t; O[i3 + 2] = C[i3 + 2] + (C1[i3 + 2] - C[i3 + 2]) * t;
    }
    this.count = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    if (n > 0) {
      this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, n * 3); this.aPos.needsUpdate = true;
      this.aCol.clearUpdateRanges(); this.aCol.addUpdateRange(0, n * 3); this.aCol.needsUpdate = true;
      this.aSize.clearUpdateRanges(); this.aSize.addUpdateRange(0, n); this.aSize.needsUpdate = true;
      this.aAlpha.clearUpdateRanges(); this.aAlpha.addUpdateRange(0, n); this.aAlpha.needsUpdate = true;
    }
  }
  _move(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[t3 + k] = this.pos[f3 + k]; this.vel[t3 + k] = this.vel[f3 + k];
      this.col[t3 + k] = this.col[f3 + k]; this.col1[t3 + k] = this.col1[f3 + k]; this.outCol[t3 + k] = this.outCol[f3 + k];
    }
    this.size[to] = this.size[from]; this.alpha[to] = this.alpha[from]; this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from];
    this.a0[to] = this.a0[from]; this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.drag[to] = this.drag[from]; this.grav[to] = this.grav[from];
  }
  clear() { this.count = 0; this.points.geometry.setDrawRange(0, 0); }
}

// ---------------------------------------------------------------------------------------------------------------
export function createFX(game) {
  const scene = game.scene;
  const fire = new Particles(scene, 4000, { additive: true });
  const smoke = new Particles(scene, 3000, { additive: false, fog: true });

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const _z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3(), _c = new THREE.Color();
  const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---- tracers: instanced stretched boxes (unit length along +z from z=0..1)
  const TR_MAX = 384;
  const trGeo = new THREE.BoxGeometry(1, 1, 1); trGeo.translate(0, 0, 0.5);
  const trMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const trMesh = new THREE.InstancedMesh(trGeo, trMat, TR_MAX);
  trMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trMesh.setColorAt(0, _c.set(0xffffff)); trMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  trMesh.frustumCulled = false; trMesh.count = 0; trMesh.renderOrder = 11;
  scene.add(trMesh);
  const tr = { n: 0, sx: new Float32Array(TR_MAX * 3), dx: new Float32Array(TR_MAX * 3), dist: new Float32Array(TR_MAX),
    head: new Float32Array(TR_MAX), speed: new Float32Array(TR_MAX), len: new Float32Array(TR_MAX), w: new Float32Array(TR_MAX),
    col: new Int32Array(TR_MAX) };

  // ---- debris: instanced chunky boxes with simple physics
  const DB_MAX = 500;
  const dbGeo = new THREE.BoxGeometry(1, 1, 1);
  const dbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const dbMesh = new THREE.InstancedMesh(dbGeo, dbMat, DB_MAX);
  dbMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dbMesh.setColorAt(0, _c.set(0xffffff)); dbMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  dbMesh.frustumCulled = false; dbMesh.count = 0; dbMesh.castShadow = false;
  scene.add(dbMesh);
  const db = { n: 0, p: new Float32Array(DB_MAX * 3), v: new Float32Array(DB_MAX * 3), r: new Float32Array(DB_MAX * 3),
    w: new Float32Array(DB_MAX * 3), s: new Float32Array(DB_MAX), life: new Float32Array(DB_MAX), col: new Int32Array(DB_MAX),
    rest: new Uint8Array(DB_MAX) };
  const _e = new THREE.Euler();

  // ---- shockwave rings + fireball cores (small pools of meshes)
  const ringGeo = new THREE.RingGeometry(0.8, 1, 40); ringGeo.rotateX(-Math.PI / 2);
  const ballGeo = new THREE.IcosahedronGeometry(1, 2);
  const rings = [], balls = [];
  for (let i = 0; i < 10; i++) {
    const rm = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    rm.visible = false; rm.renderOrder = 9; scene.add(rm); rings.push({ m: rm, t: 0, dur: 0, r: 0 });
    const bm = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    bm.visible = false; bm.renderOrder = 13; scene.add(bm); balls.push({ m: bm, t: 0, dur: 0, r: 0 });
  }
  let ringI = 0, ballI = 0;

  // ---- light flashes: fixed number of point lights (constant light count => no shader recompiles)
  const lights = [];
  for (let i = 0; i < 2; i++) {
    const l = new THREE.PointLight(0xffa040, 0, 28, 1.6);
    l.castShadow = false; scene.add(l); lights.push({ l, t: 0, dur: 1, peak: 0 });
  }
  let lightI = 0;

  const api = {
    fire, smoke,
    get counts() { return { fire: fire.count, smoke: smoke.count, tracers: tr.n, debris: db.n }; },

    tracer(ox, oy, oz, ex, ey, ez, color = 0xffe2a0, width = 0.035, speed = 420, len = 6) {
      if (tr.n >= TR_MAX) return;
      let dx = ex - ox, dy = ey - oy, dz = ez - oz;
      const dist = Math.hypot(dx, dy, dz); if (dist < 0.5) return;
      dx /= dist; dy /= dist; dz /= dist;
      const i = tr.n++, i3 = i * 3;
      tr.sx[i3] = ox; tr.sx[i3 + 1] = oy; tr.sx[i3 + 2] = oz;
      tr.dx[i3] = dx; tr.dx[i3 + 1] = dy; tr.dx[i3 + 2] = dz;
      tr.dist[i] = dist; tr.head[i] = Math.min(dist, len * 0.6); tr.speed[i] = speed; tr.len[i] = len; tr.w[i] = width; tr.col[i] = color;
    },

    // muzzle flash in world space (cheap: a few additive particles)
    muzzle(x, y, z, dx, dy, dz, scale = 1, color = 0xffd070) {
      fire.emit(x, y, z, dx * 2, dy * 2, dz * 2, 0.05, 0.35 * scale, 0.15 * scale, 0xfff2c0, color, 1.4, 0, 0);
      fire.emit(x + dx * 0.15, y + dy * 0.15, z + dz * 0.15, dx * 6, dy * 6, dz * 6, 0.06, 0.25 * scale, 0.05, color, 0xff6010, 1.0, 0, 0);
    },

    // bullet impact: dirt spray on ground, sparks + plastic chips on props, plastic puff on units
    impact(x, y, z, nx, ny, nz, kind = 'dirt') {
      if (kind === 'unit') {
        for (let k = 0; k < 3; k++) smoke.emit(x, y, z, nx * rand(0.5, 2) + rand(-1, 1), ny * rand(0.5, 2) + rand(0, 1), nz * rand(0.5, 2) + rand(-1, 1), rand(0.25, 0.45), 0.08, 0.3, 0xd8e0c0, 0x90a080, 0.6, 3, -2);
        return;
      }
      const ground = ny > 0.7;
      for (let k = 0; k < 4; k++) {
        smoke.emit(x, y, z, nx * rand(1, 3) + rand(-1.2, 1.2), ny * rand(1, 4) + rand(0.5, 2.5), nz * rand(1, 3) + rand(-1.2, 1.2),
          rand(0.4, 0.9), 0.12, rand(0.5, 0.9), ground ? 0x8a6a40 : 0xb8b0a0, ground ? 0x6e5a40 : 0x9a948a, 0.65, 2.5, -3.5);
      }
      if (!ground || Math.random() < 0.3) {
        for (let k = 0; k < 3; k++) fire.emit(x, y, z, nx * 4 + rand(-4, 4), ny * 4 + rand(0, 4), nz * 4 + rand(-4, 4), rand(0.08, 0.2), 0.05, 0.02, 0xffe8a0, 0xff7020, 1.2, 1, -14);
      }
      if (Math.random() < 0.5) api.debris(x, y, z, nx * 3, ny * 3 + 2, nz * 3, 1, ground ? 0x6b5233 : 0x9b9080, 0.05, 1.2);
    },

    debris(x, y, z, vx, vy, vz, n, color, size, life = 3, spread = 2) {
      for (let k = 0; k < n; k++) {
        if (db.n >= DB_MAX) { // recycle the oldest-ish slot
          const j = (Math.random() * DB_MAX) | 0; api._dbSet(j, x, y, z, vx, vy, vz, color, size, life, spread); continue;
        }
        api._dbSet(db.n++, x, y, z, vx, vy, vz, color, size, life, spread);
      }
    },
    _dbSet(i, x, y, z, vx, vy, vz, color, size, life, spread) {
      const i3 = i * 3;
      db.p[i3] = x; db.p[i3 + 1] = y; db.p[i3 + 2] = z;
      db.v[i3] = vx + rand(-spread, spread); db.v[i3 + 1] = vy + rand(0, spread); db.v[i3 + 2] = vz + rand(-spread, spread);
      db.r[i3] = rand(0, 6); db.r[i3 + 1] = rand(0, 6); db.r[i3 + 2] = rand(0, 6);
      db.w[i3] = rand(-12, 12); db.w[i3 + 1] = rand(-12, 12); db.w[i3 + 2] = rand(-12, 12);
      db.s[i] = size * rand(0.6, 1.4); db.life[i] = life * rand(0.7, 1.3); db.col[i] = color; db.rest[i] = 0;
    },

    ring(x, y, z, radius, dur = 0.45, color = 0xfff1c8) {
      const r = rings[ringI++ % rings.length];
      r.m.position.set(x, y + 0.15, z); r.t = 0; r.dur = dur; r.r = radius; r.m.visible = true; r.m.material.color.setHex(color);
    },
    fireball(x, y, z, radius, dur = 0.35) {
      const b = balls[ballI++ % balls.length];
      b.m.position.set(x, y, z); b.t = 0; b.dur = dur; b.r = radius; b.m.visible = true;
    },
    flash(x, y, z, intensity = 60, dur = 0.25, color = 0xffa040) {
      const L = lights[lightI++ % lights.length];
      L.l.position.set(x, y + 1, z); L.l.color.setHex(color); L.t = 0; L.dur = dur; L.peak = intensity; L.l.intensity = intensity;
    },

    // the full explosion package
    explosion(x, y, z, radius, scale = 1) {
      const R = radius * scale;
      api.fireball(x, y + 0.6, z, R * 0.55, 0.32);
      api.ring(x, Math.max(y, 0.02), z, R * 1.5, 0.5);
      api.flash(x, y, z, 90 * scale, 0.35);
      const nf = Math.round(40 * scale);
      for (let k = 0; k < nf; k++) {
        const a = Math.random() * 6.283, e = Math.random() * 1.4, sp = rand(3, 11) * scale;
        const cx = Math.cos(a) * Math.cos(e), cy = Math.sin(e) + 0.2, cz = Math.sin(a) * Math.cos(e);
        fire.emit(x + cx * 0.3, y + 0.4 + cy * 0.3, z + cz * 0.3, cx * sp, cy * sp, cz * sp, rand(0.25, 0.6), rand(0.9, 1.8) * scale, rand(0.2, 0.5), 0xfff0b0, 0xff4a10, 1.2, 4.5, 2);
      }
      const ns = Math.round(26 * scale);
      for (let k = 0; k < ns; k++) {
        const a = Math.random() * 6.283, sp = rand(1, 5) * scale;
        smoke.emit(x + rand(-1, 1) * scale, y + rand(0.3, 1.5), z + rand(-1, 1) * scale, Math.cos(a) * sp, rand(1.5, 5), Math.sin(a) * sp,
          rand(1.6, 3.4), rand(1.2, 2) * scale, rand(3.5, 6) * scale, 0x5a524a, 0x9a948c, 0.7, 1.3, 0.9);
      }
      // dirt clods + plastic shards
      api.debris(x, y + 0.3, z, 0, 7 * scale, 0, Math.round(16 * scale), 0x5e4a30, 0.18 * scale, 3.5, 6 * scale);
      api.debris(x, y + 0.3, z, 0, 5 * scale, 0, Math.round(6 * scale), 0x333333, 0.12 * scale, 3, 7 * scale);
      // sparks
      for (let k = 0; k < 14 * scale; k++) fire.emit(x, y + 0.5, z, rand(-14, 14), rand(4, 16), rand(-14, 14), rand(0.4, 0.9), 0.08, 0.04, 0xfff4c0, 0xff8020, 1.4, 0.6, -18);
    },

    update(dt) {
      const cam = game.camera;
      const scale = (game.renderer.domElement.height || innerHeight) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      fire.update(dt, scale); smoke.update(dt, scale);

      // tracers
      let n = tr.n;
      for (let i = 0; i < n; i++) {
        tr.head[i] += tr.speed[i] * dt;
        const tail = tr.head[i] - tr.len[i];
        if (tail >= tr.dist[i]) { n--; if (i !== n) api._trMove(n, i); i--; continue; }
      }
      tr.n = n;
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        const head = Math.min(tr.head[i], tr.dist[i]);
        const tail = Math.max(0, tr.head[i] - tr.len[i]);
        const L = Math.max(0.01, head - tail);
        _d.set(tr.dx[i3], tr.dx[i3 + 1], tr.dx[i3 + 2]);
        _p.set(tr.sx[i3] + _d.x * tail, tr.sx[i3 + 1] + _d.y * tail, tr.sx[i3 + 2] + _d.z * tail);
        _q.setFromUnitVectors(_z, _d);
        _s.set(tr.w[i], tr.w[i], L);
        _m.compose(_p, _q, _s);
        trMesh.setMatrixAt(i, _m);
        trMesh.setColorAt(i, _c.setHex(tr.col[i]));
      }
      trMesh.count = n;
      if (n) { trMesh.instanceMatrix.needsUpdate = true; trMesh.instanceColor.needsUpdate = true; }

      // debris
      const world = game.world;
      let m = db.n;
      for (let i = 0; i < m; i++) {
        db.life[i] -= dt;
        if (db.life[i] <= 0) { m--; if (i !== m) api._dbMove(m, i); i--; continue; }
      }
      db.n = m;
      for (let i = 0; i < m; i++) {
        const i3 = i * 3;
        if (!db.rest[i]) {
          db.v[i3 + 1] -= 20 * dt;
          db.p[i3] += db.v[i3] * dt; db.p[i3 + 1] += db.v[i3 + 1] * dt; db.p[i3 + 2] += db.v[i3 + 2] * dt;
          db.r[i3] += db.w[i3] * dt; db.r[i3 + 1] += db.w[i3 + 1] * dt; db.r[i3 + 2] += db.w[i3 + 2] * dt;
          const floor = (world?.getFloor ? world.getFloor(db.p[i3], db.p[i3 + 1] + 0.3, db.p[i3 + 2]) : 0) + db.s[i] * 0.5;
          if (db.p[i3 + 1] < floor) {
            db.p[i3 + 1] = floor;
            if (Math.abs(db.v[i3 + 1]) < 1.5) { db.rest[i] = 1; }
            db.v[i3 + 1] *= -0.35; db.v[i3] *= 0.55; db.v[i3 + 2] *= 0.55;
            db.w[i3] *= 0.5; db.w[i3 + 1] *= 0.5; db.w[i3 + 2] *= 0.5;
          }
        }
        const sc = db.s[i] * Math.min(1, db.life[i] * 2);
        _p.set(db.p[i3], db.p[i3 + 1], db.p[i3 + 2]);
        _q.setFromEuler(_e.set(db.r[i3], db.r[i3 + 1], db.r[i3 + 2]));
        _s.set(sc, sc * 0.7, sc);
        dbMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
        dbMesh.setColorAt(i, _c.setHex(db.col[i]));
      }
      dbMesh.count = m;
      if (m) { dbMesh.instanceMatrix.needsUpdate = true; dbMesh.instanceColor.needsUpdate = true; }

      for (const r of rings) {
        if (!r.m.visible) continue;
        r.t += dt; const t = r.t / r.dur;
        if (t >= 1) { r.m.visible = false; continue; }
        const s = r.r * (0.15 + (1 - (1 - t) * (1 - t)) * 0.85);
        r.m.scale.set(s, 1, s); r.m.material.opacity = 0.85 * (1 - t);
      }
      for (const b of balls) {
        if (!b.m.visible) continue;
        b.t += dt; const t = b.t / b.dur;
        if (t >= 1) { b.m.visible = false; continue; }
        const s = b.r * (0.3 + Math.sqrt(t) * 0.9);
        b.m.scale.setScalar(s); b.m.material.opacity = 1 - t * t;
        b.m.material.color.setRGB(1, 0.85 - t * 0.5, 0.45 - t * 0.4);
      }
      for (const L of lights) {
        if (L.l.intensity <= 0) continue;
        L.t += dt; const t = L.t / L.dur;
        L.l.intensity = t >= 1 ? 0 : L.peak * (1 - t) * (1 - t);
      }
    },
    _trMove(from, to) {
      const f3 = from * 3, t3 = to * 3;
      for (let k = 0; k < 3; k++) { tr.sx[t3 + k] = tr.sx[f3 + k]; tr.dx[t3 + k] = tr.dx[f3 + k]; }
      tr.dist[to] = tr.dist[from]; tr.head[to] = tr.head[from]; tr.speed[to] = tr.speed[from]; tr.len[to] = tr.len[from]; tr.w[to] = tr.w[from]; tr.col[to] = tr.col[from];
    },
    _dbMove(from, to) {
      const f3 = from * 3, t3 = to * 3;
      for (let k = 0; k < 3; k++) { db.p[t3 + k] = db.p[f3 + k]; db.v[t3 + k] = db.v[f3 + k]; db.r[t3 + k] = db.r[f3 + k]; db.w[t3 + k] = db.w[f3 + k]; }
      db.s[to] = db.s[from]; db.life[to] = db.life[from]; db.col[to] = db.col[from]; db.rest[to] = db.rest[from];
    },
    clear() {
      fire.clear(); smoke.clear(); tr.n = 0; trMesh.count = 0; db.n = 0; dbMesh.count = 0;
      for (const r of rings) r.m.visible = false; for (const b of balls) b.m.visible = false; for (const L of lights) L.l.intensity = 0;
    },
  };
  return api;
}
