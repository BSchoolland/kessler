import type { EnemyKind } from "./types";

export interface EnemyDef {
  hp: number;
  radius: number;
  speed: number;
  damage: number;
  reach: number;
  windup: number;
  attack: number;
  recover: number;
  knockbackResist: number;
  leapSpeed: number;
  leapDelay: number;
  cost: number;
  minWave: number;
  score: number;
  hue: number;
  name: string;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  grunt: {
    name: "Grunt", hp: 50, radius: 12, speed: 150, damage: 12, reach: 48, windup: 0.42, attack: 0.16,
    recover: 0.55, knockbackResist: 0, leapSpeed: 470, leapDelay: 1.3, cost: 1, minWave: 1, score: 10, hue: 350,
  },
  hopper: {
    name: "Hopper", hp: 30, radius: 10, speed: 215, damage: 9, reach: 42, windup: 0.28, attack: 0.12,
    recover: 0.35, knockbackResist: 0, leapSpeed: 570, leapDelay: 0.45, cost: 1.4, minWave: 2, score: 12, hue: 95,
  },
  orbiter: {
    name: "Orbiter", hp: 38, radius: 11, speed: 0, damage: 11, reach: 600, windup: 0.75, attack: 0.1,
    recover: 2.6, knockbackResist: 0, leapSpeed: 0, leapDelay: 0, cost: 2, minWave: 3, score: 15, hue: 200,
  },
  bulwark: {
    name: "Bulwark", hp: 169, radius: 18, speed: 105, damage: 28, reach: 60, windup: 0.7, attack: 0.2,
    recover: 0.9, knockbackResist: 0.78, leapSpeed: 430, leapDelay: 2.2, cost: 3, minWave: 4, score: 25, hue: 35,
  },
  flak: {
    name: "Flak", hp: 44, radius: 12, speed: 175, damage: 11, reach: 900, windup: 0.6, attack: 0.1,
    recover: 2.4, knockbackResist: 0, leapSpeed: 500, leapDelay: 0.6, cost: 2, minWave: 3, score: 16, hue: 52,
  },
  raider: {
    name: "Raider", hp: 120, radius: 20, speed: 150, damage: 12, reach: 1000, windup: 0.55, attack: 0.1,
    recover: 2.4, knockbackResist: 0.55, leapSpeed: 0, leapDelay: 0, cost: 4, minWave: 4, score: 30, hue: 15,
  },
  lancer: {
    name: "Lancer", hp: 55, radius: 12, speed: 130, damage: 16, reach: 420, windup: 0.5, attack: 0.55,
    recover: 0.9, knockbackResist: 0, leapSpeed: 470, leapDelay: 1.4, cost: 2, minWave: 6, score: 16, hue: 130,
  },
  mine: {
    name: "Mine", hp: 45, radius: 11, speed: 110, damage: 18, reach: 0, windup: 0, attack: 0,
    recover: 0, knockbackResist: 0, leapSpeed: 0, leapDelay: 0, cost: 1.5, minWave: 7, score: 12, hue: 8,
  },
  splitter: {
    name: "Splitter", hp: 90, radius: 16, speed: 120, damage: 14, reach: 52, windup: 0.5, attack: 0.16,
    recover: 0.6, knockbackResist: 0.15, leapSpeed: 440, leapDelay: 1.6, cost: 2.5, minWave: 9, score: 20, hue: 75,
  },
  sweeper: {
    name: "Sweeper", hp: 110, radius: 15, speed: 0, damage: 14, reach: 0, windup: 1.2, attack: 0,
    recover: 0, knockbackResist: 0.3, leapSpeed: 0, leapDelay: 0, cost: 3.5, minWave: 12, score: 28, hue: 265,
  },
  hammer: {
    name: "The Hammer", hp: 1150, radius: 30, speed: 165, damage: 26, reach: 84, windup: 0.6, attack: 0.25,
    recover: 0.6, knockbackResist: 0.9, leapSpeed: 540, leapDelay: 1.1, cost: 0, minWave: 5, score: 400, hue: 330,
  },
  warden: {
    name: "The Warden", hp: 1400, radius: 34, speed: 170, damage: 13, reach: 900, windup: 0.6, attack: 0.1,
    recover: 3, knockbackResist: 0.7, leapSpeed: 560, leapDelay: 0, cost: 0, minWave: 10, score: 500, hue: 45,
  },
  twin: {
    name: "The Twins", hp: 620, radius: 24, speed: 175, damage: 20, reach: 70, windup: 0.5, attack: 0.2,
    recover: 0.5, knockbackResist: 0.85, leapSpeed: 560, leapDelay: 1.6, cost: 0, minWave: 15, score: 300, hue: 330,
  },
  belt: {
    name: "The Belt", hp: 2300, radius: 40, speed: 80, damage: 28, reach: 90, windup: 0.6, attack: 0.25,
    recover: 0.8, knockbackResist: 0.96, leapSpeed: 700, leapDelay: 2.5, cost: 0, minWave: 20, score: 900, hue: 22,
  },
};

export const BOSSES: EnemyKind[] = ["hammer", "warden", "twin", "belt"];
export const isBoss = (k: EnemyKind): boolean => BOSSES.includes(k);
/** Which boss a boss wave brings: the four in order, then around again. */
export const bossForWave = (n: number, every: number): EnemyKind => BOSSES[(n / every - 1) % BOSSES.length];
/** Space units arrive without a pod: they never land. */
export const FLIES = (k: EnemyKind): boolean => k === "raider" || k === "mine" || k === "warden";

export const SPAWNABLE: EnemyKind[] = ["grunt", "hopper", "orbiter", "bulwark", "flak", "raider", "lancer", "mine", "splitter", "sweeper"];

/** Radius of the raiders' patrol ring around the arena; outside every planet, inside the void. */
export const RAIDER_RING = 1180;
