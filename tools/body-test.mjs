// Body system stress/correctness test.
// Spawns many soldiers, checks hit zones, kills them with each damage type, piles up 1000+ corpses,
// kicks them with an explosion, and reports corpse count, draw calls and frame time.
// Usage: node tools/body-test.mjs [--port 5184] [--units 150] [--corpses 1000] [--shot out.png]
import { createServer } from 'vite';
import { createRequire } from 'module';
import { canvasShot } from './body-shot.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('port', 5184)), nUnits = Number(arg('units', 150)), nCorpses = Number(arg('corpses', 1000)), shot = arg('shot', null);

const server = await createServer({ server: { port, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.setDefaultTimeout(180000);
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });

const log = (k, v) => console.log(k.padEnd(28), typeof v === 'string' ? v : JSON.stringify(v));

// boot: freeze AI + waves, keep posing (so pose cost is measured), instrument bodies.update / poseModel
await page.evaluate(() => {
  const g = window.__game;
  g.start({ classId: 'rifleman' });
  g.renderer.setAnimationLoop(null); // drive the sim manually (headless GPU is far too slow for real-time)
  window.__step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) { g.time += dt; g.dt = dt; for (const sy of g.systems) sy?.update?.(dt); } };
  if (g.uiRoot) g.uiRoot.style.display = 'none';
  g.player.update = () => {};
  g.units.update = (dt) => { for (const u of g.units.list) if (u.alive && !u.isPlayer) { u.anim.phase += dt * 10; u.syncModel(dt); } for (let i = g.units.list.length - 1; i >= 0; i--) if (!g.units.list[i].alive && !g.units.list[i].isPlayer) g.units.list.splice(i, 1); };
  const b = g.bodies; const T = { upd: 0, pose: 0, frames: 0 };
  const upd = b.update.bind(b); b.update = (dt) => { const t0 = performance.now(); upd(dt); T.upd += performance.now() - t0; T.frames++; };
  const pose = b.poseModel; b.poseModel = (...a) => { const t0 = performance.now(); pose(...a); T.pose += performance.now() - t0; };
  window.__bt = T;
  window.__ev = { killed: new Map(), limb: 0, damaged: 0, ignited: 0 };
  g.events.on('unit:killed', ({ unit }) => window.__ev.killed.set(unit.id, (window.__ev.killed.get(unit.id) || 0) + 1));
  g.events.on('unit:limbLost', () => window.__ev.limb++);
  g.events.on('unit:damaged', () => window.__ev.damaged++);
  g.events.on('unit:ignited', () => window.__ev.ignited++);
  // camera overlooking the test field
  g.__testCenter = g.world.objective?.position?.clone?.() || g.world.spawnPoints.green[0].clone();
});

// simulate `frames` frames (CPU only), then render once for draw-call/triangle stats
async function measure(label, frames = 60) {
  const r = await page.evaluate((frames) => {
    const g = window.__game, T = window.__bt; T.upd = 0; T.pose = 0; T.frames = 0;
    const t0 = performance.now(); window.__step(frames); const simMs = (performance.now() - t0) / frames;
    const t1 = performance.now(); g.renderer.render(g.scene, g.camera); const renderMs = performance.now() - t1;
    return {
      simMsPerFrame: +simMs.toFixed(2), renderMs: +renderMs.toFixed(1),
      bodiesUpdateMs: +(T.upd / Math.max(1, T.frames)).toFixed(3), poseMsPerFrame: +(T.pose / Math.max(1, T.frames)).toFixed(3),
      calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles,
      alive: g.units.list.filter((u) => u.alive && !u.isPlayer).length, ...g.bodies.stats(),
    };
  }, frames);
  log(label, r);
  return r;
}
const step = (n) => page.evaluate((n) => window.__step(n), n);
const camTo = (x, y, z, lx, ly, lz) => page.evaluate(([x, y, z, lx, ly, lz]) => { const g = window.__game, c = g.__testCenter; g.camera.position.set(c.x + x, c.y + y, c.z + z); g.camera.lookAt(c.x + lx, c.y + ly, c.z + lz); }, [x, y, z, lx, ly, lz]);

// 1) hit-zone sanity
const hits = await page.evaluate(() => {
  const g = window.__game, c = g.__testCenter;
  const u = g.units.spawn({ team: 'tan', classId: 'rifleman', position: c.clone().add({ x: 60, y: 0, z: 60 }) });
  u.position.y = g.world.getHeight(u.position.x, u.position.z); u.yaw = 0;
  const V = u.position.constructor;
  const res = {};
  const shoot = (h, side = 0, label) => {
    const o = new V(u.position.x + side, u.position.y + h, u.position.z + 10), d = new V(0, 0, -1);
    const r = g.bodies.hitTest(u, o, d, 50); res[label] = r ? r.zone : null;
  };
  for (const [st, cs] of [['aim', 1], ['crouch', 0.65], ['prone', 0.3]]) {
    u.anim.state = st; u.crouchScale = cs;
    for (let i = 0; i < 40; i++) u.syncModel(0.05, true);
    shoot(1.72 * (st === 'aim' ? 1 : st === 'crouch' ? 0.66 : 0.18), 0, st + ':head?');
    shoot(1.2 * (st === 'aim' ? 1 : 0.7), 0, st + ':torso?');
    shoot(0.3, -0.12, st + ':low');
    shoot(3, 0, st + ':above');
  }
  u.alive = false; g.scene.remove(u.model.root);
  return res;
});
log('hitTest zones', hits);

// 2) spawn an army
await page.evaluate((n) => {
  const g = window.__game, c = g.__testCenter;
  const ids = ['rifleman', 'bazooka', 'flamer', 'sniper', 'grenadier'], st = ['idle', 'run', 'aim', 'crouch', 'prone', 'throw'];
  for (let i = 0; i < n; i++) {
    const team = i % 2 ? 'tan' : 'green';
    const p = c.clone(); p.x += ((i % 15) - 7) * 2.2; p.z += (Math.floor(i / 15) - 5) * 2.2;
    p.y = g.world.getHeight(p.x, p.z);
    const u = g.units.spawn({ team, classId: ids[i % 5], position: p });
    u.yaw = Math.random() * 6.28; u.anim.state = st[i % st.length];
  }
}, nUnits);
await camTo(0, 14, 34, 0, 0, 0);
await step(30);
const live = await measure(`${nUnits} live soldiers`);

// 3) kill them with each damage type (bullets, explosions, fire) + dismember a few survivors first
await page.evaluate(() => {
  const g = window.__game, list = g.units.list.filter((u) => u.alive && !u.isPlayer);
  const V = list[0].position.constructor;
  list.slice(0, 10).forEach((u, i) => u.takeDamage({ amount: 60, type: 'bullet', zone: ['larm', 'rarm', 'lleg', 'rleg'][i % 4], dir: new V(1, 0, 0), point: u.position.clone(), force: 3 }));
  list.slice(10, 20).forEach((u) => { g.combat?.ignite ? g.combat.ignite(u, 3, null) : (u.onFire = 3); u.takeDamage({ amount: 5, type: 'fire', point: u.position.clone() }); });
});
await step(70);
await page.evaluate(() => {
  const g = window.__game, list = g.units.list.filter((u) => u.alive && !u.isPlayer);
  const V = list[0].position.constructor;
  list.forEach((u, i) => {
    const k = i % 3, dir = new V(Math.random() - 0.5, 0.2, Math.random() - 0.5).normalize();
    const pt = u.position.clone().addScaledVector(dir, -1.5);
    if (k === 0) u.takeDamage({ amount: 500, type: 'bullet', zone: i % 6 ? 'torso' : 'head', dir, point: u.position.clone(), force: 4 });
    else if (k === 1) u.takeDamage({ amount: 140, type: 'explosive', dir, point: pt, force: 10 });
    else u.takeDamage({ amount: 500, type: 'fire', dir, point: u.position.clone() });
    // a dead unit must ignore further damage and never re-emit unit:killed
    u.takeDamage({ amount: 500, type: 'bullet', zone: 'torso' });
  });
});
await step(40);
if (shot) await canvasShot(page, shot.replace('.png', '-dying.png'));
await step(400);
const ev = await page.evaluate(() => { const e = window.__ev; let dup = 0; for (const v of e.killed.values()) if (v !== 1) dup++; return { killed: e.killed.size, dupKilled: dup, limbLost: e.limb, damaged: e.damaged, ignited: e.ignited }; });
log('events', ev);
const dead = await measure('after mass death');
if (shot) await canvasShot(page, shot);

// 4) a thousand more corpses
await page.evaluate((n) => { const g = window.__game; g.bodies.debugSpawnCorpses(n, 'mixed', g.__testCenter, 70); }, nCorpses);
await step(500);
await camTo(0, 30, 60, 0, 0, 0);
const many = await measure(`+${nCorpses} corpses`);
if (shot) await canvasShot(page, shot.replace('.png', '-pile.png'));

// 5) kick the pile with explosions
const kickedBefore = many.kicked;
await page.evaluate(() => { const g = window.__game, c = g.__testCenter; for (let i = 0; i < 3; i++) g.events.emit('explosion', { point: c.clone().add({ x: (i - 1) * 8, y: 0.3, z: 0 }), radius: 6 }); });
await camTo(0, 8, 22, 0, 0, 0);
await step(30);
if (shot) await canvasShot(page, shot.replace('.png', '-kick.png'));
await step(600);
const kicked = await measure('after kick & resettle');

const ok = ev.dupKilled === 0 && ev.killed >= nUnits && kicked.corpses >= nUnits + nCorpses && kicked.dynamic === 0 && kicked.kicked > kickedBefore && errors.length === 0;
log('RESULT', ok ? 'PASS' : 'FAIL');
log('errors', errors.slice(0, 10));
await browser.close();
await server.close();
process.exit(ok ? 0 : 1);
