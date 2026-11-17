import * as THREE from 'three';
import { CLASSES } from '../core/classes.js';

// In-match HUD. DOM is built once; update() only touches nodes whose values changed.
const TEAMCOL = { green: '#86c24a', tan: '#e0b974' };
const CALLSIGN_A = ['Pvt.', 'Cpl.', 'Sgt.', 'Pfc.', 'Lt.'];
const _v = new THREE.Vector3();

export function soldierIcon(color = '#86c24a') {
  return `<svg viewBox="0 0 16 22"><circle cx="8" cy="4" r="3" fill="${color}"/><path d="M4 8h8l1 6h-2l-.5 6h-5L5 14H3z" fill="${color}"/><rect x="2" y="20" width="12" height="2" fill="${color}"/></svg>`;
}

export function createHUD(game, root, moxie) {
  const el = document.createElement('div');
  el.id = 'pf-hud'; el.className = 'pf-layer pf-hide';
  el.innerHTML = `
    <div class="pf-layer pf-vignette"></div>
    <div class="pf-layer pf-flash"></div>
    <div class="pf-layer pf-scope"><i></i></div>
    <div class="pf-cross"><i class="u"></i><i class="d"></i><i class="l"></i><i class="r"></i><i class="c"></i></div>
    <div class="pf-hitm"><i style="transform:rotate(45deg) translateY(-11px)"></i><i style="transform:rotate(135deg) translateY(-11px)"></i><i style="transform:rotate(225deg) translateY(-11px)"></i><i style="transform:rotate(315deg) translateY(-11px)"></i></div>
    <div class="pf-dmg"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="pf-panel pf-radar"><canvas width="184" height="184"></canvas></div>
    <div class="pf-panel pf-wave pf-stencil"><div class="pf-wnum">WAVE 1</div><div class="pf-wsub">TAN REMAINING <b>0</b></div><div class="pf-wavebar"><i></i></div></div>
    <div class="pf-panel pf-obj pf-stencil pf-hide"><div class="pf-otext">FLAG UNDER ATTACK</div><div class="pf-objbar"><i></i></div></div>
    <div class="pf-feed pf-stencil"></div>
    <div class="pf-intermission pf-stencil pf-hide"><div class="a">NEXT WAVE IN</div><div class="b">5</div></div>
    <div class="pf-banner pf-stencil"><div class="pf-bt"></div><div class="pf-bs"></div></div>
    <div class="pf-streak pf-stencil"><div class="pf-st"></div><div class="pf-ss"></div></div>
    <div class="pf-radio"></div>
    <div class="pf-bubbles"></div>
    <div class="pf-panel pf-hp pf-stencil">
      <div class="pf-row"><div class="pf-cls">RIFLEMAN</div><div class="pf-hpnum">100</div></div>
      <div class="pf-hpbar"><div class="pf-ghostfill"></div><div class="pf-fill"></div></div>
      <div class="pf-lives"></div>
    </div>
    <div class="pf-panel pf-ability pf-stencil"><b>Q</b><span>ABILITY</span></div>
    <div class="pf-panel pf-ammo pf-stencil">
      <div class="pf-wname">WEAPON</div>
      <div class="pf-count">0<small> / 0</small></div>
      <div class="pf-reload"></div>
      <div class="pf-secondary"></div>
    </div>
    <div class="pf-layer pf-dead pf-stencil pf-hide"><div class="pf-bt">SNAPPED!</div><div class="pf-bs">REDEPLOYING IN 4.0</div></div>
    <div class="pf-layer pf-relock pf-stencil pf-hide"><div>CLICK TO TAKE COMMAND</div></div>`;
  root.appendChild(el);
  const q = (s) => el.querySelector(s);
  const N = {
    vignette: q('.pf-vignette'), flash: q('.pf-flash'), scope: q('.pf-scope'), cross: q('.pf-cross'), hitm: q('.pf-hitm'),
    crossU: q('.pf-cross .u'), crossD: q('.pf-cross .d'), crossL: q('.pf-cross .l'), crossR: q('.pf-cross .r'),
    dmg: [...el.querySelectorAll('.pf-dmg i')], radar: q('.pf-radar canvas'),
    wnum: q('.pf-wnum'), wleft: q('.pf-wsub b'), wsub: q('.pf-wsub'), wbar: q('.pf-wavebar i'),
    obj: q('.pf-obj'), objText: q('.pf-otext'), objBar: q('.pf-objbar i'), feed: q('.pf-feed'),
    inter: q('.pf-intermission'), interNum: q('.pf-intermission .b'), interA: q('.pf-intermission .a'),
    banner: q('.pf-banner'), bannerT: q('.pf-banner .pf-bt'), bannerS: q('.pf-banner .pf-bs'),
    streak: q('.pf-streak'), streakT: q('.pf-streak .pf-st'), streakS: q('.pf-streak .pf-ss'),
    radio: q('.pf-radio'), bubbles: q('.pf-bubbles'),
    cls: q('.pf-cls'), hpnum: q('.pf-hpnum'), hpbar: q('.pf-hpbar'), hpfill: q('.pf-fill'), hpghost: q('.pf-ghostfill'), lives: q('.pf-lives'),
    ability: q('.pf-ability'), abilityName: q('.pf-ability span'), abilityKey: q('.pf-ability b'),
    wname: q('.pf-wname'), count: q('.pf-count'), reload: q('.pf-reload'), secondary: q('.pf-secondary'),
    dead: q('.pf-dead'), deadT: q('.pf-dead .pf-bt'), deadS: q('.pf-dead .pf-bs'), relock: q('.pf-relock'),
  };
  N.relock.onclick = () => game.input?.lock?.();
  const ctx2d = N.radar.getContext('2d');

  // cached values -> only write DOM on change
  const C = {};
  const set = (key, node, prop, val) => { if (C[key] !== val) { C[key] = val; if (prop === 'text') node.textContent = val; else if (prop === 'html') node.innerHTML = val; else node.style[prop] = val; } };
  const toggle = (key, node, cls, on) => { if (C[key] !== on) { C[key] = on; node.classList.toggle(cls, on); } };

  // ---------- state ----------
  let spread = 0, hitT = 0, hitKind = '', flashT = 0, waveTotal = 0, incomingEnd = -1, objT = 0, objProgress = 0, everLocked = false, radarT = 0;
  const dmgInd = N.dmg.map((node) => ({ node, t: 0, dir: new THREE.Vector3() }));
  const bannerQ = []; let bannerBusy = 0;
  const streakQ = []; let streakBusy = 0;

  // ---------- banners ----------
  function banner(text, sub = '', style = '', dur = 2.8) { bannerQ.push({ text, sub, style, dur }); if (bannerQ.length > 3) bannerQ.shift(); }
  function showBanner(b) {
    N.bannerT.textContent = b.text; N.bannerS.textContent = b.sub; N.bannerS.style.display = b.sub ? '' : 'none';
    N.banner.className = 'pf-banner pf-stencil ' + (b.style ? 'pf-' + b.style : '');
    void N.banner.offsetWidth; N.banner.classList.add('pf-show'); bannerBusy = b.dur; game.events.emit('ui:stamp', {});
  }
  function streak(text, sub = '', big = false, small = false) {
    if (small && (streakBusy > 0 || streakQ.length)) return;
    streakQ.push({ text, sub, big, small }); if (streakQ.length > 2) streakQ.shift();
  }
  function showStreak(s) {
    N.streakT.textContent = s.text; N.streakS.textContent = s.sub;
    N.streakT.style.fontSize = s.big ? '64px' : s.small ? '32px' : '46px';
    N.streak.classList.remove('pf-show'); void N.streak.offsetWidth; N.streak.classList.add('pf-show'); streakBusy = s.small ? 1.2 : 1.9;
  }

  // ---------- kill feed ----------
  let lastAiFeed = -9;
  function label(u, me) {
    if (!u) return '<span>???</span>';
    if (u === me) return '<span style="color:#f6c935">YOU</span>';
    const nm = u.name ? `${u.rank === 'sergeant' ? 'SGT. ' : ''}${u.name}` : (CLASSES[u.classId]?.name || 'Soldier');
    return `<span class="${u.team === 'tan' ? 't' : 'g'}">${esc(nm)}${u.name ? ` <small style="opacity:.6">${esc((CLASSES[u.classId]?.name || '').toUpperCase())}</small>` : ''}</span>`;
  }
  function how(info, unit) {
    if (info?.type === 'fire') return ['MELTED', 'fire'];
    if (info?.type === 'explosive') return ['BLOWN APART', 'boom'];
    if (info?.zone === 'head') return ['HEADSHOT', 'head'];
    if (info?.type === 'melee') return ['BONKED', 'gun'];
    if (info?.zone && info.zone !== 'torso') return [info.zone.includes('arm') ? 'DISARMED' : 'DE-LEGGED', 'limb'];
    const w = info?.weapon?.name || info?.source?.weapon?.def?.name;
    return [w ? w.toUpperCase() : 'SNAPPED', 'gun'];
  }
  game.events.on('unit:killed', ({ unit, killer, info }) => {
    const me = game.player?.unit, k = killer || info?.source;
    const mine = me && (k === me || unit === me);
    if (!mine) { if (game.time - lastAiFeed < 0.8) return; lastAiFeed = game.time; }
    const [verb, cls] = how(info, unit);
    const row = document.createElement('div');
    row.className = 'pf-kill' + (mine ? ' pf-me' : '');
    row.innerHTML = k && k !== unit ? `${label(k, me)}<em class="pf-how-${cls}">${verb}</em>${label(unit, me)}` : `${label(unit, me)}<em class="pf-how-${cls}">${verb === 'SNAPPED' ? 'TRIPPED' : verb}</em>`;
    N.feed.prepend(row);
    while (N.feed.children.length > 6) N.feed.lastChild.remove();
    setTimeout(() => { row.style.opacity = '0'; setTimeout(() => row.remove(), 600); }, mine ? 6000 : 4000);
  });

  // ---------- barks: bubbles above heads, radio subtitles ----------
  const bubbles = [];
  for (let i = 0; i < 5; i++) { const b = document.createElement('div'); b.className = 'pf-bubble'; N.bubbles.appendChild(b); bubbles.push({ node: b, unit: null, t: 0, life: 0 }); }
  function callsign(u) {
    if (!u) return 'HQ';
    if (u.isPlayer) return 'YOU';
    if (u.name) return `${u.rank === 'sergeant' ? 'Sgt.' : CALLSIGN_A[u.id % 4]} ${u.name}`;
    return `${CALLSIGN_A[u.id % 5]} ${['Pudding', 'Crayon', 'Biscuit', 'Gizmo', 'Pickles', 'Noodle', 'Waffles', 'Tater'][u.id % 8]}`;
  }
  function radioLine(unit, text, team) {
    if (game.settings && !game.settings.subtitles) return;
    const d = document.createElement('div');
    if ((unit?.team || team) === 'tan') d.className = 'pf-tan';
    d.innerHTML = `<b>${esc(callsign(unit))}${(unit?.team || team) === 'tan' ? ' [INTERCEPT]' : ''}:</b>${esc(text)}`;
    N.radio.appendChild(d);
    while (N.radio.children.length > 3) N.radio.firstChild.remove();
    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 450); }, 3600);
  }
  game.events.on('bark', ({ unit, kind, text, radio }) => {
    if (!text || game.state === 'menu') return;
    const me = game.player?.unit;
    const near = unit && !unit.isPlayer && unit.alive !== false && unit.position && me && unit.position.distanceTo(game.camera.position) < 38;
    if (near && onScreen(unit)) {
      // take a free bubble (or the oldest)
      let b = bubbles.find((x) => x.unit === unit) || bubbles.find((x) => x.t <= 0) || bubbles.reduce((a, x) => (x.t < a.t ? x : a));
      b.unit = unit; b.life = b.t = Math.min(4, 1.6 + text.length * 0.04);
      b.node.textContent = text;
      b.node.className = 'pf-bubble' + (unit.team === 'tan' ? ' pf-tan' : '') + (kind === 'burning' || kind === 'death' || kind === 'limb' ? ' pf-scream' : '');
      b.h = b.node.offsetHeight || 40;
      return;
    }
    const isRadio = radio || !unit || unit.isPlayer || unit.team === me?.team || ['wave_start', 'wave_clear', 'objective', 'player_spawn', 'player_death'].includes(kind);
    if (isRadio) radioLine(unit, text, unit?.team);
  });
  function onScreen(u) {
    _v.copy(u.position); _v.y += (u.height || 1.8) + 0.4; _v.project(game.camera);
    return _v.z < 1 && Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.95;
  }

  // ---------- events ----------
  const ev = game.events;
  ev.on('weapon:fire', ({ unit, weapon }) => {
    if (!unit || unit !== game.player?.unit) return;
    const d = weapon?.def || weapon || {};
    spread += d.kind === 'flame' ? 1.2 : d.id === 'sniper' ? 24 : d.id === 'smg' ? 5 : d.kind === 'projectile' ? 18 : 9;
  });
  ev.on('player:hitmarker', ({ kill, headshot }) => {
    const k = kill ? 'k' : headshot ? 'h' : '';
    if (hitT > 0.12 && hitKind === 'k' && !kill) return; // let kill markers read
    hitT = kill ? 0.45 : 0.25; hitKind = k;
    N.hitm.className = 'pf-hitm' + (k ? ' pf-' + k : '');
  });
  ev.on('player:hit', ({ fromDir, damage = 10 }) => {
    flashT = Math.min(0.6, 0.15 + damage / 80);
    if (!fromDir) return;
    // merge with an indicator pointing nearly the same way
    let slot = dmgInd.find((d) => d.t > 0 && d.dir.dot(fromDir) > 0.95) || dmgInd.reduce((a, d) => (d.t < a.t ? d : a));
    slot.dir.copy(fromDir); slot.t = 1.6;
  });
  ev.on('wave:start', ({ wave, enemies, title, sub }) => {
    waveTotal = enemies || 0; incomingEnd = -1;
    if (wave === 1 && game.ui?.operation) banner(game.ui.operation.toUpperCase(), `WAVE 1 — ${enemies ?? '??'} TAN INBOUND`, 'danger', 3.4);
    else banner(title ? String(title).toUpperCase() : `WAVE ${wave}`, sub ? String(sub).toUpperCase() : `${enemies ?? '??'} TAN INBOUND`, 'danger');
  });
  ev.on('wave:boss', ({ title, sub }) => banner(String(title || 'BOSS').toUpperCase(), String(sub || 'BIG TOY INCOMING').toUpperCase(), 'danger', 3.2));
  ev.on('wave:cleared', ({ wave }) => {
    const subs = ['SWEEP UP THE ARMS', 'TAKE FIVE, TROOPER', 'THE LAWN IS OURS (FOR NOW)', 'SMELLS LIKE VICTORY. AND PLASTIC.'];
    banner(`WAVE ${wave} CLEARED`, subs[(wave || 0) % subs.length], 'clear');
  });
  ev.on('wave:incoming', (p) => { if (p.in > 0) { incomingEnd = game.time + p.in; N.interA.textContent = p.special ? `${String(p.special.title || p.special.name || p.special).toUpperCase?.() || 'SPECIAL WAVE'} IN` : `WAVE ${p.wave ?? ''} IN`; } });
  ev.on('objective:contested', ({ progress = 0, contested }) => { objT = 1.5; objProgress = progress; N.objText.textContent = contested ? 'FLAG CONTESTED!' : progress > 0.66 ? 'FLAG FALLING! GET BACK THERE!' : 'TAN ON THE FLAG!'; });
  ev.on('objective:lost', () => banner('FLAG LOST', 'THE BEIGE HAVE TAKEN THE YARD', 'danger'));
  ev.on('player:spawn', () => { spread = 0; for (const d of dmgInd) d.t = 0; });
  ev.on('player:died', () => { N.deadT.textContent = ['SNAPPED!', 'MELTED!', 'RECYCLED!', 'BROKEN!', 'BENT!'][(Math.random() * 5) | 0]; });
  ev.on('ability:used', ({ unit, name }) => { if (unit === game.player?.unit) streak(String(name || 'ABILITY').toUpperCase() + '!', '', false, false); });

  function reset() {
    N.feed.innerHTML = ''; N.radio.innerHTML = ''; bannerQ.length = 0; streakQ.length = 0; bannerBusy = streakBusy = 0;
    N.banner.classList.remove('pf-show'); N.streak.classList.remove('pf-show');
    for (const b of bubbles) { b.t = 0; b.unit = null; b.node.style.opacity = 0; }
    for (const d of dmgInd) d.t = 0;
    incomingEnd = -1; objT = 0; hitT = 0; flashT = 0; spread = 0; for (const k in C) delete C[k];
  }

  // ---------- radar ----------
  function drawRadar() {
    const W = 184, R = W / 2, range = 55, s = R / range, c = ctx2d;
    const e = game.camera.matrixWorld.elements, cx = e[12], cz = e[14];
    let rx = e[0], rz = e[2]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl; // camera right (horizontal)
    const fx = -rz, fz = rx; // forward = right rotated -90 (horizontal)
    c.clearRect(0, 0, W, W);
    c.fillStyle = 'rgba(40,52,20,.9)'; c.beginPath(); c.arc(R, R, R, 0, 7); c.fill();
    c.strokeStyle = 'rgba(160,200,90,.25)'; c.lineWidth = 1;
    for (const rr of [R * 0.33, R * 0.66]) { c.beginPath(); c.arc(R, R, rr, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(R, 0); c.lineTo(R, W); c.moveTo(0, R); c.lineTo(W, R); c.stroke();
    // sweep
    const sw = (performance.now() / 1000 * 1.6) % (Math.PI * 2);
    const g = c.createConicGradient ? c.createConicGradient(sw, R, R) : null;
    if (g) { g.addColorStop(0, 'rgba(160,230,90,.28)'); g.addColorStop(0.12, 'rgba(160,230,90,0)'); g.addColorStop(1, 'rgba(160,230,90,0)'); c.fillStyle = g; c.beginPath(); c.arc(R, R, R, 0, 7); c.fill(); }
    const toR = (x, z, out) => { const dx = x - cx, dz = z - cz; out[0] = R + (dx * rx + dz * rz) * s; out[1] = R - (dx * fx + dz * fz) * s; return out; };
    const P = [0, 0];
    const obj = game.world?.objective?.position;
    if (obj) {
      toR(obj.x, obj.z, P); let px = P[0] - R, py = P[1] - R; const d = Math.hypot(px, py);
      if (d > R - 10) { px *= (R - 10) / d; py *= (R - 10) / d; }
      c.fillStyle = objT > 0 && (performance.now() / 250 | 0) % 2 ? '#ff4a2a' : '#f6c935';
      c.fillRect(R + px - 1, R + py - 9, 2, 12); c.beginPath(); c.moveTo(R + px + 1, R + py - 9); c.lineTo(R + px + 9, R + py - 6); c.lineTo(R + px + 1, R + py - 3); c.fill();
    }
    const me = game.player?.unit;
    for (const u of game.units?.list || []) {
      if (!u.alive || u === me) continue;
      toR(u.position.x, u.position.z, P);
      const dx = P[0] - R, dy = P[1] - R; if (dx * dx + dy * dy > (R - 3) * (R - 3)) continue;
      c.fillStyle = u.team === 'tan' ? (u.markedUntil > game.time ? '#ff3b2f' : '#f0c27a') : '#9be35a';
      const sz = (u.scale || 1) > 1.2 ? 4.5 : 2.6;
      if (u.team === 'tan') c.fillRect(P[0] - sz, P[1] - sz, sz * 2, sz * 2); else { c.beginPath(); c.arc(P[0], P[1], sz, 0, 7); c.fill(); }
    }
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(R, R - 8); c.lineTo(R + 6, R + 6); c.lineTo(R, R + 3); c.lineTo(R - 6, R + 6); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3; c.beginPath(); c.arc(R, R, R - 1.5, 0, 7); c.stroke();
  }

  // ---------- per-frame ----------
  function update(dt) {
    const pl = game.player, u = pl?.unit, playing = game.state === 'playing';
    // queues
    if (bannerBusy > 0) bannerBusy -= dt; else if (bannerQ.length) showBanner(bannerQ.shift());
    if (streakBusy > 0) streakBusy -= dt; else if (streakQ.length) showStreak(streakQ.shift());
    if (!u) return;
    const alive = u.alive;
    const maxHp = u.maxHp || u.cls?.hp || 100, hpFrac = Math.max(0, u.hp / maxHp);
    // health
    set('cls', N.cls, 'text', (u.cls?.name || CLASSES[pl.classId]?.name || '').toUpperCase());
    set('hpnum', N.hpnum, 'text', String(Math.max(0, Math.ceil(u.hp))));
    set('hpfill', N.hpfill, 'transform', `scaleX(${hpFrac.toFixed(3)})`);
    set('hpghost', N.hpghost, 'transform', `scaleX(${hpFrac.toFixed(3)})`);
    toggle('hplow', N.hpbar, 'pf-low', hpFrac < 0.3);
    const lives = pl.lives ?? 0;
    if (C.lives !== lives) { C.lives = lives; N.lives.innerHTML = 'LIVES ' + Array.from({ length: Math.max(3, lives) }, (_, i) => soldierIcon(i < lives ? '#86c24a' : '#555').replace('<svg', `<svg class="${i < lives ? '' : 'pf-gone'}"`)).join(''); }
    // vignette: low hp + hit flash
    const low = alive ? Math.max(0, (0.45 - hpFrac) / 0.45) : 0.9;
    const pulse = low > 0 ? low * (0.75 + 0.25 * Math.sin(performance.now() / 180)) : 0;
    set('vig', N.vignette, 'opacity', pulse.toFixed(2));
    flashT = Math.max(0, flashT - dt * 1.6); set('flash', N.flash, 'opacity', flashT.toFixed(2));
    // weapon
    const ws = u.weapon, def = ws?.def || {};
    if (ws) {
      set('wname', N.wname, 'text', (def.name || def.id || '').toUpperCase());
      const ammoHtml = `${ws.ammo}<small> / ${ws.reserve}</small>`;
      set('ammo', N.count, 'html', ammoHtml);
      toggle('lowammo', N.count, 'pf-lowammo', ws.ammo <= Math.max(1, Math.floor((def.mag || 10) * 0.25)));
      const rl = !!ws.reloading;
      set('reloadTxt', N.reload, 'text', rl ? 'RELOADING...' : ws.ammo === 0 && ws.reserve === 0 ? 'OUT OF AMMO' : ws.ammo === 0 ? 'PRESS R TO RELOAD' : '');
      toggle('reloadOn', N.reload, 'pf-on', rl || ws.ammo === 0);
      const other = u.weapons?.[u.weaponIndex === 0 ? 1 : 0];
      const gren = pl.grenades ?? u.grenades;
      set('second', N.secondary, 'text', (other ? `[${u.weaponIndex === 0 ? 2 : 1}] ${(other.def?.name || '').toUpperCase()} ${other.ammo + other.reserve}` : '') + (gren != null ? `   [G] PINEAPPLES ${gren}` : ''));
    }
    // ability
    const ab = u.cls?.ability;
    const abName = pl.abilityName ?? ab?.name;
    if (abName) {
      const cd = pl.abilityCooldown ?? u.abilityCd ?? 0, max = pl.abilityCooldownMax ?? ab?.cooldown ?? 20;
      const p = Math.max(0, Math.min(1, 1 - cd / max));
      set('abName', N.abilityName, 'text', String(abName).toUpperCase());
      if (C.abPv !== p) { C.abPv = p; N.ability.style.setProperty('--p', p.toFixed(3)); }
      set('abKey', N.abilityKey, 'text', cd > 0 ? String(Math.ceil(cd)) : 'Q');
      toggle('abReady', N.ability, 'pf-ready', cd <= 0);
      set('abShow', N.ability, 'display', '');
    } else set('abShow', N.ability, 'display', 'none');
    // crosshair: spread from weapon def + recent firing + movement
    const speed = Math.hypot(u.velocity?.x || 0, u.velocity?.z || 0);
    spread = Math.max(0, spread - dt * (30 + spread * 6));
    if (spread > 40) spread = 40;
    const ads = !!(pl.isADS || pl.ads), scoped = !!pl.scoped;
    const gap = ((def.spread || 0.01) * 520 + 5 + spread + speed * 1.4) * (ads ? 0.4 : 1);
    const gapPx = Math.round(gap);
    if (C.gap !== gapPx) {
      C.gap = gapPx;
      N.crossU.style.transform = `translateY(${-gapPx - 10}px)`; N.crossD.style.transform = `translateY(${gapPx}px)`;
      N.crossL.style.transform = `translateX(${-gapPx - 10}px)`; N.crossR.style.transform = `translateX(${gapPx}px)`;
    }
    set('crossShow', N.cross, 'display', alive && !scoped && playing ? '' : 'none');
    set('scope', N.scope, 'display', scoped && alive ? 'block' : 'none');
    // hitmarker
    if (hitT > 0) { hitT -= dt; const a = Math.max(0, hitT / 0.25); N.hitm.style.opacity = Math.min(1, a).toFixed(2); N.hitm.style.transform = `scale(${(1 + (hitKind === 'k' ? 0.6 : 0.3) * Math.min(1, a)).toFixed(2)})`; C.hitOff = false; }
    else if (!C.hitOff) { C.hitOff = true; N.hitm.style.opacity = '0'; }
    // damage direction indicators (relative to camera heading)
    const e = game.camera.matrixWorld.elements;
    let rx = e[0], rz = e[2]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    for (const d of dmgInd) {
      if (d.t <= 0) { if (d.on) { d.on = false; d.node.style.opacity = '0'; } continue; }
      d.t -= dt; d.on = true;
      const x = d.dir.x * rx + d.dir.z * rz, y = d.dir.x * -rz + d.dir.z * rx;
      const ang = Math.atan2(x, y);
      d.node.style.transform = `rotate(${ang.toFixed(3)}rad)`; d.node.style.opacity = Math.min(1, d.t).toFixed(2);
    }
    // wave panel
    const wave = game.units?.wave ?? 0, left = game.units?.countAlive?.('tan') ?? 0;
    set('wnum', N.wnum, 'text', `WAVE ${wave}`);
    set('wleft', N.wleft, 'text', String(left));
    if (left > waveTotal) waveTotal = left;
    set('wbar', N.wbar, 'transform', `scaleX(${waveTotal ? (left / waveTotal).toFixed(3) : 0})`);
    // intermission
    const rem = incomingEnd > 0 ? incomingEnd - game.time : -1;
    set('inter', N.inter, 'display', rem > 0 ? 'block' : 'none');
    if (rem > 0) set('interNum', N.interNum, 'text', String(Math.ceil(rem)));
    // objective
    if (objT > 0) objT -= dt;
    set('objShow', N.obj, 'display', objT > 0 ? 'block' : 'none');
    if (objT > 0) set('objBar', N.objBar, 'transform', `scaleX(${Math.max(0, Math.min(1, objProgress)).toFixed(3)})`);
    // death overlay
    const dead = !alive && playing;
    set('dead', N.dead, 'display', dead ? 'flex' : 'none');
    if (dead) set('deadS', N.deadS, 'text', (pl.lives ?? 0) > 0 ? `REDEPLOYING IN ${Math.max(0, pl.respawnTimer ?? 0).toFixed(1)} — ${pl.lives} ${pl.lives === 1 ? 'LIFE' : 'LIVES'} LEFT` : 'NO MORE TOYS IN THE BAG...');
    // re-lock hint (only once the player has actually used pointer lock)
    if (game.input?.locked) everLocked = true;
    set('relock', N.relock, 'display', playing && everLocked && !game.input?.locked && alive ? 'flex' : 'none');
    // bubbles follow heads
    const W = innerWidth, H = innerHeight;
    for (const b of bubbles) {
      if (b.t <= 0) { if (b.vis) { b.vis = false; b.node.style.opacity = '0'; } continue; }
      b.t -= dt;
      const uu = b.unit;
      if (!uu?.position) { b.t = 0; continue; }
      _v.copy(uu.position); _v.y += (uu.height || 1.8) * (uu.crouchScale || 1) + 0.55; _v.project(game.camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { b.node.style.opacity = '0'; b.vis = true; continue; }
      const sx = (_v.x * 0.5 + 0.5) * W - 20, sy = (-_v.y * 0.5 + 0.5) * H - b.h - 10;
      const fade = Math.min(1, b.t * 3, (b.life - b.t) * 8);
      b.node.style.transform = `translate(${sx | 0}px,${sy | 0}px)`; b.node.style.opacity = fade.toFixed(2); b.vis = true;
    }
    // radar @ ~15 Hz
    radarT -= dt; if (radarT <= 0) { radarT = 1 / 15; drawRadar(); }
  }

  return {
    el, update, banner, streak, reset,
    show() { el.classList.remove('pf-hide'); }, hide() { el.classList.add('pf-hide'); },
  };
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
