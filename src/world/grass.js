// Instanced grass tufts (chunked for frustum culling) with GPU wind sway.
import * as THREE from 'three';

export const wind = { uTime: { value: 0 }, uStrength: { value: 1 } };

function tuftGeometry() {
  // 5 tapered blades fanning out, vertex colour dark base -> sunlit tip
  const pos = [], col = [], base = new THREE.Color(0x4f7f2e), tip = new THREE.Color(0xa9d35f);
  const blades = 6;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + b * 0.7, lean = 0.18 + (b % 3) * 0.12, h = 0.7 + ((b * 37) % 10) / 22, w = 0.07;
    const cx = Math.cos(a), cz = Math.sin(a), px = -cz, pz = cx;
    const ox = cx * 0.06, oz = cz * 0.06;
    const tx = ox + cx * lean * h, tz = oz + cz * lean * h;
    // two triangles: base-left, base-right, tip
    // both windings so both faces are front faces (normals all point up => evenly lit, no dark backfaces)
    pos.push(ox - px * w, 0, oz - pz * w, ox + px * w, 0, oz + pz * w, tx, h, tz);
    pos.push(ox + px * w, 0, oz + pz * w, ox - px * w, 0, oz - pz * w, tx, h, tz);
    for (let k = 0; k < 2; k++) col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nrm = new Float32Array(pos.length); for (let i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

export function windPatch(mat, amp = 0.12) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind.uTime; sh.uniforms.uStrength = wind.uStrength;
    sh.vertexShader = 'uniform float uTime; uniform float uStrength;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #ifdef USE_INSTANCING
          vec3 wp = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
        #else
          vec3 wp = (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
        #endif
        float hh = max(position.y, 0.0);
        float w = sin(uTime * 1.6 + wp.x * 0.13 + wp.z * 0.09) * 0.7 + sin(uTime * 3.3 + wp.x * 0.5 - wp.z * 0.3) * 0.3;
        w *= uStrength * ${amp.toFixed(3)} * hh * hh;
        transformed.x += w; transformed.z += w * 0.5;
      }`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp;
  return mat;
}

// placeFn(rand) -> {x,z,y,s,rot} | null
export function createGrass(scene, { count, extent, chunk = 40, accept, getHeight, rand }) {
  const geo = tuftGeometry();
  const mat = windPatch(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.16);
  const buckets = new Map();
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 4) {
    tries++;
    const x = extent.minX + rand() * (extent.maxX - extent.minX), z = extent.minZ + rand() * (extent.maxZ - extent.minZ);
    const dens = accept(x, z);
    if (dens <= 0 || rand() > dens) continue;
    const key = Math.floor((x - extent.minX) / chunk) + ',' + Math.floor((z - extent.minZ) / chunk);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push([x, getHeight(x, z) - 0.03, z, 0.38 + rand() * 0.55, rand() * Math.PI * 2, rand()]);
    placed++;
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  const meshes = [];
  for (const list of buckets.values()) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z, sc, r, t], i) => {
      q.setFromAxisAngle(Y, r); s.set(sc * (0.9 + t * 0.3), sc * (0.8 + t * 0.5), sc * (0.9 + t * 0.3)); p.set(x, y, z);
      m.compose(p, q, s); im.setMatrixAt(i, m);
      c.setRGB(0.85 + t * 0.3, 0.9 + t * 0.2, 0.75 + t * 0.2); im.setColorAt(i, c);
    });
    im.computeBoundingSphere();
    im.receiveShadow = true; im.castShadow = false; im.name = 'grass';
    scene.add(im); meshes.push(im);
  }
  return { meshes, count: placed };
}
