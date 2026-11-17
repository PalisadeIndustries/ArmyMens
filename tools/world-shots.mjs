// World team: screenshots from fixed camera positions + collision/raycast checks & timing.
// Usage: node tools/world-shots.mjs [--port 5181] [--out dir] [--only name,name] [--play]
import { createServer } from 'vite';
import { createRequire } from 'module';
import fs from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('port', 5181)), outDir = arg('out', '/tmp/world-shots'), only = arg('only', null)?.split(',');
fs.mkdirSync(outDir, { recursive: true });

const VIEWS = {
  menu: null, // whatever idleUpdate shows
  overview: { pos: [0, 120, 150], look: [0, 0, -10] },
  tanSpawn: { pos: [0, 1.6, 100], look: [0, 1.6, 60] },
  blanket: { pos: [-4, 1.6, 66], look: [4, 1, 30] },
  books: { pos: [-14, 2.5, 46], look: [-34, 3, 40] },
  sneaker: { pos: [50, 2, 30], look: [36, 2, 42] },
  hose: { pos: [10, 1.4, 22], look: [-10, 0.5, 5] },
  midfield: { pos: [0, 1.6, -20], look: [0, 1.5, 30] },
  fortFront: { pos: [6, 2, -40], look: [0, 2, -80] },
  fortInside: { pos: [0, 1.6, -95], look: [0, 3, -60] },
  house: { pos: [20, 6, -40], look: [0, 40, -112] },
  wateringCan: { pos: [-20, 2, -12], look: [-36, 2, -28] },
  rightLane: { pos: [60, 1.6, 90], look: [58, 1.5, 30] },
};

const server = await createServer({ server: { port, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.setDefaultTimeout(180000);
await page.goto(url + (arg('quality', 'high') ? '?quality=' + arg('quality', 'high') : ''));
try { await page.waitForFunction(() => window.__game?.world, null, { timeout: 30000 }); } catch (e) { console.log('boot failed', errors); await browser.close(); await server.close(); process.exit(1); }
await page.waitForTimeout(1500);

// hide UI overlay so we see the world
await page.addStyleTag({ content: '#ui{display:none!important}' });

await page.evaluate(() => window.__game.renderer.setAnimationLoop(null)); // drive frames manually (swiftshader is slow)
for (const [name, v] of Object.entries(VIEWS)) {
  if (only && !only.includes(name)) continue;
  const t0 = Date.now();
  await page.waitForFunction(() => window.__game?.world, null, { timeout: 120000 });
  const data = await page.evaluate(({ v }) => {
    const g = window.__game; g.renderer.setAnimationLoop(null);
    if (v) { g.state = 'paused'; g.camera.position.set(...v.pos); g.camera.lookAt(...v.look); g.camera.updateMatrixWorld(); }
    g.world.idleUpdate(0.016);
    g.renderer.render(g.scene, g.camera);
    return g.renderer.domElement.toDataURL('image/jpeg', 0.85);
  }, { v });
  fs.writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('shot', name, Date.now() - t0, 'ms');
}

// collision / raycast sanity + perf
await page.waitForFunction(() => window.__game?.world, null, { timeout: 120000 });
const report = await page.evaluate(() => {
  const g = window.__game, w = g.world, THREE = g.camera.position.constructor;
  const V = (x, y, z) => new THREE(x, y, z);
  const res = {};
  res.colliders = w.colliders.length; res.cover = w.coverPoints?.length; res.lanes = w.lanes?.map((l) => l.length);
  // lane clearance check: walk each lane with radius 0.6
  res.laneBlocks = [];
  w.lanes.forEach((l, li) => {
    for (let i = 0; i < l.length - 1; i++) for (let t = 0; t <= 1; t += 0.02) {
      const x = l[i].x + (l[i + 1].x - l[i].x) * t, z = l[i].z + (l[i + 1].z - l[i].z) * t;
      if (w.isBlocked(x, w.getHeight(x, z), z, 0.6)) { res.laneBlocks.push([li, i, +x.toFixed(1), +z.toFixed(1)]); break; }
    }
  });
  res.spawnBlocked = [...w.spawnPoints.green, ...w.spawnPoints.tan].filter((p) => w.isBlocked(p.x, p.y, p.z, 1.5)).map((p) => [p.x, p.z]);
  // raycast checks
  const down = w.raycast(V(5, 20, 5), V(0, -1, 0), 50); res.down = down && { y: +down.point.y.toFixed(3), h: +w.getHeight(5, 5).toFixed(3), n: down.normal.toArray().map((v) => +v.toFixed(2)) };
  const wall = w.raycast(V(-10, 1, -30), V(0, 0, -1), 300); res.wallHit = wall && { z: +wall.point.z.toFixed(2), surface: wall.surface };
  const can = w.raycast(V(12, 1.5, -10), V(0, 0, -1), 100); res.canHit = can && { z: +can.point.z.toFixed(2), n: can.normal.toArray() };
  // perf: random bullets
  const N = 20000, dirs = [];
  for (let i = 0; i < N; i++) { const a = Math.random() * 6.28, p = (Math.random() - 0.6) * 0.3; dirs.push([V((Math.random() - 0.5) * 160, 1.2 + Math.random(), (Math.random() - 0.5) * 190), V(Math.sin(a) * Math.cos(p), Math.sin(p), Math.cos(a) * Math.cos(p))]); }
  let t0 = performance.now(), hits = 0;
  for (const [o, d] of dirs) if (w.raycast(o, d, 150)) hits++;
  res.raycastUsPer = +((performance.now() - t0) * 1000 / N).toFixed(2); res.hitFrac = hits / N;
  t0 = performance.now();
  for (let i = 0; i < N; i++) { const [o] = dirs[i]; w.hasLineOfSight(o, dirs[(i + 1) % N][0]); }
  res.losUsPer = +((performance.now() - t0) * 1000 / N).toFixed(2);
  t0 = performance.now(); const p = V(0, 0, 0);
  for (let i = 0; i < N; i++) { const [o] = dirs[i]; p.set(o.x, w.getHeight(o.x, o.z), o.z); w.resolveCircle(p, 0.4, 1.8); w.getFloor(p.x, p.y, p.z); }
  res.resolveUsPer = +((performance.now() - t0) * 1000 / N).toFixed(2);
  res.calls = g.renderer.info.render.calls; res.tris = g.renderer.info.render.triangles;
  return res;
});
console.log(JSON.stringify({ report, errors }, null, 1));
await browser.close(); await server.close();
process.exit(errors.length ? 1 : 0);
