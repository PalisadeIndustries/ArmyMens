// UI/Audio test: boots the game, screenshots menu, settings, HUD (with synthetic events), wave banner, scope,
// pause and game-over; checks menu hides on direct game.start(). Waits on conditions (machine may be slow).
// Usage: node tools/ui-test.mjs [--port 5185] [--out dir] [--stub-world file]
import { createServer } from 'vite';
import { createRequire } from 'module';
import path from 'path';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('port', 5185)), out = arg('out', '/tmp');
// --stub-world <file>: swap src/world/index.js for another file (when the world team's code is mid-edit)
const stubWorld = arg('stub-world', null);
const plugins = stubWorld ? [{ name: 'stub-world', enforce: 'pre', resolveId(src, importer) { if (importer && /\/world\/index\.js$/.test(src)) return path.resolve(stubWorld); } }] : [];
const server = await createServer({ server: { port, strictPort: false, fs: { strict: false }, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error', plugins });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const shot = (n) => page.screenshot({ path: `${out}/ui-${n}.png`, timeout: 180000 });
const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = async (name, fn) => { const t = Date.now(); try { await fn(); } catch (e) { errors.push(`step ${name}: ${e.message.split('\n')[0]}`); } console.error(`[ui-test] ${name} ${Date.now() - t}ms`); };

await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game, null, { timeout: 120000 });
if (!process.argv.includes('--full-res')) await page.evaluate(() => window.__game.renderer.setPixelRatio(0.5)); // UI is what we test; keep GL cheap
await step('menu', async () => { await frames(5); await shot('menu'); });
await step('settings', async () => { await page.click('.pf-card[data-class-id="flamer"]'); await page.click('.pf-setbtn'); await frames(2); await shot('settings'); await page.click('.pf-done'); });
await step('deploy', async () => { await page.click('.pf-deploy'); await page.waitForFunction(() => window.__game.time > 0.5 && window.__game.player?.unit); });
await step('hud', async () => {
  await page.evaluate(() => {
    const g = window.__game, ev = g.events, me = g.player.unit;
    const V0 = me.position.constructor, base = me.position;
    // make sure there are soldiers to talk about, whatever the wave state
    for (let i = 0; i < 8; i++) g.units.spawn({ team: 'tan', classId: ['rifleman', 'flamer', 'bazooka', 'sniper'][i % 4], position: new V0(base.x + 20 + i, base.y, base.z + 25) });
    g.units.spawn({ team: 'green', classId: 'rifleman', position: new V0(base.x + 3, base.y, base.z - 3) });
    const enemies = g.units.list.filter((u) => u.team === 'tan' && u.alive);
    const friend = g.units.list.find((u) => u.team === 'green' && !u.isPlayer && u.alive);
    const V = me.position.constructor;
    ev.emit('player:hit', { unit: me, damage: 20, fromDir: new V(1, 0, 0) });
    ev.emit('player:hit', { unit: me, damage: 20, fromDir: new V(0, 0, -1) });
    me.hp = me.maxHp * 0.2;
    ev.emit('player:hitmarker', { kill: true, headshot: false });
    const victim = enemies[0] || friend;
    for (let i = 0; i < 5; i++) ev.emit('unit:killed', { unit: enemies[i] || victim, killer: me, info: { type: i === 1 ? 'fire' : i === 2 ? 'explosive' : 'bullet', zone: i === 0 ? 'head' : i === 3 ? 'larm' : 'torso', source: me } });
    if (friend && enemies[5]) ev.emit('unit:killed', { unit: friend, killer: enemies[5], info: { type: 'bullet', zone: 'torso', source: enemies[5] } });
    ev.emit('objective:contested', { progress: 0.45 });
    ev.emit('bark', { unit: null, kind: 'wave_start', text: 'HQ to all units: tan army inbound. Look lively.' });
    if (friend) ev.emit('bark', { unit: friend, kind: 'charge', text: 'CHARGE! Last one there gets left in the sandbox!', radio: true });
    const cam = g.camera, f = new V(); cam.getWorldDirection(f);
    const e6 = enemies[6];
    if (e6) { e6.position.copy(cam.position).addScaledVector(f, 9); e6.position.y = g.world.getHeight?.(e6.position.x, e6.position.z) ?? 0; e6.ai = null; ev.emit('bark', { unit: e6, kind: 'taunt', text: 'You fight like a bendy straw!' }); }
    ev.emit('weapon:fire', { unit: me, weapon: me.weapon.def, origin: cam.position.clone(), dir: f });
    ev.emit('explosion', { point: cam.position.clone().addScaledVector(f, 4), radius: 5 });
  });
  await frames(3); await shot('hud');
});
const audio1 = await page.evaluate(() => { const a = window.__game.audio; return { ready: a.ready, state: a.ctx?.state, stats: { ...a.stats, voices: a.stats.voices }, music: a.musicIntensity }; });
await step('wave', async () => { await page.evaluate(() => { const ev = window.__game.events; ev.emit('wave:cleared', { wave: 3 }); ev.emit('wave:incoming', { wave: 4, in: 5 }); }); await frames(3); await shot('wave'); });
await step('scope', async () => { await page.evaluate(() => { window.__game.player.scoped = true; }); await frames(2); await shot('scope'); await page.evaluate(() => { window.__game.player.scoped = false; }); });
await step('pause', async () => { await page.evaluate(() => window.__game.pause()); await frames(2); await shot('pause'); });
await step('gameover', async () => {
  await page.evaluate(() => { window.__game.resume(); window.__game.gameOver({ reason: 'lives', wave: 7 }); });
  await page.waitForSelector('.pf-change', { state: 'visible' }); await frames(2); await shot('gameover');
});
let backToMenu = null, afterStart = null;
await step('tomenu', async () => {
  await page.evaluate(() => document.querySelector('.pf-change').click()); await frames(2);
  backToMenu = await page.evaluate(() => ({ state: window.__game.state, menuVisible: !document.getElementById('pf-menu').classList.contains('pf-hide') }));
});
await step('restart', async () => {
  await page.evaluate(() => window.__game.start({ classId: 'sniper' })); await frames(3);
  afterStart = await page.evaluate(() => ({ state: window.__game.state, menuVisible: !document.getElementById('pf-menu').classList.contains('pf-hide'), hud: !document.getElementById('pf-hud').classList.contains('pf-hide') }));
});
const audio2 = await page.evaluate(() => { const a = window.__game.audio; return { stats: { ...a.stats, voices: a.stats.voices }, music: a.musicIntensity, settings: window.__game.settings }; });
const ok = backToMenu?.menuVisible && backToMenu.state === 'menu' && afterStart && !afterStart.menuVisible && afterStart.hud;
if (!ok) errors.push('menu/hud visibility check failed');
console.log(JSON.stringify({ audio1, audio2, backToMenu, afterStart, errors }, null, 2));
await browser.close(); await server.close();
process.exit(errors.length ? 1 : 0);
