// Prints per-part vertex counts of the procedural soldier (node, no browser).
import { getClassAssets } from '../src/body/model.js';
for (const c of ['rifleman', 'bazooka', 'flamer', 'sniper', 'grenadier']) {
  const a = getClassAssets(c);
  console.log(c, a.verts, Object.fromEntries(Object.entries(a.partGeos).map(([k, g]) => [k, g.attributes.position.count])));
}
