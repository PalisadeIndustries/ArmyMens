// World team: render-cost probe in headless chromium. Times full renders with world parts toggled.
// Usage: node tools/world-probe.mjs [--port 5181] [--quality low|high]
import { createServer } from 'vite';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const server = await createServer({ server: { port: Number(arg('port', 5181)), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
const q = arg('quality', '');
await page.goto(server.resolvedUrls.local[0] + (q ? '?quality=' + q : ''));
await page.waitForFunction(() => window.__game?.world, null, { timeout: 120000 });
const r = await page.evaluate(() => {
  const g = window.__game; g.renderer.setAnimationLoop(null);
  const gl = g.renderer.getContext(), px = new Uint8Array(4);
  const time = () => { const t = performance.now(); g.renderer.render(g.scene, g.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return Math.round(performance.now() - t); };
  g.camera.position.set(0, 1.6, -60); g.camera.lookAt(0, 1.5, 0); g.world.update(0.016);
  time(); time();
  const out = { quality: g.world.quality, full: time(), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
  const set = (name, v) => g.scene.traverse((o) => { if (o.name === name) o.visible = v; });
  set('grass', false); out.noGrass = time(); set('grass', true);
  g.world.sun.castShadow = false; out.noShadow = time(); g.world.sun.castShadow = true;
  set('sky', false); out.noSky = time(); set('sky', true);
  set('props', false); out.noProps = time(); set('props', true);
  return out;
});
console.log(JSON.stringify(r));
if (process.argv.includes('--play')) {
  const r2 = await page.evaluate(async () => {
    const g = window.__game; g.renderer.setAnimationLoop(() => g.frame()); g.start({ classId: 'rifleman' });
    const fps = () => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 6000) requestAnimationFrame(f); else res(+(n / ((performance.now() - t0) / 1000)).toFixed(2)); }; requestAnimationFrame(f); });
    await new Promise((r) => setTimeout(r, 3000));
    const a = await fps();
    const w = g.scene.getObjectByName('world'), sky = g.scene.getObjectByName('sky');
    w.visible = false; sky.visible = false; g.world.sun.castShadow = false;
    const b = await fps();
    return { fpsWithWorld: a, fpsWithoutWorld: b, units: g.units?.list?.length, calls: g.renderer.info.render.calls };
  });
  console.log(JSON.stringify(r2));
}
await browser.close(); await server.close();
