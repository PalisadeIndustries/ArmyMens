import * as THREE from 'three';
import { Events } from './events.js';
import { Input } from './input.js';
import { createAudio } from '../audio/index.js';
import { createWorld } from '../world/index.js';
import { createBodies } from '../body/index.js';
import { createCombat } from '../combat/index.js';
import { createUnits } from '../units/index.js';
import { createPlayer } from '../player/index.js';
import { createUI } from '../ui/index.js';

// The Game owns the renderer and the main loop and wires the subsystems together.
// Each subsystem is created by its module's factory and may expose update(dt).
// Update order matters: world -> units(AI) -> player -> combat(projectiles) -> bodies(corpses/debris) -> audio -> ui.
export class Game {
  constructor(container, uiRoot) {
    this.container = container;
    this.uiRoot = uiRoot;
    this.events = new Events();
    this.state = 'menu'; // 'menu' | 'playing' | 'paused' | 'gameover'
    this.time = 0;       // seconds of simulated play time
    this.dt = 0;
    this.timeScale = 1;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1500);
    this.scene.add(this.camera); // so view-model children of the camera render

    this.input = new Input(this.renderer.domElement);
    addEventListener('resize', () => this.resize());
  }

  init() {
    this.audio = createAudio(this);
    this.world = createWorld(this);
    this.bodies = createBodies(this);
    this.combat = createCombat(this);
    this.units = createUnits(this);
    this.player = createPlayer(this);
    this.ui = createUI(this);
    this.systems = [this.world, this.units, this.player, this.combat, this.bodies, this.audio];
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
    this.events.emit('game:ready', {});
  }

  // opts: { classId }
  start(opts = {}) {
    this.time = 0;
    this.state = 'playing';
    this.events.emit('game:start', opts);
    this.input.lock();
  }
  pause() { if (this.state === 'playing') { this.state = 'paused'; this.input.unlock(); this.events.emit('game:pause', {}); } }
  resume() { if (this.state === 'paused') { this.state = 'playing'; this.input.lock(); this.events.emit('game:resume', {}); } }
  gameOver(info = {}) {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this.input.unlock();
    this.events.emit('game:over', info);
  }

  // Return to the main menu (UI shows the menu on 'game:menu').
  toMenu() {
    if (this.ui?.toMenu) return this.ui.toMenu();
    this.state = 'menu';
    this.input.unlock();
    this.events.emit('game:menu', {});
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  frame() {
    const raw = Math.min(this.clock.getDelta(), 0.05);
    const dt = raw * this.timeScale;
    this.dt = dt;
    if (this.state === 'playing') {
      this.time += dt;
      for (const s of this.systems) s?.update?.(dt);
    } else {
      this.world?.idleUpdate?.(raw);
    }
    this.ui?.update?.(raw);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
}
