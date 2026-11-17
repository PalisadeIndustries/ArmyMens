// Silly randomly generated operation names. "Operation Soggy Sandbox" etc.
const ADJ = ['Soggy', 'Crusty', 'Sticky', 'Grumpy', 'Lumpy', 'Squeaky', 'Melty', 'Wobbly', 'Bendy', 'Dusty', 'Spicy', 'Moldy',
  'Feral', 'Damp', 'Chunky', 'Rusty', 'Fuzzy', 'Itchy', 'Sunburnt', 'Overcooked', 'Unsupervised', 'Discount', 'Off-Brand',
  'Second-Hand', 'Glow-in-the-Dark', 'Dishwasher-Safe', 'Non-Toxic', 'Lukewarm', 'Furious', 'Clammy', 'Mighty', 'Very Small'];
const NOUN = ['Sandbox', 'Garden Hose', 'Flowerpot', 'Lawn Gnome', 'Sprinkler', 'Juice Box', 'Kiddie Pool', 'Doghouse', 'Mudpie',
  'Birdbath', 'Wheelbarrow', 'Tupperware', 'Crayon', 'Shoebox', 'Popsicle', 'Picnic Blanket', 'Rain Gutter', 'Garden Gnome',
  'Rubber Duck', 'Sock Drawer', 'Grill Lid', 'Welcome Mat', 'Hula Hoop', 'Lunchbox', 'Ant Hill', 'Compost Heap', 'Tricycle',
  'Bottle Cap', 'Petunia', 'Sidewalk Chalk', 'Water Balloon', 'Lawn Flamingo'];
const SUFFIX = ['', '', '', '', ' II', ' Redux', ': The Re-Melting', ' (Again)', ' Junior', ': Recess Edition'];
const pick = (a) => a[(Math.random() * a.length) | 0];
export function operationName() {
  let a = pick(ADJ), b = pick(ADJ);
  const two = Math.random() < 0.18 && a !== b;
  return `Operation ${two ? a + ' ' + b : a} ${pick(NOUN)}${pick(SUFFIX)}`;
}
