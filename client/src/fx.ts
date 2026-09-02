import type { GameEvent, GameState } from "../../shared/types";
import { scale, type Vec } from "../../shared/vec";
import type { Camera } from "./camera";
import type { Particles } from "./particles";
import { hsl, PLAYER_COLOR } from "./render";
import { play, type SfxName } from "./sound";
import { ENEMY_DEFS } from "../../shared/enemies";

export interface FxHooks {
  banner: (title: string, sub?: string, kind?: "wave" | "boss" | "sector" | "clear" | "phase") => void;
  hurtFlash: () => void;
}

const SOURCE_LABEL: Record<string, string> = { impact: "SPLAT", debris: "DEBRIS", collision: "BOWLED", shockwave: "QUAKE", projectile: "RETURNED" };

export function applyEvents(s: GameState, events: GameEvent[], particles: Particles, cam: Camera, hooks: FxHooks): void {
  const pan = (pos: Vec) => ((cam.toScreen(pos).x / cam.width) - 0.5) * 1.4;
  const sfx = (name: SfxName, pos: Vec, vol = 1) => play(name, vol, pan(pos));
  for (const ev of events) {
    switch (ev.type) {
      case "swing":
        sfx(ev.dashStrike ? "swingHeavy" : ev.arc > 3 ? "sweep" : "swing", ev.pos, 0.7);
        break;
      case "fuelEmpty":
        particles.float(ev.pos, "NO FUEL", "#ff8fb0", 13);
        sfx("fuelEmpty", ev.pos, 0.7);
        break;
      case "hit": {
        if (ev.damage <= 0) { sfx("deflect", ev.pos); particles.burst(ev.pos, 8, { color: PLAYER_COLOR, speed: 300, shape: "spark", size: 2.5, max: 0.3 }); break; }
        const c = ev.crit ? "#ffe07a" : "#ffffff";
        particles.burst(ev.pos, ev.crit ? 18 : 10, { color: c, speed: ev.crit ? 420 : 300, dir: ev.dir, spread: 1.6, shape: "spark", size: 3, max: 0.35 });
        particles.float(ev.pos, `${Math.round(ev.damage)}`, ev.crit ? "#ffe07a" : "#ffffff", ev.crit ? 22 : 15);
        cam.addTrauma(ev.crit ? 0.3 : 0.16);
        sfx(ev.crit ? "crit" : "hit", ev.pos);
        break;
      }
      case "kill": {
        const hue = ENEMY_DEFS[ev.kind as keyof typeof ENEMY_DEFS]?.hue ?? 0;
        const boss = ev.kind === "accretor";
        particles.burst(ev.pos, boss ? 90 : 22, { color: hsl(hue, 95, 65), speed: boss ? 600 : 320, shape: "shard", size: boss ? 7 : 4, max: boss ? 1.4 : 0.7, vx: ev.vel.x * 0.3, vy: ev.vel.y * 0.3 });
        particles.burst(ev.pos, boss ? 60 : 14, { color: "#ffffff", speed: boss ? 500 : 260, shape: "dot", size: 3, max: 0.5 });
        particles.ring(ev.pos, hsl(hue, 95, 70), boss ? 260 : 60, boss ? 0.9 : 0.4);
        cam.addTrauma(boss ? 0.9 : 0.25);
        const label = SOURCE_LABEL[ev.source];
        if (label) particles.float(scale({ x: ev.pos.x, y: ev.pos.y - 18 }, 1), label, hsl(hue, 95, 75), 14);
        sfx(boss ? "bossKill" : "kill", ev.pos);
        if (boss) hooks.banner("THE ACCRETOR IS DOWN", "sector cleared", "clear");
        break;
      }
      case "impact": {
        const strong = ev.speed > 330;
        const n = ev.kind === "debris" ? (strong ? 5 : 2) : Math.min(30, 6 + ev.speed / 40);
        particles.burst(ev.pos, n, { color: ev.kind === "debris" ? "#c9c9d8" : "#ffd9a0", speed: 80 + ev.speed * 0.5, dir: ev.normal, spread: 2.2, shape: strong ? "spark" : "dot", size: 2.5, max: 0.45, drag: 3 });
        if (ev.kind !== "debris") {
          cam.addTrauma(Math.min(0.5, ev.speed / 1400));
          sfx("impact", ev.pos, Math.min(1, ev.speed / 700));
          if (strong) particles.ring(ev.pos, "#ffd9a0", 40, 0.3);
        } else if (strong) sfx("land", ev.pos, 0.25);
        break;
      }
      case "void":
        if (ev.kind === "debris") break;
        particles.ring(ev.pos, "#ff4d7a", 80, 0.6);
        particles.burst(ev.pos, 12, { color: "#ff4d7a", speed: 120, shape: "dot", size: 3, max: 0.8 });
        if (ev.kind !== "player") { particles.float(ev.pos, "LOST TO THE VOID", "#ff8fb0", 16); sfx("void", ev.pos); }
        break;
      case "dash":
        particles.burst(ev.pos, 14, { color: PLAYER_COLOR, speed: 160, dir: scale(ev.dir, -1), spread: 0.9, shape: "spark", size: 3, max: 0.3 });
        sfx("dash", ev.pos, 0.6);
        break;
      case "land":
        if (ev.speed > 160) {
          particles.burst(ev.pos, Math.min(14, ev.speed / 40), { color: "#b8c0d8", speed: 60 + ev.speed * 0.3, dir: ev.normal, spread: 2.6, shape: "dot", size: 2, max: 0.4, additive: false, drag: 4 });
          if (ev.kind === "player") { sfx("land", ev.pos, Math.min(1, ev.speed / 500)); cam.addTrauma(Math.min(0.25, ev.speed / 2500)); }
        }
        break;
      case "playerHurt":
        particles.burst(ev.pos, 16, { color: "#ff5a7a", speed: 260, shape: "spark", size: 3, max: 0.4 });
        particles.float(ev.pos, `-${Math.round(ev.damage)}`, "#ff5a7a", 18);
        cam.addTrauma(0.4);
        hooks.hurtFlash();
        sfx("hurt", ev.pos);
        break;
      case "playerDead":
        particles.burst(ev.pos, 80, { color: PLAYER_COLOR, speed: 500, shape: "shard", size: 5, max: 1.5 });
        particles.burst(ev.pos, 40, { color: "#ffffff", speed: 400, shape: "spark", size: 3, max: 0.8 });
        particles.ring(ev.pos, PLAYER_COLOR, 200, 1);
        cam.addTrauma(1);
        play("death");
        break;
      case "waveStart":
        if (ev.boss) { hooks.banner("THE ACCRETOR", `wave ${ev.wave} · it wants you closer`, "boss"); play("boss"); }
        else { hooks.banner(`WAVE ${ev.wave}`, undefined, "wave"); play("wave", 0.7); }
        break;
      case "waveClear":
        hooks.banner("CLEAR", undefined, "clear");
        play("upgrade", 0.6);
        break;
      case "sector":
        hooks.banner(`SECTOR ${ev.sector}`, "new cluster, new gravity", "sector");
        play("sector");
        break;
      case "pod":
        sfx("pod", ev.pos, 0.5);
        break;
      case "shot":
        particles.burst(ev.pos, 6, { color: hsl(200, 100, 70), speed: 200, dir: ev.dir, spread: 0.8, shape: "spark", size: 2, max: 0.25 });
        sfx("shot", ev.pos, 0.7);
        break;
      case "telegraph":
        if (ev.kind === "shot") sfx("telegraph", ev.pos, 0.5);
        else if (ev.kind === "pull") sfx("pull", ev.pos, 0.8);
        else sfx("telegraph", ev.pos, 0.8);
        break;
      case "shockwave":
        cam.addTrauma(0.35);
        sfx("shockwave", ev.pos);
        break;
      case "bossPhase":
        hooks.banner("IT'S ANGRY NOW", "phase two", "phase");
        particles.ring(ev.pos, hsl(285, 100, 70), 300, 1);
        cam.addTrauma(0.6);
        play("phase");
        break;
      case "debrisHit":
        particles.burst(ev.pos, 6, { color: "#dddddd", speed: 180, shape: "spark", size: 2, max: 0.25 });
        sfx(ev.damage > 0 ? "debrisHit" : "deflect", ev.pos, 0.6);
        break;
      case "gunshot":
        particles.burst(ev.pos, 10, { color: "#ffe07a", speed: 380, dir: ev.dir, spread: 0.7, shape: "spark", size: 3, max: 0.22 });
        particles.ring(ev.pos, "#ffe07a", 18, 0.15);
        cam.addTrauma(0.22);
        sfx("gunshot", ev.pos);
        break;
      case "empty":
        particles.float(ev.pos, "EMPTY", "#ff8fb0", 13);
        sfx("empty", ev.pos, 0.8);
        break;
      case "ammo":
        sfx("ammo", ev.pos, 0.5);
        break;
      case "combo":
        particles.float({ x: ev.pos.x, y: ev.pos.y - 34 }, `x${ev.idx} MULTI`, PLAYER_COLOR, 16);
        sfx("combo", ev.pos, 0.6);
        break;
    }
  }
  void s;
}
