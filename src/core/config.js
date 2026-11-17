// Shared constants. Units: meters, seconds. A soldier is ~1.8 "plastic meters" tall.
export const TEAMS = {
  green: { id: 'green', name: 'Green Army', color: 0x3f6b2a, enemy: 'tan' },
  tan:   { id: 'tan',   name: 'Tan Army',   color: 0xc2a46b, enemy: 'green' },
};
export const GRAVITY = 18;
export const SOLDIER_HEIGHT = 1.8;
export const SOLDIER_RADIUS = 0.4;
export const EYE_HEIGHT = 1.6;
// Body zones. Every soldier model exposes these part names.
export const ZONES = ['head', 'torso', 'larm', 'rarm', 'lleg', 'rleg'];
