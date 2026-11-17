import { CSS } from './styles.js';
import { ensureSettings } from './settings.js';
import { createMenus } from './menu.js';
import { createHUD } from './hud.js';
import { createMoxie } from './moxie.js';

// UI / Moxie entry point. DOM/CSS overlay on top of the WebGL canvas:
//  main menu (toy-box title, operation name, class cards, settings), HUD, pause & game-over sheets,
//  plus the "moxie" director (stats, killstreak announcer, radio chatter).
// Exposes: game.ui.update(dt), game.ui.stats, game.ui.operation, game.ui.banner(text, sub, style), game.ui.announce(text, sub),
//          game.ui.toMenu(), game.ui.openSettings(). Emits: ui:click, ui:hover, ui:stamp, ui:streak, game:menu, settings:changed.
export function createUI(game) {
  const settings = ensureSettings(game);
  const root = game.uiRoot;
  root.innerHTML = '';
  if (!document.getElementById('pf-style')) {
    const st = document.createElement('style'); st.id = 'pf-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  root.style.setProperty('--pf-grunge', `url(${grungeTexture()})`);

  let hud = null, moxie = null;
  const hooks = {
    deploy(classId) { game.start({ classId }); },
    toMenu,
    applySettings,
  };
  const menus = createMenus(game, root, hooks);
  moxie = createMoxie(game, { streak: (...a) => hud.streak(...a) });
  hud = createHUD(game, root, moxie);
  // modals above HUD
  for (const el of Object.values(menus.elements)) root.appendChild(el);

  function applySettings() {
    const cam = game.camera, pl = game.player;
    if (!cam || pl?.scoped || pl?.isADS) return;
    if (Math.abs(cam.fov - settings.fov) > 0.01) { cam.fov = settings.fov; cam.updateProjectionMatrix(); }
  }
  function toMenu() {
    game.input?.unlock?.();
    game.state = 'menu';
    hud.hide(); hud.reset();
    menus.showMenu(); menus.rerollOperation();
    game.events.emit('game:menu', {});
  }

  const ev = game.events;
  ev.on('game:start', () => { menus.hideAll(); hud.reset(); hud.show(); applySettings(); });
  ev.on('player:spawn', applySettings);
  ev.on('game:pause', () => menus.showPause(moxie.stats));
  ev.on('game:resume', () => menus.hidePause());
  ev.on('game:over', (info) => { menus.hidePause(); setTimeout(() => { if (game.state === 'gameover') menus.showGameOver(info, moxie.stats); }, 1200); hud.banner('MISSION FAILED', 'RETURN TO SENDER', 'danger', 2); });
  // first user gesture: also make sure FOV matches settings
  applySettings();

  const api = {
    get operation() { return menus.operation; },
    get stats() { return moxie.stats; },
    banner: (t, s, style, dur) => hud.banner(t, s, style, dur),
    announce: (t, s) => hud.streak(t, s, true),
    toMenu, openSettings: () => menus.openSettings(),
    menus, hud,
    update(dt) {
      if (game.state === 'playing') moxie.update(dt);
      if (game.state !== 'menu') hud.update(dt);
    },
  };
  return api;
}

function grungeTexture() {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 420; i++) {
      const r = Math.random() < 0.95 ? Math.random() * 1.3 + 0.3 : Math.random() * 4 + 1.5;
      g.globalAlpha = Math.random() * 0.8 + 0.2; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, r, 0, 7); g.fill();
    }
    for (let i = 0; i < 14; i++) { // scratches
      g.globalAlpha = 0.5; g.lineWidth = Math.random() * 1.5 + 0.5; g.beginPath();
      const x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); g.lineTo(x + Math.random() * 60 - 30, y + Math.random() * 60 - 30); g.stroke();
    }
    return c.toDataURL();
  } catch { return ''; }
}
