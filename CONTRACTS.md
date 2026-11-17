# Plastic Front — module contracts

Original mass-combat FPS: plastic green army men vs. tan army men, battling across a giant backyard.
Three.js + Vite, plain ES modules, no other runtime deps. Everything is procedural (no external asset files)
unless a team adds small original assets under `public/`.

## Ownership (one team per directory — do not edit other teams' files)
| Dir | Team | Factory |
|---|---|---|
| `src/core/` | Lead (integration). `classes.js` is co-owned by Combat. | `Game` |
| `src/world/` | World & Visuals | `createWorld(game)` |
| `src/units/` | Units, AI & Waves | `createUnits(game)`, `Soldier` |
| `src/combat/`, `src/player/` | Weapons, Classes & Player | `createCombat(game)`, `createPlayer(game)` |
| `src/body/` | Body Damage & Corpses | `createBodies(game)` |
| `src/ui/`, `src/audio/` | UI, Audio & Moxie | `createUI(game)`, `createAudio(game)` |

Need something from another team's module? Code defensively against the contract below (`game.x?.y?.()`),
and list the request in your final report. The lead integrates.

## `game` (src/core/game.js)
`scene, camera, renderer, events, input, state ('menu'|'playing'|'paused'|'gameover'), time, dt, timeScale`,
`start({classId})`, `pause()`, `resume()`, `gameOver(info)`, subsystems `world, units, combat, bodies, player, ui, audio`.
Update order each playing frame: world → units → player → combat → bodies → audio; ui.update always runs.
`window.__game` is exposed for debugging/tests.

## World — `game.world`
- `bounds {minX,maxX,minZ,maxZ}`, `colliders: [{min:Vector3,max:Vector3,mesh?}]` (AABBs)
- `spawnPoints.green[] / .tan[]` (Vector3), `objective {position, radius}` (green's flag the tan army wants)
- `getHeight(x,z)`, `getFloor(x,y,z)` (walkable top under a point), `raycast(origin, dir, maxDist) → {point,normal,dist,object}|null`
- `resolveCircle(pos, radius, height)` pushes a feet-position out of colliders, clamps to bounds
- `hasLineOfSight(a,b)`, optional `coverPoints: [{position, normal}]` for AI, `update(dt)`, `idleUpdate(dt)` (menu backdrop)
- Optional `addScorch(point, radius)` / `addDecal(point, normal, kind)` for persistent ground marks.

## Units — `game.units`
- `list` (all live soldiers incl. the player), `wave`, `spawn({team,classId,position,isPlayer}) → Soldier`
- `query(pos, radius, filter)`, `nearestEnemy(unit, maxDist)`, `countAlive(team)`, `reset()`, `update(dt)`
- Dead units are removed from `list` after death (the body system owns their corpses). The player's Soldier stays.
- `Soldier` fields: `id, team, classId, cls, isPlayer, position (feet), velocity, yaw (0=+z), pitch, radius, height,
  crouchScale, hp, maxHp, alive, limbs{head,torso,larm,rarm,lleg,rleg: bool}, onFire, anim{state,phase,aimPitch},
  weapons[], weaponIndex, weapon (getter), ai, kills, model`; methods `eyePosition(out)`, `forward(out)`, `takeDamage(info)`, `syncModel(dt)`.

## Combat — `game.combat`
- `WEAPONS` (src/combat/weapons.js) defs include `kind ('hitscan'|'projectile'|'throw'|'flame'), damage, rpm, mag, reserve, reload, spread, range, auto, aiRange, aiBurst, aiSpread`, optional `radius, speed, fuse`.
- `createWeaponState(id) → {id, def, ammo, reserve, cooldown, reloading}`, `tickWeapon(ws, dt)`, `reload(ws)`
- `tryFire(shooter, ws, origin, dir, {spreadMul, extraSpread}) → bool` — used by both player and AI
- `hitscan(shooter, origin, dir, maxDist)`, `raycastUnits(origin, dir, maxDist, ignore) → {unit,zone,point,dist}|null`
- `explode(point, radius, damage, source, opts)`, `update(dt)`
- Classes in `src/core/classes.js`: ids `rifleman, bazooka, flamer, sniper, grenadier` (AI relies on these ids).

## Bodies — `game.bodies`
- `createSoldierModel(team, classId) → {root, parts:{head,torso,larm,rarm,lleg,rleg} (pivot Groups), weaponMount, team, classId}`
- `poseModel(model, anim, dt, unit)` — anim.state: `'idle'|'run'|'aim'|'crouch'|'prone'|'throw'|'panic'` (burning), anim.phase, anim.aimPitch
- `hitTest(unit, origin, dir, maxDist) → {zone, point, dist}|null`
- `applyDamage(unit, info) → {damage, killed, limbLost}`; info: `{amount, type:'bullet'|'explosive'|'fire'|'melee', zone?, point?, dir?, force?, source?}`
- `spawnCorpse(unit, info)` — takes ownership of `unit.model` (sets `unit.model = null`). Corpses persist all match.
- `corpses` (array), `update(dt)`

## Player — `game.player`
`unit, classId, lives, respawnTimer, setClass(id), spawn(), update(dt)`. Optional `viewmodel`, `isADS`, `hitmarker`.

## UI / Audio
- `game.ui.update(dt)`; UI listens to events. Must hide the menu on `game:start` (tests call `game.start()` directly).
- `game.audio.play(name, {position?, volume?, unit?})`, `game.audio.bark(unit, kind)`, `update(dt)`.

## Events (`game.events.on/emit`)
| event | payload |
|---|---|
| `game:ready`, `game:start {classId}`, `game:pause`, `game:resume`, `game:over {reason, wave}` | |
| `wave:start {wave, enemies}`, `wave:cleared {wave}`, `wave:incoming {wave, in}` | |
| `unit:spawned {unit}`, `unit:damaged {unit, info, damage}`, `unit:killed {unit, killer, info}` | |
| `unit:limbLost {unit, zone, info}`, `unit:ignited {unit}` | |
| `weapon:fire {unit, weapon, origin, dir}`, `weapon:reload {unit, weapon}`, `impact {point, normal, kind}` | |
| `explosion {point, radius, source}`, `projectile:spawn {kind, position}` | |
| `player:spawn {unit}`, `player:died {unit}`, `player:hit {unit, damage, fromDir}`, `player:killstreak {count}` | |
| `bark {unit, kind, text}` (radio chatter, screams), `objective:contested {progress}`, `objective:lost` | |

## Testing
`node tools/smoke.mjs --port <unique> --seconds 30 --shot <png>` boots headless Chromium (no pointer lock, player idle),
prints wave/unit/corpse stats + console errors; exit code 1 on any error. Also run `npx vite build`.
Headless uses SwiftShader, so FPS numbers are only relative.
