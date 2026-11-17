// Debug probe: mass deaths + render timing, with optional hiding of subsystems. node tools/body-probe2.mjs [hide=points|groups|skinned]
import { createServer } from 'vite';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const hide = process.argv[2] || '';
const server = await createServer({ server: { port: 5184, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('crash', () => console.log('CRASH'));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
await page.evaluate(() => { const g = window.__game; g.start({ classId: 'rifleman' }); g.renderer.setAnimationLoop(null); g.player.update = () => {}; g.units.update = () => {};
  const c = g.world.spawnPoints.green[0]; g.camera.position.set(c.x, c.y + 14, c.z + 34); g.camera.lookAt(c.x, c.y, c.z);
  g.bodies.debugSpawnCorpses(60, 'mixed', c, 30); });
for (let i = 0; i < 12; i++) {
  const r = await page.evaluate((hide) => { const g = window.__game; for (let k = 0; k < 15; k++) { g.time += 1 / 60; g.bodies.update(1 / 60); }
    let n = { skinned: 0, groups: 0, points: 0, meshes: 0 };
    g.scene.traverse((o) => { if (o.isSkinnedMesh) { n.skinned++; if (hide.includes('skinned')) o.visible = false; } else if (o.isPoints) { n.points++; if (hide.includes('points')) o.visible = false; } else if (o.isMesh) n.meshes++; if (o.isGroup && o.children.length && o.children[0].isMesh && !o.children[0].isSkinnedMesh && o.children[0].matrixAutoUpdate === false) { n.groups++; if (hide.includes('groups')) o.visible = false; } });
    const t0 = performance.now(); g.renderer.render(g.scene, g.camera); const gl = g.renderer.getContext(); gl.finish(); return JSON.stringify({ rms: (performance.now() - t0) | 0, calls: g.renderer.info.render.calls, progs: g.renderer.info.programs.length, tex: g.renderer.info.memory.textures, geos: g.renderer.info.memory.geometries, n, s: g.bodies.stats().batch }); }, hide);
  console.log(i, r);
}
await browser.close(); await server.close();
