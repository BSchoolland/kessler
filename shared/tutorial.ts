import { DT } from "./config";
import { emit, placePlayer, player, spawnDebris, spawnEnemyPod, type Ctx } from "./actions";
import { nearestPlanet, surfaceNormal } from "./physics";
import { baseState } from "./sim";
import type { Entity, GameState, InputFrame, Planet, PodAim, TutorialStep } from "./types";
import { add, angleDelta, angleOf, dist, fromAngle, norm, scale, sub, type Vec } from "./vec";

// Two planets in a line with a long gap: you start on the underside of the big one, walk over
// the top, launch straight up and have a few seconds of flight to try the thrusters. Coasting
// gets you there; the small planet sits off-axis enough that nothing about it is automatic
// but not so far that holding W sends you past it into the void (that layout was tried).
// Pod start points stay well inside the void ring (1500 from the origin).
export const TUTORIAL_PLANETS: Planet[] = [
  { id: 0, pos: { x: 0, y: 650 }, r: 150, hue: 205, seed: 1101 },
  { id: 1, pos: { x: 0, y: -750 }, r: 110, hue: 38, seed: 2202 },
];

const START = Math.PI / 2;          // underside of planet 0
const OVER_THE_TOP = -Math.PI / 2;  // top of planet 0, facing planet 1
const LANDING = Math.PI / 2;        // underside of planet 1, facing planet 0
const REACHED = 0.22;               // radians of surface either side of the beacon
const POD_SPEED = 380;
const HEAD_ROOM = 22;               // gap between the player's hull and the grunt held over it
const FLY_SLOWMO = 0.03;
const FLY_SLOWMO_AFTER = 0.5;      // seconds of full-speed flight first, so the launch itself is seen
const SWEEP_SLOWMO = 0.08;
const DEBRIS_SLOWMO = 0.3;
const WAVE_SLOWMO = 0.35;
const KEY_W = 1, KEY_A = 2, KEY_S = 4, KEY_D = 8;

export function createTutorial(): GameState {
  const s = baseState(2026, TUTORIAL_PLANETS.map((p) => ({ ...p, pos: { ...p.pos } })));
  placePlayer(s, 0, START);
  s.tutorial = { step: "walk", t: 0, goal: { planet: 0, angle: OVER_THE_TOP }, keys: 0, timeScale: 1, queue: [], guided: [], hover: null, waved: false };
  return s;
}

function popcount(x: number): number {
  let n = 0;
  for (; x; x &= x - 1) n++;
  return n;
}

/** Just above the player's nose, along the local up. */
function overhead(s: GameState, e: Entity): Vec {
  const p = player(s);
  const n = p.planet !== null ? surfaceNormal(s.planets[p.planet], p.pos) : norm(sub(p.pos, nearestPlanet(s.planets, p.pos).planet.pos));
  return add(p.pos, scale(n, p.radius + e.radius + HEAD_ROOM));
}

function aroundSmall(s: GameState, angle: number, out: number): Vec {
  const pl = s.planets[1];
  return add(pl.pos, fromAngle(angle, pl.r + out));
}

function podsFor(s: GameState, step: TutorialStep) {
  const pl = s.planets[1];
  const p = player(s);
  const a = angleOf(sub(p.pos, pl.pos));
  const grunt = (at: number, start: Vec, aim: PodAim) => ({ at, kind: "grunt" as const, start, aim });
  switch (step) {
    case "sweep": return [grunt(0.6, add(p.pos, fromAngle(a, 500)), "player")];
    case "wave": return [grunt(0.4, aroundSmall(s, a + 1.7, 480), a + 1.7)];
    case "brawl": return [-0.7, 0, 0.7].map((o, i) => grunt(0.4 + i * 0.7, aroundSmall(s, a + Math.PI + o, 480), a + Math.PI + o));
    case "gun": return [{ at: 0.8, kind: "orbiter" as const, start: aroundSmall(s, a + Math.PI, 500), aim: null }];
    default: return [];
  }
}

function advance(s: GameState, step: TutorialStep): void {
  const tut = s.tutorial!;
  tut.step = step;
  tut.t = 0;
  tut.guided = [];
  tut.hover = null;
  tut.waved = false;
  tut.timeScale = step === "debris" ? DEBRIS_SLOWMO : 1;
  tut.goal = step === "launch" || step === "fly" ? { planet: 1, angle: LANDING } : null;
  tut.queue = podsFor(s, step);
  emit(s, { type: "tutorial", step });
}

function atBeacon(s: GameState): boolean {
  const tut = s.tutorial!;
  const p = player(s);
  if (!tut.goal || p.planet !== tut.goal.planet) return false;
  const pl = s.planets[tut.goal.planet];
  return Math.abs(angleDelta(angleOf(sub(p.pos, pl.pos)), tut.goal.angle)) < REACHED;
}

function easeToFull(tut: { timeScale: number }): void {
  tut.timeScale = Math.min(1, tut.timeScale + DT * 2.5);
}

const alive = (s: GameState, id: number | null): Entity | null => (id === null ? null : s.entities.find((e) => e.id === id && !e.dead) ?? null);

export function updateTutorial(ctx: Ctx, input: InputFrame): void {
  const { s } = ctx;
  const tut = s.tutorial!;
  const p = player(s);
  tut.t += ctx.dt;

  while (tut.queue.length && tut.queue[0].at <= tut.t) {
    const item = tut.queue.shift()!;
    const e = spawnEnemyPod(ctx, item.kind, 1, false, item.start);
    e.hp = e.maxHp = 1;
    if (item.aim !== null) tut.guided.push({ id: e.id, aim: item.aim });
  }
  // steer descending pods so lessons land where they say they will
  tut.guided = tut.guided.filter((g) => {
    const e = alive(s, g.id);
    if (!e || e.spawnT <= 0) return false;
    const target = g.aim === "player" ? overhead(s, e) : aroundSmall(s, g.aim as number, e.radius);
    e.vel = scale(norm(sub(target, e.pos)), POD_SPEED);
    return true;
  });
  const cleared = !tut.queue.length && s.wave.alive <= 0;

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
      // half a second of real launch, then near-frozen until two steering directions have been tried, then ease back
      if (popcount(tut.keys) < 2) tut.timeScale = tut.t < FLY_SLOWMO_AFTER ? 1 : FLY_SLOWMO;
      else easeToFull(tut);
      if (p.planet === 1) advance(s, "sweep");
      else if (p.planet === 0) advance(s, "launch");
      break;
    }
    case "sweep": {
      // the grunt parks over the player's head, hittable, and the clock crawls until the swing lands
      if (tut.hover === null) {
        const g = s.entities.find((e) => e.kind === "grunt" && !e.dead);
        if (g && dist(g.pos, overhead(s, g)) < 40) { tut.hover = g.id; tut.guided = []; }
      }
      const h = alive(s, tut.hover);
      if (h && h.hp >= h.maxHp) {
        h.pos = overhead(s, h);
        h.vel = { x: 0, y: 0 };
        h.planet = null;
        h.spawnT = 0;
        h.airTime = 0;
        h.stun = 0;
        tut.timeScale = SWEEP_SLOWMO;
      } else easeToFull(tut);
      if (cleared) {
        // the demo kill makes a bigger mess than a real grunt would, so the lesson reads
        const kill = s.events.find((ev) => ev.type === "kill");
        if (kill && kill.type === "kill") spawnDebris(ctx, kill.pos, kill.vel, 9, 350);
        advance(s, "debris");
      }
      break;
    }
    case "debris":
      if (tut.t > 1.5) advance(s, "wave");
      break;
    case "wave": {
      if (s.shockwaves.some((w) => w.edge)) tut.waved = true;
      const landed = !tut.queue.length && !tut.guided.length && s.wave.alive > 0;
      if (landed && !tut.waved) tut.timeScale = WAVE_SLOWMO;
      else easeToFull(tut);
      if (cleared) {
        if (tut.waved) advance(s, "brawl");
        else tut.queue = podsFor(s, "wave").map((q) => ({ ...q, at: tut.t + 0.6 }));   // killed some other way: another one, same lesson
      }
      break;
    }
    case "brawl":
      if (cleared && tut.t > 2) advance(s, "gun");
      break;
    case "gun":
      if (cleared && tut.t > 2) advance(s, "done");
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
