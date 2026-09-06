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

## Input philosophy (after the first playtest)

Ben's read: the sword game should be WASD and clicking, nothing else. So the sword
faces movement, the dash goes where you're moving and always lifts off, and aiming
only exists for the gun, where auto-aim with a cycle button is the default and the
mouse is the opt-in. Enemies hurt on touch instead of swinging; that reads better
when everyone is running around a circle.

Flying was overpowered (enemies couldn't reach you), so air control burns fuel that
only refills on the ground. Dash stays free so the gap-crossing verb is never gated.

## Melee and gun

Round two of Ben's feedback made it positional: melee (called the edge in the code) is the weapon on a planet,
the gun is the weapon in space, and there is no swap. Standing still you face up and
sweep both sides; moving you face sideways and launch. Auto-aim always takes the
nearest enemy. Shift dashes, space attacks, so the whole game is keyboard-only.

The gun is fed by the ground: standing on a planet gives one round back every 2s. The gun fires a fast slug that launches on hit with more
knockback than a normal swing, at range, with gravity drop. It exists for the two
things the sword can't do: reach orbiters without leaving the ground, and line
up a launch from the far side of a gap. Empty gun clicks and says so. Swapping is
instant and cancels a wind-up, not an active swing.

## Physics

- Every planet pulls with the same surface gravity; reach scales with radius². A
  weak pull toward the arena's barycenter brings slow drifters home so the void
  is a punishment for *launches*, not for drifting.
- Grounded movement is "walk, then re-project onto the surface", which makes the
  curved ground free. Leaving the ground is a velocity with an outward component.
- Player dash ignores gravity for its 0.15s, then keeps 42% of its speed: enough
  to clear a gap, not enough to escape a big planet by accident.
- Enemy impacts above 330 u/s deal damage; above 420 u/s a stunned enemy bounces. A launched
  enemy regains control the moment its hit-stun ends (~0.85s) and lands soft after that, so
  splats come from hits that put it into a planet directly. The player never takes landing damage.
  Enemy-enemy collisions above 260 u/s relative speed damage both.

## Enemies

| | role | forces |
|---|---|---|
| Grunt | baseline walker, leaps between planets | spacing |
| Hopper | fast, fragile, constantly leaping | tracking airborne threats |
| Orbiter | circles a planet, shoots gravity-curved shots; every 7-12s one on another planet may hop to yours | leaving the ground / deflecting |
| Bulwark | slow, heavy, 78% knockback resist | launch-strikes, debris, impacts |
| Flak | goes to a planet you're not on, lines up under you, fires straight up | moving; punishes camping one spot |
| Raider | never lands; patrols the outer ring toward your bearing, fires 3-shot spreads inward | staying off the outside of outer planets; the gun (a slug can knock it into the void) |
| The Hammer (boss, every 5 waves) | fast chaser that leaps at you; every landing is a full-ring ground pound; heavy-debris shotgun only with line of sight; calls a pod every 6.5s (4.5s in phase 2, capped at 4 alive) | being airborne when it lands; fighting near the middle |

Elites (from wave 4): 1.6× HP, 1.2× speed, gold ring, double score.

## Run structure

Wave → clear → pick 1 of 3 upgrades (rarity-weighted, 18 families) → next wave.
Boss every 5 waves; each boss kill moves you to a new sector with a fresh planet
layout and one more planet. Endless. Score is the leaderboard metric; the daily
challenge shares a seed for everyone.

## Tutorial

Eight lessons on a fixed two-planet layout, scripted inside the sim so it replays like
anything else. Walk over the top of the big planet to a beacon; launch at the small one,
which sits far enough and far enough off-axis that the thrusters are needed; the flight
runs at 3% speed until two steering keys have been tried, then eases back to full. On the
small planet a grunt pod is steered onto the player's head and parked there in slow motion
until the standing sweep lands; the debris it leaves gets its own slow beat; a second grunt
lands down the surface for the moving wave (the lesson repeats until a wave has been fired);
three at once; then one orbiter, which only the gun can reach. Tutorial enemies have 1 HP.
HP floors at 1 and the void respawns you, so it can't be failed. The menu badges the button
until it's been finished once.

## Not in v1 (engine is shaped for it)

Online co-op: the sim consumes InputFrames and is deterministic, so lockstep or
server-authoritative play is a transport problem, not an engine rewrite. Player
entity is `entities[0]` by convention in a few places; that's the first thing to
generalize.
