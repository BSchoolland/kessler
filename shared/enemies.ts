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
    name: "Grunt", hp: 40, radius: 12, speed: 150, damage: 12, reach: 48, windup: 0.42, attack: 0.16,
    recover: 0.55, knockbackResist: 0, leapSpeed: 470, leapDelay: 1.3, cost: 1, minWave: 1, score: 10, hue: 350,
  },
  hopper: {
    name: "Hopper", hp: 24, radius: 10, speed: 215, damage: 9, reach: 42, windup: 0.28, attack: 0.12,
    recover: 0.35, knockbackResist: 0, leapSpeed: 570, leapDelay: 0.45, cost: 1.4, minWave: 2, score: 12, hue: 95,
  },
  orbiter: {
    name: "Orbiter", hp: 30, radius: 11, speed: 0, damage: 11, reach: 600, windup: 0.75, attack: 0.1,
    recover: 2.6, knockbackResist: 0, leapSpeed: 0, leapDelay: 0, cost: 2, minWave: 3, score: 15, hue: 200,
  },
  bulwark: {
    name: "Bulwark", hp: 135, radius: 18, speed: 105, damage: 28, reach: 60, windup: 0.7, attack: 0.2,
    recover: 0.9, knockbackResist: 0.78, leapSpeed: 430, leapDelay: 2.2, cost: 3, minWave: 4, score: 25, hue: 35,
  },
  accretor: {
    name: "The Accretor", hp: 1300, radius: 32, speed: 92, damage: 30, reach: 84, windup: 0.8, attack: 0.25,
    recover: 1.0, knockbackResist: 0.93, leapSpeed: 400, leapDelay: 3, cost: 0, minWave: 5, score: 400, hue: 285,
  },
};

export const SPAWNABLE: EnemyKind[] = ["grunt", "hopper", "orbiter", "bulwark"];
