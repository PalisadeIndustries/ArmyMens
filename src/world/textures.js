// Procedural canvas textures for the backyard (all original art, generated at load).
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = false, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Neutral, light grass detail that multiplies the terrain's vertex colours.
export function grassDetailTexture() {
  const [c, g] = cv(512, 512), r = rng(7);
  g.fillStyle = '#d8dccc'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const x = r() * 512, y = r() * 512, l = 150 + r() * 105 | 0, gg = Math.min(255, l + 12);
    g.strokeStyle = `rgba(${l - 20},${gg},${l - 40},${0.35 + r() * 0.4})`;
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y - 4 - r() * 9); g.stroke();
  }
  for (let i = 0; i < 300; i++) { // little clover / dark specks
    g.fillStyle = `rgba(70,95,50,${0.15 + r() * 0.2})`; g.beginPath(); g.arc(r() * 512, r() * 512, 1 + r() * 3, 0, 7); g.fill();
  }
  return tex(c, { repeat: true });
}

export function ginghamTexture() {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#f6efe4'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(196,36,40,0.55)';
  for (let i = 0; i < 4; i++) { g.fillRect(i * 64, 0, 32, 256); g.fillRect(0, i * 64, 256, 32); }
  const r = rng(3);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * 256, r() * 256, 1, 2); }
  return tex(c, { repeat: true });
}

export function sidingTexture() {
  const [c, g] = cv(256, 512), r = rng(11);
  const n = 8, bh = 512 / n;
  for (let i = 0; i < n; i++) {
    const y = i * bh;
    const grd = g.createLinearGradient(0, y, 0, y + bh);
    grd.addColorStop(0, '#f2e6bd'); grd.addColorStop(0.85, '#e4d5a6'); grd.addColorStop(1, '#a8996f');
    g.fillStyle = grd; g.fillRect(0, y, 256, bh);
    for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(120,100,60,${r() * 0.06})`; g.fillRect(r() * 256, y + r() * bh, 20 + r() * 60, 1); }
  }
  return tex(c, { repeat: true });
}

export function woodTexture() {
  const [c, g] = cv(256, 256), r = rng(5);
  g.fillStyle = '#d8b58a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${110 + r() * 40 | 0},${70 + r() * 30 | 0},40,${0.12 + r() * 0.2})`; g.lineWidth = 1 + r() * 3;
    const y = r() * 256; g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 4 + (r() - 0.5) * 3);
    g.stroke();
  }
  for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(90,55,25,0.35)'; g.beginPath(); g.ellipse(r() * 256, r() * 256, 8, 4, 0, 0, 7); g.fill(); }
  return tex(c, { repeat: true });
}

// 4x4 atlas of toy-block faces (cream inset with a coloured glyph).
export const BLOCK_GLYPHS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', '1', '2', '3', '4', '★', '♥', 'Z', '7'];
export function blockAtlasTexture() {
  const [c, g] = cv(512, 512);
  const cols = ['#d23a2e', '#2f62c9', '#e3a91b', '#7a3cb0', '#e06b1f', '#1f9a8a'];
  g.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 16; i++) {
    const x = (i % 4) * 128, y = Math.floor(i / 4) * 128;
    g.fillStyle = '#f4ead2'; roundRect(g, x + 6, y + 6, 116, 116, 14); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 4; roundRect(g, x + 12, y + 12, 104, 104, 10); g.stroke();
    g.fillStyle = cols[i % cols.length];
    g.font = 'bold 84px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(BLOCK_GLYPHS[i], x + 64, y + 70);
  }
  return tex(c);
}

export const BOOK_TITLES = ['GARDENING FOR GIANTS', '1001 LAWN FACTS', 'THE BIG BOOK OF DIRT', 'ADVANCED NAPPING', 'ATLAS OF THE BACKYARD', 'COOKING WITH KETCHUP', 'MYSTERY OF THE LOST SOCK', 'BIRDS & OTHER MENACES'];
export function spineAtlasTexture() {
  const [c, g] = cv(1024, 512);
  g.clearRect(0, 0, 1024, 512);
  for (let i = 0; i < 8; i++) {
    const y = i * 64;
    g.fillStyle = 'rgba(255,230,160,0.95)';
    g.fillRect(12, y + 8, 1000, 4); g.fillRect(12, y + 52, 1000, 4);
    g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(BOOK_TITLES[i], 512, y + 33);
  }
  return tex(c);
}

export function canLabelTexture(kind = 0) {
  const [c, g] = cv(512, 256);
  const pal = [
    { bg: '#c8202a', bg2: '#7d0f15', fg: '#ffffff', name: 'FIZZBANG', sub: 'EXTREME COLA' },
    { bg: '#d9e03a', bg2: '#4f9a2b', fg: '#1b4d17', name: 'LEMON BLAST', sub: 'SOUR SODA' },
    { bg: '#2b5fbf', bg2: '#0f2b66', fg: '#ffe066', name: 'GRAPE ESCAPE', sub: 'PURPLE POP' },
  ][kind % 3];
  g.fillStyle = pal.bg; g.fillRect(0, 0, 512, 256);
  g.fillStyle = pal.bg2;
  g.beginPath(); g.moveTo(0, 170);
  for (let x = 0; x <= 512; x += 16) g.lineTo(x, 170 + Math.sin(x / 512 * Math.PI * 4) * 22);
  g.lineTo(512, 256); g.lineTo(0, 256); g.fill();
  g.fillStyle = '#c9ced4'; g.fillRect(0, 0, 512, 14); g.fillRect(0, 242, 512, 14);
  for (const off of [0, 256]) {
    g.save(); g.translate(off + 128, 110); g.rotate(-0.12);
    g.fillStyle = pal.fg; g.font = 'italic bold 52px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(pal.name, 0, 0);
    g.font = 'bold 20px Arial, sans-serif'; g.fillText(pal.sub, 0, 44);
    g.restore();
  }
  return tex(c);
}

export function flagTexture() {
  const [c, g] = cv(256, 160);
  g.fillStyle = '#3d6e2b'; g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#2b5020'; g.fillRect(0, 0, 256, 18); g.fillRect(0, 142, 256, 18);
  g.fillStyle = '#e8dc8a'; star(g, 128, 82, 46, 19); g.fill();
  g.strokeStyle = '#e8dc8a'; g.lineWidth = 5; g.beginPath(); g.arc(128, 82, 62, 0, 7); g.stroke();
  return tex(c);
}

export function matTexture() {
  const [c, g] = cv(512, 256), r = rng(9);
  g.fillStyle = '#7a5530'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${40 + r() * 60 | 0},${25 + r() * 40 | 0},10,0.5)`; g.fillRect(r() * 512, r() * 256, 1, 3); }
  g.strokeStyle = '#3d2814'; g.lineWidth = 10; g.strokeRect(14, 14, 484, 228);
  g.fillStyle = '#3a2410'; g.font = 'bold 54px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('WIPE YOUR BOOTS', 256, 128);
  return tex(c);
}

// Decal sprites (white-ish where the instance colour should tint them).
export function decalTexture(kind) {
  const S = kind === 'bullet' ? 64 : 256;
  const [c, g] = cv(S, S), r = rng(kind.length * 31);
  const m = S / 2;
  if (kind === 'scorch') {
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = r() * m * 0.45, rad = m * (0.25 + r() * 0.35);
      const grd = g.createRadialGradient(m + Math.cos(a) * d, m + Math.sin(a) * d, 0, m + Math.cos(a) * d, m + Math.sin(a) * d, rad);
      grd.addColorStop(0, 'rgba(14,10,8,0.55)'); grd.addColorStop(1, 'rgba(14,10,8,0)');
      g.fillStyle = grd; g.fillRect(0, 0, S, S);
    }
    for (let i = 0; i < 40; i++) { // streaks
      const a = r() * Math.PI * 2; g.strokeStyle = `rgba(20,14,10,${0.2 + r() * 0.3})`; g.lineWidth = 1 + r() * 3;
      g.beginPath(); g.moveTo(m + Math.cos(a) * m * 0.3, m + Math.sin(a) * m * 0.3); g.lineTo(m + Math.cos(a) * m * (0.6 + r() * 0.35), m + Math.sin(a) * m * (0.6 + r() * 0.35)); g.stroke();
    }
  } else if (kind === 'crater') {
    let grd = g.createRadialGradient(m, m, 0, m, m, m);
    grd.addColorStop(0, 'rgba(30,20,12,0.95)'); grd.addColorStop(0.35, 'rgba(70,48,28,0.9)'); grd.addColorStop(0.55, 'rgba(110,80,50,0.85)');
    grd.addColorStop(0.7, 'rgba(60,42,25,0.6)'); grd.addColorStop(1, 'rgba(40,30,20,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(m, m, m, 0, 7); g.fill();
    for (let i = 0; i < 70; i++) { const a = r() * 7, d = m * (0.55 + r() * 0.42); g.fillStyle = `rgba(${60 + r() * 50 | 0},${40 + r() * 30 | 0},20,${0.5 + r() * 0.5})`; g.beginPath(); g.arc(m + Math.cos(a) * d, m + Math.sin(a) * d, 1 + r() * 5, 0, 7); g.fill(); }
  } else if (kind === 'bullet') {
    let grd = g.createRadialGradient(m, m, 0, m, m, m);
    grd.addColorStop(0, 'rgba(10,8,6,1)'); grd.addColorStop(0.25, 'rgba(20,16,12,0.9)'); grd.addColorStop(0.5, 'rgba(60,50,40,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  } else { // 'melt' / 'splat': irregular white blob, tinted per instance
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    const n = 18;
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, d = m * (0.55 + r() * 0.35); const x = m + Math.cos(a) * d, y = m + Math.sin(a) * d; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.fill();
    for (let i = 0; i < 8; i++) { const a = r() * 7, d = m * (0.6 + r() * 0.25); g.beginPath(); g.arc(m + Math.cos(a) * d, m + Math.sin(a) * d, m * (0.06 + r() * 0.1), 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-atop';
    const grd = g.createRadialGradient(m * 0.8, m * 0.8, 0, m, m, m);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  }
  const t = tex(c);
  return t;
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function star(g, cx, cy, R, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); } g.closePath(); }
