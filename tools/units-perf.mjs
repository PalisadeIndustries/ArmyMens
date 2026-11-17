// Units team perf/behaviour probe. Boots the game headless, optionally spawns a huge wave instantly, then reports
// units.update() cost, per-system frame cost, AI counters and a state histogram.
// Usage: node tools/units-perf.mjs [--port 5182] [--spawn 150] [--green 50] [--seconds 10] [--shot out.png] [--wave N]
import { createServer } from 'vite';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('port', 5182)), seconds = Number(arg('seconds', 10)), spawnN = Number(arg('spawn', 150));
const lowgfx = process.argv.includes('--lowgfx');
const greenN = Number(arg('green', 50)), shot = arg('shot', null), wave = Number(arg('wave', 0));

// --stub world,body : serve the committed (git HEAD) skeleton of those modules, to isolate units perf from
// other teams' in-progress code.
import { execSync } from 'child_process';
import path from 'path';
const stubs = (arg('stub', '') || '').split(',').filter(Boolean);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const stubSrc = Object.fromEntries(stubs.map((m) => [path.join(root, 'src', m, 'index.js'), execSync(`git show HEAD:src/${m}/index.js`, { cwd: root }).toString()]));
const stubPlugin = { name: 'units-stub', enforce: 'pre', load(id) { const clean = id.split('?')[0]; return stubSrc[clean]; } };
const server = await createServer({ root, plugins: [stubPlugin], server: { port, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
await page.evaluate(({ spawnN, greenN, wave, lowgfx }) => {
  const g = window.__game;
  g.start({ classId: 'rifleman' });
  g.units.profile = true;
  if (lowgfx) { g.renderer.shadowMap.enabled = false; g.renderer.setPixelRatio(0.5); }
  if (wave) g.units.debugSkipToWave(wave);
  if (spawnN) g.units.debugSpawn(spawnN, 'tan');
  if (greenN) g.units.debugSpawn(greenN, 'green');
  // wrap every system's update to time it
  window.__sysTimes = {};
  for (const name of ['world', 'units', 'player', 'combat', 'bodies', 'audio', 'ui']) {
    const s = g[name]; if (!s?.update) continue;
    const orig = s.update.bind(s);
    window.__sysTimes[name] = { total: 0, n: 0 };
    s.update = (dt) => { const t0 = performance.now(); orig(dt); const r = window.__sysTimes[name]; r.total += performance.now() - t0; r.n++; };
  }
  window.__frames = 0; window.__f0 = performance.now(); const fr = () => { window.__frames++; requestAnimationFrame(fr); }; requestAnimationFrame(fr);
  const r = g.renderer; const orender = r.render.bind(r);
  window.__sysTimes.render = { total: 0, n: 0 };
  r.render = (s, c) => { const t0 = performance.now(); orender(s, c); const x = window.__sysTimes.render; x.total += performance.now() - t0; x.n++; };
  // the debug spawns already happened; keep the wave director from adding more for a clean measurement
}, { spawnN, greenN, wave, lowgfx });
const samples = [];
for (let t = 0; t < seconds; t += 2) {
  await page.waitForTimeout(2000);
  samples.push(await page.evaluate(() => {
    const g = window.__game, U = g.units;
    const modes = {}, anims = {};
    for (const u of U.list) { if (!u.ai) continue; modes[u.ai.mode] = (modes[u.ai.mode] || 0) + 1; anims[u.anim.state] = (anims[u.anim.state] || 0) + 1; }
    const sys = {};
    for (const k in window.__sysTimes) { const s = window.__sysTimes[k]; sys[k] = s.n ? +(s.total / s.n).toFixed(2) : 0; s.total = 0; s.n = 0; }
    const fps = +(window.__frames / ((performance.now() - window.__f0) / 1000)).toFixed(1); window.__frames = 0; window.__f0 = performance.now();
    return {
      fps, t: +g.time.toFixed(1), state: g.state, wave: U.wave, phase: U.phase, green: U.countAlive('green'), tan: U.countAlive('tan'),
      squads: U.squads.length, corpses: g.bodies.corpses?.length ?? null, unitsMs: +U.perf.updateMs.toFixed(2), unitsMax: +U.perf.maxMs.toFixed(2),
      thinks: U.perf.thinks, tMs: +(U.perf.thinkMs||0).toFixed(2), sMs: +(U.perf.steerMs||0).toFixed(2), syMs: +(U.perf.syncMs||0).toFixed(2), sysMs: sys, modes, anims, obj: +U.objective.progress.toFixed(2), kills: { ...U.stats.kills },
    };
  }));
  console.log(JSON.stringify(samples[samples.length - 1]));
}
if (shot) await page.screenshot({ path: shot });
console.log(JSON.stringify({ errors: errors.slice(0, 20), errorCount: errors.length }, null, 2));
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
