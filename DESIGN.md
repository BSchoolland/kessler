# KESSLER — Design

## Pillars

1. **Knockback is the game.** Damage numbers matter less than *where the enemy ends
   up*. Every hit is a shot: at a planet (impact damage), at a friend (bowling), or
   at the void. The dash-strike is the risk/reward verb that makes the big shots.
2. **The arena remembers.** Kills leave debris that obeys the same gravity as
   everything else. A good run fills the sky with orbiting shrapnel that works for
   you and against you. Bat it with the sword.
3. **Readable danger.** Every enemy attack telegraphs. Orbiter shots draw their line
   first. The boss's pull, slam and throw each have a distinct shape and sound. You
   should always die to something you could have dodged.
4. **Juice everywhere.** Hit-stop, trauma shake, floating numbers, freeze on kills,
   kill labels (SPLAT / BOWLED / LOST TO THE VOID), music intensity tied to threat.

## Physics

- Every planet pulls with the same surface gravity; reach scales with radius². A
  weak pull toward the arena's barycenter brings slow drifters home so the void
  is a punishment for *launches*, not for drifting.
- Grounded movement is "walk, then re-project onto the surface", which makes the
  curved ground free. Leaving the ground is a velocity with an outward component.
- Player dash ignores gravity for its 0.15s, then keeps 42% of its speed: enough
  to clear a gap, not enough to escape a big planet by accident.
- Enemy impacts above 330 u/s deal damage; above 420 u/s a stunned enemy bounces.
  Enemy-enemy collisions above 260 u/s relative speed damage both.

## Enemies

| | role | forces |
|---|---|---|
| Grunt | baseline walker, leaps between planets | spacing |
| Hopper | fast, fragile, constantly leaping | tracking airborne threats |
| Orbiter | circles a planet, shoots gravity-curved shots | leaving the ground / deflecting |
| Bulwark | slow, heavy, 78% knockback resist | dash-strikes, debris, impacts |
| The Accretor (boss, every 5 waves) | pull → slam, rock throws, phase 2 escorts | being airborne at the right moment |

Elites (from wave 4): 1.6× HP, 1.2× speed, gold ring, double score.

## Run structure

Wave → clear → pick 1 of 3 upgrades (rarity-weighted, 18 families) → next wave.
Boss every 5 waves; each boss kill moves you to a new sector with a fresh planet
layout and one more planet. Endless. Score is the leaderboard metric; the daily
challenge shares a seed for everyone.

## Not in v1 (engine is shaped for it)

Online co-op: the sim consumes InputFrames and is deterministic, so lockstep or
server-authoritative play is a transport problem, not an engine rewrite. Player
entity is `entities[0]` by convention in a few places; that's the first thing to
generalize.
