// Cinematic overhead screenshots of a simulated wave-7 battle. Usage: node tools/aerial-shot.mjs <outdir>
import { createServer } from 'vite';
import { createRequire } from 'module';
import { canvasShot } from './body-shot.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const server = await createServer({ root: '/home/user/ArmyMens', server: { port: 5195, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(server.resolvedUrls.local[0] + '?autoplay&quality=high');
await p.waitForFunction(() => window.__game?.systems);
await p.evaluate(() => { const g = window.__game; g.renderer.setAnimationLoop(null); g.start({ classId: 'bazooka' }); g.player.autoplay = true; g.units.debugSkipToWave(7);
  for (let i = 0; i < 30 * 45; i++) { g.time += 1/30; for (const s of g.systems) s?.update?.(1/30); g.ui.update(1/30); g.input.endFrame(); } });
for (const [i, pos, look] of [[0, [-30, 22, -20], [0, 0, -55]], [1, [10, 4, -60], [0, 1, -30]]]) {
  await p.evaluate(({ pos, look }) => { const g = window.__game; g.player.viewmodel && (g.player.viewmodel.visible = false); g.camera.position.set(...pos); g.camera.lookAt(...look); g.ui && document.getElementById('ui') && (document.getElementById('ui').style.display = 'none'); }, { pos, look });
  await canvasShot(p, `${process.argv[2]}/aerial-${i}.png`);
}
await b.close(); await server.close();
