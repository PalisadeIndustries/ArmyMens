// Headless combat test: every class, every weapon, grenades (cooked), melee, abilities and an autoplay battle.
// The render loop is stopped and the simulation is stepped manually at 60 Hz (fast + deterministic under
// SwiftShader); a few frames are rendered at the end for the screenshot.
// Usage: node tools/combat-test.mjs [--port 5183] [--shot out.png] [--autoplay 20]   (autoplay = sim seconds)
// Exit code 1 on any page error or if expected events never fired.
import { createServer } from 'vite';
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('port', 5183)), shot = arg('shot', null), autoSecs = Number(arg('autoplay', 20));

const server = await createServer({ server: { port, strictPort: false, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); else if (process.argv.includes('--verbose')) console.log('[page]', m.text()); });
page.on('crash', () => console.log('PAGE CRASHED'));
await page.goto(url);
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });

await page.evaluate(() => {
  const g = window.__game; g.__counts = {};
  for (const ev of ['weapon:fire', 'weapon:reload', 'explosion', 'impact', 'unit:ignited', 'unit:damaged', 'unit:killed', 'player:hitmarker',
    'player:killstreak', 'player:hit', 'ability:used', 'projectile:spawn', 'projectile:bounce', 'player:melee', 'unit:marked', 'bullet:whizz'])
    g.events.on(ev, () => { g.__counts[ev] = (g.__counts[ev] || 0) + 1; });
  g.renderer.setAnimationLoop(null);
  // manual fixed-step simulation (mirrors Game.frame without rendering)
  window.__step = (n, render = false) => {
    for (let i = 0; i < n; i++) {
      const dt = 1 / 60; g.dt = dt;
      if (g.state === 'playing') { g.time += dt; for (const s of g.systems) s?.update?.(dt); }
      g.ui?.update?.(dt);
      if (render && i === n - 1) g.renderer.render(g.scene, g.camera);
      g.input.endFrame();
    }
  };
});
const step = (n, render) => page.evaluate(([n, r]) => window.__step(n, r), [n, !!render]);

const results = {};
for (const cls of ['rifleman', 'bazooka', 'flamer', 'sniper', 'grenadier']) {
  await page.evaluate((c) => window.__game.start({ classId: c }), cls);
  await step(10);
  const r = await page.evaluate(() => {
    const g = window.__game, pl = g.player, p = pl.unit;
    const fwd = p.forward(p.position.clone()); fwd.y = 0; fwd.normalize();
    for (let i = 0; i < 4; i++) {
      const pos = p.position.clone().addScaledVector(fwd, 7 + i * 2); pos.x += (i - 1.5) * 0.6;
      g.units.spawn({ team: 'tan', classId: 'rifleman', position: pos });
    }
    p.pitch = -0.04;
    const out = { fired: {} };
    for (let slot = 0; slot < p.weapons.length; slot++) {
      pl.debugSelect(slot);
      let n = 0;
      for (let k = 0; k < 14; k++) { if (pl.debugFire()) n++; window.__step(4); }
      out.fired[p.weapon.id] = n;
    }
    pl.debugSelect(0);
    out.throw = pl.debugThrow(1.2);
    window.__step(20);
    // melee: put a dummy right in front
    const close = g.units.spawn({ team: 'tan', classId: 'rifleman', position: p.position.clone().addScaledVector(fwd, 1.4) });
    window.__step(1);
    out.melee = !!pl.debugMelee();
    out.ability = pl.debugAbility();
    out.abilityName = pl.abilityName;
    window.__step(240);
    out.fx = g.combat.fx.counts;
    out.activeProjectiles = g.combat.projectiles.activeCount;
    out.closeHp = Math.round(close.hp);
    return out;
  });
  results[cls] = r;
  console.error('class done', cls);
}

// autoplay a live battle
await page.evaluate(() => { const g = window.__game; g.start({ classId: 'grenadier' }); g.player.autoplay = true; });
const t0 = Date.now();
for (let s = 0; s < autoSecs; s += 2) await step(120);
const simMs = Date.now() - t0;
await step(3, true);
const summary = await page.evaluate(() => {
  const g = window.__game, p = g.player;
  return { counts: g.__counts, player: { alive: p.unit?.alive, lives: p.lives, kills: p.kills, streak: p.killstreak, ability: p.abilityName, cd: +p.abilityCooldown.toFixed(1) },
    fx: g.combat.fx.counts, wave: g.units.wave, units: g.units.list.length, calls: g.renderer.info.render.calls };
});
if (shot) await page.screenshot({ path: shot });
const need = ['weapon:fire', 'explosion', 'unit:ignited', 'player:hitmarker', 'ability:used', 'projectile:spawn', 'unit:damaged', 'player:melee'];
const missing = need.filter((e) => !summary.counts[e]);
console.log(JSON.stringify({ url, results, summary, simMsPerSimSec: Math.round(simMs / autoSecs), missing, errors: errors.slice(0, 20), errorCount: errors.length }, null, 1));
await browser.close();
await server.close();
process.exit(errors.length || missing.length ? 1 : 0);
