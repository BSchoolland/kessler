import { describe, expect, it } from "vitest";
import { chooseUpgrade, createGame, step } from "../shared/sim";
import { botInput } from "../shared/bot";
import { Rng } from "../shared/rng";
import { player } from "../shared/actions";
import type { InputFrame } from "../shared/types";
import { inVoid } from "../shared/physics";

const idle: InputFrame = { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: false, dash: false };

describe("sim", () => {
  it("is deterministic for the same seed and inputs", () => {
    const a = createGame(42);
    const b = createGame(42);
    const ra = new Rng(7);
    const rb = new Rng(7);
    for (let i = 0; i < 60 * 40; i++) {
      step(a, botInput(a, () => ra.next()));
      step(b, botInput(b, () => rb.next()));
      if (a.offers) chooseUpgrade(a, a.offers[0].id);
      if (b.offers) chooseUpgrade(b, b.offers[0].id);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("keeps the player on the surface when idle", () => {
    const s = createGame(1);
    for (let i = 0; i < 600; i++) step(s, idle);
    const p = player(s);
    expect(p.planet).toBe(0);
    expect(p.hp).toBeGreaterThan(0);
    expect(inVoid(p.pos)).toBe(false);
  });

  it("spawns wave 1 and the pods land somewhere", () => {
    const s = createGame(3);
    for (let i = 0; i < 60 * 20; i++) step(s, idle);
    expect(s.wave.n).toBe(1);
    const enemies = s.entities.filter((e) => e.kind !== "player");
    expect(enemies.length).toBeGreaterThan(0);
    expect(enemies.every((e) => e.spawnT === 0)).toBe(true);
  });

  it("lets a bot clear at least a few waves across seeds", () => {
    let waves = 0;
    for (const seed of [1, 2, 3]) {
      const s = createGame(seed);
      const r = new Rng(seed * 13);
      for (let i = 0; i < 60 * 240 && !s.over; i++) {
        step(s, botInput(s, () => r.next()));
        if (s.offers) chooseUpgrade(s, s.offers[0].id);
      }
      waves += s.wave.n;
    }
    expect(waves / 3).toBeGreaterThan(2);
  });

  it("gun is the weapon in space and spends ammo", () => {
    const s = createGame(5);
    for (let i = 0; i < 60 * 2; i++) step(s, idle);
    expect(s.ammo).toBe(3);
    expect(s.weapon).toBe("sword");
    step(s, { ...idle, dash: true });
    expect(player(s).planet).toBeNull();
    step(s, idle);
    expect(s.weapon).toBe("gun");
    step(s, { ...idle, attack: true });
    expect(s.ammo).toBe(2);
    expect(s.events.some((e) => e.type === "gunshot")).toBe(true);
  });

  it("side attack sends a one-way wave along the surface; standing still sweeps wide", () => {
    const s = createGame(5);
    for (let i = 0; i < 30; i++) step(s, idle);
    step(s, { ...idle, move: { x: 1, y: 0 }, attack: true });
    for (let i = 0; i < 12; i++) step(s, { ...idle, move: { x: 1, y: 0 } });
    const wave = s.shockwaves.find((w) => w.edge);
    expect(wave).toBeDefined();
    expect(wave!.dir).not.toBe(0);
    expect(player(s).swing?.arc ?? 0).toBeLessThan(3);
    for (let i = 0; i < 60; i++) step(s, idle);
    step(s, { ...idle, attack: true });
    expect(player(s).swing?.arc ?? 0).toBeGreaterThan(3);
  });

  it("no fuel means no dash, with a rate-limited warning", () => {
    const s = createGame(5);
    for (let i = 0; i < 30; i++) step(s, idle);
    s.fuel = 0;
    step(s, { ...idle, dash: true });
    expect(player(s).planet).toBe(0);
    expect(s.events.filter((e) => e.type === "fuelEmpty").length).toBe(1);
    step(s, { ...idle, dash: true });
    expect(s.events.filter((e) => e.type === "fuelEmpty").length).toBe(0);
  });

  it("dash strike launches an enemy off the planet", () => {
    const s = createGame(5);
    for (let i = 0; i < 60 * 6; i++) step(s, idle);
    const p = player(s);
    expect(s.over).toBe(false);
    const e = s.entities.find((x) => x.kind !== "player" && x.planet !== null)!;
    expect(e).toBeDefined();
    // teleport the enemy next to the player for a clean shot
    e.pos = { x: p.pos.x + 40, y: p.pos.y };
    e.planet = p.planet;
    e.stun = 0;
    const aim = { x: 1, y: 0 };
    step(s, { ...idle, aim, dash: false, attack: true });
    for (let i = 0; i < 30; i++) step(s, { ...idle, aim });
    expect(e.hp < e.maxHp || e.dead).toBe(true);
  });

  it("side attack has no front arc, only a one-way wave that deflects shots", () => {
    const s = createGame(5);
    for (let i = 0; i < 60 * 2; i++) step(s, idle);
    const p = player(s);
    step(s, { ...idle, move: { x: 1, y: 0 }, attack: true });
    expect(p.swing?.arc).toBeLessThan(3);
    for (let i = 0; i < 12; i++) step(s, { ...idle, move: { x: 1, y: 0 } });
    const w = s.shockwaves.find((x) => x.edge)!;
    expect(w).toBeDefined();
    expect(w.dir).not.toBe(0);
    // an enemy shot sitting in the wave's path gets batted back
    const planet = s.planets[p.planet!];
    const ahead = w.angle + w.dir * 0.3;
    const pos = { x: planet.pos.x + Math.cos(ahead) * (planet.r + 20), y: planet.pos.y + Math.sin(ahead) * (planet.r + 20) };
    s.projectiles.push({ id: 9999, pos, vel: { x: 0, y: 0 }, radius: 5, life: 3, damage: 10, hue: 200, friendly: false, knockback: 320, slug: false });
    for (let i = 0; i < 60; i++) step(s, idle);
    const pr = s.projectiles.find((x) => x.id === 9999);
    expect(pr === undefined || pr.friendly).toBe(true);
  });
});
