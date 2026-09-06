import { SCORE, WAVES } from "./config";
import { emit, healPlayer, placePlayer, player, spawnEnemyPod, type Ctx } from "./actions";
import { bossForWave, ENEMY_DEFS, isBoss, SPAWNABLE } from "./enemies";
import { rollOffers } from "./upgrades";
import type { EnemyKind, WaveState } from "./types";
import { generatePlanets } from "./world";

export function initialWave(): WaveState {
  return { n: 0, sector: 1, queue: [], t: 0, alive: 0, phase: "intermission", phaseT: 1.2, boss: false, buff: 1 };
}

/** Roll a wave: up to maxUnits by budget; budget left over promotes elites, then buffs everyone's HP. */
function compose(ctx: Ctx, n: number, sector: number): { queue: WaveState["queue"]; buff: number } {
  const { rng } = ctx;
  const queue: WaveState["queue"] = [];
  const boss = n % WAVES.bossEvery === 0;
  if (boss) {
    const kind = bossForWave(n, WAVES.bossEvery);
    queue.push({ at: 0.5, kind, elite: false });
    if (kind === "twin") queue.push({ at: 1.3, kind, elite: false });
    const escorts = Math.min(WAVES.maxUnits - queue.length, 2 + sector * 2);
    for (let i = 0; i < escorts; i++) queue.push({ at: 2 + i * 1.5, kind: rng.chance(0.6) ? "grunt" : "hopper", elite: false });
    return { queue, buff: 1 + Math.max(0, sector - 4) * 0.15 };
  }
  let budget = 4 + n * 1.7 + sector * 2;
  const pool = SPAWNABLE.filter((k) => ENEMY_DEFS[k].minWave <= n);
  const eliteChance = n > 3 ? Math.min(0.35, (n - 3) * 0.035) : 0;
  let guard = 0;
  const WEIGHT: Partial<Record<EnemyKind, (n: number) => number>> = {
    grunt: () => 3, hopper: () => 2.2, orbiter: (n) => 1.4 + n * 0.08, flak: (n) => 1.3 + n * 0.08, raider: (n) => 0.7 + n * 0.07,
    lancer: (n) => 1.2 + n * 0.06, mine: (n) => 1.1 + n * 0.05, splitter: (n) => 0.8 + n * 0.06, sweeper: (n) => 0.5 + n * 0.05,
    aegis: (n) => 0.9 + n * 0.05, bomber: (n) => 0.6 + n * 0.05,
  };
  while (budget > 0.9 && guard++ < 60 && queue.length < WAVES.maxUnits) {
    // cheap units stay likely; expensive ones ramp in with the wave number
    const weights = pool.map((k) => (WEIGHT[k] ?? ((n) => 0.9 + n * 0.1))(n));
    let r = rng.next() * weights.reduce((a, b) => a + b, 0);
    let kind: EnemyKind = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { kind = pool[i]; break; } }
    const cost = ENEMY_DEFS[kind].cost;
    if (cost > budget + 0.5) continue;
    // ring gunships are a pressure, not a wall: two per wave at most
    if (kind === "raider" && queue.filter((q) => q.kind === "raider").length >= 2) continue;
    budget -= cost;
    queue.push({ at: rng.range(0, WAVES.spawnSpread), kind, elite: rng.chance(eliteChance) });
  }
  // the cap held the count: the rest of the budget makes the wave meaner instead of bigger
  const plain = queue.filter((q) => !q.elite);
  while (budget >= WAVES.eliteCost && plain.length && queue.filter((q) => q.elite).length < WAVES.maxElites) {
    plain.splice(rng.int(0, plain.length), 1)[0].elite = true;
    budget -= WAVES.eliteCost;
  }
  const buff = 1 + Math.min(1, Math.max(0, budget) * WAVES.buffPerBudget);
  queue.sort((a, b) => a.at - b.at);
  return { queue, buff };
}

function startSector(ctx: Ctx, sector: number): void {
  const { s, rng } = ctx;
  s.planets = generatePlanets(rng, sector);
  s.debris = [];
  s.projectiles = [];
  s.shockwaves = [];
  s.telegraphs = [];
  placePlayer(s, 0, -Math.PI / 2);
  healPlayer(s, 0.3, 0);
  emit(s, { type: "sector", sector });
}

export function startWave(ctx: Ctx, n: number): void {
  const { s } = ctx;
  const sector = Math.floor((n - 1) / WAVES.bossEvery) + 1;
  if (sector !== s.wave.sector) startSector(ctx, sector);
  const boss = n % WAVES.bossEvery === 0;
  const { queue, buff } = compose(ctx, n, sector);
  s.wave = { n, sector, queue, t: 0, alive: 0, phase: "spawning", phaseT: 0, boss, buff };
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
        // prefer planets the player isn't standing on; bosses take the big one; sweepers come to yours
        const candidates = s.planets.filter((pl) => pl.id !== p.planet);
        const target = isBoss(item.kind) ? s.planets[0] : item.kind === "sweeper" && p.planet !== null ? s.planets[p.planet] : rng.pick(candidates.length ? candidates : s.planets);
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
        if (w.boss && w.n === WAVES.arc && !s.won) {
          s.won = true;
          s.score += WAVES.winBonus;
          emit(s, { type: "won" });
        }
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
