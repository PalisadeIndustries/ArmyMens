// Radio chatter & screams for AI soldiers. Emits `bark {unit, kind, text, team, priority}`; UI shows it, Audio voices it.
// All lines are original. {name} = a fallen/affected buddy's surname, {foe} = enemy team nickname.

export const SURNAMES = [
  'Jenkins', 'Dobbs', 'Pruitt', 'Mulvaney', 'Okafor', 'Haskins', 'Tibbs', 'Lundqvist', 'Moreno', 'Kowalski',
  'Fitch', 'Barnaby', 'Duffy', 'Rourke', 'Pemberton', 'Castillo', 'Nakamura', 'Briggs', 'Holloway', 'Tubbs',
  'Grubb', 'McCready', 'Pickett', 'Sprockett', 'Waddell', 'Ferris', 'Delgado', 'Quimby', 'Ostrowski', 'Bixby',
  'Hollis', 'Stamper', 'Vance', 'Kettering', 'Pugh', 'Abernathy', 'Mbeki', 'Larkin', 'Soto', 'Wexley',
];
export const OFFICERS = [
  { name: 'Sergeant Sprue', title: 'SERGEANT SPRUE', sub: 'Snapped off the frame and mad about it' },
  { name: 'Major Mold-Line', title: 'MAJOR MOLD-LINE', sub: 'Has a seam right down the middle of his temper' },
  { name: 'Colonel Flashing', title: 'COLONEL FLASHING', sub: 'Excess plastic. Excess attitude.' },
  { name: 'Sergeant Bucketbase', title: 'SERGEANT BUCKETBASE', sub: 'Never once tipped over' },
  { name: 'General Khakimus', title: 'GENERAL KHAKIMUS', sub: 'Biggest toy in the bag, and he knows it' },
];

const FOE = { green: ['tan', 'beige boys', 'khakis', 'sand-pants'], tan: ['greenies', 'pickles', 'lime-boys', 'pea pods'] };

// kind -> { green: [...], tan: [...], any: [...] }
const L = {
  spotted: {
    green: ['Movement by the garden hose! Tan, and lots of it!', 'Beige on the horizon! Wake up, people!', 'Contact! They brought the whole bag this time!', 'I got {foe} sneaking through the clover!'],
    tan: ['Greenies spotted! Smell that pickle stink!', 'Lime-flavored targets ahead!', 'Look at \'em, standing there like garnish!', 'Enemy veggies at range!'],
  },
  charge: {
    green: ['Up and at \'em! Our bases don\'t bend backwards!', 'CHARGE! Last one there gets left in the sandbox!', 'Forward! Show \'em what quality control looks like!', 'Move it, molded heroes!', 'Bayonets! ...Pretend bayonets! GO!'],
    tan: ['TAKE THE FLAG! Khaki ever forward!', 'Rush \'em! There\'s two bags of us for every one of them!', 'BEIGE TIDE, ROLL OUT!', 'Charge! Last one to the flag gets used as a doorstop!', 'Overrun the pickles!', 'Nothing left to lose but our paint! CHARGE!'],
  },
  cover: {
    green: ['Get behind the brick!', 'Cover! Hug that flowerpot like it\'s your mama!', 'Heads down, chins up! ...Wait, heads down!', 'Find something solid and pray it\'s not a sponge!'],
    tan: ['Duck behind the juice box!', 'Cover, you beige dummies!', 'Hide! Look like a rock! A tan rock!', 'Behind the gnome! He\'s neutral!'],
  },
  suppressed: {
    any: ['I can\'t lift my head! Literally, it\'s glued!', 'They got us pinned like a poster!', 'Too much lead! Too much lead!', 'Pinned down! Somebody do something heroic!', 'Rounds snapping everywhere! My finish!', 'Whoa whoa whoa — friendly yard, FRIENDLY YARD!'],
  },
  grenade: {
    green: ['Pineapple, special delivery!', 'Frag out! Plug your ears — oh right, no ears!', 'Grenade! Somebody catch that! Not you!', 'Fire in the sandbox!'],
    tan: ['Pin\'s out! Party favors for the pickles!', 'Catch, greenies!', 'Here\'s a little present from the beige side!', 'Boom-berry incoming!'],
  },
  rocket: {
    any: ['Tube\'s hot! Backblast clear!', 'Rocket away! Wave bye-bye!', 'One express ticket to confetti town!', 'Say cheese, cluster-boys!'],
  },
  medic: {
    any: ['MEDIC! Bring the superglue!', 'Corpsman! I\'m leaking... uh, nothing, but it hurts!', 'I need tape! Duct, masking, I\'m not picky!', 'Somebody tell the kid to fix me!', 'Am I dented? Be honest. Am I dented?'],
  },
  burning: {
    any: ['I\'M MELTING! I\'M MELTIIIING!', 'HOT HOT HOT HOT HOT!', 'Somebody turn on the sprinkler!', 'MY FACE IS DRIPPING!', 'I smell like a microwave dinner!', 'AAAH! I\'M A CANDLE NOW!', 'Not the paint job! NOT THE PAINT JOB!', 'Stop, drop and— I can\'t bend!'],
  },
  limb: {
    any: ['I can\'t feel my peg!', 'Where\'s my arm?! Has anyone seen my arm?!', 'It\'s just a plastic wound! Mostly!', 'Somebody grab that leg, it\'s still under warranty!', 'Snapped clean off! Like a cheap action figure!', 'Ow! That was my good arm! ...They were both my good arm!', 'I\'m gonna need the glue! The SUPERglue!'],
  },
  crawl: {
    any: ['I\'ll crawl there! I\'m not proud!', 'Legs are overrated anyway!', 'Inch by inch, baby!', 'Who needs legs when you\'ve got spite?!', 'Still in this! Lower to the ground, is all!'],
  },
  unarmed: {
    any: ['MY GUN ARM! I CAN\'T SHOOT! AAAAH!', 'No arm! No gun! NO PROBLEM — I\'M RUNNING!', 'I\'m a non-combatant now! Diplomatic immunity!', 'Waaaaah! Somebody hold my weapon! And my hand!', 'Can\'t salute! Can\'t shoot! Can SCREAM!'],
  },
  mandown: {
    green: ['They melted {name}!', '{name}\'s down! Somebody grab his helmet!', 'Nooo! {name} still owed me a bottle cap!', 'They snapped {name} in half!', '{name}! Back in the bin, buddy...'],
    tan: ['They got {name}!', '{name}\'s been pickled!', 'Man down! {name}\'s just a puddle now!', 'Poor {name}... he was almost the right shade of khaki.'],
  },
  kill: {
    green: ['Back in the toy box, khaki!', 'Scratch one beige!', 'He\'s recycled!', 'Return to sender!', 'That one\'s for {name}!', 'Melted and delivered!', 'Another one for the lost-and-found!'],
    tan: ['Pickle\'s pickled!', 'Green goes down easy!', 'Another lime squeezed!', 'Hah! Snapped like a crayon!', 'That\'s what you get for being green!'],
  },
  retreat: {
    green: ['Fall back! Fall back to the flag!', 'Tactical scoot! Back to the line!', 'Retreat! Regroup! Re-glue!'],
    tan: ['RETREAT! This isn\'t in the box art!', 'Fall back! Strategic running-away!', 'Everybody run! Fast but brave-looking!', 'Back! Back to the sandbox!'],
  },
  flank: {
    green: ['Swing around the hedge! Catch \'em sideways!', 'Flank \'em! Nobody guards their elbows!'],
    tan: ['Flanking! Around the gnome! Go quietly! QUIETLY!', 'Side door, boys! Hit \'em in the ribs!', 'Go around! They never look left!'],
  },
  reload: {
    any: ['Reloading! Look busy!', 'Changing mags!', 'Out! Cover me!', 'Hold on, stuffing more plastic in here!'],
  },
  taunt: {
    green: ['Come on, khaki! You fight like a bendy straw!', 'Is that the best the discount aisle can do?', 'I\'ve been chewed by dogs tougher than you!', 'Tan? More like TAN-trum!'],
    tan: ['You greens look like spilled peas!', 'We\'re the deluxe edition, pickle!', 'Your paint\'s chipping, greenie!', 'Hey green! Your mama was a frog!', 'Surrender now and we\'ll only melt you a little!'],
  },
  objective: {
    green: ['They\'re on our flag! Get them OFF!', 'Flag\'s being touched by beige hands! Unacceptable!', 'Defend the colors! DEFEND THE COLORS!'],
    tan: ['Flag\'s ours! Hold it! HOLD IT!', 'Plant your bases, boys! Don\'t let \'em budge us!', 'We\'re on the flag! Somebody get a picture!'],
  },
  promote: {
    any: ['Guess I\'m in charge now. Great. Follow me, I guess!', 'Squad\'s mine now! Nobody panic! ...I\'m panicking.', 'New boss! Same plastic! On me!'],
  },
  boss: {
    tan: ['LISTEN UP, MAGGOTS! I\'ve got more plastic in my boot than you have in your whole squad!', 'I was molded for this! Every one of you greens is going back in the bag!', 'Nobody leaves this yard until that flag is BEIGE!', 'You call that shooting? I\'ve been hit harder by a dandelion!', 'Keep firing, greenie! I\'m double-thick polymer!'],
  },
  panic: {
    any: ['Too many of \'em! TOO MANY!', 'This isn\'t in the instruction sheet!', 'I want to go back to my blister pack!', 'Mommyyyyy! ...The kid\'s mommy! Anyone\'s!'],
  },
  hit: {
    green: ['Ow! That\'s gonna leave a dent!', 'Hit! Just a scuff! Keep going!', 'They nicked my paint job!'],
    tan: ['Ack! Right in the mold seam!', 'I\'m hit! Somebody sand that down!', 'Ow ow ow, that\'s factory-fresh plastic!'],
  },
  reinforce: {
    green: ['Fresh troops from the bag! Fall in!', 'Reinforcements on the line! Still smell like the factory!', 'Squad reporting! Where do you want us, sir?'],
    tan: ['More beige coming up the yard!'],
  },
};

const RADIO = new Set(['charge', 'retreat', 'flank', 'boss', 'objective', 'reinforce', 'promote']);
const URGENT = new Set(['burning', 'limb', 'boss', 'unarmed', 'objective']);
const KIND_CD = { burning: 0.6, limb: 0.8, boss: 4, mandown: 1.4, kill: 1.6, suppressed: 2.5, taunt: 3, spotted: 4, reinforce: 6, objective: 4 };
const PRIORITY = { boss: 3, burning: 2, limb: 2, unarmed: 2, objective: 2, charge: 1, retreat: 1, mandown: 1, grenade: 1, rocket: 1 };

export function createBarker(game) {
  const kindT = new Map();
  const recent = new Map();
  let tokens = 3, lastT = 0;
  const camPos = game.camera?.position;

  function pick(kind, team) {
    const set = L[kind];
    if (!set) return null;
    const arr = set[team] || set.any || set.green || set.tan;
    if (!arr?.length) return null;
    let rec = recent.get(kind); if (!rec) { rec = []; recent.set(kind, rec); }
    let line = arr[(Math.random() * arr.length) | 0];
    for (let tries = 0; tries < 4 && rec.includes(line); tries++) line = arr[(Math.random() * arr.length) | 0];
    rec.push(line); if (rec.length > Math.min(4, arr.length - 1)) rec.shift();
    return line;
  }

  const api = {
    lines: L,
    // opts: { chance, force, vars: {name}, distance }. Returns the text if emitted.
    bark(unit, kind, opts = {}) {
      if (!unit || unit.isPlayer) return null;
      const now = game.time;
      if (opts.chance != null && Math.random() > opts.chance) return null;
      // token bucket refill
      tokens = Math.min(3, tokens + (now - lastT) / 0.75); lastT = now;
      const urgent = URGENT.has(kind) || opts.force;
      if (!urgent && tokens < 1) return null;
      if ((unit._barkT ?? -99) > now) return null;
      if ((kindT.get(kind) ?? -99) > now) return null;
      // far-away soldiers only chatter on the radio
      if (!RADIO.has(kind) && camPos && !opts.force) {
        const dx = unit.position.x - camPos.x, dz = unit.position.z - camPos.z;
        if (dx * dx + dz * dz > (urgent ? 90 * 90 : 65 * 65)) return null;
      }
      let text = pick(kind, unit.team);
      if (!text) return null;
      const vars = opts.vars || {};
      if (text.includes('{name}')) text = text.replace('{name}', vars.name || SURNAMES[(Math.random() * SURNAMES.length) | 0]);
      if (text.includes('{foe}')) { const f = FOE[unit.team] || FOE.green; text = text.replace('{foe}', f[(Math.random() * f.length) | 0]); }
      tokens = Math.max(0, tokens - 1);
      unit._barkT = now + (urgent ? 1.6 : 3.5 + Math.random() * 2);
      kindT.set(kind, now + (KIND_CD[kind] ?? 2.0));
      game.events.emit('bark', { unit, kind, text, team: unit.team, priority: PRIORITY[kind] ?? 0, radio: RADIO.has(kind) });
      return text;
    },
    reset() { kindT.clear(); recent.clear(); tokens = 3; lastT = 0; },
  };
  return api;
}
