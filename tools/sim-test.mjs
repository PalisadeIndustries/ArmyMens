// Integrated simulation test: stops the render loop and steps every system manually at 30Hz,
// so whole waves can be played out headless despite software rendering. Renders only for screenshots.
// Usage: node tools/sim-test.mjs [--port 5190] [--seconds 240] [--class bazooka] [--wave N] [--shots dir]
import { createServer } from 'vite';
import { createRequire } from 'module';
import { canvasShot } from './body-shot.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('port', 5190)), seconds = Number(arg('seconds', 240)), cls = arg('class', 'rifleman');
const startWave = Number(arg('wave', 0)), shots = arg('shots', null);

const server = await createServer({ server: { port, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(server.resolvedUrls.local[0] + '?autoplay');
await page.waitForFunction(() => window.__game?.systems, null, { timeout: 30000 });
await page.evaluate(({ cls, startWave }) => {
  const g = window.__game;
  g.renderer.setAnimationLoop(null);
  g.start({ classId: cls });
  if (g.player) g.player.autoplay = true;
  if (startWave) g.units.debugSkipToWave?.(startWave);
  window.__step = (n, dt = 1 / 30) => {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      if (g.state !== 'playing') break;
      const t0 = performance.now();
      g.dt = dt; g.time += dt;
      for (const s of g.systems) s?.update?.(dt);
      g.ui?.update?.(dt);
      g.input.endFrame();
      worst = Math.max(worst, performance.now() - t0);
    }
    return worst;
  };
}, { cls, startWave });

const samples = [];
let shotN = 0;
for (let t = 0; t < seconds; t += 10) {
  const r = await page.evaluate(() => {
    const t0 = performance.now(); const worst = window.__step(300); const ms = (performance.now() - t0) / 300;
    const g = window.__game, u = g.units, s = u.stats || {};
    return { t: +g.time.toFixed(0), state: g.state, wave: u.wave, green: u.countAlive('green'), tan: u.countAlive('tan'),
      corpses: g.bodies.corpses?.length, limbs: g.bodies.limbCount, simMs: +ms.toFixed(1), worstMs: +worst.toFixed(0),
      kills: s.kills, playerKills: g.player?.kills, lives: g.player?.lives, obj: +(u.objective?.progress ?? 0).toFixed(2) };
  });
  samples.push(r); console.log(JSON.stringify(r));
  if (shots && (t % 60 === 0)) {
    await page.evaluate(() => window.__game.renderer.render(window.__game.scene, window.__game.camera));
    await canvasShot(page, `${shots}/sim-${shotN++}.png`);
  }
  if (r.state !== 'playing') break;
}
const stragglers = await page.evaluate(() => window.__game.units.list.filter((u) => u.alive && u.team === 'tan').slice(0, 8).map((u) => ({
  pos: u.position.toArray().map((v) => +v.toFixed(1)), cls: u.classId, hp: Math.round(u.hp), limbs: Object.entries(u.limbs).filter(([, v]) => !v).map(([k]) => k),
  mode: u.ai?.mode ?? u.ai?.state, squadOrder: u.squad?.order, onFire: u.onFire, anim: u.anim.state })));
console.log('tan alive:', JSON.stringify(stragglers));
const draw = await page.evaluate(() => { const g = window.__game; g.renderer.render(g.scene, g.camera); return g.renderer.info.render; });
console.log(JSON.stringify({ drawCalls: draw.calls, tris: draw.triangles, errors: errors.slice(0, 15), errorCount: errors.length }, null, 2));
await browser.close(); await server.close();
process.exit(errors.length ? 1 : 0);
