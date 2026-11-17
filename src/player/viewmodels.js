import * as THREE from 'three';

// Procedural first-person viewmodels: chunky green plastic guns and plastic hands, rendered in an overlay pass
// (own scene + camera, depth cleared) so they never clip into walls and keep a fixed FOV while the world zooms.

const PLASTIC = 0x4c7a30;
const mats = {
  body: new THREE.MeshStandardMaterial({ color: PLASTIC, roughness: 0.36, metalness: 0.0 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x3a5f24, roughness: 0.42, metalness: 0.0 }),
  light: new THREE.MeshStandardMaterial({ color: 0x5f9140, roughness: 0.34, metalness: 0.0 }),
  skin: new THREE.MeshStandardMaterial({ color: 0x4f8034, roughness: 0.4, metalness: 0.0 }),
  pilot: new THREE.MeshBasicMaterial({ color: 0x66aaff, toneMapped: false }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  flashCore: new THREE.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
};

function box(g, w, h, d, x, y, z, m = mats.body, rx = 0, ry = 0, rz = 0) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); g.add(me); return me;
}
function cyl(g, r, len, x, y, z, m = mats.body, axis = 'z', seg = 12, r2 = r) {
  const geo = new THREE.CylinderGeometry(r2, r, len, seg);
  if (axis === 'z') geo.rotateX(Math.PI / 2); else if (axis === 'x') geo.rotateZ(Math.PI / 2);
  const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); g.add(me); return me;
}
// plastic hand gripping at a point, forearm running back toward `elbow` (offset from hand)
function hand(g, x, y, z, elbow, side = 1) {
  const h = new THREE.Group(); h.position.set(x, y, z); g.add(h);
  box(h, 0.075, 0.085, 0.1, 0, 0, 0, mats.skin);
  box(h, 0.03, 0.03, 0.06, -0.04 * side, 0.02, -0.04, mats.skin); // thumb
  const fa = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.42), mats.skin);
  const e = new THREE.Vector3(...elbow);
  fa.position.copy(e).multiplyScalar(0.5);
  fa.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), e.clone().normalize()); // orient along the forearm
  h.add(fa);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), mats.dark);
  cuff.position.copy(e).multiplyScalar(0.62); cuff.quaternion.copy(fa.quaternion); h.add(cuff);
  return h;
}
function muzzleFlash(g, x, y, z, scale = 1) {
  const f = new THREE.Group(); f.position.set(x, y, z); g.add(f);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05 * scale, 0.22 * scale, 6, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.1 * scale), mats.flash);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.035 * scale, 8, 6), mats.flashCore);
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.22 * scale, 0.22 * scale), mats.flash);
  f.add(cone, core, p1);
  f.visible = false;
  return f;
}

// Each builder returns { gun: Group, muzzle: Object3D, flash, hip: Vector3, ads: Vector3, extra }
const BUILDERS = {
  rifle() {
    const g = new THREE.Group();
    box(g, 0.07, 0.1, 0.3, 0, -0.035, 0.2, mats.dark, 0.12);         // stock
    box(g, 0.066, 0.08, 0.32, 0, 0, -0.05);                         // receiver
    box(g, 0.072, 0.06, 0.32, 0, -0.012, -0.36, mats.light);        // handguard
    cyl(g, 0.017, 0.5, 0, 0.018, -0.48, mats.dark);                  // barrel
    box(g, 0.012, 0.04, 0.012, 0, 0.055, -0.66, mats.dark);          // front sight
    box(g, 0.034, 0.028, 0.025, 0, 0.052, 0.06, mats.dark);          // rear sight
    box(g, 0.045, 0.07, 0.07, 0, -0.07, -0.07, mats.dark);           // mag
    box(g, 0.02, 0.04, 0.07, 0, -0.065, 0.04, mats.dark);            // trigger guard
    hand(g, 0.0, -0.085, 0.08, [0.12, -0.18, 0.32], 1);
    hand(g, -0.005, -0.06, -0.33, [-0.2, -0.2, 0.3], -1);
    return { gun: g, muzzle: new THREE.Vector3(0, 0.018, -0.74), hip: new THREE.Vector3(0.2, -0.2, -0.46), ads: new THREE.Vector3(0, -0.067, -0.33) };
  },
  smg() {
    const g = new THREE.Group();
    box(g, 0.07, 0.09, 0.26, 0, -0.04, 0.22, mats.dark, 0.1);
    box(g, 0.072, 0.085, 0.3, 0, 0, -0.03);
    cyl(g, 0.028, 0.22, 0, 0.012, -0.3, mats.light);                 // finned barrel shroud
    for (let i = 0; i < 6; i++) cyl(g, 0.034, 0.012, 0, 0.012, -0.22 - i * 0.03, mats.body);
    cyl(g, 0.014, 0.12, 0, 0.012, -0.46, mats.dark);
    cyl(g, 0.085, 0.07, 0, -0.1, -0.09, mats.dark, 'x', 16);         // drum
    box(g, 0.035, 0.1, 0.04, 0, -0.08, -0.25, mats.dark, 0.25);      // fore grip
    box(g, 0.04, 0.1, 0.05, 0, -0.08, 0.08, mats.dark, -0.3);        // pistol grip
    box(g, 0.012, 0.03, 0.012, 0, 0.055, -0.4, mats.dark);
    box(g, 0.03, 0.022, 0.02, 0, 0.052, 0.08, mats.dark);
    hand(g, 0, -0.11, 0.1, [0.13, -0.17, 0.3], 1);
    hand(g, 0, -0.12, -0.25, [-0.2, -0.18, 0.28], -1);
    return { gun: g, muzzle: new THREE.Vector3(0, 0.012, -0.53), hip: new THREE.Vector3(0.19, -0.19, -0.42), ads: new THREE.Vector3(0, -0.064, -0.3) };
  },
  sniper() {
    const g = new THREE.Group();
    box(g, 0.07, 0.11, 0.32, 0, -0.04, 0.22, mats.dark, 0.1);
    box(g, 0.066, 0.08, 0.34, 0, 0, -0.06);
    box(g, 0.07, 0.06, 0.3, 0, -0.014, -0.38, mats.light);
    cyl(g, 0.016, 0.62, 0, 0.018, -0.66, mats.dark);
    cyl(g, 0.024, 0.06, 0, 0.018, -0.98, mats.dark);                 // muzzle brake
    cyl(g, 0.03, 0.32, 0, 0.085, -0.08, mats.dark);                  // scope tube
    cyl(g, 0.042, 0.07, 0, 0.085, -0.25, mats.dark, 'z', 12, 0.03);  // objective bell
    cyl(g, 0.038, 0.05, 0, 0.085, 0.08, mats.dark);
    box(g, 0.02, 0.04, 0.03, 0, 0.05, -0.12, mats.dark); box(g, 0.02, 0.04, 0.03, 0, 0.05, 0.02, mats.dark);
    cyl(g, 0.012, 0.08, 0.05, 0.02, 0.06, mats.light, 'x');          // bolt handle
    hand(g, 0, -0.085, 0.09, [0.12, -0.18, 0.32], 1);
    hand(g, 0, -0.06, -0.36, [-0.2, -0.2, 0.3], -1);
    return { gun: g, muzzle: new THREE.Vector3(0, 0.018, -1.0), hip: new THREE.Vector3(0.2, -0.2, -0.44), ads: new THREE.Vector3(0, -0.085, -0.26) };
  },
  pistol() {
    const g = new THREE.Group();
    box(g, 0.042, 0.05, 0.2, 0, 0, -0.06, mats.body);                // slide
    box(g, 0.04, 0.12, 0.06, 0, -0.07, 0.02, mats.dark, -0.25);      // grip
    cyl(g, 0.012, 0.04, 0, 0.005, -0.17, mats.dark);
    box(g, 0.008, 0.02, 0.008, 0, 0.033, -0.15, mats.dark);
    box(g, 0.026, 0.016, 0.012, 0, 0.032, 0.03, mats.dark);
    hand(g, 0, -0.09, 0.03, [0.1, -0.2, 0.3], 1);
    hand(g, -0.03, -0.1, 0.0, [-0.18, -0.2, 0.28], -1);
    return { gun: g, muzzle: new THREE.Vector3(0, 0.005, -0.2), hip: new THREE.Vector3(0.17, -0.17, -0.38), ads: new THREE.Vector3(0, -0.04, -0.32) };
  },
  bazooka() {
    const g = new THREE.Group();
    cyl(g, 0.075, 1.15, 0, 0, -0.1, mats.body, 'z', 16);
    cyl(g, 0.11, 0.18, 0, 0, -0.72, mats.dark, 'z', 16, 0.08);       // flared muzzle
    cyl(g, 0.09, 0.14, 0, 0, 0.46, mats.dark, 'z', 16, 0.08);        // rear
    for (const z of [-0.45, -0.1, 0.2]) cyl(g, 0.084, 0.03, 0, 0, z, mats.light, 'z', 16);
    box(g, 0.035, 0.12, 0.05, 0, -0.12, 0.0, mats.dark, -0.2);        // grip
    box(g, 0.035, 0.1, 0.05, 0, -0.11, -0.3, mats.dark, 0.1);         // front grip
    const sf = new THREE.Group(); sf.position.set(-0.11, 0.06, -0.2); g.add(sf); // side sight frame
    box(sf, 0.006, 0.06, 0.006, 0, 0.0, 0, mats.dark); box(sf, 0.05, 0.006, 0.006, 0, 0.03, 0, mats.dark); box(sf, 0.05, 0.006, 0.006, 0, -0.03, 0, mats.dark);
    box(g, 0.05, 0.02, 0.02, -0.08, 0.06, -0.2, mats.dark);
    const rocket = new THREE.Group(); rocket.position.set(0, 0, -0.7); g.add(rocket);
    cyl(rocket, 0.06, 0.1, 0, 0, -0.05, mats.dark, 'z', 10, 0.0);
    hand(g, 0, -0.17, 0.0, [0.1, -0.2, 0.3], 1);
    hand(g, 0, -0.16, -0.3, [-0.2, -0.16, 0.26], -1);
    return { gun: g, muzzle: new THREE.Vector3(0, 0, -0.8), hip: new THREE.Vector3(0.25, -0.16, -0.36), ads: new THREE.Vector3(0.15, -0.07, -0.34), rocket };
  },
  grenade() {
    const g = new THREE.Group();
    const ball = new THREE.Group(); g.add(ball);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8).scale(1, 1.25, 1), mats.light); ball.add(b);
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.006, 4, 14), mats.dark); r.rotation.x = Math.PI / 2; r.position.y = -0.03 + i * 0.03; r.scale.setScalar(1 - Math.abs(i - 1) * 0.12); ball.add(r); }
    cyl(ball, 0.022, 0.04, 0, 0.085, 0, mats.dark, 'y');
    box(ball, 0.016, 0.09, 0.012, 0.03, 0.05, 0, mats.dark, 0, 0, -0.25);
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 4, 10), mats.dark); pin.position.set(-0.03, 0.09, 0); ball.add(pin);
    hand(g, 0.01, -0.06, 0.04, [0.1, -0.2, 0.3], 1);
    return { gun: g, muzzle: new THREE.Vector3(0, 0, -0.1), hip: new THREE.Vector3(0.2, -0.18, -0.36), ads: new THREE.Vector3(0.12, -0.14, -0.34), pin };
  },
  flamethrower() {
    const g = new THREE.Group();
    cyl(g, 0.028, 0.62, 0, 0, -0.2, mats.body);                      // wand
    cyl(g, 0.045, 0.14, 0, 0, -0.55, mats.dark, 'z', 12, 0.03);       // nozzle
    cyl(g, 0.04, 0.1, 0, 0, 0.12, mats.dark);
    box(g, 0.04, 0.12, 0.05, 0, -0.08, 0.05, mats.dark, -0.2);        // rear grip
    box(g, 0.04, 0.11, 0.05, 0, -0.07, -0.3, mats.dark, 0.15);        // front grip
    cyl(g, 0.02, 0.06, 0, -0.045, -0.5, mats.light);                   // igniter
    const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), mats.pilot); pilot.position.set(0, -0.045, -0.54); g.add(pilot);
    // hose curving down out of view
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.02, 0.15), new THREE.Vector3(0.02, -0.12, 0.25), new THREE.Vector3(0.08, -0.3, 0.3), new THREE.Vector3(0.1, -0.5, 0.25)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.022, 6), mats.dark));
    hand(g, 0, -0.1, 0.05, [0.12, -0.18, 0.3], 1);
    hand(g, 0, -0.1, -0.3, [-0.2, -0.18, 0.28], -1);
    return { gun: g, muzzle: new THREE.Vector3(0, 0, -0.64), hip: new THREE.Vector3(0.2, -0.22, -0.45), ads: new THREE.Vector3(0.08, -0.16, -0.42), pilot };
  },
};

export function createViewmodels(game) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.01, 10);
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x4a3a20, 1.4));
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2); sun.position.set(0.6, 1, 0.4); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb0c8ff, 0.5); fill.position.set(-1, 0.2, 0.6); scene.add(fill);
  const flashLight = new THREE.PointLight(0xffb050, 0, 2, 2); flashLight.position.set(0.1, -0.05, -0.6); scene.add(flashLight);

  const root = new THREE.Group(); scene.add(root);
  const models = {};
  for (const id in BUILDERS) {
    const m = BUILDERS[id]();
    const holder = new THREE.Group(); holder.add(m.gun); holder.visible = false; root.add(holder);
    const muzzleObj = new THREE.Object3D(); muzzleObj.position.copy(m.muzzle); m.gun.add(muzzleObj);
    m.flash = id === 'grenade' ? null : muzzleFlash(m.gun, m.muzzle.x, m.muzzle.y, m.muzzle.z, id === 'bazooka' ? 2.2 : id === 'flamethrower' ? 0.8 : id === 'sniper' ? 1.4 : 1);
    m.muzzleObj = muzzleObj; m.holder = holder;
    m.gun.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } });
    models[id] = m;
  }
  let current = null, flashT = 0;
  const tmp = new THREE.Vector3(), tmpE = new THREE.Euler();
  const pos = new THREE.Vector3(), rot = new THREE.Euler();

  const api = {
    scene, camera, models, visible: true,
    get current() { return current; },
    set(id) {
      if (!models[id]) id = 'rifle';
      if (current === models[id]) return;
      if (current) current.holder.visible = false;
      current = models[id]; current.holder.visible = true;
    },
    flash(intensity = 1) {
      if (!current?.flash) return;
      flashT = 0.05; current.flash.visible = true;
      current.flash.rotation.z = Math.random() * Math.PI;
      current.flash.scale.setScalar((0.8 + Math.random() * 0.5) * intensity);
      flashLight.intensity = 3 * intensity;
    },
    // Muzzle position in world space (approximate: maps the overlay camera space into the main camera).
    muzzleWorld(out) {
      if (!current) return out.copy(game.camera.position);
      root.updateMatrixWorld(true);
      current.muzzleObj.getWorldPosition(out);
      return out.applyMatrix4(game.camera.matrixWorld);
    },
    // s: { adsT, bobX, bobY, swayX, swayY, sprintT, reloadP, kick, throwT, cookT, meleeT, switchT, crouchT, time, firing (flame) }
    update(dt, s) {
      if (!current) return;
      camera.aspect = game.camera.aspect; camera.fov = 62 - s.adsT * 10; camera.updateProjectionMatrix();
      const m = current;
      pos.lerpVectors(m.hip, m.ads, s.adsT);
      const hipW = 1 - s.adsT * 0.85;
      pos.x += s.bobX * hipW + s.swayX;
      pos.y += s.bobY * hipW + s.swayY - s.crouchT * 0.01;
      rot.set(0, 0, 0);
      // idle breathing
      pos.y += Math.sin(s.time * 1.6) * 0.004 * hipW;
      // recoil kick
      pos.z += s.kick * (current === models.bazooka ? 0.12 : 0.06);
      pos.y += s.kick * 0.012;
      rot.x += s.kick * (current === models.bazooka ? 0.06 : 0.12) * (1 - s.adsT * 0.6);
      // sprint carry pose
      if (s.sprintT > 0) {
        pos.x += 0.04 * s.sprintT; pos.y -= 0.06 * s.sprintT;
        rot.y += 0.75 * s.sprintT; rot.z += 0.25 * s.sprintT; rot.x -= 0.2 * s.sprintT;
      }
      // reload: dip, roll, tilt
      if (s.reloadP >= 0) {
        const k = Math.sin(Math.min(1, s.reloadP) * Math.PI);
        pos.y -= 0.12 * k; pos.x -= 0.03 * k;
        rot.x -= 0.35 * k; rot.z += 0.55 * k;
        if (m.rocket) m.rocket.visible = s.reloadP > 0.6;
      } else if (m.rocket) m.rocket.visible = true;
      // weapon switch: drop down then up
      if (s.switchT > 0) { pos.y -= 0.35 * s.switchT; rot.x -= 0.6 * s.switchT; }
      // melee bash: thrust forward and twist
      if (s.meleeT > 0) {
        const k = Math.sin(s.meleeT * Math.PI);
        pos.z -= 0.22 * k; pos.x -= 0.08 * k; pos.y += 0.03 * k; rot.y += 0.6 * k; rot.z -= 0.4 * k;
      }
      // grenade: cooking pulls back + up; throw arcs forward
      if (current === models.grenade) {
        if (s.cookT > 0) { const c = Math.min(1, s.cookT * 4); pos.z += 0.12 * c; pos.y += 0.1 * c; pos.x += 0.06 * c; rot.x += 0.5 * c; if (m.pin) m.pin.visible = false; }
        else if (m.pin) m.pin.visible = true;
        if (s.throwT > 0) {
          const k = s.throwT; // 0 -> 1
          pos.z -= 0.5 * Math.sin(k * Math.PI * 0.5); pos.y += 0.12 * Math.sin(k * Math.PI) - 0.25 * k * k; rot.x -= 1.4 * k;
          m.gun.children[0].visible = k < 0.25;
        } else m.gun.children[0].visible = true;
      }
      if (m.pilot) m.pilot.scale.setScalar(0.8 + Math.random() * 0.5 + (s.firing ? 0.8 : 0));
      root.position.copy(pos);
      root.rotation.copy(rot);
      if (flashT > 0) {
        flashT -= dt;
        if (flashT <= 0) { if (m.flash) m.flash.visible = false; flashLight.intensity = 0; }
      }
    },
    hideFlash() { for (const id in models) if (models[id].flash) models[id].flash.visible = false; flashLight.intensity = 0; },
  };

  // overlay render pass, chained after the main scene render
  const prev = game.scene.onAfterRender;
  game.scene.onAfterRender = function (renderer, sc, cam) {
    if (prev) prev.call(this, renderer, sc, cam);
    if (cam !== game.camera || !api.visible || !current || game.state === 'menu') return;
    const ac = renderer.autoClear, ar = renderer.info.autoReset, sm = renderer.shadowMap.autoUpdate;
    renderer.autoClear = false; renderer.info.autoReset = false; renderer.shadowMap.autoUpdate = false;
    renderer.state.buffers.depth.setMask(true); // a depthWrite:false material may have left the mask off
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = ac; renderer.info.autoReset = ar; renderer.shadowMap.autoUpdate = sm;
  };
  return api;
}
