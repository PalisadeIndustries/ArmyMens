import * as THREE from 'three';
import { CLASSES } from '../core/classes.js';
import { SOLDIER_RADIUS, SOLDIER_HEIGHT } from '../core/config.js';

let nextId = 1;

// A soldier (player or AI). Fields here are part of the shared contract (CONTRACTS.md).
export class Soldier {
  constructor(game, { team, classId = 'rifleman', position, isPlayer = false }) {
    this.game = game;
    this.id = nextId++;
    this.team = team;
    this.classId = classId;
    this.cls = CLASSES[classId];
    this.isPlayer = isPlayer;
    this.position = position ? position.clone() : new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;          // facing, radians, 0 = +z
    this.pitch = 0;        // aim pitch
    this.radius = SOLDIER_RADIUS;
    this.height = SOLDIER_HEIGHT;
    this.crouchScale = 1;  // 1 standing, ~0.65 crouched, ~0.3 prone
    this.maxHp = this.cls.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.limbs = { head: true, torso: true, larm: true, rarm: true, lleg: true, rleg: true };
    this.onFire = 0;       // seconds of burning left (body system drives this)
    this.anim = { state: 'idle', phase: 0, aimPitch: 0 };
    this.weapons = this.cls.weapons.map((w) => game.combat.createWeaponState(w));
    this.weaponIndex = 0;
    this.ai = null;        // AI brain state (units system)
    this.kills = 0;
    this.model = isPlayer ? null : game.bodies.createSoldierModel(team, classId);
    if (this.model) game.scene.add(this.model.root);
  }
  get weapon() { return this.weapons[this.weaponIndex]; }
  eyePosition(out = new THREE.Vector3()) { return out.set(this.position.x, this.position.y + 1.6 * this.crouchScale, this.position.z); }
  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }
  takeDamage(info) { return this.game.bodies.applyDamage(this, info); }
  syncModel(dt) {
    if (!this.model) return;
    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.yaw;
    this.anim.aimPitch = this.pitch;
    this.game.bodies.poseModel(this.model, this.anim, dt, this);
  }
}
