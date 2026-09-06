// Content smoke test: every enemy kind gets spawned next to the bot and run; every boss wave gets
// fought with scripted damage so its abilities fire and the wave (and the wave-20 win) completes.
// usage: npx tsx scripts/smoke.ts
import { DT, WAVES } from "../shared/config";
import { damageEnemy, placePlayer, spawnEnemyPod } from "../shared/actions";
import { BOSSES, ENEMY_DEFS, isBoss, SPAWNABLE } from "../shared/enemies";
import { Rng } from "../shared/rng";
import { chooseUpgrade, createGame, step } from "../shared/sim";
import { botInput } from "../shared/bot";
import type { EnemyKind, GameEvent, GameState } from "../shared/types";

function check(s: GameState, where: string): void {
  const bad = s.entities.find((e) => !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.y) || !Number.isFinite(e.vel.x));
  if (bad) throw new Error(`${where}: NaN position on ${bad.kind}`);
  const alive = s.entities.filter((e) => e.kind !== "player" && !e.dead).length;
  if (s.wave.alive !== alive && s.wave.phase === "fighting") throw new Error(`${where}: wave.alive ${s.wave.alive} != living ${alive}`);
}

const counts: Record<string, number> = {};
const tally = (evs: GameEvent[]) => { for (const ev of evs) counts[ev.type] = (counts[ev.type] ?? 0) + 1; };

for (const kind of SPAWNABLE) {
  const s = createGame(21);
  const r = new Rng(3);
  for (let i = 0; i < 60; i++) step(s, botInput(s, () => r.next()));
  s.wave.phase = "fighting"; s.wave.n = ENEMY_DEFS[kind].minWave; s.wave.queue = []; s.wave.alive = 0;
  const ctx = { s, rng: new Rng(9), dt: DT };
  for (let i = 0; i < 3; i++) spawnEnemyPod(ctx, kind, 0, i === 2);
  const evs: Record<string, number> = {};
  let hurt = 0;
  for (let i = 0; i < 60 * 40 && !s.over; i++) {
    step(s, botInput(s, () => r.next()));
    for (const ev of s.events) { evs[ev.type] = (evs[ev.type] ?? 0) + 1; if (ev.type === "playerHurt") hurt += ev.damage; }
    check(s, kind);
    if (s.wave.phase !== "fighting") break;
  }
  const left = s.entities.filter((e) => e.kind !== "player" && !e.dead).map((e) => e.kind);
  console.log(`${kind.padEnd(9)} kills=${s.stats.kills} hurt=${hurt} left=[${left.join(",")}] over=${s.over} ev=${JSON.stringify(Object.fromEntries(Object.entries(evs).filter(([k]) => ["charge","explode","beam","shot","rocket","telegraph","kill"].includes(k))))}`);
}

for (const n of [5, 10, 15, 20, 25]) {
  const s = createGame(7 + n);
  s.wave.n = n - 1;
  const r = new Rng(n);
  const ctx = { s, rng: new Rng(1), dt: DT };
  let t = 0, won = false, phase2 = 0, pounds = 0, beams = 0, mines = 0, pods = 0, bossDown = 0;
  const kinds = new Set<string>();
  for (let i = 0; i < 60 * 150 && !s.over; i++) {
    step(s, botInput(s, () => r.next()));
    if (s.offers) chooseUpgrade(s, s.offers[0].id);
    t += DT;
    // the bot can't kill a boss; chip it so the fight runs its course in ~40s (events from the chip land in this tick's list)
    // (twins: chip the first one harder so the survivor's enrage gets exercised)
    let first = true;
    for (const e of s.entities) if (isBoss(e.kind as EnemyKind) && !e.dead && e.spawnT <= 0 && i % 6 === 0) { damageEnemy(ctx, e, (e.maxHp / 400) * (e.kind === "twin" && first ? 2.5 : 1), "blade"); first = false; }
    for (const ev of s.events) {
      if (ev.type === "won") won = true;
      if (ev.type === "bossPhase") phase2++;
      if (ev.type === "pound") pounds++;
      if (ev.type === "beam") beams++;
      if (ev.type === "bossDown") bossDown++;
      if (ev.type === "pod") pods++;
    }
    for (const e of s.entities) if (e.kind !== "player") kinds.add(e.kind);
    mines = Math.max(mines, s.entities.filter((e) => e.kind === "mine" && !e.dead).length);
    // and keep the bot alive (and out of the void) so the wave can actually end
    s.entities[0].maxHp = 600; s.entities[0].hp = 600;
    if (Math.hypot(s.entities[0].pos.x, s.entities[0].pos.y) > 1350) placePlayer(s, 0, -Math.PI / 2);
    check(s, `wave ${n}`);
    if (s.wave.n > n) break;
  }
  const boss = BOSSES[(n / WAVES.bossEvery - 1) % BOSSES.length];
  console.log(`wave ${n} (${boss}): reached wave ${s.wave.n} in ${t.toFixed(0)}s over=${s.over} bossDown=${bossDown} phase2=${phase2} pounds=${pounds} beams=${beams} maxMines=${mines} pods=${pods} won=${won} kinds=[${[...kinds].join(",")}]`);
  if (bossDown < 1) throw new Error(`wave ${n}: boss never went down`);
  if (n === 20 && !won) throw new Error("wave 20: no win");
}
console.log("smoke ok");
