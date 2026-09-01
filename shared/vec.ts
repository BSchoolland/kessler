export interface Vec {
  x: number;
  y: number;
}

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const len2 = (a: Vec): number => a.x * a.x + a.y * a.y;
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });
export const neg = (a: Vec): Vec => ({ x: -a.x, y: -a.y });
export const angleOf = (a: Vec): number => Math.atan2(a.y, a.x);
export const fromAngle = (t: number, m = 1): Vec => ({ x: Math.cos(t) * m, y: Math.sin(t) * m });
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

export function norm(a: Vec): Vec {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
}

export function clampLen(a: Vec, max: number): Vec {
  const l = Math.hypot(a.x, a.y);
  return l > max ? { x: (a.x / l) * max, y: (a.y / l) * max } : a;
}

/** Smallest signed angle from a to b, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Exponential approach: fraction of the remaining gap closed per second. */
export function damp(current: number, target: number, ratePerSec: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-ratePerSec * dt));
}
