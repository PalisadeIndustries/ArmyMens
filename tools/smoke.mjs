// Headless smoke test: boots the game in Chromium, picks a class, lets the battle run, reports errors + stats.
// Usage: node tools/smoke.mjs [--port 5180] [--seconds 20] [--class rifleman] [--shot out.png]
// Pointer lock is unavailable headless, so the player stands still; AI armies still fight.
import { createServer } from 'vite';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright'); // globally pre-installed

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('port', 5180)), seconds = Number(arg('seconds', 20)), cls = arg('class', 'rifleman'), shot = arg('shot', null);

const server = await createServer({ server: { port, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
await page.evaluate((c) => window.__game.start({ classId: c }), cls);
const samples = [];
for (let t = 0; t < seconds; t += 5) {
  await page.waitForTimeout(Math.min(5, seconds - t) * 1000);
  samples.push(await page.evaluate(() => {
    const g = window.__game;
    return {
      t: +g.time.toFixed(1), state: g.state, wave: g.units.wave,
      green: g.units.countAlive('green'), tan: g.units.countAlive('tan'),
      corpses: g.bodies.corpses?.length ?? null,
      calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles,
    };
  }));
}
// rough fps estimate over 2s (swiftshader is slow; relative numbers only)
const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
if (shot) await page.screenshot({ path: shot });
console.log(JSON.stringify({ url, samples, fps, errors: errors.slice(0, 20), errorCount: errors.length }, null, 2));
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
