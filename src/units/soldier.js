import * as THREE from 'three';
import { CLASSES } from '../core/classes.js';
import { SOLDIER_RADIUS, SOLDIER_HEIGHT } from '../core/config.js';
import { SURNAMES } from './barks.js';

let nextId = 1;

// A soldier (player or AI). Fields here are part of the shared contract (CONTRACTS.md).
// Added by the units team: name, rank ('pvt'|'sergeant'), scale, squad, suppression, speedMul, spawnTime.
export class Soldier {
  constructor(game, { team, classId = 'rifleman', position, isPlayer = false, rank = 'pvt', scale = 1, hp = null, name = null }) {
    this.game = game;
    this.id = nextId++;
    this.team = team;
    this.classId = classId;
    this.cls = CLASSES[classId] || CLASSES.rifleman;
    this.isPlayer = isPlayer;
    this.position = position ? position.clone() : new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;          // facing, radians, 0 = +z
    this.pitch = 0;        // aim pitch
    this.scale = scale;    // visual/physical size multiplier (bosses are bigger)
    this.radius = SOLDIER_RADIUS * Math.sqrt(scale);
    this.height = SOLDIER_HEIGHT * scale;
    this.crouchScale = 1;  // 1 standing, ~0.65 crouched, ~0.3 prone
    this.maxHp = hp ?? this.cls.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.limbs = { head: true, torso: true, larm: true, rarm: true, lleg: true, rleg: true };
    this.onFire = 0;       // seconds of burning left (body system drives this)
    this.anim = { state: 'idle', phase: Math.random() * 6, aimPitch: 0 };
    this.weapons = this.cls.weapons.map((w) => game.combat.createWeaponState(w));
    this.weaponIndex = 0;
    this.ai = null;        // AI brain state (units system)
    this.kills = 0;
    this.rank = rank;
    this.name = name || SURNAMES[(Math.random() * SURNAMES.length) | 0];
    this.squad = null;
    this.suppression = 0;  // 0..1.5, rises when rounds land nearby (units system)
    this.spawnTime = game.time || 0;
    this._poseDt = 0;
    this.model = isPlayer ? null : game.bodies.createSoldierModel(team, classId);
    if (this.model) {
      if (scale !== 1) this.model.root.scale.setScalar(scale);
      game.scene.add(this.model.root);
    }
  }
  get weapon() { return this.weapons[this.weaponIndex]; }
  eyePosition(out = new THREE.Vector3()) { return out.set(this.position.x, this.position.y + 1.6 * this.scale * this.crouchScale, this.position.z); }
  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }
  takeDamage(info) { return this.game.bodies.applyDamage(this, info); }
  // pose=false skips the (comparatively expensive) skeletal pose for distant soldiers; the skipped dt is accumulated.
  syncModel(dt, pose = true) {
    if (!this.model) return;
    const r = this.model.root;
    r.position.copy(this.position);
    if (r.rotation.y !== this.yaw) r.rotation.y = this.yaw;
    if (this.scale !== 1 && r.scale.x !== this.scale) r.scale.setScalar(this.scale);
    this.anim.aimPitch = this.pitch;
    this._poseDt += dt;
    if (pose) { this.game.bodies.poseModel(this.model, this.anim, this._poseDt, this); this._poseDt = 0; }
  }
}
