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
  enemy has a 2.5s splat window (it flashes white for the duration); after that it's back in
  control and lands soft. The player never takes landing damage.
  Enemy-enemy collisions above 260 u/s relative speed damage both.

## Enemies

| | role | forces |
|---|---|---|
| Grunt | baseline walker, leaps between planets | spacing |
| Hopper | fast, fragile, constantly leaping | tracking airborne threats |
| Orbiter | circles a planet, shoots gravity-curved shots; every 7-12s one on another planet may hop to yours | leaving the ground / deflecting |
| Bulwark | slow, heavy, 78% knockback resist | launch-strikes, debris, impacts |
| Flak | goes to a planet you're not on, lines up under you, fires straight up | moving; punishes camping one spot |
| Raider | never lands; patrols the outer ring toward your bearing, fires 3-shot spreads inward; once only raiders are left each dives at you in turn and sits exposed ~2s; two per wave max | staying off the outside of outer planets; the gun (a slug can knock it into the void) |
| Lancer (w6) | telegraphs, then charges 620 u/s along the surface; contact hurts more mid-charge | leaving the ground on the cue, or swinging it away |
| Mine (w7) | drifts in through space, blows at 62 units; hit it and it's a thrown bomb that detonates on anything it touches | the sweep and the gun as bomb-throwing tools |
| Splitter (w9) | walker; dies into two launched hoppers | cleaning up; the debris economy |
| Sweeper (w12) | lands on your planet, runs a 36-unit laser around the surface at 1.15 rad/s | hopping over the blade; knocking the turret off the ground kills the beam |
| Aegis (w8) | walker behind a 140° shield that turns toward you at 2.2 rad/s; slugs and the wave break on its front | the overhead sweep up close; launching over it and hitting the back |
| Bomber (w11) | orbits your planet at 170 units and drops a bomb every 3s that bursts into a short surface shockwave; hops planets like an orbiter | moving off the drop point; the gun |
| The Hammer (boss, wave 5) | fast chaser that leaps at you (and hops every 5.5s even up close); every landing is a full-ring ground pound; heavy-debris shotgun only with line of sight; calls a pod every 6.5s (4.5s in phase 2, capped at 4 alive) | being airborne when it lands; fighting near the middle |
| The Warden (boss, wave 10) | gunship in a 260-unit orbit around your planet; 5-shot fans (7 in phase 2), drops mines on a clock, a pod every 7s (5s in phase 2), dives onto your planet every 9.5s and sits there 2.6s after a small pound | the gun while it orbits, melee during the dive |
| The Twins (boss, wave 15) | two pounders, 620 HP each, both calling pods; when one dies the other enrages | splitting attention; killing one fast |
| The Hive (boss, wave 25 and on the cycle) | orbiting hulk like the Warden; launches pods (hopper/lancer/splitter/grunt) at your planet every 4s (cap 6, phase 2: 8 and every 2.8s), drops bomb clusters, dives every 12s | killing the pods as they land; the dive window |
| The Belt (boss, wave 20) | slow giant on the main planet: 5s sweeping laser (two blades in phase 2), a straight-up leap that lands as a pound, a ring of 8 heavy rocks thrown into orbit; pods every 5.5s | the whole kit; winning here ends the arc and rolls into endless |

Elites (from wave 4): 1.6× HP, 1.2× speed, gold ring, double score.

## Run structure

Wave → clear → pick 1 of 3 upgrades (rarity-weighted) → next wave. A wave never spawns more
than 12 units (debris scales with kills, and 20 bodies made wave 19 a one-shot); budget past
that promotes up to 6 elites, and what's left becomes an HP multiplier on the whole wave (up to
2×, reached around wave 30). Boss every 5 waves,
the four bosses in order; each boss kill moves you to a new sector with a fresh planet
layout and one more planet. Wave 20's boss is the arc: killing it is a win (2000 points,
a screen, a counter on the menu) and the run continues endless, bosses cycling. Score is
the leaderboard metric.

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
