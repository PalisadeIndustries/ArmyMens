# Plastic Front

An original browser 3D mass-combat FPS: green plastic army men hold the flag against huge waves of the tan army,
fought across a giant backyard. Persistent bodies, limbs that snap off, plastic that melts, and lots of attitude.

```bash
npm install
npm run dev     # open the printed URL, pick a class, DEPLOY!
npm run build   # static build in dist/
```

## Controls
WASD move · Shift sprint (hold breath when scoped) · Space jump · C/Ctrl crouch · Z prone · Mouse fire · Right mouse aim
R reload · 1/2/wheel switch weapon · G cook & throw grenade · V melee bash · Q class ability · Esc pause

## Classes
| Class | Main | Side | Q ability |
|---|---|---|---|
| Rifleman | M1 Plastic | Pineapple grenades | Rally Cry |
| Bazooka | Tube Launcher | Snub Pistol | Rocket Barrage |
| Flamethrower | Hot Glue Gun | Snub Pistol | Napalm Burst |
| Sniper | Long Tom | Snub Pistol | Spotter Mark |
| Grenadier | Tommy Toy | Pineapple grenades | Cluster Bomb |

## Game
Defend the flag in the sandbox fort. Each wave is bigger (≈20 tan in wave 1, 150+ on the field later), with special
waves (Flamer Rush, Sniper Line, Bazooka Barrage, Pineapple Party, Beige Blitz) and an officer boss every 5th wave.
You lose if the tan army holds the flag, or you run out of lives (3; topped up every 3rd wave).

## Code
Three.js + Vite, all geometry/textures/audio procedural. One directory per subsystem: see [CONTRACTS.md](CONTRACTS.md).

## Tests (headless Chromium)
- `node tools/sim-test.mjs --seconds 300 [--wave 10] [--class flamer] [--shots dir]` — steps the whole game at 30 Hz with an autoplaying player; reports waves, units, corpses, sim cost, errors.
- `node tools/smoke.mjs` — real-time boot check. Team suites: `tools/combat-test.mjs`, `tools/body-test.mjs`, `tools/ui-test.mjs`, `tools/units-sim.mjs`, `tools/world-shots.mjs`, `tools/aerial-shot.mjs`.
