// Original bark / radio-chatter lines. kind -> lines. Used by audio.bark(unit, kind) when no text is given.
// Kinds other teams may emit: spotted, charge, reload, grenade, hit, death, burning, limb, kill, flank, retreat,
// cover, medic, taunt, objective, wave_start, wave_clear, low_hp, sniper, rocket, panic, idle.
export const BARKS = {
  spotted: ['Contact! Tan boys, twelve o\'clock!', 'Eyes up, plastic incoming!', 'I see \'em! They\'re beige and ugly!', 'Hostiles by the flowerpot!', 'Got movement in the grass!', 'Enemy toys! Lots of \'em!'],
  charge: ['FOR THE TOY BOX!', 'Charge! Last one there gets recycled!', 'Go go go! Mind the dog!', 'Move it, you lumps of polymer!', 'Hit \'em before the sprinkler comes on!', 'No retreat! We can\'t bend that way!'],
  reload: ['Reloading!', 'Changing mags, cover me!', 'Hold on, I\'m out!', 'Reload! Somebody shoot something!', 'Clip\'s dry!'],
  grenade: ['Frag out!', 'Pineapple delivery!', 'Catch, beige boy!', 'Grenade! Hug the dirt!', 'Fire in the sandbox!'],
  hit: ['Ow! That\'s gonna leave a dent!', 'I\'m hit! Mostly cosmetically!', 'Argh! My paint!', 'Took one in the mold line!', 'That one stung!'],
  death: ['Tell my mold I loved her...', 'I\'m... going back... in the bin...', 'Not like this... not in the yard...', 'Bury me with the marbles...', 'Gaaah!', 'Ugh... choking hazard...'],
  burning: ['I\'M MELTING! I\'M MELTIIING!', 'HOT HOT HOT HOT!', 'Somebody get the hose!', 'Not the face! It\'s my only face!', 'I smell like a burnt lunchbox!', 'AAAAH MY FINISH!'],
  limb: ['My arm! Has anyone seen my arm?!', 'It\'s just a flesh... er, plastic wound!', 'I\'ll walk it off! ...Hop it off!', 'Glue! Somebody get the glue!', 'That snapped clean off!', 'I needed that leg!'],
  kill: ['Scratch one tan!', 'Back in the box!', 'Recycled!', 'He\'s melted down!', 'Another one for the lawnmower!', 'Snapped him!', 'Return to sender!'],
  flank: ['Flank left! Around the gnome!', 'Get around their side!', 'Hit \'em from the hedge!', 'Sneaky time, boys!'],
  retreat: ['Fall back! Fall back!', 'Tactical scoot!', 'Back to the porch!', 'Strategic run-away!'],
  cover: ['Get behind something!', 'Cover! Use the bucket!', 'Find a brick and hide behind it!', 'Heads down!'],
  medic: ['Medic! Bring the superglue!', 'Need a patch-up here!', 'Anybody got tape?!'],
  taunt: ['Come get some, khaki!', 'You fight like a bendy straw!', 'Your mother was a beige crayon!', 'I\'ve seen tougher Lego!', 'Hah! Made in a cheaper factory!', 'Is that all? I\'ve been chewed by dogs worse!'],
  objective: ['They\'re on the flag! Get them off!', 'Defend the flag, you plastic heroes!', 'Tan\'s grabbing our colors!', 'Flag\'s under attack! Move!'],
  wave_start: ['HQ to all units: tan army inbound. Look lively.', 'Command here. Big wave coming. Try not to melt.', 'Incoming hostiles! Every toy to the line!', 'Radar\'s full of beige. Lock and load!', 'Here they come again! Fix bayonets... we don\'t have bayonets!'],
  wave_clear: ['Wave cleared. Somebody sweep up the arms.', 'That\'s the lot! Take five, soldiers.', 'Area secure. Mostly. Smells like burnt plastic.', 'Good work! Reload and hydrate. Wait, we can\'t drink.'],
  low_hp: ['I\'m falling apart here!', 'Running on fumes and glue!', 'Need a breather!'],
  sniper: ['Sniper! Keep your heads down!', 'Glint in the tree line!'],
  rocket: ['ROCKET!', 'Incoming tube!', 'Duck and cover!'],
  panic: ['I want my mommy\'s toybox!', 'This isn\'t in the box art!', 'Too many of \'em!'],
  idle: ['Quiet... too quiet.', 'Anybody else hear a lawnmower?', 'I hope the kid doesn\'t come back.', 'My base is itchy.'],
  player_spawn: ['Fresh out of the package! Get in there!', 'Reinforcements! Shiny new trooper on the field!', 'Back on your base, soldier!'],
  player_death: ['Man down! We need a new one from the bag!', 'Lost our best toy!', 'He got snapped! Send another!'],
};
// tan army speaks with a different flavor for some kinds
export const TAN_BARKS = {
  spotted: ['Green menace, dead ahead!', 'Spotted a little green weirdo!', 'Contact, contact! Lime-flavored!'],
  charge: ['FOR THE BEIGE!', 'Khaki never quits!', 'Advance! Take their flag!', 'Overwhelm them! We\'ve got a whole bag!'],
  kill: ['Lime-flavored down!', 'Green is the new dead!', 'Another pickle snapped!'],
  taunt: ['You look like a pea pod!', 'Greenie go home!', 'We\'re the deluxe edition!'],
};
export function pickBark(kind, team) {
  const set = (team === 'tan' && TAN_BARKS[kind]) || BARKS[kind] || BARKS.taunt;
  return set[(Math.random() * set.length) | 0];
}
