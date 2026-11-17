import * as THREE from 'three';

// Cheap pooled effects owned by the body system: plastic shards (InstancedMesh, 1 draw call),
// black smoke wisps and little flames (Points, 1 draw call each). No per-frame allocations.

const VERT = /* glsl */`
attribute float aSize; attribute vec4 aColor; varying vec4 vC; uniform float uScale;
void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const FRAG = /* glsl */`
varying vec4 vC; uniform float uSoft;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
  float a = vC.a * smoothstep(0.5, uSoft, d); gl_FragColor = vec4(vC.rgb, a); }`;

class Particles {
  constructor(scene, cap, additive) {
    this.cap = cap; this.n = 0;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap);
    this.c = new Float32Array(cap * 3); this.a0 = new Float32Array(cap); this.rise = new Float32Array(cap);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos); this.geo.setAttribute('aSize', this.aSize); this.geo.setAttribute('aColor', this.aCol);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 }, uSoft: { value: additive ? 0.0 : 0.1 } },
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, rise = 0) {
    let i = this.n;
    if (i >= this.cap) i = (Math.random() * this.cap) | 0; else this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = 0; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b; this.a0[i] = a; this.rise[i] = rise;
  }
  update(dt, scale) {
    this.mat.uniforms.uScale.value = scale;
    const P = this.aPos.array, Sz = this.aSize.array, C = this.aCol.array;
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) { // swap-remove
        const j = --this.n;
        if (i !== j) {
          for (let k = 0; k < 3; k++) { this.p[i * 3 + k] = this.p[j * 3 + k]; this.v[i * 3 + k] = this.v[j * 3 + k]; this.c[i * 3 + k] = this.c[j * 3 + k]; }
          this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.a0[i] = this.a0[j]; this.rise[i] = this.rise[j];
        }
        continue;
      }
      const f = this.life[i] / this.max[i];
      const drag = 1 - Math.min(1, dt * 1.5);
      this.v[i * 3] *= drag; this.v[i * 3 + 2] *= drag; this.v[i * 3 + 1] = this.v[i * 3 + 1] * drag + this.rise[i] * dt;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      P[i * 3] = this.p[i * 3]; P[i * 3 + 1] = this.p[i * 3 + 1]; P[i * 3 + 2] = this.p[i * 3 + 2];
      Sz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * f;
      C[i * 4] = this.c[i * 3]; C[i * 4 + 1] = this.c[i * 3 + 1]; C[i * 4 + 2] = this.c[i * 3 + 2];
      C[i * 4 + 3] = this.a0[i] * (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    if (this.n) { this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aCol.needsUpdate = true; }
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

export function createFx(game) {
  const scene = game.scene;
  const smoke = new Particles(scene, 1400, false);
  const fire = new Particles(scene, 900, true);

  // plastic shards
  const SHARD_CAP = 400;
  const shardGeo = new THREE.TetrahedronGeometry(0.045);
  shardGeo.scale(1, 0.55, 1.3);
  const shardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, SHARD_CAP);
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shards.setColorAt(0, new THREE.Color(1, 1, 1));
  shards.instanceColor.setUsage(THREE.DynamicDrawUsage);
  shards.count = 0; shards.frustumCulled = false; shards.castShadow = false;
  scene.add(shards);
  const sp = new Float32Array(SHARD_CAP * 3), sv = new Float32Array(SHARD_CAP * 3), sl = new Float32Array(SHARD_CAP);
  const sax = new Float32Array(SHARD_CAP * 3), sang = new Float32Array(SHARD_CAP), sspin = new Float32Array(SHARD_CAP), ssc = new Float32Array(SHARD_CAP);
  const scol = new Float32Array(SHARD_CAP * 3);
  let sn = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc3 = new THREE.Vector3(), ax = new THREE.Vector3(), col = new THREE.Color();

  function emitShards(point, dir, color, count = 6, speed = 4) {
    col.set(color);
    for (let n = 0; n < count; n++) {
      let i = sn < SHARD_CAP ? sn++ : (Math.random() * SHARD_CAP) | 0;
      sp[i * 3] = point.x; sp[i * 3 + 1] = point.y; sp[i * 3 + 2] = point.z;
      const dx = (dir?.x || 0) * -0.6, dz = (dir?.z || 0) * -0.6;
      sv[i * 3] = (dx + (Math.random() - 0.5) * 1.4) * speed;
      sv[i * 3 + 1] = (0.5 + Math.random()) * speed * 0.8;
      sv[i * 3 + 2] = (dz + (Math.random() - 0.5) * 1.4) * speed;
      sl[i] = 1.6 + Math.random() * 1.6;
      ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      sax[i * 3] = ax.x; sax[i * 3 + 1] = ax.y; sax[i * 3 + 2] = ax.z;
      sang[i] = Math.random() * 6; sspin[i] = 8 + Math.random() * 18; ssc[i] = 0.6 + Math.random() * 0.9;
      const shade = 0.75 + Math.random() * 0.35;
      scol[i * 3] = col.r * shade; scol[i * 3 + 1] = col.g * shade; scol[i * 3 + 2] = col.b * shade;
    }
  }

  function updateShards(dt) {
    let i = 0;
    const world = game.world;
    while (i < sn) {
      sl[i] -= dt;
      if (sl[i] <= 0) {
        const j = --sn;
        if (i !== j) {
          for (let k = 0; k < 3; k++) { sp[i * 3 + k] = sp[j * 3 + k]; sv[i * 3 + k] = sv[j * 3 + k]; sax[i * 3 + k] = sax[j * 3 + k]; scol[i * 3 + k] = scol[j * 3 + k]; }
          sl[i] = sl[j]; sang[i] = sang[j]; sspin[i] = sspin[j]; ssc[i] = ssc[j];
        }
        continue;
      }
      sv[i * 3 + 1] -= 18 * dt;
      sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
      const fl = (world?.getHeight?.(sp[i * 3], sp[i * 3 + 2]) ?? 0) + 0.02;
      if (sp[i * 3 + 1] < fl) {
        sp[i * 3 + 1] = fl;
        if (sv[i * 3 + 1] < -1.5) { sv[i * 3 + 1] *= -0.35; sv[i * 3] *= 0.6; sv[i * 3 + 2] *= 0.6; sspin[i] *= 0.6; }
        else { sv[i * 3] = sv[i * 3 + 1] = sv[i * 3 + 2] = 0; sspin[i] = 0; }
      }
      sang[i] += sspin[i] * dt;
      ax.set(sax[i * 3], sax[i * 3 + 1], sax[i * 3 + 2]);
      q.setFromAxisAngle(ax, sang[i]);
      const s = ssc[i] * Math.min(1, sl[i] * 2);
      m4.compose(v3.set(sp[i * 3], sp[i * 3 + 1], sp[i * 3 + 2]), q, sc3.set(s, s, s));
      shards.setMatrixAt(i, m4);
      col.setRGB(scol[i * 3], scol[i * 3 + 1], scol[i * 3 + 2]);
      shards.setColorAt(i, col);
      i++;
    }
    shards.count = sn;
    if (sn) { shards.instanceMatrix.needsUpdate = true; shards.instanceColor.needsUpdate = true; }
  }

  return {
    shards: emitShards,
    // black acrid plastic smoke wisp
    smoke(x, y, z, size = 1, dark = 0.06) {
      const g = dark + Math.random() * 0.06;
      smoke.emit(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4,
        1.6 + Math.random() * 1.4, 0.35 * size, (1.4 + Math.random()) * size, g, g, g * 0.95, 0.55, 0.4);
    },
    dust(x, y, z, size = 1) {
      const g = 0.55 + Math.random() * 0.15;
      smoke.emit(x, y, z, (Math.random() - 0.5) * 1.5, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 1.5,
        0.7 + Math.random() * 0.5, 0.3 * size, 1.1 * size, g, g * 0.95, g * 0.85, 0.35, 0);
    },
    flame(x, y, z, size = 1) {
      const h = Math.random();
      fire.emit(x + (Math.random() - 0.5) * 0.15, y, z + (Math.random() - 0.5) * 0.15,
        (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.9, (Math.random() - 0.5) * 0.3,
        0.3 + Math.random() * 0.3, 0.45 * size, 0.1 * size, 1.0, 0.45 + h * 0.35, 0.08 + h * 0.1, 0.9, 1.5);
    },
    update(dt) {
      const cam = game.camera, h = game.renderer?.domElement?.height || 720;
      const scale = h / (2 * Math.tan((cam.fov * Math.PI / 180) / 2));
      smoke.update(dt, scale); fire.update(dt, scale); updateShards(dt);
    },
    clear() { smoke.clear(); fire.clear(); sn = 0; shards.count = 0; },
    get counts() { return { smoke: smoke.n, fire: fire.n, shards: sn }; },
  };
}
