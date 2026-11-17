import { CLASSES, CLASS_IDS } from '../core/classes.js';
import { WEAPONS } from '../combat/weapons.js';
import { operationName } from './opnames.js';
import { saveSettings } from './settings.js';

// Main menu (title, operation, class cards, controls), settings sheet, pause sheet, game-over sheet.
const CONTROLS = [['W A S D', 'Move'], ['SHIFT', 'Sprint'], ['SPACE', 'Jump'], ['C / CTRL', 'Crouch'], ['Z', 'Go prone'], ['MOUSE 1', 'Fire'],
  ['MOUSE 2', 'Aim / scope'], ['R', 'Reload'], ['1 / 2 / WHEEL', 'Switch weapon'], ['G', 'Quick grenade'], ['Q', 'Class ability'], ['ESC', 'Pause']];
const TIPS = ['Tan soldiers are 40% more beige than regulation.', 'Limbs grow back in the factory. Not on the field.', 'The flamethrower is not a toy. Well. It is. But still.',
  'Headshots pop helmets AND egos.', 'Corpses make excellent, if judgmental, cover.', 'Never trust a soldier with a perfectly flat base.',
  'Grenades bounce. Plan accordingly. Or don\'t, it\'s funnier.', 'No toys were harmed. Several were melted.'];

function weaponName(id) { return WEAPONS[id]?.name || id; }
export function soldierSVG(classId, body = '#5f8f32', dark = '#3a5a1c') {
  const W = {
    rifleman: `<path d="M12 46 L54 24" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><path d="M40 33 L36 40" stroke="${dark}" stroke-width="3"/>`,
    bazooka: `<path d="M6 26 L56 15" stroke="${dark}" stroke-width="9" stroke-linecap="round"/><circle cx="56" cy="15" r="5" fill="${dark}"/>`,
    flamer: `<rect x="34" y="24" width="12" height="24" rx="5" fill="${dark}"/><path d="M18 50 L54 44" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><path d="M40 46 Q30 58 22 50" stroke="${dark}" stroke-width="2" fill="none"/>`,
    sniper: `<path d="M2 40 L60 30" stroke="${dark}" stroke-width="3" stroke-linecap="round"/><rect x="30" y="29" width="12" height="4" rx="2" fill="${dark}"/>`,
    grenadier: `<path d="M18 46 L44 40" stroke="${dark}" stroke-width="5" stroke-linecap="round"/><path d="M36 28 L46 8" stroke="${body}" stroke-width="6" stroke-linecap="round"/><circle cx="47" cy="6" r="5" fill="${dark}"/>`,
  };
  return `<svg viewBox="0 0 62 96">
    <ellipse cx="31" cy="90" rx="24" ry="5" fill="${dark}"/><rect x="7" y="84" width="48" height="6" fill="${body}"/>
    <path d="M24 56 L19 84 L28 84 L31 64 L34 84 L43 84 L38 56Z" fill="${body}"/>
    <path d="M21 28 Q31 22 41 28 L40 58 L22 58Z" fill="${body}"/>
    <circle cx="31" cy="19" r="7" fill="${body}"/><path d="M21 17 Q31 4 41 17 L43 18 L19 18Z" fill="${dark}"/>
    ${W[classId] || W.rifleman}
  </svg>`;
}

export function createMenus(game, root, hooks) {
  const s = game.settings;
  const click = () => game.events.emit('ui:click', {});
  let selected = (() => { try { return localStorage.getItem('plasticFront.class') || 'rifleman'; } catch { return 'rifleman'; } })();
  if (!CLASSES[selected]) selected = 'rifleman';
  let operation = operationName();

  // ---------- main menu ----------
  const menu = document.createElement('div');
  menu.id = 'pf-menu'; menu.className = 'pf-layer';
  const title = 'PLASTIC'.split('').map((c) => `<span>${c}</span>`).join('');
  const front = 'FRONT'.split('').map((c) => `<span>${c}</span>`).join('');
  menu.innerHTML = `
    <div class="pf-menu-top">
      <div class="pf-boxlabel">
        <h1 class="pf-title pf-stencil pf-cut">${title} <span class="pf-front pf-cut" style="display:inline">${front}</span></h1>
        <div class="pf-tagline pf-stencil"><span>150+ GENUINE PLASTIC SOLDIERS</span><span>AGES 8 & UP</span><span>SMALL PARTS. VERY SMALL.</span></div>
        <div class="pf-starburst pf-stencil">NOW<br>40% MORE<br>MELTING!</div>
      </div>
      <div class="pf-op">
        <div class="pf-opstamp pf-stencil pf-grunge"><small>TODAY'S MISSION — TOP SECRET</small><span class="pf-opname"></span></div>
        <div class="pf-btnrow">
          <button class="pf-btn pf-ghost pf-reroll" title="New operation name">NEW ORDERS</button>
          <button class="pf-btn pf-ghost pf-ctlbtn">CONTROLS</button>
          <button class="pf-btn pf-ghost pf-setbtn">SETTINGS</button>
        </div>
      </div>
    </div>
    <div class="pf-menu-mid"></div>
    <div class="pf-sidepanel pf-ctlpanel pf-hide"><h4 class="pf-stencil">FIELD MANUAL</h4><div class="pf-controls">${CONTROLS.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
      <div class="pf-tipline" style="color:#cdb47c;margin-top:10px">Hold the flag. Survive the waves. Don't get stepped on.</div></div>
    <div class="pf-menu-bottom">
      <div class="pf-cards"></div>
      <div class="pf-deployrow"><button class="pf-btn pf-red pf-big pf-deploy pf-stencil">DEPLOY!</button><span class="pf-hint pf-stencil pf-deployas"></span></div>
    </div>`;
  root.appendChild(menu);
  const $ = (sel, r = menu) => r.querySelector(sel);
  const opName = $('.pf-opname');
  const setOp = (n) => { operation = n; opName.textContent = n; hooks.onOperation?.(n); };
  setOp(operation);
  const cards = $('.pf-cards');
  const maxHp = Math.max(...CLASS_IDS.map((id) => CLASSES[id].hp)), maxSpd = Math.max(...CLASS_IDS.map((id) => CLASSES[id].speed));
  CLASS_IDS.forEach((id, i) => {
    const c = CLASSES[id];
    const card = document.createElement('div');
    card.className = 'pf-card'; card.dataset.classId = id;
    const ab = c.ability ? `<div style="margin-top:3px"><b>Q:</b> <span>${c.ability.name}</span></div>` : '';
    card.innerHTML = `<div class="pf-key">${i + 1}</div><div class="pf-blister">${soldierSVG(id)}</div>
      <h3 class="pf-stencil">${c.name}</h3><div class="pf-blurb">${c.blurb || ''}</div>
      <div class="pf-stat pf-stencil"><b>HP ${c.hp}</b><i style="--v:${(c.hp / maxHp * 100).toFixed(0)}%"></i></div>
      <div class="pf-stat pf-stencil"><b>SPD</b><i style="--v:${(c.speed / maxSpd * 100).toFixed(0)}%"></i></div>
      <div class="pf-weap pf-stencil">${(c.weapons || []).map((w, k) => `<div>${k ? 'SIDE' : 'MAIN'}: <span>${weaponName(w)}</span></div>`).join('')}${ab}</div>`;
    card.title = c.ability?.desc || '';
    card.onmouseenter = () => game.events.emit('ui:hover', {});
    card.onclick = () => { select(id); click(); };
    card.ondblclick = () => deploy();
    cards.appendChild(card);
  });
  function select(id) {
    selected = id; try { localStorage.setItem('plasticFront.class', id); } catch { }
    for (const el of cards.children) el.classList.toggle('pf-sel', el.dataset.classId === id);
    $('.pf-deployas').innerHTML = `AS ${CLASSES[id].name.toUpperCase()}<br>1-5 PICK · ENTER DEPLOY`;
  }
  select(selected);
  function deploy(classId = selected) { click(); hooks.deploy(classId); }
  $('.pf-deploy').onclick = () => deploy();
  $('.pf-reroll').onclick = () => { click(); setOp(operationName()); game.events.emit('ui:stamp', {}); };
  $('.pf-ctlbtn').onclick = () => { click(); $('.pf-ctlpanel').classList.toggle('pf-hide'); };
  $('.pf-setbtn').onclick = () => { click(); openSettings(); };
  for (const b of root.querySelectorAll('.pf-btn')) b.addEventListener('mouseenter', () => game.events.emit('ui:hover', {}));
  addEventListener('keydown', (e) => {
    if (game.state !== 'menu' || menu.classList.contains('pf-hide') || !settingsEl.classList.contains('pf-hide')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= CLASS_IDS.length) { select(CLASS_IDS[n - 1]); click(); }
    if (e.key === 'Enter') deploy();
  });

  // ---------- settings sheet ----------
  const settingsEl = document.createElement('div');
  settingsEl.className = 'pf-layer pf-modal pf-hide';
  const rows = [
    ['sensitivity', 'MOUSE SENS', 0.2, 3, 0.05, (v) => v.toFixed(2) + 'x'],
    ['volume', 'MASTER VOL', 0, 1, 0.01, (v) => Math.round(v * 100) + '%'],
    ['music', 'DRUM CORPS', 0, 1, 0.01, (v) => Math.round(v * 100) + '%'],
    ['fov', 'FIELD OF VIEW', 60, 105, 1, (v) => v + '°'],
  ];
  const toggles = [['voice', 'SPOKEN BARKS'], ['subtitles', 'RADIO SUBTITLES'], ['invertY', 'INVERT MOUSE Y']];
  settingsEl.innerHTML = `<div class="pf-sheet"><h2 class="pf-stencil">SETTINGS</h2><div class="pf-sub">Adjust your plastic. Saved automatically.</div>
    ${rows.map(([k, l, a, b, st]) => `<label class="pf-setrow pf-stencil"><span>${l}</span><input type="range" data-k="${k}" min="${a}" max="${b}" step="${st}"><output data-o="${k}"></output></label>`).join('')}
    ${toggles.map(([k, l]) => `<label class="pf-setrow pf-stencil"><span>${l}</span><input type="checkbox" data-k="${k}"><output></output></label>`).join('')}
    <div class="pf-btnrow"><button class="pf-btn pf-red pf-done">DONE</button><button class="pf-btn pf-ghost pf-defaults">RESET DEFAULTS</button></div></div>`;
  root.appendChild(settingsEl);
  function syncSettingsUI() {
    for (const [k, , , , , fmt] of rows) { $(`input[data-k="${k}"]`, settingsEl).value = s[k]; $(`output[data-o="${k}"]`, settingsEl).textContent = fmt(+s[k]); }
    for (const [k] of toggles) $(`input[data-k="${k}"]`, settingsEl).checked = !!s[k];
  }
  for (const [k, , , , , fmt] of rows) {
    const inp = $(`input[data-k="${k}"]`, settingsEl);
    inp.oninput = () => { s[k] = +inp.value; $(`output[data-o="${k}"]`, settingsEl).textContent = fmt(s[k]); saveSettings(game); hooks.applySettings?.(); };
  }
  for (const [k] of toggles) { const inp = $(`input[data-k="${k}"]`, settingsEl); inp.onchange = () => { s[k] = inp.checked; click(); saveSettings(game); hooks.applySettings?.(); }; }
  let settingsReturn = null;
  function openSettings(ret = null) { settingsReturn = ret; syncSettingsUI(); settingsEl.classList.remove('pf-hide'); ret?.classList.add('pf-hide'); }
  function closeSettings() { settingsEl.classList.add('pf-hide'); settingsReturn?.classList.remove('pf-hide'); settingsReturn = null; }
  $('.pf-done', settingsEl).onclick = () => { click(); closeSettings(); };
  $('.pf-defaults', settingsEl).onclick = () => {
    click(); Object.assign(s, { sensitivity: 1, volume: 0.8, music: 0.55, fov: 75, voice: true, subtitles: true, invertY: false });
    saveSettings(game); hooks.applySettings?.(); syncSettingsUI();
  };

  // ---------- pause ----------
  const pause = document.createElement('div');
  pause.className = 'pf-layer pf-modal pf-hide';
  pause.innerHTML = `<div class="pf-sheet"><div class="pf-bigstamp pf-stencil pf-grunge">ON HOLD</div><h2 class="pf-stencil">PAUSED</h2>
    <div class="pf-sub pf-pauseop"></div>
    <div class="pf-stats pf-pausestats"></div>
    <div class="pf-btnrow"><button class="pf-btn pf-red pf-big pf-resume">RESUME</button><button class="pf-btn pf-psettings">SETTINGS</button><button class="pf-btn pf-ghost pf-quit">QUIT TO TOY BOX</button></div>
    <div class="pf-sidepanel" style="position:static;width:auto;margin-top:16px;display:block"><div class="pf-controls">${CONTROLS.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div></div></div>`;
  root.appendChild(pause);
  $('.pf-resume', pause).onclick = () => { click(); game.resume(); };
  $('.pf-psettings', pause).onclick = () => { click(); openSettings(pause); };
  $('.pf-quit', pause).onclick = () => { click(); hooks.toMenu(); };

  // ---------- game over ----------
  const over = document.createElement('div');
  over.className = 'pf-layer pf-modal pf-hide';
  over.innerHTML = `<div class="pf-sheet" style="min-width:min(640px,92vw)"><div class="pf-bigstamp pf-stencil pf-grunge">RECALLED</div>
    <h2 class="pf-stencil pf-overtitle">GAME OVER</h2><div class="pf-sub pf-oversub"></div>
    <div class="pf-stats pf-overstats"></div>
    <div class="pf-tipline pf-overtip"></div>
    <div class="pf-btnrow"><button class="pf-btn pf-red pf-big pf-again">REDEPLOY</button><button class="pf-btn pf-change">CHANGE CLASS</button></div></div>`;
  root.appendChild(over);
  $('.pf-again', over).onclick = () => { click(); hooks.deploy(game.player?.classId || selected, true); };
  $('.pf-change', over).onclick = () => { click(); hooks.toMenu(); };

  function statGrid(st, extra = true) {
    const corpses = game.bodies?.corpses?.length ?? 0;
    const acc = st.shots ? Math.round(Math.min(1, st.hits / st.shots) * 100) + '%' : '—';
    const items = [
      ['WAVES SURVIVED', st.wavesCleared], ['YOUR KILLS', st.kills], ['BEST STREAK', st.bestStreak],
      ['LIMBS REMOVED', st.limbs || st.limbsTotal, true], ['SOLDIERS MELTED', st.melted || st.meltedTotal, true], ['CORPSES ON FIELD', corpses, true],
    ];
    if (extra) items.push(['HEADSHOTS', st.headshots], ['ACCURACY', acc], ['TOYS LOST (ALL)', st.killsTotal, true]);
    return items.map(([l, v, gore]) => `<div class="${gore ? 'pf-gore' : ''}"><b>${v}</b><span>${l}</span></div>`).join('');
  }

  return {
    get selected() { return selected; },
    get operation() { return operation; },
    rerollOperation() { setOp(operationName()); },
    showMenu() { menu.classList.remove('pf-hide'); pause.classList.add('pf-hide'); over.classList.add('pf-hide'); },
    hideAll() { for (const el of [menu, pause, over, settingsEl]) el.classList.add('pf-hide'); },
    showPause(stats) {
      $('.pf-pauseop', pause).textContent = `${operation} — wave ${game.units?.wave ?? 0}. The tan army politely waits.`;
      $('.pf-pausestats', pause).innerHTML = statGrid(stats, false);
      pause.classList.remove('pf-hide');
    },
    hidePause() { pause.classList.add('pf-hide'); settingsEl.classList.add('pf-hide'); },
    showGameOver(info, stats) {
      const reason = info?.reason;
      $('.pf-overtitle', over).textContent = reason === 'objective' || reason === 'flag' ? 'FLAG CAPTURED' : 'OUT OF TOYS';
      $('.pf-oversub', over).textContent = `${operation}: ${reason === 'objective' || reason === 'flag' ? 'the tan army carried off our colors.' : 'no reinforcements left in the bag.'} Reached wave ${info?.wave ?? game.units?.wave ?? 0}.`;
      $('.pf-overstats', over).innerHTML = statGrid(stats);
      $('.pf-overtip', over).textContent = 'FIELD TIP: ' + TIPS[(Math.random() * TIPS.length) | 0];
      over.classList.remove('pf-hide');
    },
    openSettings,
    elements: { menu, pause, over, settings: settingsEl },
  };
}
