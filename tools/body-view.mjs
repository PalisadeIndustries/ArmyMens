// Visual check of soldier models, poses, deaths and corpses (close-up screenshots).
// Usage: node tools/body-view.mjs --port 5184 --out dir [--states idle,aim] [--scene poses|deaths]
import { createServer } from 'vite';
import { createRequire } from 'module';
import { canvasShot } from './body-shot.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('port', 5184)), out = arg('out', '.'), which = arg('scene', 'poses'), states = arg('states', 'idle,aim');
const server = await createServer({ server: { port, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.evaluate(() => {
  const g = window.__game; g.start({ classId: 'rifleman' }); g.renderer.setAnimationLoop(null);
  g.units.update = () => {}; g.player.update = () => {};
  if (g.uiRoot) g.uiRoot.style.display = 'none';
  for (const c of g.camera.children) c.visible = false; // hide the first-person viewmodel
  window.__step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) { g.time += dt; g.bodies.update(dt); g.combat?.update?.(dt); } };
});
const cam = (p, l) => page.evaluate(([p, l]) => { const g = window.__game, c = g.__c; g.camera.position.set(c.x + p[0], c.y + p[1], c.z + p[2]); g.camera.lookAt(c.x + l[0], c.y + l[1], c.z + l[2]); g.camera.updateMatrixWorld();
  g.scene.updateMatrixWorld(); const wp = new c.constructor();
  g.scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.getWorldPosition(wp).distanceTo(g.camera.position) < 2.5 && o.geometry?.boundingSphere?.radius !== undefined && (o.geometry.boundingSphere?.radius ?? 0) < 3) o.visible = false; }); }, [p, l]);
await page.evaluate(([which, states]) => {
  const g = window.__game;
  const c = g.__c = (g.world.objective?.position || g.world.spawnPoints.green[0]).clone();
  const cls = ['rifleman', 'bazooka', 'flamer', 'sniper', 'grenadier'];
  const st = states.split(',');
  if (which === 'poses') {
    for (let r = 0; r < 2; r++) for (let i = 0; i < cls.length; i++) {
      const m = g.bodies.createSoldierModel(r ? 'tan' : 'green', cls[i]);
      const x = c.x + (i - 2) * 1.5, z = c.z + r * 2.5;
      m.root.position.set(x, g.world.getHeight(x, z), z); m.root.rotation.y = 0.6;
      g.scene.add(m.root);
      const s = st[r] || 'aim';
      for (let k = 0; k < 60; k++) g.bodies.poseModel(m, { state: s, phase: k * 0.07 + 1, aimPitch: 0.1 }, 0.016, { onFire: s === 'panic' ? 1 : 0, alive: true });
    }
  } else {
    // deaths: row of soldiers, each killed differently, plus some dismembered
    const types = ['bullet', 'bullet', 'explosive', 'fire', 'fire', 'bullet', 'explosive', 'bullet'];
    const V = c.constructor;
    for (let i = 0; i < types.length; i++) {
      const x = c.x + (i - 3.5) * 1.6, z = c.z;
      const u = g.units.spawn({ team: i % 2 ? 'tan' : 'green', classId: cls[i % 5], position: new V(x, g.world.getHeight(x, z), z) });
      u.yaw = 0.3; u.anim.state = 'aim'; for (let k = 0; k < 20; k++) u.syncModel(0.05);
      if (i === 5) u.takeDamage({ amount: 60, type: 'bullet', zone: 'larm', dir: new V(1, 0, 0), point: u.position.clone(), force: 3 });
      u.takeDamage({ amount: 300, type: types[i], zone: i === 7 ? 'head' : 'torso', dir: new V(0.3, 0, -1).normalize(), point: u.position.clone().add(new V(0, 0.4, 1.2)), force: 9 });
    }
  }
}, [which, states]);
const tag = which === 'poses' ? states.replace(',', '-') : 'deaths';
if (which === 'poses') {
  await cam([0.5, 2.0, 7.5], [0, 0.9, 1.2]);
  await canvasShot(page, `${out}/${tag}.png`);
  await cam([-1.6, 1.4, 4.6], [-2.2, 0.9, 1.2]);
  await canvasShot(page, `${out}/${tag}-close.png`);
} else {
  await cam([0, 4.5, 8], [0, 0.5, 0]);
  await page.evaluate(() => window.__step(18));
  await canvasShot(page, `${out}/${tag}-mid.png`);
  await page.evaluate(() => window.__step(400));
  await canvasShot(page, `${out}/${tag}-end.png`);
  await cam([-0.5, 1.8, 3.2], [2.2, 0.3, 0]);
  await canvasShot(page, `${out}/${tag}-close.png`);
  console.log(JSON.stringify(await page.evaluate(() => window.__game.bodies.stats().batch)));
}
console.log(JSON.stringify({ errors }, null, 1));
await browser.close(); await server.close();
