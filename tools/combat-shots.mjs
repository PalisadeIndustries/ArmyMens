// Renders the first-person viewmodel of every weapon (hip + ADS) to PNGs for visual review.
// Usage: node tools/combat-shots.mjs --out <dir> [--port 5183]
import { createServer } from 'vite';
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = arg('out', '.'); mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: Number(arg('port', 5183)), strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
const shots = [['rifleman', 0], ['rifleman', 1], ['grenadier', 0], ['sniper', 0], ['sniper', 1], ['bazooka', 0], ['flamer', 0]];
for (const [cls, slot] of shots) {
  for (const ads of [0, 1]) {
    const data = await page.evaluate(([cls, slot, ads]) => {
      const g = window.__game; g.renderer.setAnimationLoop(null);
      if (g.player.classId !== cls || !g.player.unit) g.start({ classId: cls });
      const pl = g.player; pl.debugSelect(slot);
      const step = (n) => { for (let i = 0; i < n; i++) { g.time += 1 / 60; for (const s of g.systems) s?.update?.(1 / 60); g.input.endFrame(); } };
      step(30);
      if (ads) { pl.adsT = 1; g.input.mouse.buttons |= 4; Object.defineProperty(g.input, 'locked', { value: true, configurable: true, writable: true }); step(30); }
      g.renderer.render(g.scene, g.camera);
      const url = g.renderer.domElement.toDataURL('image/png');
      if (ads) { g.input.mouse.buttons &= ~4; delete g.input.locked; g.input.locked = false; step(30); }
      return url;
    }, [cls, slot, ads]);
    const f = `${out}/vm-${cls}-${slot}${ads ? '-ads' : ''}.png`;
    writeFileSync(f, Buffer.from(data.split(',')[1], 'base64')); console.log(f);
  }
}
await browser.close(); await server.close();
