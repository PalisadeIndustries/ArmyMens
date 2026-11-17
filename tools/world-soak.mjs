// World team: soak test — plays N seconds headless, logs heap/units/corpses/decals every 5s (finds leaks/crashes).
import { createServer } from 'vite';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const server = await createServer({ server: { port: Number(arg('port', 5181)), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: Number(arg('w', 1280)), height: Number(arg('h', 720)) } });
page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
page.on('crash', () => console.log('PAGE CRASHED'));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game?.world, null, { timeout: 120000 });
await page.evaluate(() => window.__game.start({ classId: 'rifleman' }));
for (let t = 0; t < Number(arg('seconds', 60)); t += 5) {
  await page.waitForTimeout(5000);
  try {
    console.log(JSON.stringify(await page.evaluate(() => { const g = window.__game, d = g.world.decals?.pools; return { t: +g.time.toFixed(1), heapMB: Math.round(performance.memory.usedJSHeapSize / 1e6), units: g.units.list.length, corpses: g.bodies?.corpses?.length, geoms: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures, decals: d && Object.fromEntries(Object.entries(d).map(([k, p]) => [k, p.mesh.count])) }; })));
  } catch (e) { console.log('ERR', e.message); break; }
}
if (process.argv.includes('--tris')) console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.__game, out = {};
  g.scene.getObjectByName('world').traverse((o) => { if (!o.geometry) return; const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.count || 1); const k = o.name + ':' + (o.material.vertexColors ? 'vc' : '') + (o.material.map ? 'map' : '') + (o.material.flatShading ? 'flat' : '') + (o.material.metalness > 0.5 ? 'metal' : '') + (o.material.side === 2 ? 'ds' : ''); out[k] = (out[k] || 0) + Math.round(n); });
  return out;
})));
if (process.argv.includes('--split')) console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.__game; g.renderer.setAnimationLoop(null);
  const gl = g.renderer.getContext(), px = new Uint8Array(4);
  const rt = () => { const t = performance.now(); g.renderer.render(g.scene, g.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return Math.round(performance.now() - t); };
  let t = performance.now(); for (let i = 0; i < 5; i++) for (const s of g.systems) s?.update?.(0.016); const sim = Math.round((performance.now() - t) / 5);
  t = performance.now(); for (let i = 0; i < 5; i++) g.world.update(0.016); const worldUpd = Math.round((performance.now() - t) / 5);
  rt(); const full = rt();
  const w = g.scene.getObjectByName('world'); w.visible = false; const noWorld = rt(); w.visible = true;
  g.world.sun.castShadow = false; const noShadow = rt(); g.world.sun.castShadow = true;
  return { simMsPerFrame: sim, worldUpdateMs: worldUpd, renderFull: full, renderNoWorldGroup: noWorld, renderNoShadow: noShadow, tris: g.renderer.info.render.triangles };
})));
await browser.close(); await server.close();
