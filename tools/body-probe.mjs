// Debug probe: kill one unit with a given damage type and step frames, logging state. node tools/body-probe.mjs <type>
import { createServer } from 'vite';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const type = process.argv[2] || 'bullet';
const server = await createServer({ server: { port: 5184, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('pageerror', e.message, (e.stack || '').split('\n').slice(1, 4).join('|')));
page.on('console', (m) => console.log('console', m.text().slice(0, 300)));
page.on('crash', () => console.log('CRASH'));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.evaluate((type) => {
  const g = window.__game; g.start({ classId: 'rifleman' }); g.renderer.setAnimationLoop(null);
  g.player.update = () => {}; g.units.update = () => {};
  const c = g.world.spawnPoints.green[0].clone();
  const u = g.units.spawn({ team: 'tan', classId: 'flamer', position: c });
  u.syncModel(0.016);
  window.__u = u;
  const V = c.constructor;
  console.log('dmg', JSON.stringify(Object.keys(u.takeDamage({ amount: 999, type, zone: 'torso', dir: new V(1, 0, 0), point: c.clone(), force: 8 }))));
}, type);
for (let i = 0; i < 40; i++) {
  const r = await page.evaluate(() => { const g = window.__game; for (let k = 0; k < 10; k++) { g.time += 1 / 60; g.bodies.update(1 / 60); } return JSON.stringify({ heap: (performance.memory.usedJSHeapSize / 1e6) | 0, ...g.bodies.stats(), vertsPerSoldier: 0 }); });
  console.log(i, r.slice(0, 300));
}
await browser.close(); await server.close();
