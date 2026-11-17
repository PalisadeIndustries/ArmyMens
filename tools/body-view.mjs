// Visual check of soldier models/poses/corpses. Usage: node tools/body-view.mjs --port 5184 --out dir [--scene poses|deaths]
import { createServer } from 'vite';
import { createRequire } from 'module';
import { canvasShot } from './body-shot.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('port', 5184)), out = arg('out', '.'), which = arg('scene', 'poses');
const server = await createServer({ server: { port, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game, null, { timeout: 30000 }).catch((e) => { console.log(errors); throw e; });
await page.evaluate(() => { const g = window.__game; g.start({ classId: 'rifleman' }); g.units.update = () => {}; g.player.update = () => {}; if (g.uiRoot) g.uiRoot.style.display = 'none'; });
await page.evaluate((s) => { globalThis.__st = s; }, arg('states', 'idle,aim'));
const setup = await page.evaluate((which) => {
  const g = window.__game, T = g.scene.constructor; // THREE not global; use object constructors
  const sp = g.world.spawnPoints.green[0].clone();
  const cls = ['rifleman', 'bazooka', 'flamer', 'sniper', 'grenadier'];
  const states = ['idle', 'run', 'aim', 'crouch', 'prone', 'throw', 'panic'];
  const models = [];
  if (which === 'poses') {
    const st0 = (globalThis.__st || '').split(',');
    for (let r = 0; r < 2; r++) for (let i = 0; i < cls.length; i++) {
      const m = g.bodies.createSoldierModel(r ? 'tan' : 'green', cls[i]);
      m.root.position.set(sp.x + 14 + (i - 2) * 1.5, 0, sp.z + 4 + r * 2.5);
      m.root.position.y = g.world.getHeight(m.root.position.x, m.root.position.z);
      m.root.rotation.y = 0.9;
      g.scene.add(m.root);
      const st = r ? (st0[1] || 'aim') : (st0[0] || 'idle');
      for (let k = 0; k < 60; k++) g.bodies.poseModel(m, { state: st, phase: k * 0.07 + 1, aimPitch: 0.1 }, 0.016, { onFire: st === 'panic' ? 1 : 0, alive: true });
      models.push(m);
    }
    g.camera.position.set(sp.x + 14.5, sp.y + 2.0, sp.z + 11);
    g.camera.lookAt(sp.x + 14, sp.y + 0.8, sp.z + 5);
  }
  return { sp: [sp.x, sp.y, sp.z] };
}, which);
await page.waitForTimeout(800);
const tag = arg('states', 'idle,aim').replace(',', '-');
await canvasShot(page, `${out}/${tag}.png`);
// close up
await page.evaluate(() => { const g = window.__game; const sp = g.world.spawnPoints.green[0]; g.camera.position.set(sp.x + 13.2, sp.y + 1.6, sp.z + 8.6); g.camera.lookAt(sp.x + 12.5, sp.y + 0.9, sp.z + 4); });
await page.waitForTimeout(400);
await canvasShot(page, `${out}/${tag}-close.png`);
console.log(JSON.stringify({ setup, errors }, null, 1));
await browser.close(); await server.close();
