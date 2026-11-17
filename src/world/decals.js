// Persistent marks (scorches, craters, bullet holes, melted plastic) as pooled InstancedMeshes (ring buffers).
import * as THREE from 'three';
import { decalTexture } from './textures.js';

const KINDS = {
  scorch: { cap: 220, tex: 'scorch', lift: 0.06, order: 1 },
  crater: { cap: 140, tex: 'crater', lift: 0.05, order: 0 },
  bullet: { cap: 700, tex: 'bullet', lift: 0.025, order: 3 },
  melt: { cap: 200, tex: 'melt', lift: 0.07, order: 2 },
  splat: { cap: 160, tex: 'splat', lift: 0.07, order: 2 },
};

export function createDecals(scene) {
  const pools = {};
  const geo = new THREE.PlaneGeometry(1, 1);
  for (const [kind, k] of Object.entries(KINDS)) {
    const mat = new THREE.MeshStandardMaterial({
      map: decalTexture(k.tex), transparent: true, depthWrite: false, roughness: 0.95, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2 - k.order, polygonOffsetUnits: -4 - k.order,
    });
    if (kind === 'melt' || kind === 'splat') { mat.roughness = 0.35; }
    const mesh = new THREE.InstancedMesh(geo, mat, k.cap);
    mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.renderOrder = 2 + k.order;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(k.cap * 3).fill(1), 3);
    mesh.name = 'decals:' + kind;
    scene.add(mesh);
    pools[kind] = { mesh, cap: k.cap, next: 0, lift: k.lift };
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1), n = new THREE.Vector3(), col = new THREE.Color();

  function add(kind, point, normal, size, color) {
    const pool = pools[kind] || pools.scorch;
    n.copy(normal || Y).normalize();
    q.setFromUnitVectors(Z, n);
    q2.setFromAxisAngle(Z, Math.random() * Math.PI * 2);
    q.multiply(q2);
    p.copy(point).addScaledVector(n, pool.lift + Math.random() * 0.01);
    s.set(size, size, 1);
    m4.compose(p, q, s);
    const i = pool.next;
    pool.mesh.setMatrixAt(i, m4);
    if (color !== undefined && color !== null) col.set(color); else col.setRGB(1, 1, 1);
    pool.mesh.setColorAt(i, col);
    pool.next = (i + 1) % pool.cap;
    pool.mesh.count = Math.max(pool.mesh.count, i + 1);
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.mesh.instanceColor.needsUpdate = true;
  }
  function clear() { for (const k in pools) { pools[k].next = 0; pools[k].mesh.count = 0; } }
  return { add, clear, pools };
}
const Y = new THREE.Vector3(0, 1, 0);
