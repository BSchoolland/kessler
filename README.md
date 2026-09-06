# KESSLER

A top-down sword brawler on a cluster of tiny planets with real gravity. You walk on
planet surfaces, dash across the gaps, and every hit *launches* the enemy: into the
next planet for impact damage, into their friends, or past the red ring and into the
void. Kills shatter into debris that keeps orbiting and keeps hitting things, so the
arena gets more dangerous the better you're doing. Hence the name.

**Play:** https://wreckingwheels.com/kessler/

New here? The menu's **TUTORIAL** (badged until you've done it once) is eight short lessons
on two planets: walk to a beacon, launch, steer across a real gap, the melee sweep, debris,
the melee wave, three grunts at once, one orbiter with the gun. You can't lose it.

## Controls

Keyboard only is the intended way to play. The mouse is optional.

| | Keyboard (+ mouse) | Gamepad |
|---|---|---|
| Move along the surface / steer in space | WASD / arrows | left stick |
| Attack | space / J / left click | RT / A |
| Launch (leave the planet) | shift / K / right click | LT / B |
| Pause | Esc / P | Start |

- **Where you are decides the weapon.** On a planet you have **melee**, a kinetic
  crescent on the nose of the ship. In space you have the **gun**.
- Standing still on a planet you face straight up and melee does a wide overhead
  sweep covering both sides. Moving, you face left or right and melee becomes a
  **wave**: a wall of light two ship-heights tall that runs along the surface ahead
  of you, shoving enemies along its travel, batting enemy shots back and sending
  debris flying. Hits knock enemies *away*.
- **Launch** leaves the planet where you're moving. Ground only, no cooldown, needs
  fuel. Attack right after for a **launch-strike**: double damage, much harder
  knockback. Invulnerable during the burst. A slight drag in space means you can't
  sit in orbit forever.
- **Flying**: WASD in space steers you (visible, audible thrusters) but burns fuel. The
  gauge sits beside the ship. Fuel refills on the ground.
- The **gun** auto-aims at the nearest enemy and fires a heavy homing slug that
  launches whatever it hits. Every melee hit earns one round (6 max). Turn auto-aim off
  in settings to aim with the mouse or right stick.
- Enemies hurt on touch. Only enemies *you* launched take impact damage.

## Architecture

```
shared/   Headless deterministic engine. Pure TS, no DOM. Seeded RNG, fixed 60Hz tick,
          consumes InputFrames, emits GameEvents. Everything gameplay lives here,
          including the scripted tutorial (tutorial.ts) and its slow-motion.
client/   Vite + Canvas 2D. Renderer is a pure reader of state; fx.ts turns events
          into particles, sound (ZzFX-style synth), shake and hit-stop.
server/   Express: serves the built client, JSON leaderboard (endless + daily).
scripts/  balance.ts (bot sim over N seeds), playtest.mjs (headless Chrome run with
          screenshots + video), deploy.sh.
test/     vitest on the engine: determinism, physics invariants, bot progress.
```

The sim never touches `Math.random` or wall-clock time, so a seed + input log replays
exactly.

## Development

```bash
npm install
npm run dev          # vite on :5174 (/kessler/) + API on :3006
npm test             # engine tests
npm run balance 12   # bot sim, 12 seeds
npm run playtest     # headless Chrome; screenshots + video in .playtest/
node scripts/playtest-tutorial.mjs [url]   # scripted run through the tutorial
```

Debug URL params: `?bot=1` lets the balance bot drive, `?seed=N`, `?wave=N`.

## Deploy

```bash
./scripts/deploy.sh
```
