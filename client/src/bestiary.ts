import { baseState } from "../../shared/sim";
import { makeEntity } from "../../shared/actions";
import { ENEMY_DEFS, ORBIT_HEIGHT, SPAWNABLE } from "../../shared/enemies";
import { snapToSurface } from "../../shared/physics";
import type { EnemyKind, GameState } from "../../shared/types";
import { Camera } from "./camera";
import { Particles } from "./particles";
import { Renderer } from "./render";

const BLURB: Record<string, string> = {
  grunt: "walks at you, leaps between planets",
  hopper: "fast and fragile, always in the air",
  orbiter: "circles a planet and shoots; hops to yours",
  bulwark: "heavy; barely moves when hit",
  flak: "parks under you, fires seeking rockets",
  raider: "patrols the red ring, fires spreads inward",
  lancer: "telegraphs, then charges along the ground",
  mine: "drifts in and blows; hit it first, it's yours",
  splitter: "dies into two hoppers",
  sweeper: "lands on your planet, runs a low laser around it",
  aegis: "slow-turning shield; slugs and the wave break on it",
  bomber: "orbits your planet, drops gravity bombs",
};

interface Tile { kind: EnemyKind; state: GameState; renderer: Renderer; cam: Camera }

/** One tiny live world per enemy kind, drawn with the real renderer while the how-to is open. */
export class Bestiary {
  private tiles: Tile[] = [];
  private raf = 0;

  constructor(private root: HTMLElement) {
    for (const kind of SPAWNABLE) {
      const cell = document.createElement("div");
      const canvas = document.createElement("canvas");
      cell.appendChild(canvas);
      const label = document.createElement("span");
      label.innerHTML = `<b>${ENEMY_DEFS[kind].name.toUpperCase()}</b><br>${BLURB[kind]}`;
      cell.appendChild(label);
      root.appendChild(cell);
      const state = baseState(1, [{ id: 0, pos: { x: 0, y: 0 }, r: 150, hue: 220, seed: 5 }]);
      const def = ENEMY_DEFS[kind];
      const e = makeEntity(state, kind, { x: 0, y: -150 }, def.radius, def.hp, def.hue);
      const top = { x: 0, y: -1 };
      if (ORBIT_HEIGHT[kind]) { e.orbit = { planet: 0, radius: 150 + ORBIT_HEIGHT[kind]!, angle: -Math.PI / 2, dir: 1 }; e.pos = { x: 0, y: -(150 + ORBIT_HEIGHT[kind]!) }; }
      else if (kind === "raider" || kind === "mine") { e.pos = { x: 0, y: -230 }; e.orbit = kind === "raider" ? { planet: -1, radius: 230, angle: -Math.PI / 2, dir: 1 } : null; }
      else { e.pos = snapToSurface(state.planets[0], { x: 0, y: -1 }, def.radius); e.planet = 0; }
      e.facing = kind === "raider" || kind === "bomber" ? 0 : Math.atan2(top.y, top.x);
      if (kind === "aegis") e.ai.rot = -Math.PI / 2 - 0.6;
      if (kind === "sweeper") e.ai.beam = { angle: -Math.PI / 2 + 0.9, dir: 1, height: 36, speed: 0.6, blades: 1, t: Infinity };
      state.entities.push(e);
      state.entities[0].pos = { x: 9999, y: 9999 }; // the player stays out of frame
      const cam = new Camera();
      const renderer = new Renderer(canvas, cam, new Particles());
      renderer.sizeTo(72, 72);
      cam.snap({ x: 0, y: e.pos.y + 4 });
      cam.zoom = cam.targetZoom = kind === "raider" || kind === "bomber" || kind === "orbiter" ? 1.1 : 1.35;
      this.tiles.push({ kind, state, renderer, cam });
    }
  }

  start(): void {
    if (this.raf) return;
    let last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const t of this.tiles) {
        const e = t.state.entities[1];
        if (t.kind === "sweeper" && e.ai.beam) e.ai.beam.angle += e.ai.beam.speed * dt;
        if (e.orbit && e.orbit.planet === 0) { e.orbit.angle += 0.5 * dt; const R = e.orbit.radius; e.pos = { x: Math.cos(e.orbit.angle) * R, y: Math.sin(e.orbit.angle) * R }; t.cam.snap({ x: e.pos.x, y: e.pos.y }); }
        t.renderer.draw(t.state, null, dt, { paused: true });
      }
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
