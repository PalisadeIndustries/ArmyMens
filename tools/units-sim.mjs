// Headless (no browser, no rendering) simulation of the units/AI/wave systems for deterministic-ish CPU profiling
// and behaviour checks. Mirrors src/ into a temp dir, using the committed (git HEAD) skeletons of world/body/combat
// by default (pass --live to use the working-tree versions, which may need a DOM).
// Usage: node tools/units-sim.mjs [--frames 1800] [--spawn 150] [--green 50] [--waves] [--live body,combat|all] [--wave N]
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const frames = Number(arg('frames', 1800)), spawnN = Number(arg('spawn', 150)), greenN = Number(arg('green', 50));
const liveArg = arg('live', ''); const liveSet = new Set(liveArg === 'all' ? ['world', 'body', 'combat'] : liveArg.split(',').filter(Boolean));
const waves = process.argv.includes('--waves'), startWave = Number(arg('wave', 0));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'units-sim-'));
fs.cpSync(path.join(root, 'src'), path.join(tmp, 'src'), { recursive: true });
fs.symlinkSync(path.join(root, 'node_modules'), path.join(tmp, 'node_modules'));
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
for (const m of ['world', 'body', 'combat'].filter((m) => !liveSet.has(m))) {
  const dir = path.join(tmp, 'src', m);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'index.js'), execSync(`git show HEAD:src/${m}/index.js`, { cwd: root }));
  if (m === 'combat') fs.writeFileSync(path.join(dir, 'weapons.js'), fs.readFileSync(path.join(root, 'src/combat/weapons.js')));
}
const imp = (p) => import(path.join(tmp, p));
const THREE = await imp('node_modules/three/build/three.module.js');
const { Events } = await imp('src/core/events.js');
const { createWorld } = await imp('src/world/index.js');
const { createBodies } = await imp('src/body/index.js');
const { createCombat } = await imp('src/combat/index.js');
const { createUnits } = await imp('src/units/index.js');

globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
globalThis.performance ??= { now: () => Number(process.hrtime.bigint()) / 1e6 };
const game = {
  scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 1500), events: new Events(),
  renderer: { shadowMap: {}, domElement: { width: 1280, height: 720 }, info: { render: {} }, capabilities: {} }, state: 'playing', time: 0, dt: 0, timeScale: 1, player: { unit: null },
  gameOver(info) { this.state = 'gameover'; this.events.emit('game:over', info); },
};
game.camera.position.set(0, 30, -70);
game.world = createWorld(game);
game.bodies = createBodies(game);
game.combat = createCombat(game);
game.units = createUnits(game);
const counts = {};
for (const ev of ['bark', 'wave:start', 'wave:cleared', 'wave:incoming', 'wave:boss', 'unit:killed', 'objective:contested', 'objective:lost', 'game:over', 'weapon:fire', 'explosion']) {
  game.events.on(ev, (p) => { counts[ev] = (counts[ev] || 0) + 1; if (ev === 'bark' && counts[ev] <= 25) console.log(`  [${p.kind}] ${p.unit.team} ${p.unit.name}: ${p.text}`); if (ev === 'wave:start' || ev === 'wave:boss' || ev === 'game:over' || ev === 'wave:cleared') console.log(ev, JSON.stringify({ ...p, unit: undefined, stats: undefined })); });
}
game.events.emit('game:start', {});
const U = game.units;
if (process.argv.includes('--player')) {
  const sp = game.world.spawnPoints.green[1];
  const pu = U.spawn({ team: 'green', classId: 'rifleman', position: (sp.position || sp).clone(), isPlayer: true });
  game.player.unit = pu;
  game.events.on('unit:killed', ({ unit }) => { if (unit === pu) console.log('PLAYER DIED at', game.time.toFixed(1)); });
}
U.profile = true;
if (startWave) U.debugSkipToWave(startWave);
if (!waves) {
  U.director.update = () => {}; // freeze the director for a clean, fixed-size benchmark
  if (spawnN) U.debugSpawn(spawnN, 'tan'); if (greenN) U.debugSpawn(greenN, 'green');
}
const dt = 1 / 60;
const times = [];
let thinkT = 0, steerT = 0, syncT = 0; const sec = { preMs: 0, dirMs: 0, sqMs: 0 };
for (let f = 0; f < frames && game.state === 'playing'; f++) {
  game.time += dt; game.dt = dt;
  game.world.update?.(dt);
  const t0 = performance.now();
  U.update(dt);
  times.push(performance.now() - t0);
  for (const k in sec) sec[k] += U.perf[k] || 0;
  thinkT += U.perf.thinkMs || 0; steerT += U.perf.steerMs || 0; syncT += U.perf.syncMs || 0;
  game.combat.update?.(dt); game.bodies.update?.(dt);
  if (f % 300 === 0) {
    const modes = {};
    for (const u of U.list) if (u.ai) modes[u.ai.mode] = (modes[u.ai.mode] || 0) + 1;
    console.log(`t=${game.time.toFixed(1)} wave=${U.wave} ${U.phase} green=${U.countAlive('green')} tan=${U.countAlive('tan')} squads=${U.squads.length} obj=${U.objective.progress.toFixed(2)} kills=${JSON.stringify(U.stats.kills)} modes=${JSON.stringify(modes)}`);
  }
}
times.sort((a, b) => a - b);
const pct = (p) => times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(3);
console.log(`units.update ms: median ${pct(0.5)} p90 ${pct(0.9)} p99 ${pct(0.99)} max ${pct(1)}  | avg think ${(thinkT / times.length).toFixed(3)} steer ${(steerT / times.length).toFixed(3)} sync ${(syncT / times.length).toFixed(3)}`);
console.log('sections avg ms', Object.entries(sec).map(([k, v]) => k + ' ' + (v / times.length).toFixed(3)).join(' '));
console.log('events', JSON.stringify(counts));
console.log('stats', JSON.stringify(U.stats));
fs.rmSync(tmp, { recursive: true, force: true });
