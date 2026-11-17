// World team: checks whether page.screenshot completes while playing, with the world shown vs hidden.
import { createServer } from 'vite';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const hide = process.argv.includes('--hide');
const server = await createServer({ server: { port: 5181, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game?.world, null, { timeout: 120000 });
await page.evaluate((hide) => { const g = window.__game; g.start({ classId: 'rifleman' }); if (hide) { g.scene.getObjectByName('world').visible = false; g.scene.getObjectByName('sky').visible = false; } }, hide);
await page.waitForTimeout(10000);
const t = Date.now();
try { await page.screenshot({ path: '/tmp/claude-0/-home-user-ArmyMens/94110d4a-e32e-5bdf-94c0-de3208084168/scratchpad/check.png', timeout: 120000 }); console.log('ok', Date.now() - t); } catch (e) { console.log('fail', e.message.split('\n')[0]); }
await browser.close(); await server.close();
