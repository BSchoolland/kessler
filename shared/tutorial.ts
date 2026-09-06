import { DT } from "./config";
import { emit, placePlayer, player, spawnEnemyPod, type Ctx } from "./actions";
import { baseState } from "./sim";
import type { GameState, InputFrame, Planet, TutorialStep } from "./types";
import { angleDelta, angleOf, sub } from "./vec";

// Two planets in a line: you start on the underside of the big one, walk over the top,
// launch straight up to the small one, and fight there.
export const TUTORIAL_PLANETS: Planet[] = [
  { id: 0, pos: { x: 0, y: 0 }, r: 150, hue: 205, seed: 1101 },
  { id: 1, pos: { x: 0, y: -560 }, r: 110, hue: 38, seed: 2202 },
];

const START = Math.PI / 2;          // underside of planet 0
const OVER_THE_TOP = -Math.PI / 2;  // top of planet 0, facing planet 1
const LANDING = Math.PI / 2;        // underside of planet 1, facing planet 0
const REACHED = 0.22;               // radians of surface either side of the beacon
const FLY_SLOWMO = 0.03;
const KEY_W = 1, KEY_A = 2, KEY_S = 4, KEY_D = 8;

export function createTutorial(): GameState {
  const s = baseState(2026, TUTORIAL_PLANETS.map((p) => ({ ...p, pos: { ...p.pos } })));
  placePlayer(s, 0, START);
  s.tutorial = { step: "walk", t: 0, goal: { planet: 0, angle: OVER_THE_TOP }, keys: 0, timeScale: 1, queue: [] };
  return s;
}

function advance(s: GameState, step: TutorialStep): void {
  const tut = s.tutorial!;
  tut.step = step;
  tut.t = 0;
  tut.timeScale = step === "fly" && popcount(tut.keys) < 2 ? FLY_SLOWMO : 1;
  tut.goal = step === "launch" || step === "fly" ? { planet: 1, angle: LANDING } : null;
  // pods come in from behind the small planet so nothing swings past the big one
  tut.queue = step === "fight"
    ? [0.4, 1.1, 1.8].map((at, i) => ({ at, kind: "grunt" as const, from: -Math.PI / 2 + (i - 1) * 0.45 }))
    : step === "gun" ? [{ at: 0.8, kind: "orbiter" as const, from: -Math.PI / 2 }] : [];
  emit(s, { type: "tutorial", step });
}

function atBeacon(s: GameState): boolean {
  const tut = s.tutorial!;
  const p = player(s);
  if (!tut.goal || p.planet !== tut.goal.planet) return false;
  const pl = s.planets[tut.goal.planet];
  return Math.abs(angleDelta(angleOf(sub(p.pos, pl.pos)), tut.goal.angle)) < REACHED;
}

function popcount(x: number): number {
  let n = 0;
  for (; x; x &= x - 1) n++;
  return n;
}

export function updateTutorial(ctx: Ctx, input: InputFrame): void {
  const { s } = ctx;
  const tut = s.tutorial!;
  const p = player(s);
  tut.t += ctx.dt;

  while (tut.queue.length && tut.queue[0].at <= tut.t) {
    const item = tut.queue.shift()!;
    spawnEnemyPod(ctx, item.kind, 1, false, item.from);
  }

  switch (tut.step) {
    case "walk":
      if (atBeacon(s)) advance(s, "launch");
      break;
    case "launch":
      if (p.planet === null) advance(s, "fly");
      break;
    case "fly": {
      const m = input.move;
      if (m.y < -0.5) tut.keys |= KEY_W;
      if (m.x < -0.5) tut.keys |= KEY_A;
      if (m.y > 0.5) tut.keys |= KEY_S;
      if (m.x > 0.5) tut.keys |= KEY_D;
      // near-frozen until two steering directions have been tried, then ease back to full speed (real time)
      if (popcount(tut.keys) < 2) tut.timeScale = FLY_SLOWMO;
      else tut.timeScale = Math.min(1, tut.timeScale + DT * 2.5);
      if (p.planet === 1) advance(s, "fight");
      else if (p.planet === 0) advance(s, "launch");
      break;
    }
    case "fight":
      if (!tut.queue.length && s.wave.alive <= 0 && tut.t > 2) advance(s, "gun");
      break;
    case "gun":
      if (!tut.queue.length && s.wave.alive <= 0 && tut.t > 2) advance(s, "done");
      break;
    case "done":
      break;
  }
}

/** Falling into the void is a do-over in the tutorial, not a death: back to the step's planet. */
export function tutorialRespawn(s: GameState): void {
  const tut = s.tutorial!;
  s.fuel = Math.max(s.fuel, 50);
  if (tut.step === "walk") placePlayer(s, 0, START);
  else if (tut.step === "launch" || tut.step === "fly") { placePlayer(s, 0, OVER_THE_TOP); advance(s, "launch"); }
  else placePlayer(s, 1, LANDING);
}
