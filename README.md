# KESSLER

A top-down sword brawler on a cluster of tiny planets with real gravity. You walk on
planet surfaces, dash across the gaps, and every hit *launches* the enemy: into the
next planet for impact damage, into their friends, or past the red ring and into the
void. Kills shatter into debris that keeps orbiting and keeps hitting things, so the
arena gets more dangerous the better you're doing. Hence the name.

**Play:** https://wreckingwheels.com/kessler/

## Controls

The sword game is WASD and clicking. The mouse only matters for the gun, and only if
you turn auto-aim off.

| | Keyboard + mouse | Gamepad |
|---|---|---|
| Move (along the surface) | WASD / arrows | left stick |
| Swing | left click / J | RT / A |
| Dash | space / shift / right click / K | LT / B |
| Swap sword / gun | Q / E / scroll | Y |
| Cycle gun target | Tab / R | X |
| Pause | Esc / P | Start |

- The sword faces the direction you're moving. Swing while flying fast for a long
  **dive-slash** that stays out and hits whatever you pass through.
- **Dash** goes where you're moving and always lifts you off the planet. Swing right
  after for a **dash-strike**: double damage, much harder launch. Invulnerable while dashing.
- **Flying**: WASD in the air steers you but burns fuel (bar under HP). Fuel refills on
  the ground. Dashing is free.
- The **gun** fires a heavy homing slug that launches whatever it hits. Every sword hit
  earns one round (6 max). With auto-aim on it locks the nearest target; Tab cycles.
- Enemies hurt on touch. Only enemies *you* launched take impact damage.

## Architecture

```
shared/   Headless deterministic engine. Pure TS, no DOM. Seeded RNG, fixed 60Hz tick,
          consumes InputFrames, emits GameEvents. Everything gameplay lives here.
client/   Vite + Canvas 2D. Renderer is a pure reader of state; fx.ts turns events
          into particles, sound (ZzFX-style synth), shake and hit-stop.
server/   Express: serves the built client, JSON leaderboard (endless + daily).
scripts/  balance.ts (bot sim over N seeds), playtest.mjs (headless Chrome run with
          screenshots + video), deploy.sh.
test/     vitest on the engine: determinism, physics invariants, bot progress.
```

The sim never touches `Math.random` or wall-clock time, so a seed + input log replays
exactly. The daily challenge is just `hash("kessler-YYYY-MM-DD")`.

## Development

```bash
npm install
npm run dev          # vite on :5174 (/kessler/) + API on :3006
npm test             # engine tests
npm run balance 12   # bot sim, 12 seeds
npm run playtest     # headless Chrome; screenshots + video in .playtest/
```

Debug URL params: `?bot=1` lets the balance bot drive, `?seed=N`, `?wave=N`.

## Deploy

```bash
./scripts/deploy.sh
```
