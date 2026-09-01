import { ARENA } from "./config";
import { Rng } from "./rng";
import type { Planet } from "./types";
import { dist, fromAngle, type Vec } from "./vec";

/** Lay out a cluster of planets that fit inside the void radius without crowding. */
export function generatePlanets(rng: Rng, sector: number): Planet[] {
  const count = Math.min(ARENA.maxPlanets, ARENA.minPlanets + Math.floor((sector - 1) / 2));
  const planets: Planet[] = [];
  const spreadRadius = ARENA.voidRadius * 0.46;
  const gapMin = 210;
  const hueBase = rng.range(0, 360);

  for (let attempt = 0; attempt < 400 && planets.length < count; attempt++) {
    const i = planets.length;
    const r = i === 0 ? rng.range(150, 185) : rng.range(70, 150);
    const pos: Vec =
      i === 0
        ? fromAngle(rng.range(0, Math.PI * 2), rng.range(0, 120))
        : fromAngle(rng.range(0, Math.PI * 2), rng.range(r + 260, spreadRadius + 120));
    if (dist(pos, { x: 0, y: 0 }) + r > ARENA.voidRadius * 0.72) continue;
    let ok = true;
    for (const p of planets) {
      const d = dist(p.pos, pos);
      if (d < p.r + r + gapMin) ok = false;
    }
    if (!ok) continue;
    // every planet must be within dash-and-drift range of at least one other
    if (i > 0 && !planets.some((p) => dist(p.pos, pos) - p.r - r < 520)) continue;
    planets.push({ id: i, pos, r, hue: (hueBase + i * 47 + rng.range(-12, 12)) % 360, seed: rng.int(0, 1 << 30) });
  }
  return planets;
}
