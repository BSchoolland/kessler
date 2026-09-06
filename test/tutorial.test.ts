import { describe, expect, it } from "vitest";
import { DT } from "../shared/config";
import { damagePlayer, killEnemy, player } from "../shared/actions";
import { Rng } from "../shared/rng";
import { step } from "../shared/sim";
import { createTutorial } from "../shared/tutorial";
import type { GameState, InputFrame } from "../shared/types";
import { surfaceNormal } from "../shared/physics";
import { angleDelta, angleOf, perp, scale, sub } from "../shared/vec";

const frame = (over: Partial<InputFrame> = {}): InputFrame => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: -1 }, attack: false, dash: false, ...over });

function runUntil(s: GameState, input: () => InputFrame, done: () => boolean, maxTicks: number): boolean {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return true;
    step(s, input());
  }
  return done();
}

/** What a person does on a round planet: push along the surface, toward the beacon. */
function walkToGoal(s: GameState): InputFrame {
  const p = player(s);
  const tut = s.tutorial!;
  if (p.planet === null || !tut.goal) return frame();
  const pl = s.planets[p.planet];
  const da = angleDelta(angleOf(sub(p.pos, pl.pos)), tut.goal.angle);
  return frame({ move: scale(perp(surfaceNormal(pl, p.pos)), Math.sign(da) || 1) });
}

function killAllLanded(s: GameState): void {
  const ctx = { s, rng: new Rng(1), dt: DT };
  for (const e of s.entities) if (e.kind !== "player" && !e.dead && e.spawnT <= 0) killEnemy(ctx, e, "blade");
}

describe("tutorial", () => {
  it("walks the player through every lesson", () => {
    const s = createTutorial();
    const tut = () => s.tutorial!;
    expect(tut().step).toBe("walk");
    expect(player(s).planet).toBe(0);

    // 1. walk over the top to the beacon
    expect(runUntil(s, () => walkToGoal(s), () => tut().step === "launch", 60 * 10)).toBe(true);
    expect(tut().goal?.planet).toBe(1);

    // 2. stand still, launch: straight up toward the small planet
    for (let i = 0; i < 20; i++) step(s, frame());
    step(s, frame({ dash: true }));
    expect(tut().step).toBe("fly");
    expect(player(s).planet).toBeNull();
    expect(tut().timeScale).toBeLessThan(0.1);

    // 3. the flight lesson stays near-frozen until two directions are tried, then eases back to full speed
    for (let i = 0; i < 30; i++) step(s, frame());
    expect(tut().timeScale).toBeLessThan(0.1);
    for (let i = 0; i < 4; i++) step(s, frame({ move: { x: 0, y: -1 } }));
    expect(tut().timeScale).toBeLessThan(0.1);
    for (let i = 0; i < 4; i++) step(s, frame({ move: { x: -1, y: 0 } }));
    expect(tut().keys).toBe(1 | 2);
    expect(runUntil(s, () => frame(), () => tut().timeScale === 1, 60)).toBe(true);
    expect(runUntil(s, () => frame(), () => tut().step === "fight", 60 * 8)).toBe(true);
    expect(player(s).planet).toBe(1);

    // 4. three grunts drop onto the small planet
    const grunts = () => s.entities.filter((e) => e.kind === "grunt");
    expect(runUntil(s, () => frame(), () => grunts().length === 3 && grunts().every((g) => g.spawnT <= 0), 60 * 12)).toBe(true);
    expect(grunts().every((g) => g.planet === 1 || g.planet === null)).toBe(true);
    expect(player(s).hp).toBeGreaterThan(0);
    killAllLanded(s);
    expect(runUntil(s, () => frame(), () => tut().step === "gun", 60 * 4)).toBe(true);

    // 5. one orbiter, then done
    const orbiters = () => s.entities.filter((e) => e.kind === "orbiter" && !e.dead);
    expect(runUntil(s, () => frame(), () => orbiters().length === 1 && orbiters()[0].spawnT <= 0, 60 * 12)).toBe(true);
    killAllLanded(s);
    expect(runUntil(s, () => frame(), () => tut().step === "done", 60 * 4)).toBe(true);
    expect(s.over).toBe(false);
    expect(s.offers).toBeNull();
  });

  it("cannot be lost: hp floors at 1 and the void respawns you", () => {
    const s = createTutorial();
    const p = player(s);
    p.hp = 1;
    p.invuln = 0;
    // three grunts' worth of contact damage, forced
    const ctx = { s, rng: new Rng(3), dt: DT };
    for (let i = 0; i < 5; i++) { p.invuln = 0; damagePlayer(ctx, 40, "contact"); }
    expect(p.hp).toBe(1);
    expect(s.over).toBe(false);

    p.planet = null;
    p.pos = { x: 1600, y: 0 };
    step(s, frame());
    expect(s.over).toBe(false);
    expect(p.planet).toBe(0);
  });

  it("is deterministic", () => {
    const a = createTutorial();
    const b = createTutorial();
    const script = (i: number): InputFrame => (i < 300 ? frame({ move: { x: 1, y: 0 } }) : i === 320 ? frame({ dash: true }) : i < 340 ? frame({ move: { x: 0, y: -1 } }) : i < 360 ? frame({ move: { x: 1, y: 0 } }) : frame({ attack: i % 30 === 0, move: { x: i % 120 < 60 ? 1 : -1, y: 0 } }));
    for (let i = 0; i < 60 * 40; i++) { step(a, script(i)); step(b, script(i)); }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
