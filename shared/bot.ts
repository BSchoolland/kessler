import type { GameState, InputFrame } from "./types";
import { player } from "./actions";
import { dist, norm, sub, type Vec } from "./vec";
import { dominantPlanet, surfaceNormal } from "./physics";
import { perp, dot, scale, add } from "./vec";

/**
 * A blunt but competent bot for balance sims: walks toward the nearest live enemy,
 * dashes across gaps, swings when in reach, dodges telegraphed windups by dashing.
 */
export function botInput(s: GameState, rngNext: () => number): InputFrame {
  const p = player(s);
  const zero: Vec = { x: 0, y: 0 };
  const enemies = s.entities.filter((e) => e.kind !== "player" && !e.dead && e.spawnT <= 0);
  if (!enemies.length) return { move: zero, aim: { x: 1, y: 0 }, attack: false, dash: false, swap: false };
  let best = enemies[0];
  let bd = Infinity;
  for (const e of enemies) {
    const d = dist(e.pos, p.pos) + (e.kind === "orbiter" ? 120 : 0);
    if (d < bd) { bd = d; best = e; }
  }
  const incoming = s.projectiles.find((pr) => !pr.friendly && dist(pr.pos, p.pos) < 70 && dot(sub(p.pos, pr.pos), pr.vel) > 0);
  const to = sub(best.pos, p.pos);
  const d = dist(best.pos, p.pos);
  const targetPlanet = best.planet !== null ? s.planets[best.planet] : dominantPlanet(s.planets, best.pos);
  const crossing = p.planet !== null && targetPlanet.id !== p.planet;
  // when crossing a gap, aim at the planet itself so gravity catches us
  const aim = crossing ? norm(sub(targetPlanet.pos, p.pos)) : norm(to);
  const inReach = d <= 72 * s.mods.reachMult + best.radius;
  const threatened = enemies.some((e) => e.ai.state === "windup" && dist(e.pos, p.pos) < 90);
  const samePlanet = best.planet !== null && best.planet === p.planet;
  const onOtherPlanet = p.planet !== null && (best.planet ?? dominantPlanet(s.planets, best.pos).id) !== p.planet;

  let move: Vec = zero;
  if (p.planet !== null) {
    const n = surfaceNormal(s.planets[p.planet], p.pos);
    const t = perp(n);
    move = scale(t, Math.sign(dot(to, t)) || 1);
  } else {
    move = aim;
  }
  const facingIt = p.planet === null || dot(aim, surfaceNormal(s.planets[p.planet], p.pos)) > 0.35;
  const orbiterHunt = best.kind === "orbiter" && best.orbit !== null && p.planet !== null && best.orbit.planet === p.planet;
  const huntAim = orbiterHunt ? norm(sub(add(best.pos, scale(best.vel, 0.2)), p.pos)) : aim;
  const dash = p.dashCd <= 0 && (threatened ? rngNext() < 0.6
    : orbiterHunt ? d < 330 && dot(huntAim, surfaceNormal(s.planets[p.planet!], p.pos)) > 0.5 && rngNext() < 0.5
    : onOtherPlanet ? facingIt && dist(targetPlanet.pos, p.pos) - targetPlanet.r < 520 && rngNext() < 0.3
    : samePlanet && d > 160 && rngNext() < 0.12);
  const attack = !p.swing && ((inReach && rngNext() < 0.9) || (!!incoming && rngNext() < 0.7));
  const finalAim = incoming && !inReach ? norm(sub(incoming.pos, p.pos)) : huntAim;
  // the bot uses the gun on orbiters it can't reach and whenever it has spare rounds at range
  const wantGun = s.ammo > 0 && !inReach && d < 700 && (best.kind === "orbiter" || s.ammo >= 3);
  const swap = wantGun !== (s.weapon === "gun") && rngNext() < 0.5;
  const shoot = s.weapon === "gun" && wantGun && s.gunCd <= 0 && rngNext() < 0.6;
  return { move: add(move, zero), aim: finalAim, attack: attack || shoot, dash, swap };
}
