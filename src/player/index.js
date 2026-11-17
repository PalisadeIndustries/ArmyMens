import * as THREE from 'three';
import { GRAVITY } from '../core/config.js';
import { CLASSES } from '../core/classes.js';
import { createViewmodels } from './viewmodels.js';

// First-person player controller: sprint / crouch / prone / jump, ADS with FOV zoom (+ sniper scope), head bob,
// recoil kick & recovery, weapon sway, procedural viewmodels, grenade cooking, melee bash, class ability on Q.
//
// UI-facing fields (read-only): isADS, adsT, scoped, stance, sprinting, spread, abilityName, abilityCooldown,
// abilityMax, abilityReady, cooking, cookTime, grenades, killstreak, hitmarker {time, kill, headshot}, lives,
// respawnTimer, spawnProtect, dead.
// Events emitted: player:spawn, player:died, player:hit, player:hitmarker, player:killstreak, player:melee,
//   player:lives, player:resupply, player:stance, player:ads.
// Debug/test hooks: autoplay (bool, or ?autoplay in URL), debugFire(), debugThrow(cook), debugAbility(),
//   debugMelee(), debugSelect(i).

const rand = (a, b) => a + Math.random() * (b - a);
const STANCE = { stand: { scale: 1, speed: 1, spread: 1 }, crouch: { scale: 0.62, speed: 0.55, spread: 0.7 }, prone: { scale: 0.3, speed: 0.25, spread: 0.45 } };
const STREAK_MILESTONES = new Set([3, 5, 7, 10, 15, 20, 25, 30, 40, 50, 75, 100]);

export function createPlayer(game) {
  const cam = game.camera;
  let baseFov = cam.fov || 75; // hip FOV; follows game.settings.fov (UI settings) every frame
  const vm = createViewmodels(game);
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3();
  const _dir = new THREE.Vector3(), _muz = new THREE.Vector3(), _aim = new THREE.Vector3(), _t = new THREE.Vector3();
  const _fv = new THREE.Vector3(0, 0, -1);

  let unit = null, classId = 'rifleman', onGround = true, wasLocked = false;
  let grenadeWs = null; // ws used by G (the class grenade slot, or a separate pouch)
  let recoilP = 0, recoilY = 0, kick = 0, swayX = 0, swayY = 0, bobPhase = 0, bobAmt = 0, landDip = 0;
  let sprintT = 0, switchT = 0, meleeT = 0, meleeCd = 0, meleeHitDone = true, throwT = 0, throwBackTo = -1;
  let cookFromSlot = false, breath = 4, breathT = 0, deathT = 0, firing = false, hitmarkCd = 0, lastFov = baseFov;
  let autoTarget = null, autoRetarget = 0, autoNade = 4;
  let protectedUntil = 0;

  const api = {
    get unit() { return unit; },
    get classId() { return classId; },
    get cls() { return CLASSES[classId]; },
    viewmodel: vm,
    lives: 3,
    respawnTimer: 0,
    isADS: false, adsT: 0, scoped: false,
    stance: 'stand', sprinting: false, spread: 0,
    cooking: false, cookTime: 0, cookElapsed: 0,
    killstreak: 0, kills: 0,
    hitmarker: { time: -10, kill: false, headshot: false },
    sensitivity: 0.0022,
    autoplay: typeof location !== 'undefined' && /[?&]autoplay/.test(location.search),
    get dead() { return !unit || !unit.alive; },
    get abilityName() { return CLASSES[classId]?.ability?.name ?? ''; },
    get abilityDesc() { return CLASSES[classId]?.ability?.desc ?? ''; },
    get abilityCooldownMax() { return CLASSES[classId]?.ability?.cooldown ?? 1; },
    get abilityMax() { return CLASSES[classId]?.ability?.cooldown ?? 1; },
    get abilityCooldown() { return unit?.abilityCd ?? 0; },
    get abilityReady() { return !!unit?.alive && !(unit.abilityCd > 0); },
    get grenades() { return grenadeWs ? grenadeWs.ammo + grenadeWs.reserve : 0; },
    get spawnProtect() { return Math.max(0, protectedUntil - game.time); },

    setClass(id) { if (CLASSES[id]) classId = id; },

    spawn() {
      if (unit) { const i = game.units.list.indexOf(unit); if (i >= 0) game.units.list.splice(i, 1); }
      const sps = game.world.spawnPoints?.green || [new THREE.Vector3()];
      const sp = sps[(Math.random() * sps.length) | 0] || sps[0];
      const pos = sp.clone(); pos.x += rand(-2, 2); pos.z += rand(-1, 1);
      unit = game.units.spawn({ team: 'green', classId, position: pos, isPlayer: true });
      // face the enemy side (tan spawns), fallback +z
      const tan = game.world.spawnPoints?.tan?.[0];
      unit.yaw = tan ? Math.atan2(tan.x - pos.x, tan.z - pos.z) : 0; unit.pitch = 0;
      // spawn protection
      const base = unit.takeDamage.bind(unit);
      unit.takeDamage = (info) => (game.time < protectedUntil ? { damage: 0, killed: false, limbLost: null } : base(info));
      protectedUntil = game.time + 2.5;
      const pouch = unit.weapons.find((w) => w.def.kind === 'throw');
      if (pouch) grenadeWs = pouch;
      else {
        const n = CLASSES[classId]?.grenades ?? 0;
        grenadeWs = n > 0 ? game.combat.createWeaponState('grenade') : null;
        if (grenadeWs) { grenadeWs.ammo = 1; grenadeWs.reserve = n - 1; }
      }
      if (game.settings?.fov) baseFov = game.settings.fov;
      unit.weaponIndex = 0;
      api.stance = 'stand'; unit.crouchScale = 1; onGround = true;
      recoilP = recoilY = kick = 0; api.adsT = 0; api.isADS = false; api.scoped = false;
      api.cooking = false; throwT = 0; meleeT = 0; switchT = 1; deathT = 0; api.killstreak = 0;
      vm.set(unit.weapon.id); vm.visible = true;
      cam.fov = baseFov; cam.updateProjectionMatrix(); lastFov = baseFov;
      game.events.emit('player:spawn', { unit });
    },

    update(dt) {
      if (!unit) return;
      const inp = game.input;
      const S = game.settings;
      if (S?.fov > 30 && S.fov < 130) baseFov = S.fov;
      hitmarkCd -= dt;
      if (!unit.alive) { deathCam(dt); return; }
      if (inp.justPressed('Escape') || (!inp.locked && wasLocked && game.state === 'playing')) { wasLocked = false; game.pause(); return; }
      wasLocked = inp.locked;
      const active = inp.locked || api.autoplay;
      const cls = CLASSES[classId];
      let ws = unit.weapon;
      const def = ws.def;

      // ---------------- look
      const fovScale = cam.fov / baseFov;
      if (inp.locked) {
        const sens = api.sensitivity * (S?.sensitivity ?? 1) * fovScale;
        unit.yaw -= inp.mouse.dx * sens;
        unit.pitch -= inp.mouse.dy * sens * (S?.invertY ? -1 : 1);
      }
      swayX += (-inp.mouse.dx * 0.00018 - swayX) * Math.min(1, dt * 8);
      swayY += (inp.mouse.dy * 0.00018 - swayY) * Math.min(1, dt * 8);
      swayX = THREE.MathUtils.clamp(swayX, -0.03, 0.03); swayY = THREE.MathUtils.clamp(swayY, -0.03, 0.03);
      if (api.autoplay) autoplay(dt);
      unit.pitch = THREE.MathUtils.clamp(unit.pitch, -1.45, 1.45);

      // ---------------- stance
      if (inp.justPressed('KeyC') || inp.justPressed('ControlLeft')) setStance(api.stance === 'crouch' ? 'stand' : 'crouch');
      if (inp.justPressed('KeyZ')) setStance(api.stance === 'prone' ? 'stand' : 'prone');
      const st = STANCE[api.stance];
      unit.crouchScale += (st.scale - unit.crouchScale) * Math.min(1, dt * 10);

      // ---------------- ADS
      const wantADS = active && inp.mouseDown(2) && meleeT <= 0 && !(ws.reloading > 0 && def.kind !== 'hitscan') && def.kind !== 'throw' && !api.cooking;
      const adsTime = def.adsTime || 0.2;
      api.adsT = THREE.MathUtils.clamp(api.adsT + (wantADS ? dt : -dt) / adsTime, 0, 1);
      if (api.isADS !== wantADS) { api.isADS = wantADS; game.events.emit('player:ads', { on: wantADS }); }
      api.scoped = !!def.scope && api.adsT > 0.92;

      // ---------------- movement
      const yaw = unit.yaw;
      _f.set(Math.sin(yaw), 0, Math.cos(yaw)); _r.set(-_f.z, 0, _f.x);
      _w.set(0, 0, 0);
      let fwdIn = 0;
      if (active) {
        if (inp.down('KeyW')) { _w.add(_f); fwdIn = 1; }
        if (inp.down('KeyS')) { _w.sub(_f); fwdIn = -1; }
        if (inp.down('KeyD')) _w.add(_r);
        if (inp.down('KeyA')) _w.sub(_r);
      }
      const moving = _w.lengthSq() > 0;
      const wantSprint = active && inp.down('ShiftLeft') && fwdIn > 0 && api.stance !== 'prone' && api.adsT < 0.3 && !(firing && def.auto);
      if (wantSprint && api.stance === 'crouch') setStance('stand');
      api.sprinting = wantSprint && moving && onGround;
      sprintT += ((api.sprinting ? 1 : 0) - sprintT) * Math.min(1, dt * 10);
      let speed = cls.speed * st.speed * (api.sprinting ? (cls.sprint || 1.55) : 1) * (1 - api.adsT * 0.45);
      if (unit.rallyUntil > game.time) speed *= 1.15;
      if (moving) _w.normalize().multiplyScalar(speed);
      const accel = onGround ? 12 : 2.5;
      const k = Math.min(1, accel * dt);
      unit.velocity.x += (_w.x - unit.velocity.x) * k;
      unit.velocity.z += (_w.z - unit.velocity.z) * k;
      if (active && inp.justPressed('Space')) {
        if (api.stance !== 'stand') setStance('stand');
        else if (onGround) { unit.velocity.y = 6.6; onGround = false; }
      }
      unit.velocity.y -= GRAVITY * dt;
      const vyBefore = unit.velocity.y;
      unit.position.addScaledVector(unit.velocity, dt);
      game.world.resolveCircle(unit.position, unit.radius, unit.height * unit.crouchScale);
      const floor = game.world.getFloor(unit.position.x, unit.position.y, unit.position.z);
      if (unit.position.y <= floor) {
        if (!onGround && vyBefore < -6) { landDip = Math.min(0.22, -vyBefore * 0.018); game.combat.shake?.(Math.min(0.2, -vyBefore * 0.012)); }
        unit.position.y = floor; unit.velocity.y = 0; onGround = true;
      } else if (unit.position.y > floor + 0.08) onGround = false;
      if (unit.position.y < -20) { unit.position.y = 5; unit.velocity.y = 0; }

      // ---------------- animation state for 3rd person / AI awareness
      const hs = Math.hypot(unit.velocity.x, unit.velocity.z);
      unit.anim.state = api.stance === 'prone' ? 'prone' : api.stance === 'crouch' ? 'crouch' : hs > 0.5 ? 'run' : 'aim';
      unit.anim.phase += dt * hs * 2;

      // ---------------- weapon switching
      if (active && !api.cooking && throwT <= 0) {
        let want = -1;
        if (inp.justPressed('Digit1')) want = 0;
        if (inp.justPressed('Digit2')) want = 1;
        if (inp.mouse.wheel) want = (unit.weaponIndex + (inp.mouse.wheel > 0 ? 1 : -1) + unit.weapons.length) % unit.weapons.length;
        if (want >= 0 && want < unit.weapons.length && want !== unit.weaponIndex) selectWeapon(want);
      }
      for (const w of unit.weapons) game.combat.tickWeapon(w, dt);
      if (grenadeWs && !unit.weapons.includes(grenadeWs)) game.combat.tickWeapon(grenadeWs, dt);
      ws = unit.weapon;
      if (active && inp.justPressed('KeyR') && ws.def.kind !== 'throw') game.combat.reload(ws, unit);

      // ---------------- camera
      bobPhase += dt * hs * (api.sprinting ? 1.45 : 1.8);
      bobAmt += ((onGround ? Math.min(1.4, hs / 5) : 0) - bobAmt) * Math.min(1, dt * 8);
      landDip = Math.max(0, landDip - dt * 0.9);
      recoilP += (0 - recoilP) * Math.min(1, dt * (firing && ws.def.auto ? 4 : 7));
      recoilY += (0 - recoilY) * Math.min(1, dt * 7);
      kick += (0 - kick) * Math.min(1, dt * 14);
      unit.eyePosition(cam.position);
      const adsDamp = 1 - api.adsT * 0.8;
      cam.position.y += Math.sin(bobPhase * 2) * 0.035 * bobAmt * adsDamp - landDip;
      cam.position.addScaledVector(_r, Math.sin(bobPhase) * 0.02 * bobAmt * adsDamp);
      // scope sway (hold Shift to steady)
      let sx = 0, sy = 0;
      if (api.scoped) {
        const holding = inp.down('ShiftLeft') && breath > 0;
        breath = holding ? breath - dt : Math.min(4, breath + dt * 0.8);
        breathT += dt;
        const amp = holding ? 0.0006 : 0.004 * (api.stance === 'prone' ? 0.35 : api.stance === 'crouch' ? 0.6 : 1);
        sx = Math.sin(breathT * 0.9) * amp; sy = Math.sin(breathT * 1.7) * amp * 0.7;
      }
      cam.rotation.order = 'YXZ';
      cam.rotation.set(unit.pitch + recoilP + sy, unit.yaw + Math.PI + recoilY + sx, 0);
      cam.rotation.z = -swayX * 0.4 * (1 - api.adsT) + Math.sin(bobPhase) * 0.006 * bobAmt;
      const fov = THREE.MathUtils.lerp(baseFov, def.adsFov || baseFov, easeInOut(api.adsT)) + sprintT * 4;
      if (Math.abs(fov - lastFov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); lastFov = fov; }
      cam.updateMatrixWorld();

      // ---------------- spread (radians, for firing + UI crosshair)
      const hipBase = ws.def.hipSpread ?? ws.def.spread;
      let spread = THREE.MathUtils.lerp(hipBase, ws.def.spread * (ws.def.adsSpread ?? 0.5), api.adsT);
      spread *= st.spread;
      if (hs > 1) spread *= 1 + Math.min(1, hs / 5) * 0.9;
      if (!onGround) spread *= 2.5;
      spread += (ws.bloom || 0) * (1 - api.adsT * 0.5);
      if (unit.rallyUntil > game.time) spread *= 0.6;
      api.spread = spread;

      // ---------------- melee (V)
      meleeCd -= dt;
      if (active && inp.justPressed('KeyV') && meleeCd <= 0 && !api.cooking) { meleeT = 0.001; meleeCd = 0.65; meleeHitDone = false; }
      if (meleeT > 0) {
        meleeT += dt / 0.38;
        if (!meleeHitDone && meleeT > 0.32) { meleeHitDone = true; doMelee(); }
        if (meleeT >= 1) meleeT = 0;
      }

      // ---------------- ability (Q)
      if (active && inp.justPressed('KeyQ')) useAbility();

      // ---------------- grenades: G (quick) or LMB on the grenade slot; hold to cook
      throwT = throwT > 0 ? throwT + dt / 0.35 : 0;
      if (throwT >= 1) { throwT = 0; if (throwBackTo >= 0) { selectWeapon(throwBackTo, true); throwBackTo = -1; } else if (unit.weapon.def.kind === 'throw' && unit.weapon.ammo + unit.weapon.reserve <= 0) selectWeapon(0, true); }
      const onGrenadeSlot = ws.def.kind === 'throw';
      if (active && !api.cooking && throwT <= 0 && meleeT <= 0 && grenadeWs) {
        if (inp.justPressed('KeyG') || (onGrenadeSlot && inp.mouseJustPressed(0))) startCook(onGrenadeSlot);
      }
      if (api.cooking) {
        api.cookElapsed += dt;
        api.cookTime = Math.max(0, grenadeWs.def.fuse - api.cookElapsed);
        const held = cookFromSlot ? inp.mouseDown(0) || inp.down('KeyG') : inp.down('KeyG');
        if (api.cookTime <= 0) throwGrenade(true);
        else if (!held || api.autoplayRelease) { api.autoplayRelease = false; throwGrenade(false); }
      }

      // ---------------- fire
      firing = false;
      const canFire = !api.cooking && throwT <= 0 && meleeT <= 0 && switchT < 0.35;
      if (active && canFire && ws.def.kind !== 'throw') {
        const trig = api.autoplay ? api._autoTrigger : (ws.def.auto ? inp.mouseDown(0) : inp.mouseJustPressed(0));
        if (trig) { api.sprinting = false; sprintT *= 0.5; fireWeapon(ws); }
      }

      // ---------------- viewmodel
      switchT = Math.max(0, switchT - dt * 4);
      vm.visible = !api.scoped;
      const vmId = api.cooking || throwT > 0 ? 'grenade' : ws.id;
      vm.set(vmId);
      vm.update(dt, {
        adsT: easeInOut(api.adsT), bobX: Math.sin(bobPhase) * 0.012 * bobAmt, bobY: -Math.abs(Math.cos(bobPhase)) * 0.016 * bobAmt + landDip * 0.2,
        swayX, swayY, sprintT, reloadP: ws.reloading > 0 && vmId === ws.id ? 1 - ws.reloading / ws.def.reload : -1,
        kick, throwT, cookT: api.cooking ? api.cookElapsed + 0.01 : 0, meleeT, switchT, crouchT: 1 - unit.crouchScale,
        time: game.time, firing,
      });
    },

    // ---------------- debug / test hooks (work without pointer lock)
    debugSelect(i) { if (unit?.weapons[i]) selectWeapon(i, true); switchT = 0; },
    debugFire() {
      if (!unit?.alive) return false;
      const ws = unit.weapon; ws.cooldown = 0; switchT = 0;
      if (ws.def.kind === 'throw') { if (!startCook(true)) return false; return throwGrenade(false); }
      return fireWeapon(ws);
    },
    debugThrow(cook = 0) {
      if (!unit?.alive || !grenadeWs) return false;
      grenadeWs.cooldown = 0; grenadeWs.reloading = 0; if (grenadeWs.ammo <= 0) { grenadeWs.ammo = 1; }
      if (!startCook(false)) return false;
      api.cookElapsed = cook; return throwGrenade(false);
    },
    debugAbility() { if (unit) unit.abilityCd = 0; return useAbility(); },
    debugMelee() { return doMelee(); },
  };

  // ------------------------------------------------------------------------------------------------ helpers
  function easeInOut(t) { return t * t * (3 - 2 * t); }

  function setStance(s) {
    if (api.stance === s) return;
    api.stance = s; game.events.emit('player:stance', { stance: s });
  }

  function selectWeapon(i, instant) {
    const prev = unit.weapon; if (prev.reloading > 0) prev.reloading = 0;
    unit.weaponIndex = i; switchT = instant ? 0.6 : 1;
    game.events.emit('weapon:switch', { unit, weapon: unit.weapon.def });
  }

  function aimDir(out) { return out.copy(_fv).applyQuaternion(cam.quaternion); }

  function fireWeapon(ws) {
    const def = ws.def;
    aimDir(_dir);
    vm.muzzleWorld(_muz);
    let ok;
    if (def.kind === 'hitscan') {
      ok = game.combat.tryFire(unit, ws, cam.position, _dir, { spread: api.spread, visualOrigin: _muz, noMuzzle: true });
    } else if (def.kind === 'flame') {
      ok = game.combat.tryFire(unit, ws, cam.position, _dir, { spread: def.spread * (api.adsT > 0.5 ? 0.7 : 1), visualOrigin: _muz });
      firing = ok || firing;
    } else if (def.kind === 'projectile') {
      // converge from the muzzle onto what the crosshair is pointing at
      const hit = game.combat.hitscan(unit, cam.position, _dir, 250);
      _aim.copy(cam.position).addScaledVector(_dir, hit ? hit.dist : 250);
      _t.copy(_aim).sub(_muz).normalize();
      if (_t.dot(_dir) < 0.9) _t.copy(_dir);
      ok = game.combat.tryFire(unit, ws, _muz, _t, { spread: api.spread, visualOrigin: _muz });
    }
    if (ok) {
      const r = def.recoil || 0;
      const adsK = 1 - api.adsT * 0.45, stK = STANCE[api.stance].spread;
      recoilP += r * adsK * stK * rand(0.85, 1.15);
      recoilY += (def.recoilYaw || 0) * rand(-1, 1) * adsK;
      kick = Math.min(1.4, kick + (def.kind === 'flame' ? 0.08 : 1));
      ws.bloom = Math.min(def.bloomMax || 0, (ws.bloom || 0) + (def.bloom || 0));
      if (def.kind !== 'flame' || Math.random() < 0.3) vm.flash(def.kind === 'flame' ? 0.5 : 1);
      if (def.kind === 'hitscan' && def.id === 'sniper') game.combat.shake?.(0.12);
      if (def.kind === 'hitscan' && Math.random() < 0.5) game.combat.fx?.flash(cam.position.x, cam.position.y - 1, cam.position.z, def.id === 'sniper' ? 12 : 5, 0.06, 0xffc070);
    }
    return ok;
  }

  function startCook(fromSlot) {
    const g = grenadeWs;
    if (!g || g.ammo <= 0 || g.reloading > 0 || g.cooldown > 0) {
      if (g && g.ammo <= 0) game.combat.reload(g, unit);
      return false;
    }
    api.cooking = true; api.cookElapsed = 0; api.cookTime = g.def.fuse; cookFromSlot = fromSlot;
    if (!fromSlot) switchT = 0.5;
    game.events.emit('player:cook', { unit });
    return true;
  }

  function throwGrenade(inHand) {
    const g = grenadeWs;
    api.cooking = false;
    aimDir(_dir);
    _muz.copy(cam.position).addScaledVector(_r.set(-_dir.z, 0, _dir.x).normalize(), 0.18).addScaledVector(_dir, 0.4); _muz.y -= 0.08;
    const vel = new THREE.Vector3();
    let fuse = Math.max(0.05, g.def.fuse - api.cookElapsed);
    if (inHand) { vel.set(0, 0.5, 0); fuse = 0.01; _muz.copy(unit.position); _muz.y += 0.5; }
    else {
      const power = api.stance === 'prone' ? 0.7 : 1;
      vel.copy(_dir).multiplyScalar(g.def.speed * power); vel.y += 2.8;
      vel.addScaledVector(unit.velocity, 0.6);
    }
    g.cooldown = 0;
    const ok = game.combat.tryFire(unit, g, _muz, _dir, { throwVel: vel, fuse, visualOrigin: _muz });
    if (ok) {
      throwT = 0.001;
      if (!cookFromSlot) throwBackTo = unit.weaponIndex === unit.weapons.indexOf(g) ? -1 : unit.weaponIndex;
    }
    api.cookElapsed = 0; api.cookTime = 0;
    return ok;
  }

  function doMelee() {
    aimDir(_dir);
    const hit = game.combat.melee?.(unit, cam.position, _dir, { damage: 60, range: 2.3 });
    game.events.emit('player:melee', { unit, hit });
    return hit;
  }

  function useAbility() {
    if (!unit?.alive) return false;
    aimDir(_a);
    const ok = game.combat.useAbility?.(unit, { dir: _a });
    if (ok && classId === 'rifleman') game.combat.shake?.(0.1);
    if (ok && classId === 'grenadier') throwT = 0.001;
    return ok;
  }

  function deathCam(dt) {
    vm.visible = false; api.cooking = false; api.isADS = false; api.adsT = 0; api.scoped = false;
    deathT += dt;
    const k = Math.min(1, deathT / 0.7);
    cam.position.set(unit.position.x, unit.position.y + THREE.MathUtils.lerp(1.6 * unit.crouchScale, 0.25, k * k), unit.position.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(unit.pitch * (1 - k) + 0.25 * k, unit.yaw + Math.PI, 0.9 * k * k);
    if (Math.abs(cam.fov - baseFov) > 0.01) { cam.fov = baseFov; cam.updateProjectionMatrix(); lastFov = baseFov; }
    api.respawnTimer -= dt;
    if (api.respawnTimer <= 0) { if (api.lives > 0) api.spawn(); else game.gameOver({ reason: 'lives', wave: game.units?.wave }); }
  }

  // ---------------- autoplay: aim at the nearest visible enemy and use the whole kit (for tests/demo)
  function autoplay(dt) {
    autoRetarget -= dt; autoNade -= dt;
    const ws = unit.weapon;
    if (autoRetarget <= 0 || !autoTarget?.alive) {
      autoRetarget = 0.4;
      autoTarget = null; let bd = Math.max(40, (ws.def.aiRange || 30) * 2.5);
      unit.eyePosition(_t);
      for (const u of game.units.list) {
        if (!u.alive || u.team === unit.team) continue;
        const d = u.position.distanceTo(unit.position);
        if (d < bd) { _a.copy(u.position); _a.y += 1.1; if (game.world.hasLineOfSight(_t, _a)) { bd = d; autoTarget = u; } }
      }
    }
    api._autoTrigger = false;
    if (!autoTarget) return;
    unit.eyePosition(_t);
    _a.copy(autoTarget.position); _a.y += 1.1 * (autoTarget.crouchScale ?? 1); _a.sub(_t);
    const dist = _a.length();
    const wantYaw = Math.atan2(_a.x, _a.z), wantPitch = Math.asin(THREE.MathUtils.clamp(_a.y / dist, -1, 1));
    let dy = wantYaw - unit.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const turn = Math.min(1, dt * 8);
    unit.yaw += dy * turn; unit.pitch += (wantPitch - unit.pitch) * turn;
    if (Math.abs(dy) < 0.06 && dist < (ws.def.range || 100)) {
      api._autoTrigger = ws.def.auto ? true : ws.cooldown <= 0;
      if (unit.abilityCd <= 0 || unit.abilityCd === undefined) useAbility();
      if (autoNade <= 0 && grenadeWs && dist > 8 && dist < 28) { autoNade = 7; if (startCook(false)) api.autoplayRelease = true; }
    }
    if (ws.ammo <= 0 && ws.reserve <= 0) ws.reserve = ws.def.reserve; // autoplay never runs dry
  }

  // ------------------------------------------------------------------------------------------------ events
  game.events.on('game:start', (opts) => {
    if (opts?.classId && CLASSES[opts.classId]) classId = opts.classId;
    api.lives = 3; api.kills = 0; api.killstreak = 0; wasLocked = false;
    api.spawn();
  });
  game.events.on('unit:killed', ({ unit: u, killer, info }) => {
    if (u === unit) {
      api.lives--; api.respawnTimer = 4; api.killstreak = 0; deathT = 0;
      vm.hideFlash();
      game.events.emit('player:died', { unit: u, killer });
      return;
    }
    if (unit && killer === unit && u.team !== unit.team) {
      api.kills++; api.killstreak++;
      if (STREAK_MILESTONES.has(api.killstreak)) game.events.emit('player:killstreak', { count: api.killstreak });
    }
  });
  game.events.on('unit:damaged', ({ unit: u, info, damage }) => {
    if (!unit) return;
    if (u === unit) {
      let fromDir = null;
      if (info?.source?.position && info.source !== unit) fromDir = info.source.position.clone().sub(unit.position).setY(0).normalize();
      else if (info?.dir) fromDir = info.dir.clone().negate().setY(0).normalize();
      game.events.emit('player:hit', { unit, damage, fromDir, type: info?.type });
      return;
    }
    if (info?.source === unit && u.team !== unit.team) {
      const kill = u.hp <= 0 || !u.alive;
      const headshot = info.zone === 'head';
      if (!kill && (info.type === 'fire') && hitmarkCd > 0) return;
      hitmarkCd = 0.12;
      api.hitmarker = { time: game.time, kill, headshot };
      game.events.emit('player:hitmarker', { kill, headshot, unit: u, damage });
    }
  });
  game.events.on('wave:cleared', ({ wave } = {}) => {
    // resupply every wave, extra life every 3rd wave (up to 3)
    if (unit) {
      for (const w of unit.weapons) { w.reserve = Math.max(w.reserve, w.def.reserve); }
      if (grenadeWs) grenadeWs.reserve = Math.max(grenadeWs.reserve, unit.weapons.includes(grenadeWs) ? grenadeWs.def.reserve : (CLASSES[classId]?.grenades ?? 1) - 1);
      if (unit.alive) unit.hp = unit.maxHp;
      game.events.emit('player:resupply', { unit });
    }
    if (wave && wave % 3 === 0 && api.lives < 3) { api.lives = 3; game.events.emit('player:lives', { lives: api.lives, refilled: true }); }
  });
  return api;
}
