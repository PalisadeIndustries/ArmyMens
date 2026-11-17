import { CLASSES, CLASS_IDS } from '../core/classes.js';

// SKELETON UI: main menu with class select, minimal HUD, pause and game-over overlays.
// The UI/Audio/Moxie team replaces this.
export function createUI(game) {
  const root = game.uiRoot;
  root.innerHTML = `
    <div id="menu" class="interactive" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(20,30,10,.75);color:#e8f0d0">
      <h1 style="font-size:56px;margin:0 0 24px">PLASTIC FRONT</h1>
      <div id="classes" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center"></div>
    </div>
    <div id="hud" style="display:none;position:absolute;inset:0;color:#fff;text-shadow:0 1px 2px #000">
      <div style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff"></div>
      <div id="hp" style="position:absolute;left:20px;bottom:20px;font-size:28px"></div>
      <div id="ammo" style="position:absolute;right:20px;bottom:20px;font-size:28px"></div>
      <div id="wave" style="position:absolute;left:50%;top:16px;transform:translateX(-50%);font-size:22px"></div>
    </div>
    <div id="overlay" class="interactive" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;background:rgba(0,0,0,.6);color:#fff;font-size:32px;cursor:pointer"></div>`;
  const $ = (id) => root.querySelector('#' + id);
  for (const id of CLASS_IDS) {
    const b = document.createElement('button');
    b.textContent = CLASSES[id].name; b.dataset.classId = id;
    b.style.cssText = 'font-size:20px;padding:14px 22px;cursor:pointer';
    b.onclick = () => { $('menu').style.display = 'none'; $('hud').style.display = 'block'; game.start({ classId: id }); };
    $('classes').appendChild(b);
  }
  $('overlay').onclick = () => {
    if (game.state === 'paused') { $('overlay').style.display = 'none'; game.resume(); }
    else if (game.state === 'gameover') { $('overlay').style.display = 'none'; $('hud').style.display = 'none'; $('menu').style.display = 'flex'; game.state = 'menu'; }
  };
  game.events.on('game:pause', () => { $('overlay').style.display = 'flex'; $('overlay').textContent = 'PAUSED — click to resume'; });
  game.events.on('game:over', () => { $('overlay').style.display = 'flex'; $('overlay').textContent = `GAME OVER — reached wave ${game.units.wave}. Click.`; });
  return {
    update(dt) {
      const u = game.player?.unit;
      if (game.state !== 'playing' || !u) return;
      $('hp').textContent = u.alive ? `HP ${Math.ceil(u.hp)}` : `RESPAWN ${Math.max(0, game.player.respawnTimer).toFixed(1)}`;
      const w = u.weapon; $('ammo').textContent = `${w.def.name}  ${w.ammo} / ${w.reserve}`;
      $('wave').textContent = `WAVE ${game.units.wave} — Tan left: ${game.units.countAlive('tan')} — Lives ${game.player.lives}`;
    },
  };
}
