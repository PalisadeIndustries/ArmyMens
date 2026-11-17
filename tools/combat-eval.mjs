// Dev helper: boot the game headless, start a class, run a JS snippet file (async body, `g` = window.__game), print result.
// Usage: node tools/combat-eval.mjs <snippet.js> [--port 5183] [--class rifleman] [--shot out.png]
import { createServer } from 'vite';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const code = readFileSync(process.argv[2], 'utf8');
const server = await createServer({ server: { port: Number(arg('port', 5183)), strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1,8).join(' / ')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); else if (m.type() === 'log') console.log('[page]', m.text()); });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game, null, { timeout: 30000 }).catch((e) => { console.log(errors); throw e; });
await page.evaluate((c) => window.__game.start({ classId: c }), arg('class', 'rifleman'));
const out = await page.evaluate(`(async () => { const g = window.__game; const sleep = (ms) => new Promise(r => setTimeout(r, ms)); ${code} })()`);
const shot = arg('shot', null); if (shot) await page.screenshot({ path: shot });
console.log(JSON.stringify(out, null, 1)); if (errors.length) console.log(errors.slice(0, 10));
await browser.close(); await server.close();
