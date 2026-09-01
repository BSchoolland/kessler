import { chooseUpgrade, createGame, step } from "../shared/sim";
import { botInput } from "../shared/bot";
import { Rng } from "../shared/rng";
const seed = Number(process.argv[2] ?? 11);
const s = createGame(seed);
s.wave.n = 4;
const r = new Rng(5);
let bossStart = -1, bossEnd = -1, hurt = 0, hurtBy: Record<string, number> = {}, abilities: Record<string, number> = {}, shock = 0;
for (let i = 0; i < 60 * 240 && !s.over; i++) {
  step(s, botInput(s, () => r.next()));
  if (s.offers) chooseUpgrade(s, s.offers[0].id);
  for (const ev of s.events) {
    if (ev.type === "waveStart" && ev.boss) bossStart = s.time;
    if (ev.type === "kill" && ev.kind === "accretor") bossEnd = s.time;
    if (ev.type === "telegraph") abilities[ev.kind] = (abilities[ev.kind] ?? 0) + 1;
    if (ev.type === "shockwave") shock++;
    if (ev.type === "playerHurt" && bossStart > 0 && bossEnd < 0) { hurt += ev.damage; hurtBy[ev.source] = (hurtBy[ev.source] ?? 0) + ev.damage; }
  }
  if (bossEnd > 0 && s.time > bossEnd + 1) break;
}
const boss = s.entities.find((e) => e.kind === "accretor");
console.log(`seed ${seed}: boss fight ${bossStart.toFixed(1)}s -> ${bossEnd > 0 ? bossEnd.toFixed(1) + "s (killed)" : "not killed; hp " + boss?.hp.toFixed(0) + " state " + boss?.ai.state + " stun " + boss?.stun.toFixed(2) + " planet " + boss?.planet}`, `dur=${(bossEnd > 0 ? bossEnd - bossStart : s.time - bossStart).toFixed(1)}s`);
console.log(`player hurt during boss: ${hurt.toFixed(0)}`, hurtBy, "abilities:", abilities, "shockwaves:", shock, "playerDead:", s.over);
