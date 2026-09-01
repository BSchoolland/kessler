import { chooseUpgrade, createGame, step } from "../shared/sim";
import { botInput } from "../shared/bot";
import { Rng } from "../shared/rng";
import type { GameEvent } from "../shared/types";

const seeds = Number(process.argv[2] ?? 8);
const maxSec = Number(process.argv[3] ?? 300);
const verbose = process.argv.includes("-v");

interface Run { seed: number; waves: number; time: number; score: number; deathBy: string; kills: Record<string, number>; podsVoid: number; podsLanded: number }
const runs: Run[] = [];

for (let seed = 1; seed <= seeds; seed++) {
  const s = createGame(seed);
  const r = new Rng(seed * 7919);
  const kills: Record<string, number> = {};
  let deathBy = "alive";
  let podsVoid = 0;
  let podsLanded = 0;
  let lastWave = 0;
  for (let i = 0; i < 60 * maxSec && !s.over; i++) {
    step(s, botInput(s, () => r.next()));
    for (const ev of s.events as GameEvent[]) {
      if (ev.type === "kill") kills[ev.source] = (kills[ev.source] ?? 0) + 1;
      if (ev.type === "playerHurt" && s.over) deathBy = ev.source;
      if (ev.type === "void" && ev.kind !== "debris") {
        const e = s.entities.find((x) => x.pos === ev.pos);
        if (e && e.spawnT > 0) podsVoid++;
      }
      if (ev.type === "land" && ev.kind !== "player") podsLanded++;
      if (verbose && ev.type === "waveStart") console.log(`  seed ${seed} wave ${ev.wave} at ${s.time.toFixed(1)}s hp=${s.entities[0].hp.toFixed(0)} score=${s.score}`);
    }
    if (s.offers) chooseUpgrade(s, s.offers[Math.floor(r.next() * s.offers.length)].id);
    if (s.wave.n !== lastWave) lastWave = s.wave.n;
  }
  if (s.over && deathBy === "alive") deathBy = "void";
  runs.push({ seed, waves: s.wave.n, time: s.time, score: s.score, deathBy, kills, podsVoid, podsLanded });
  if (verbose) {
    const alive = s.entities.filter((e) => e.kind !== "player").map((e) => `${e.kind}${e.spawnT > 0 ? "(pod)" : ""}${e.planet === null ? "(air)" : ""}`);
    console.log(`seed ${seed}: waves=${s.wave.n} phase=${s.wave.phase} alive=${s.wave.alive} [${alive.join(",")}] t=${s.time.toFixed(0)} death=${deathBy}`);
  }
}

const avg = (f: (r: Run) => number) => (runs.reduce((a, r) => a + f(r), 0) / runs.length).toFixed(1);
console.log(`runs=${runs.length} avgWaves=${avg((r) => r.waves)} avgTime=${avg((r) => r.time)}s avgScore=${avg((r) => r.score)} podsVoid=${runs.reduce((a, r) => a + r.podsVoid, 0)}`);
const deaths: Record<string, number> = {};
const killsAll: Record<string, number> = {};
for (const r of runs) {
  deaths[r.deathBy] = (deaths[r.deathBy] ?? 0) + 1;
  for (const [k, v] of Object.entries(r.kills)) killsAll[k] = (killsAll[k] ?? 0) + v;
}
console.log("deaths:", deaths);
console.log("kills by source:", killsAll);
console.log("waves per seed:", runs.map((r) => r.waves).join(" "));
