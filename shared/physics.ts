import { ARENA, GRAVITY } from "./config";
import type { Planet } from "./types";
import { add, dot, len, norm, scale, sub, type Vec } from "./vec";

export function gravityAt(planets: Planet[], pos: Vec, gScale = 1): Vec {
  let ax = 0;
  let ay = 0;
  for (const p of planets) {
    const dx = p.pos.x - pos.x;
    const dy = p.pos.y - pos.y;
    const d2 = Math.max(dx * dx + dy * dy, 1);
    const d = Math.sqrt(d2);
    let a = (GRAVITY.surfaceG * p.r * p.r) / d2;
    if (a > GRAVITY.maxAccel) a = GRAVITY.maxAccel;
    ax += (dx / d) * a;
    ay += (dy / d) * a;
  }
  const dc = Math.hypot(pos.x, pos.y);
  if (dc > 1) {
    ax -= (pos.x / dc) * GRAVITY.centerPull;
    ay -= (pos.y / dc) * GRAVITY.centerPull;
  }
  return { x: ax * gScale, y: ay * gScale };
}

export function dominantPlanet(planets: Planet[], pos: Vec): Planet {
  let best = planets[0];
  let bestA = -1;
  for (const p of planets) {
    const d2 = Math.max((p.pos.x - pos.x) ** 2 + (p.pos.y - pos.y) ** 2, 1);
    const a = (p.r * p.r) / d2;
    if (a > bestA) {
      bestA = a;
      best = p;
    }
  }
  return best;
}

export function nearestPlanet(planets: Planet[], pos: Vec): { planet: Planet; gap: number } {
  let best = planets[0];
  let bestGap = Infinity;
  for (const p of planets) {
    const gap = len(sub(pos, p.pos)) - p.r;
    if (gap < bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  return { planet: best, gap: bestGap };
}

export function surfaceNormal(planet: Planet, pos: Vec): Vec {
  return norm(sub(pos, planet.pos));
}

export function snapToSurface(planet: Planet, pos: Vec, radius: number): Vec {
  const n = surfaceNormal(planet, pos);
  return add(planet.pos, scale(n, planet.r + radius));
}

export function tangentOnly(planet: Planet, pos: Vec, vel: Vec): Vec {
  const n = surfaceNormal(planet, pos);
  return sub(vel, scale(n, dot(vel, n)));
}

export function inVoid(pos: Vec): boolean {
  return pos.x * pos.x + pos.y * pos.y > ARENA.voidRadius * ARENA.voidRadius;
}

export interface Contact {
  planet: Planet;
  normal: Vec;
  speedIn: number;
}

export function findContact(planets: Planet[], pos: Vec, vel: Vec, radius: number): Contact | null {
  for (const p of planets) {
    const dx = pos.x - p.pos.x;
    const dy = pos.y - p.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < p.r + radius) {
      const normal = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 0, y: -1 };
      return { planet: p, normal, speedIn: -dot(vel, normal) };
    }
  }
  return null;
}

/** Circular orbit speed at distance R from a planet's center. */
export function orbitSpeed(planet: Planet, R: number): number {
  return Math.sqrt((GRAVITY.surfaceG * planet.r * planet.r) / R);
}

export function escapeSpeed(planet: Planet, R: number): number {
  return Math.sqrt((2 * GRAVITY.surfaceG * planet.r * planet.r) / R);
}
