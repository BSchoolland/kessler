import { ARENA, PLAYER } from "../../shared/config";
import { fuelMax } from "../../shared/sim";
import { ENEMY_DEFS } from "../../shared/enemies";
import { Rng } from "../../shared/rng";
import type { Entity, EnemyKind, GameState, Planet } from "../../shared/types";
import { angleOf, fromAngle, len, sub, type Vec } from "../../shared/vec";
import type { Camera } from "./camera";
import type { Particles } from "./particles";

export const hsl = (h: number, s = 90, l = 60, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
export const PLAYER_COLOR = "#4df3ff";

interface Star { x: number; y: number; z: number; s: number; tw: number }

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private planetCache = new Map<string, HTMLCanvasElement>();
  private t = 0;
  hurtFlash = 0;
  showDamageNumbers = true;

  constructor(private canvas: HTMLCanvasElement, private cam: Camera, private particles: Particles) {
    this.ctx = canvas.getContext("2d")!;
    const r = new Rng(1337);
    for (let i = 0; i < 420; i++) this.stars.push({ x: r.range(-2600, 2600), y: r.range(-2600, 2600), z: r.pick([0.15, 0.3, 0.5]), s: r.range(0.6, 2.2), tw: r.range(0, 6.28) });
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cam.width = w;
    this.cam.height = h;
  }

  lockedTarget: number | null = null;
  thrust: Vec = { x: 0, y: 0 };

  draw(s: GameState, aimScreen: Vec | null, dt: number, hud: { paused: boolean }): void {
    const ctx = this.ctx;
    const cam = this.cam;
    this.t += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    const w = cam.width, h = cam.height;
    const p = s.entities[0];

    // background
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    bg.addColorStop(0, "#0b0e1d");
    bg.addColorStop(1, "#04050a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // stars (parallax, screen space)
    for (const st of this.stars) {
      const sx = ((st.x - cam.pos.x * st.z) * cam.zoom) % (w + 200);
      const sy = ((st.y - cam.pos.y * st.z) * cam.zoom) % (h + 200);
      const x = ((sx + w + 200) % (w + 200)) - 100;
      const y = ((sy + h + 200) % (h + 200)) - 100;
      const tw = 0.55 + 0.45 * Math.sin(this.t * 1.7 + st.tw);
      ctx.globalAlpha = (0.25 + st.z) * tw;
      ctx.fillStyle = st.z > 0.4 ? "#dfe8ff" : "#8fa0d0";
      ctx.fillRect(x, y, st.s, st.s);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    cam.apply(ctx);

    this.drawVoid(s);
    for (const pl of s.planets) this.drawPlanet(pl);
    this.drawTelegraphs(s);
    this.drawShockwaves(s);
    this.drawDebris(s);
    this.drawProjectiles(s);
    for (const e of s.entities) if (e.kind !== "player") this.drawEnemy(s, e);
    if (!s.over) this.drawPlayer(s, p);
    if (s.weapon === "gun" && this.lockedTarget !== null) {
      const t = s.entities.find((e) => e.id === this.lockedTarget && !e.dead);
      if (t) {
        ctx.save();
        ctx.translate(t.pos.x, t.pos.y);
        ctx.rotate(this.t * 1.5);
        ctx.strokeStyle = "#ffe07a";
        ctx.lineWidth = 2;
        const rr = t.radius * 1.25 + 9;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, rr, i * Math.PI / 2 + 0.25, i * Math.PI / 2 + Math.PI / 2 - 0.25);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    this.particles.draw(ctx);
    if (this.showDamageNumbers) this.particles.drawFloaters(ctx, cam.zoom);
    ctx.restore();

    // screen-space overlays
    const distC = len(p.pos);
    if (distC > 1050 && !s.over) {
      const a = Math.min(0.75, (distC - 1050) / 450) * (0.7 + 0.3 * Math.sin(this.t * 9));
      this.vignette(`rgba(255,40,80,${a})`);
    }
    if (p.hp < p.maxHp * 0.3 && !s.over) {
      const a = (0.25 + 0.15 * Math.sin(this.t * 5)) * (1 - p.hp / (p.maxHp * 0.3));
      this.vignette(`rgba(255,0,40,${a})`);
    }
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,60,80,${this.hurtFlash * 0.25})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (aimScreen && !hud.paused && !s.over) {
      ctx.strokeStyle = "rgba(77,243,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(aimScreen.x, aimScreen.y, 9, 0, 6.283);
      ctx.moveTo(aimScreen.x - 14, aimScreen.y); ctx.lineTo(aimScreen.x - 5, aimScreen.y);
      ctx.moveTo(aimScreen.x + 5, aimScreen.y); ctx.lineTo(aimScreen.x + 14, aimScreen.y);
      ctx.moveTo(aimScreen.x, aimScreen.y - 14); ctx.lineTo(aimScreen.x, aimScreen.y - 5);
      ctx.moveTo(aimScreen.x, aimScreen.y + 5); ctx.lineTo(aimScreen.x, aimScreen.y + 14);
      ctx.stroke();
    }
  }

  private vignette(color: string): void {
    const ctx = this.ctx;
    const w = this.cam.width, h = this.cam.height;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawVoid(s: GameState): void {
    const ctx = this.ctx;
    const R = ARENA.voidRadius;
    const g = ctx.createRadialGradient(0, 0, R * 0.78, 0, 0, R * 1.35);
    g.addColorStop(0, "rgba(120,20,60,0)");
    g.addColorStop(0.62, "rgba(120,20,60,0.22)");
    g.addColorStop(1, "rgba(30,0,10,0.95)");
    ctx.fillStyle = g;
    ctx.fillRect(-R * 1.6, -R * 1.6, R * 3.2, R * 3.2);
    ctx.setLineDash([26, 18]);
    ctx.lineDashOffset = -this.t * 40;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,70,110,0.55)";
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, 6.283);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 14;
    ctx.strokeStyle = "rgba(255,70,110,0.08)";
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, 6.283);
    ctx.stroke();
    void s;
  }

  private planetSprite(pl: Planet): HTMLCanvasElement {
    const key = `${pl.seed}:${pl.r}`;
    let c = this.planetCache.get(key);
    if (c) return c;
    const pad = 6;
    const size = Math.ceil((pl.r + pad) * 2);
    c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    const cx = size / 2, cy = size / 2;
    const rng = new Rng(pl.seed);
    const base = g.createRadialGradient(cx - pl.r * 0.35, cy - pl.r * 0.35, pl.r * 0.1, cx, cy, pl.r);
    base.addColorStop(0, hsl(pl.hue, 35, 30));
    base.addColorStop(0.7, hsl(pl.hue, 40, 16));
    base.addColorStop(1, hsl(pl.hue, 45, 9));
    g.fillStyle = base;
    g.beginPath();
    g.arc(cx, cy, pl.r, 0, 6.283);
    g.fill();
    // bands
    g.save();
    g.beginPath();
    g.arc(cx, cy, pl.r, 0, 6.283);
    g.clip();
    const bands = rng.int(3, 7);
    for (let i = 0; i < bands; i++) {
      g.fillStyle = hsl(pl.hue + rng.range(-15, 15), 40, rng.range(10, 24), 0.35);
      const y = rng.range(-pl.r, pl.r);
      g.fillRect(0, cy + y, size, rng.range(4, pl.r * 0.25));
    }
    // craters
    const craters = rng.int(4, 12);
    for (let i = 0; i < craters; i++) {
      const a = rng.range(0, 6.283), d = rng.range(0, pl.r * 0.85), cr = rng.range(pl.r * 0.05, pl.r * 0.16);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      g.fillStyle = hsl(pl.hue, 40, 7, 0.7);
      g.beginPath();
      g.arc(x, y, cr, 0, 6.283);
      g.fill();
      g.strokeStyle = hsl(pl.hue, 50, 34, 0.45);
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, cr, Math.PI * 0.9, Math.PI * 1.9);
      g.stroke();
    }
    g.restore();
    // rim
    g.lineWidth = 2.5;
    g.strokeStyle = hsl(pl.hue, 90, 65, 0.9);
    g.beginPath();
    g.arc(cx, cy, pl.r, 0, 6.283);
    g.stroke();
    this.planetCache.set(key, c);
    return c;
  }

  private drawPlanet(pl: Planet): void {
    const ctx = this.ctx;
    const glow = ctx.createRadialGradient(pl.pos.x, pl.pos.y, pl.r, pl.pos.x, pl.pos.y, pl.r + 46);
    glow.addColorStop(0, hsl(pl.hue, 90, 60, 0.35));
    glow.addColorStop(1, hsl(pl.hue, 90, 60, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pl.pos.x, pl.pos.y, pl.r + 46, 0, 6.283);
    ctx.fill();
    const sp = this.planetSprite(pl);
    ctx.drawImage(sp, pl.pos.x - sp.width / 2, pl.pos.y - sp.height / 2);
  }

  private drawTelegraphs(s: GameState): void {
    const ctx = this.ctx;
    const p = s.entities[0];
    for (const t of s.telegraphs) {
      const owner = s.entities.find((e) => e.id === t.owner);
      if (!owner) continue;
      const k = 1 - t.t / t.total;
      if (t.kind === "shot") {
        ctx.strokeStyle = hsl(200, 100, 70, 0.15 + k * 0.5);
        ctx.lineWidth = 1.5 + k * 2;
        ctx.setLineDash([8, 10]);
        ctx.beginPath();
        ctx.moveTo(owner.pos.x, owner.pos.y);
        const dir = fromAngle(angleOf(sub(p.pos, owner.pos)));
        ctx.lineTo(owner.pos.x + dir.x * 700, owner.pos.y + dir.y * 700);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (t.kind === "pull") {
        const r = t.radius * (1 - k * 0.85);
        ctx.strokeStyle = hsl(285, 100, 70, 0.3 + k * 0.5);
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = this.t * 80;
        ctx.beginPath();
        ctx.arc(owner.pos.x, owner.pos.y, r, 0, 6.283);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (t.kind === "slam") {
        const pl = owner.planet !== null ? s.planets[owner.planet] : null;
        if (!pl) continue;
        ctx.strokeStyle = hsl(285, 100, 65, 0.2 + k * 0.6);
        ctx.lineWidth = 6 + k * 14;
        ctx.beginPath();
        ctx.arc(pl.pos.x, pl.pos.y, pl.r + 12, 0, 6.283);
        ctx.stroke();
      } else if (t.kind === "throw") {
        ctx.strokeStyle = hsl(285, 100, 70, 0.3 + k * 0.6);
        ctx.lineWidth = 2;
        ctx.beginPath();
        const dir = fromAngle(angleOf(sub(p.pos, owner.pos)));
        ctx.moveTo(owner.pos.x + dir.x * 40, owner.pos.y + dir.y * 40);
        ctx.lineTo(owner.pos.x + dir.x * (80 + k * 300), owner.pos.y + dir.y * (80 + k * 300));
        ctx.stroke();
      }
    }
  }

  private drawShockwaves(s: GameState): void {
    const ctx = this.ctx;
    for (const w of s.shockwaves) {
      const pl = s.planets[w.planet];
      const color = w.friendly ? PLAYER_COLOR : hsl(285, 100, 70);
      ctx.strokeStyle = color;
      ctx.globalCompositeOperation = "lighter";
      if (w.edge) {
        // a wall of light running along the surface: filled annular sector plus a bright leading face
        const H = PLAYER.swing.waveHeight;
        const a0 = w.angle + w.dir * Math.max(0, w.spread - 0.16);
        const a1 = w.angle + w.dir * w.spread;
        const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
        const g = ctx.createRadialGradient(pl.pos.x, pl.pos.y, pl.r, pl.pos.x, pl.pos.y, pl.r + H);
        g.addColorStop(0, "rgba(77,243,255,0.55)");
        g.addColorStop(1, "rgba(77,243,255,0.05)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(pl.pos.x, pl.pos.y, pl.r + H, lo, hi);
        ctx.arc(pl.pos.x, pl.pos.y, pl.r, hi, lo, true);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(pl.pos.x + Math.cos(a1) * pl.r, pl.pos.y + Math.sin(a1) * pl.r);
        ctx.lineTo(pl.pos.x + Math.cos(a1) * (pl.r + H), pl.pos.y + Math.sin(a1) * (pl.r + H));
        ctx.stroke();
        ctx.strokeStyle = "rgba(77,243,255,0.9)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pl.pos.x, pl.pos.y, pl.r + H, lo, hi);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        continue;
      }
      const tail = 0.25;
      for (const dir of w.dir === 0 ? [1, -1] : [w.dir]) {
        const a0 = w.angle + dir * Math.max(0, w.spread - tail);
        const a1 = w.angle + dir * w.spread;
        ctx.lineWidth = 14;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(pl.pos.x, pl.pos.y, pl.r + 10, Math.min(a0, a1), Math.max(a0, a1));
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(pl.pos.x, pl.pos.y, pl.r + 10, Math.min(a0, a1), Math.max(a0, a1));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private drawDebris(s: GameState): void {
    const ctx = this.ctx;
    for (const d of s.debris) {
      const speed = len(d.vel);
      const fade = Math.min(1, d.life / 1.5);
      if (speed > 120) {
        ctx.strokeStyle = hsl(d.hue, 90, 65, 0.35 * fade);
        ctx.lineWidth = d.radius * 0.8;
        ctx.beginPath();
        ctx.moveTo(d.pos.x, d.pos.y);
        ctx.lineTo(d.pos.x - d.vel.x * 0.05, d.pos.y - d.vel.y * 0.05);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(d.pos.x, d.pos.y);
      ctx.rotate(d.rot);
      const r = d.radius;
      ctx.fillStyle = hsl(d.hue, 60, d.heavy ? 22 : 30, fade);
      ctx.strokeStyle = hsl(d.hue, 95, 68, fade);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.5);
      ctx.lineTo(r * 0.7, -r * 0.8);
      ctx.lineTo(r, r * 0.3);
      ctx.lineTo(r * 0.1, r);
      ctx.lineTo(-r * 0.8, r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawProjectiles(s: GameState): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "lighter";
    for (const pr of s.projectiles) {
      const c = pr.slug ? "#ffe07a" : pr.friendly ? PLAYER_COLOR : hsl(pr.hue, 100, 70);
      ctx.strokeStyle = c;
      ctx.lineWidth = pr.slug ? 4 : 3;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(pr.pos.x, pr.pos.y);
      ctx.lineTo(pr.pos.x - pr.vel.x * (pr.slug ? 0.045 : 0.06), pr.pos.y - pr.vel.y * (pr.slug ? 0.045 : 0.06));
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(pr.pos.x, pr.pos.y, pr.radius, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(pr.pos.x, pr.pos.y, pr.radius * 0.45, 0, 6.283);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  private drawPlayer(s: GameState, p: Entity): void {
    const ctx = this.ctx;
    const mods = s.mods;
    const reach = PLAYER.swing.reach * mods.reachMult;
    const sw = p.swing;
    const half = (sw ? sw.arc : PLAYER.swing.arc) / 2;
    // the edge: a kinetic crescent on the front of the ship (the side attack draws only its wave)
    if (sw && sw.arc >= 3) {
      ctx.save();
      ctx.translate(p.pos.x, p.pos.y);
      if (sw.phase === "windup") {
        const k = 1 - sw.t / (PLAYER.swing.windup / mods.swingSpeedMult);
        ctx.strokeStyle = `rgba(77,243,255,${0.25 + k * 0.5})`;
        ctx.fillStyle = `rgba(77,243,255,${0.04 + k * 0.08})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, reach, sw.angle - half, sw.angle + half);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // a crescent shockwave pushed out from the hull to full reach, then fading
        const total = (sw.phase === "active" ? PLAYER.swing.active : PLAYER.swing.recovery) / mods.swingSpeedMult;
        const k = 1 - sw.t / total;
        const prog = sw.phase === "active" ? k : 1;
        const alpha = sw.phase === "active" ? 0.95 : 0.5 * (1 - k);
        const rad = p.radius + (reach - p.radius) * (0.35 + 0.65 * prog);
        const col = sw.dashStrike ? "255,230,120" : "77,243,255";
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(${col},${alpha * 0.18})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, rad, sw.angle - half, sw.angle + half);
        ctx.closePath();
        ctx.fill();
        for (const [w, a] of [[14, 0.25], [6, 0.6], [2.5, 1]] as const) {
          ctx.strokeStyle = `rgba(${col},${alpha * a})`;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.arc(0, 0, rad, sw.angle - half, sw.angle + half);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.restore();
    }
    // body
    ctx.save();
    ctx.translate(p.pos.x, p.pos.y);
    const flicker = p.invuln > 0 && Math.floor(this.t * 30) % 2 === 0;
    ctx.globalAlpha = flicker ? 0.45 : 1;
    ctx.rotate(p.facing);
    const r = p.radius;
    // glow
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.6);
    g.addColorStop(0, "rgba(77,243,255,0.35)");
    g.addColorStop(1, "rgba(77,243,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.6, 0, 6.283);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#0a1a24";
    ctx.strokeStyle = PLAYER_COLOR;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0);
    ctx.lineTo(-r * 0.9, r * 0.95);
    ctx.lineTo(-r * 0.4, 0);
    ctx.lineTo(-r * 0.9, -r * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // idle weapon
    if (s.weapon === "gun") {
      ctx.strokeStyle = "#ffe07a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(r * 0.3, 0);
      ctx.lineTo(r * 2.1, 0);
      ctx.stroke();
      if (s.gunCd > 0) {
        ctx.strokeStyle = "rgba(255,224,122,0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(r * 2.1, 0);
        ctx.lineTo(r * 2.1 + 8, 0);
        ctx.stroke();
      }
    } else if (!sw) {
      // resting edge: a faint crescent hugging the nose
      const ih = half * 0.6;
      ctx.strokeStyle = "rgba(232,251,255,0.7)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.9, -ih, ih);
      ctx.stroke();
      ctx.strokeStyle = "rgba(77,243,255,0.2)";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.9, -ih, ih);
      ctx.stroke();
    }
    ctx.restore();
    // thrusters: flame opposite to the steering input while airborne with fuel
    const th = this.thrust;
    if (p.planet === null && s.fuel > 0 && Math.hypot(th.x, th.y) > 0.2) {
      const a = Math.atan2(th.y, th.x) + Math.PI;
      const flick = 0.75 + 0.25 * Math.sin(this.t * 60);
      const L = (14 + 16 * Math.min(1, Math.hypot(th.x, th.y))) * flick;
      ctx.save();
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(a);
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createLinearGradient(r * 0.6, 0, r * 0.6 + L, 0);
      g.addColorStop(0, "rgba(255,240,180,0.95)");
      g.addColorStop(0.4, "rgba(255,170,60,0.7)");
      g.addColorStop(1, "rgba(255,80,40,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(r * 0.6, -r * 0.45);
      ctx.lineTo(r * 0.6 + L, 0);
      ctx.lineTo(r * 0.6, r * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
      if (Math.random() < 0.6) this.particles.burst(p.pos, 1, { color: "#ffb347", speed: 140, dir: { x: Math.cos(a), y: Math.sin(a) }, spread: 0.5, shape: "dot", size: 2.2, max: 0.25, drag: 3 });
    }
    // fuel gauge: a short vertical bar off the ship's left, screen-oriented; hidden when full on the ground
    const fm = fuelMax(s);
    const ff = s.fuel / fm;
    if (p.planet === null || ff < 0.999) {
      const gx = p.pos.x - r - 13, gy = p.pos.y;
      const H = 26, W = 4;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(gx - W / 2 - 1, gy - H / 2 - 1, W + 2, H + 2);
      ctx.strokeStyle = "rgba(255,211,106,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(gx - W / 2 - 1, gy - H / 2 - 1, W + 2, H + 2);
      const col = ff <= 0.001 ? "#ff4d7a" : ff < 0.3 && Math.floor(this.t * 6) % 2 === 0 ? "#ffb347" : "#ffd36a";
      ctx.fillStyle = col;
      ctx.fillRect(gx - W / 2, gy + H / 2 - H * ff, W, H * ff);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = ff <= 0.001 ? "rgba(255,77,122,0.25)" : "rgba(255,211,106,0.22)";
      ctx.fillRect(gx - W / 2 - 2, gy + H / 2 - H * ff - 1, W + 4, H * ff + 2);
      ctx.globalCompositeOperation = "source-over";
    }
    // dash cooldown ring
    if (p.dashCd > 0) {
      const total = PLAYER.dashCooldown * mods.dashCooldownMult;
      const k = 1 - p.dashCd / total;
      ctx.strokeStyle = "rgba(77,243,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, r + 6, -Math.PI / 2, -Math.PI / 2 + k * 6.283);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(77,243,255,0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, r + 6, 0, 6.283);
      ctx.stroke();
    }
  }

  private drawEnemy(s: GameState, e: Entity): void {
    const ctx = this.ctx;
    const def = ENEMY_DEFS[e.kind as EnemyKind];
    const hue = e.hue;
    const p = s.entities[0];
    const r = e.radius * 1.25; // glyphs read better a touch larger than their hitbox
    ctx.save();
    ctx.translate(e.pos.x, e.pos.y);

    if (e.spawnT > 0) {
      // descending pod
      const a = angleOf(e.vel);
      ctx.rotate(a);
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = hsl(hue, 100, 65, 0.5);
      ctx.lineWidth = r * 1.2;
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(-r - 55 - Math.random() * 20, 0);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = hsl(hue, 40, 22);
      ctx.strokeStyle = hsl(hue, 90, 70);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.3, r * 0.8, 0, 0, 6.283);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    // windup telegraph for melee enemies
    if (e.ai.state === "windup" && e.kind !== "orbiter") {
      const k = 1 - e.ai.t / def.windup;
      const a = angleOf(sub(p.pos, e.pos));
      ctx.fillStyle = hsl(hue, 100, 60, 0.08 + k * 0.22);
      ctx.strokeStyle = hsl(hue, 100, 65, 0.35 + k * 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, def.reach + p.radius, a - 0.6, a + 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const stunned = e.stun > 0;
    const flash = stunned && Math.floor(this.t * 40) % 2 === 0;
    const stroke = flash ? "#ffffff" : hsl(hue, 95, 65);
    const fill = flash ? "rgba(255,255,255,0.7)" : hsl(hue, 60, 14);
    ctx.lineWidth = e.kind === "accretor" ? 3.5 : 2;
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;

    // elite halo
    if (e.elite) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,210,80,0.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = this.t * 30;
      ctx.beginPath();
      ctx.arc(0, 0, r + 7, 0, 6.283);
      ctx.stroke();
      ctx.restore();
    }

    const facing = e.facing;
    if (e.kind === "grunt") {
      ctx.rotate(facing);
      ctx.beginPath();
      ctx.moveTo(r * 1.2, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.lineTo(0, -r);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (e.kind === "hopper") {
      ctx.rotate(facing);
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r * 0.8, r * 0.9); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.8, -r * 0.9);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (e.kind === "orbiter") {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.rotate(this.t * 2);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, 6.283); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 1.5, 0); ctx.lineTo(-r, 0); ctx.moveTo(r, 0); ctx.lineTo(r * 1.5, 0);
      ctx.stroke();
      if (e.ai.state === "aim") {
        const k = 1 - e.ai.t / def.windup;
        ctx.fillStyle = hsl(hue, 100, 80, k);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.4 * k, 0, 6.283); ctx.fill();
      }
    } else if (e.kind === "bulwark") {
      ctx.rotate(facing);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); }
      ctx.closePath(); ctx.stroke();
    } else {
      // accretor
      ctx.save();
      ctx.rotate(this.t * 0.6);
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * 6.283;
        const rr = i % 2 === 0 ? r : r * 0.78;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.7);
      g.addColorStop(0, hsl(hue, 100, e.ai.phase === 2 ? 80 : 65, 0.9));
      g.addColorStop(1, hsl(hue, 100, 60, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.save();
      ctx.rotate(-this.t * 1.3);
      ctx.strokeStyle = hsl(hue, 100, 75, 0.6);
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 16]);
      ctx.beginPath(); ctx.arc(0, 0, r + 14, 0, 6.283); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // hp bar
    if (e.hp < e.maxHp && e.kind !== "accretor") {
      const w = r * 2.4, h = 3;
      const x = e.pos.x - w / 2, y = e.pos.y - r - 10;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = hsl(hue, 90, 60);
      ctx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), h);
    }
  }
}
