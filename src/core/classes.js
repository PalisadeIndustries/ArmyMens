// Soldier classes, shared by the player and AI. Owned by the combat/player team.
// weapons: ids into src/combat/weapons.js. Slot 0 = primary, 1 = secondary/throwable.
export const CLASSES = {
  rifleman: { id: 'rifleman', name: 'Rifleman', hp: 100, speed: 5.0, weapons: ['rifle', 'grenade'], blurb: 'Reliable. Plastic. Expendable.' },
  bazooka:  { id: 'bazooka',  name: 'Bazooka',  hp: 110, speed: 4.4, weapons: ['bazooka', 'pistol'], blurb: 'Turns squads into confetti.' },
  flamer:   { id: 'flamer',   name: 'Flamethrower', hp: 120, speed: 4.6, weapons: ['flamethrower', 'pistol'], blurb: 'Smells like a melted lunchbox.' },
  sniper:   { id: 'sniper',   name: 'Sniper',   hp: 80,  speed: 5.2, weapons: ['sniper', 'pistol'], blurb: 'One shot. One less toy.' },
  grenadier:{ id: 'grenadier',name: 'Grenadier',hp: 100, speed: 4.8, weapons: ['smg', 'grenade'], blurb: 'Pulls pins, not punches.' },
};
export const CLASS_IDS = Object.keys(CLASSES);
