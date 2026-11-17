import { createServer } from 'vite';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const server = await createServer({ root: '/home/user/ArmyMens', server: { port: 5184, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message, (e.stack||'').split('\n').slice(1,4).join('|')));
page.on('crash', () => console.log('CRASH'));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
console.log('loaded');
await page.evaluate(() => window.__game.start({ classId: 'rifleman' }));
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2500);
  try { console.log(JSON.stringify(await page.evaluate(() => { const g = window.__game; return { t: g.time.toFixed(1), u: g.units.list.length, heapMB: (performance.memory?.usedJSHeapSize/1e6)|0, calls: g.renderer.info.render.calls, b: g.bodies.stats?.() }; }))); } catch (e) { console.log('ERR', e.message); break; }
}
await browser.close(); await server.close();
