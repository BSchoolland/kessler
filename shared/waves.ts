import { SCORE, WAVES } from "./config";
import { emit, healPlayer, player, spawnEnemyPod, type Ctx } from "./actions";
import { ENEMY_DEFS, SPAWNABLE } from "./enemies";
import { snapToSurface } from "./physics";
import { rollOffers } from "./upgrades";
import type { EnemyKind, WaveState } from "./types";
import { generatePlanets } from "./world";
import { add, fromAngle } from "./vec";

export function initialWave(): WaveState {
  return { n: 0, sector: 1, queue: [], t: 0, alive: 0, phase: "intermission", phaseT: 1.2, boss: false };
}

function compose(ctx: Ctx, n: number, sector: number): WaveState["queue"] {
  const { rng } = ctx;
  const queue: WaveState["queue"] = [];
  const boss = n % WAVES.bossEvery === 0;
  if (boss) {
    queue.push({ at: 0.5, kind: "accretor", elite: false });
    const escorts = 2 + sector * 2;
    for (let i = 0; i < escorts; i++) queue.push({ at: 2 + i * 1.5, kind: rng.chance(0.6) ? "grunt" : "hopper", elite: false });
    return queue;
  }
  let budget = 5 + n * 2.4 + sector * 1.8;
  const pool = SPAWNABLE.filter((k) => ENEMY_DEFS[k].minWave <= n);
  const eliteChance = n > 3 ? Math.min(0.28, (n - 3) * 0.045) : 0;
  let guard = 0;
  while (budget > 0.9 && guard++ < 60) {
    // cheap units stay likely; expensive ones ramp in with the wave number
    const weights = pool.map((k) => (k === "grunt" ? 3 : k === "hopper" ? 2.2 : k === "orbiter" ? 1.4 + n * 0.08 : k === "flak" ? 1.3 + n * 0.08 : 0.9 + n * 0.1));
    let r = rng.next() * weights.reduce((a, b) => a + b, 0);
    let kind: EnemyKind = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { kind = pool[i]; break; } }
    const cost = ENEMY_DEFS[kind].cost;
    if (cost > budget + 0.5) continue;
    budget -= cost;
    queue.push({ at: rng.range(0, WAVES.spawnSpread), kind, elite: rng.chance(eliteChance) });
  }
  queue.sort((a, b) => a.at - b.at);
  return queue;
}

function startSector(ctx: Ctx, sector: number): void {
  const { s, rng } = ctx;
  s.planets = generatePlanets(rng, sector);
  s.debris = [];
  s.projectiles = [];
  s.shockwaves = [];
  s.telegraphs = [];
  const p = player(s);
  p.pos = snapToSurface(s.planets[0], add(s.planets[0].pos, fromAngle(-Math.PI / 2)), p.radius);
  p.vel = { x: 0, y: 0 };
  p.planet = 0;
  p.swing = null;
  p.dashT = 0;
  healPlayer(s, 0.3, 0);
  emit(s, { type: "sector", sector });
}

export function startWave(ctx: Ctx, n: number): void {
  const { s } = ctx;
  const sector = Math.floor((n - 1) / WAVES.bossEvery) + 1;
  if (sector !== s.wave.sector) startSector(ctx, sector);
  const boss = n % WAVES.bossEvery === 0;
  s.wave = { n, sector, queue: compose(ctx, n, sector), t: 0, alive: 0, phase: "spawning", phaseT: 0, boss };
  emit(s, { type: "waveStart", wave: n, boss });
}

export function updateWave(ctx: Ctx): void {
  const { s, dt, rng } = ctx;
  const w = s.wave;
  if (s.over) return;
  switch (w.phase) {
    case "intermission":
      w.phaseT -= dt;
      if (w.phaseT <= 0) startWave(ctx, w.n + 1);
      break;
    case "spawning": {
      w.t += dt;
      while (w.queue.length && w.queue[0].at <= w.t) {
        const item = w.queue.shift()!;
        const p = player(s);
        // prefer planets the player isn't standing on, boss always takes the big one
        const candidates = s.planets.filter((pl) => pl.id !== p.planet);
        const target = item.kind === "accretor" ? s.planets[0] : rng.pick(candidates.length ? candidates : s.planets);
        spawnEnemyPod(ctx, item.kind, target.id, item.elite);
      }
      if (!w.queue.length) w.phase = "fighting";
      break;
    }
    case "fighting":
      if (w.alive <= 0) {
        w.phase = "cleared";
        w.phaseT = 0.9;
        s.score += SCORE.waveClear * w.sector;
        emit(s, { type: "waveClear", wave: w.n });
      }
      break;
    case "cleared":
      w.phaseT -= dt;
      if (w.phaseT <= 0) {
        s.offers = rollOffers(rng, s.taken);
        w.phase = "choosing";
      }
      break;
    case "choosing":
      break;
  }
}
