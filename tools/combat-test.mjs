// Headless combat test: every class, every weapon, grenades (cooked), melee, abilities and autoplay.
// Usage: node tools/combat-test.mjs [--port 5183] [--shot out.png] [--autoplay 10]
// Exit code 1 on any page error or if expected events never fired.
import { createServer } from 'vite';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('port', 5183)), shot = arg('shot', null), autoSecs = Number(arg('autoplay', 8));

const server = await createServer({ server: { port, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__game, null, { timeout: 15000 });

// count events
await page.evaluate(() => {
  const g = window.__game; g.__counts = {};
  for (const ev of ['weapon:fire', 'weapon:reload', 'explosion', 'impact', 'unit:ignited', 'unit:damaged', 'unit:killed', 'player:hitmarker',
    'player:killstreak', 'player:hit', 'ability:used', 'projectile:spawn', 'projectile:bounce', 'player:melee', 'unit:marked'])
    g.events.on(ev, () => { g.__counts[ev] = (g.__counts[ev] || 0) + 1; });
});

const wait = (ms) => page.waitForTimeout(ms);
// wait for `sec` of simulated game time (headless SwiftShader runs far below real time)
const waitGame = (sec) => page.evaluate((sec) => new Promise((res) => { const g = window.__game, t0 = g.time, s0 = performance.now();
  const f = () => (g.time - t0 >= sec || performance.now() - s0 > sec * 8000 ? res() : setTimeout(f, 50)); f(); }), sec);
const results = {};
for (const cls of ['rifleman', 'bazooka', 'flamer', 'sniper', 'grenadier']) {
  await page.evaluate((c) => window.__game.start({ classId: c }), cls);
  await wait(300);
  // dummies in front of the player
  await page.evaluate(() => {
    const g = window.__game, p = g.player.unit, T = g.combat.fx; // eslint-disable-line no-unused-vars
    const fwd = p.forward(new p.position.constructor()); fwd.y = 0; fwd.normalize();
    window.__dummies = [];
    for (let i = 0; i < 4; i++) {
      const pos = p.position.clone().addScaledVector(fwd, 7 + i * 2); pos.x += (i - 1.5) * 0.6;
      window.__dummies.push(g.units.spawn({ team: 'tan', classId: 'rifleman', position: pos }));
    }
    // aim at chest height of the first dummy
    p.pitch = -0.05;
  });
  const r = { fired: {} };
  for (let slot = 0; slot < 2; slot++) {
    const fired = await page.evaluate(async (slot) => {
      const g = window.__game, pl = g.player; pl.debugSelect(slot);
      let n = 0;
      for (let k = 0; k < 14; k++) {
        if (pl.debugFire()) n++;
        const t0 = g.time, r0 = performance.now(); while (g.time - t0 < 0.07 && performance.now() - r0 < 1500) await new Promise((res) => setTimeout(res, 15));
      }
      return { weapon: pl.unit.weapon.id, n };
    }, slot);
    r.fired[fired.weapon] = fired.n;
    await wait(200);
  }
  r.throw = await page.evaluate(() => window.__game.player.debugThrow(1.2));
  await waitGame(0.3);
  r.melee = !!(await page.evaluate(() => !!window.__game.player.debugMelee()));
  r.ability = await page.evaluate(() => window.__game.player.debugAbility());
  await waitGame(3.5);
  r.fx = await page.evaluate(() => window.__game.combat.fx.counts);
  r.projectiles = await page.evaluate(() => window.__game.combat.projectiles.activeCount);
  results[cls] = r;
}

// autoplay a live battle
await page.evaluate(() => window.__game.start({ classId: 'grenadier' }));
await page.evaluate(() => { window.__game.player.autoplay = true; });
await waitGame(autoSecs);
const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
const summary = await page.evaluate(() => {
  const g = window.__game, p = g.player;
  return { counts: g.__counts, player: { alive: p.unit?.alive, lives: p.lives, kills: p.kills, streak: p.killstreak, ability: p.abilityName, cd: +p.abilityCooldown.toFixed(1) },
    fx: g.combat.fx.counts, wave: g.units.wave, calls: g.renderer.info.render.calls };
});
if (shot) await page.screenshot({ path: shot });
const need = ['weapon:fire', 'explosion', 'unit:ignited', 'player:hitmarker', 'ability:used', 'projectile:spawn', 'unit:damaged'];
const missing = need.filter((e) => !summary.counts[e]);
console.log(JSON.stringify({ url, results, summary, fps, missing, errors: errors.slice(0, 20), errorCount: errors.length }, null, 2));
await browser.close();
await server.close();
process.exit(errors.length || missing.length ? 1 : 0);
