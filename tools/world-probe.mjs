// World team: quick perf probe (frame time, draw calls) in headless chromium. Usage: node tools/world-probe.mjs [--port 5181] [--expr "js"]
import { createServer } from 'vite';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const server = await createServer({ server: { port: Number(arg('port', 5181)), strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console: ' + m.text()); });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game?.world, null, { timeout: 60000 });
const r = await page.evaluate(async (expr) => {
  const g = window.__game;
  if (expr) eval(expr);
  const t = []; let last = performance.now();
  await new Promise((res) => { let n = 0; const f = () => { const now = performance.now(); t.push(now - last); last = now; if (++n < 8) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  const ti = performance.now(); g.renderer.render(g.scene, g.camera); const renderMs = performance.now() - ti;
  return { frames: t.map((x) => x | 0), renderMs: renderMs | 0, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
}, arg('expr', ''));
console.log(JSON.stringify(r));
await browser.close(); await server.close();
