// Persistent player settings. `game.settings` is a plain object other teams read every frame:
//   sensitivity (multiplier, 1 = default), volume (0..1 master), fov (degrees, hip-fire base FOV),
//   plus music (0..1), voice (bool, speechSynthesis barks), subtitles (bool), invertY (bool).
// Created by whichever of createAudio/createUI runs first so it exists before the player is built.
const KEY = 'plasticFront.settings.v1';
export const DEFAULT_SETTINGS = { sensitivity: 1, volume: 0.8, music: 0.55, fov: 75, voice: true, subtitles: true, invertY: false };

export function ensureSettings(game) {
  if (game.settings) return game.settings;
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { stored = {}; }
  const s = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (typeof stored[k] === typeof DEFAULT_SETTINGS[k]) s[k] = stored[k];
  s.sensitivity = clamp(s.sensitivity, 0.1, 4); s.volume = clamp(s.volume, 0, 1); s.music = clamp(s.music, 0, 1); s.fov = clamp(s.fov, 55, 110);
  game.settings = s;
  return s;
}

export function saveSettings(game) {
  try { localStorage.setItem(KEY, JSON.stringify(game.settings)); } catch { /* private mode etc. */ }
  game.events?.emit('settings:changed', { settings: game.settings });
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, Number.isFinite(v) ? v : a)); }
