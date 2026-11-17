import * as THREE from 'three';
import { GRAVITY } from '../core/config.js';

// SKELETON first-person player. The Player/Combat team replaces this with viewmodels, ADS, crouch/prone, class kits.
export function createPlayer(game) {
  const cam = game.camera;
  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let unit = null, classId = 'rifleman', respawnTimer = 0, onGround = true;

  const api = {
    get unit() { return unit; },
    get classId() { return classId; },
    lives: 3,
    respawnTimer: 0,
    setClass(id) { classId = id; },
    spawn() {
      if (unit) { const i = game.units.list.indexOf(unit); if (i >= 0) game.units.list.splice(i, 1); }
      const sp = game.world.spawnPoints.green[1];
      unit = game.units.spawn({ team: 'green', classId, position: sp.clone(), isPlayer: true });
      unit.yaw = 0; unit.pitch = 0;
      game.events.emit('player:spawn', { unit });
    },
    update(dt) {
      if (!unit) return;
      if (!unit.alive) {
        api.respawnTimer -= dt;
        if (api.respawnTimer <= 0) { if (api.lives > 0) api.spawn(); else game.gameOver({ reason: 'lives' }); }
        return;
      }
      const inp = game.input;
      if (inp.justPressed('Escape') || (!inp.locked && game.state === 'playing' && api._wasLocked)) { api._wasLocked = false; game.pause(); return; }
      api._wasLocked = inp.locked;
      unit.yaw -= inp.mouse.dx * 0.0022; unit.pitch -= inp.mouse.dy * 0.0022;
      unit.pitch = Math.max(-1.5, Math.min(1.5, unit.pitch));
      fwd.set(Math.sin(unit.yaw), 0, Math.cos(unit.yaw)); right.set(-fwd.z, 0, fwd.x);
      tmp.set(0, 0, 0);
      if (inp.down('KeyW')) tmp.add(fwd); if (inp.down('KeyS')) tmp.sub(fwd);
      if (inp.down('KeyD')) tmp.sub(right); if (inp.down('KeyA')) tmp.add(right);
      const speed = unit.cls.speed * (inp.down('ShiftLeft') ? 1.5 : 1);
      if (tmp.lengthSq() > 0) tmp.normalize().multiplyScalar(speed);
      unit.velocity.x = tmp.x; unit.velocity.z = tmp.z;
      if (onGround && inp.justPressed('Space')) { unit.velocity.y = 6.5; onGround = false; }
      unit.velocity.y -= GRAVITY * dt;
      unit.position.addScaledVector(unit.velocity, dt);
      game.world.resolveCircle(unit.position, unit.radius);
      const floor = game.world.getFloor(unit.position.x, unit.position.y, unit.position.z);
      if (unit.position.y <= floor) { unit.position.y = floor; unit.velocity.y = 0; onGround = true; }
      if (inp.justPressed('Digit1')) unit.weaponIndex = 0;
      if (inp.justPressed('Digit2')) unit.weaponIndex = Math.min(1, unit.weapons.length - 1);
      if (inp.justPressed('KeyR')) game.combat.reload(unit.weapon);
      for (const w of unit.weapons) game.combat.tickWeapon(w, dt);
      unit.eyePosition(cam.position);
      cam.rotation.set(0, 0, 0); cam.rotation.order = 'YXZ'; cam.rotation.y = unit.yaw + Math.PI; cam.rotation.x = unit.pitch;
      const ws = unit.weapon;
      if (inp.locked && (ws.def.auto ? inp.mouseDown(0) : inp.mouseJustPressed(0))) {
        game.combat.tryFire(unit, ws, cam.position.clone(), unit.forward(new THREE.Vector3()));
      }
    },
  };
  game.events.on('game:start', (opts) => { if (opts.classId) classId = opts.classId; api.lives = 3; api.spawn(); });
  game.events.on('unit:killed', ({ unit: u }) => {
    if (u === unit) { api.lives--; api.respawnTimer = 4; game.events.emit('player:died', { unit: u }); }
  });
  return api;
}
