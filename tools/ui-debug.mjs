import { createServer } from 'vite';
import { createRequire } from 'module';
import path from 'path';
const { chromium } = createRequire(import.meta.url)('playwright');
const stub = process.argv[2], mode = process.argv[3];
const plugins = [{ name: 'stub-world', enforce: 'pre', resolveId(src, imp) { if (imp && /\/world\/index\.js$/.test(src)) return path.resolve(stub); } }];
const server = await createServer({ root: '/home/user/ArmyMens', server: { port: 5186 }, logLevel: 'error', plugins });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => console.log('LOG', m.type(), m.text().slice(0, 200)));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
await page.evaluate(() => { const g = window.__game; window.__prof = {};
  const names = ['world','units','player','combat','bodies','audio','ui'];
  for (const n of names) { const s = g[n]; if (!s?.update) continue; const f = s.update.bind(s); s.update = (dt) => { const t = performance.now(); f(dt); window.__prof[n] = (window.__prof[n] || 0) + performance.now() - t; }; }
  g.systems = [g.world, g.units, g.player, g.combat, g.bodies, g.audio];
  const r = g.renderer.render.bind(g.renderer); g.renderer.render = (a, b) => { const t = performance.now(); r(a, b); window.__prof.render = (window.__prof.render || 0) + performance.now() - t; };
});
if (mode === 'click') await page.click('.pf-deploy'); else await page.evaluate(() => window.__game.start({ classId: 'rifleman' }));
const hideSel = process.argv[4];
if (hideSel) await page.evaluate((s) => { const st = document.createElement('style'); st.textContent = s + '{display:none!important}'; document.head.appendChild(st); }, hideSel);
for (let i = 0; i < 4; i++) {
  const t0 = Date.now();
  const r = await page.evaluate(() => ({ t: window.__game.time.toFixed(2), st: window.__game.state, a: window.__game.audio.stats.played, sz: JSON.stringify(window.__prof) }));
  console.log(Date.now() - t0, 'ms', JSON.stringify(r));
  await page.waitForTimeout(1000);
}
await browser.close(); await server.close();
