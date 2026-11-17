// Soldier classes, shared by the player and AI. Owned by the combat/player team.
// weapons: ids into src/combat/weapons.js. Slot 0 = primary, 1 = secondary/throwable.
// ability: class special (Q for the player). Executed by game.combat.useAbility(unit) — AI may call it too.
//   { id, name, cooldown (s), desc }
// grenades: quick-throw (G) grenades the player carries when the class has no grenade slot.
// armor: incoming damage multiplier hint (1 = normal). sprint: sprint speed multiplier.
export const CLASSES = {
  rifleman: {
    id: 'rifleman', name: 'Rifleman', hp: 100, speed: 5.0, sprint: 1.6, weapons: ['rifle', 'grenade'], grenades: 0,
    blurb: 'Reliable. Plastic. Expendable. Accurate semi-auto and a fistful of pineapples.',
    ability: { id: 'rally', name: 'Rally Cry', cooldown: 30, desc: 'Heals nearby allies and boosts their rate of fire and accuracy for 8s.' },
  },
  bazooka: {
    id: 'bazooka', name: 'Bazooka', hp: 115, speed: 4.4, sprint: 1.5, weapons: ['bazooka', 'pistol'], grenades: 1,
    blurb: 'Turns squads into confetti. Mind the backblast.',
    ability: { id: 'barrage', name: 'Rocket Barrage', cooldown: 26, desc: 'Ripples off four mini-rockets in a spread.' },
  },
  flamer: {
    id: 'flamer', name: 'Flamethrower', hp: 125, speed: 4.6, sprint: 1.5, weapons: ['flamethrower', 'pistol'], grenades: 1,
    blurb: 'Smells like a melted lunchbox. Sets toys ablaze up close.',
    ability: { id: 'napalm', name: 'Napalm Burst', cooldown: 22, desc: 'Lobs sticky glue-napalm that carpets the ground in fire.' },
  },
  sniper: {
    id: 'sniper', name: 'Sniper', hp: 80, speed: 5.2, sprint: 1.65, weapons: ['sniper', 'pistol'], grenades: 1,
    blurb: 'One shot. One less toy. Bullets punch through two soldiers.',
    ability: { id: 'spotter', name: 'Spotter Mark', cooldown: 24, desc: 'Marks enemies ahead for 10s; marked toys take +50% damage from everyone.' },
  },
  grenadier: {
    id: 'grenadier', name: 'Grenadier', hp: 100, speed: 4.8, sprint: 1.55, weapons: ['smg', 'grenade'], grenades: 0,
    blurb: 'Pulls pins, not punches. Spray-and-pray with explosive backup.',
    ability: { id: 'cluster', name: 'Cluster Bomb', cooldown: 20, desc: 'A grenade that bursts into a carpet of bomblets.' },
  },
};
export const CLASS_IDS = Object.keys(CLASSES);
