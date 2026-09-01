import type { Vec } from "../../shared/vec";

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string;
  drag: number; grav: number; shape: "dot" | "spark" | "ring" | "shard"; rot: number; spin: number;
  additive: boolean;
}

export interface Floater {
  x: number; y: number; vy: number; life: number; max: number; text: string; color: string; size: number;
}

export class Particles {
  list: Particle[] = [];
  floaters: Floater[] = [];
  max = 900;

  burst(pos: Vec, count: number, opts: Partial<Particle> & { speed?: number; spread?: number; dir?: Vec; color: string }): void {
    for (let i = 0; i < count; i++) {
      const a = opts.dir ? Math.atan2(opts.dir.y, opts.dir.x) + (Math.random() - 0.5) * (opts.spread ?? Math.PI * 2) : Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 200) * (0.3 + Math.random() * 0.9);
      const life = (opts.max ?? 0.5) * (0.6 + Math.random() * 0.7);
      this.list.push({
        x: pos.x, y: pos.y, vx: Math.cos(a) * sp + (opts.vx ?? 0), vy: Math.sin(a) * sp + (opts.vy ?? 0),
        life, max: life, size: (opts.size ?? 3) * (0.6 + Math.random() * 0.8), color: opts.color,
        drag: opts.drag ?? 2.5, grav: opts.grav ?? 0, shape: opts.shape ?? "dot", rot: Math.random() * 6.28,
        spin: (Math.random() - 0.5) * 12, additive: opts.additive ?? true,
      });
    }
    if (this.list.length > this.max) this.list.splice(0, this.list.length - this.max);
  }

  ring(pos: Vec, color: string, size: number, life = 0.4): void {
    this.list.push({ x: pos.x, y: pos.y, vx: 0, vy: 0, life, max: life, size, color, drag: 0, grav: 0, shape: "ring", rot: 0, spin: 0, additive: true });
  }

  float(pos: Vec, text: string, color: string, size = 16): void {
    this.floaters.push({ x: pos.x + (Math.random() - 0.5) * 14, y: pos.y - 10, vy: -55, life: 0.9, max: 0.9, text, color, size });
  }

  update(dt: number): void {
    const keep: Particle[] = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      keep.push(p);
    }
    this.list = keep;
    const fk: Floater[] = [];
    for (const f of this.floaters) {
      f.life -= dt;
      if (f.life <= 0) continue;
      f.y += f.vy * dt;
      f.vy *= Math.exp(-3 * dt);
      fk.push(f);
    }
    this.floaters = fk;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const t = p.life / p.max;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.globalCompositeOperation = p.additive ? "lighter" : "source-over";
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.shape === "dot") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, 6.283);
        ctx.fill();
      } else if (p.shape === "spark") {
        const l = Math.hypot(p.vx, p.vy) * 0.03 + 2;
        const a = Math.atan2(p.vy, p.vx);
        ctx.lineWidth = p.size * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(a) * l, p.y - Math.sin(a) * l);
        ctx.stroke();
      } else if (p.shape === "ring") {
        const r = p.size * (1 - t) + 4;
        ctx.lineWidth = 3 * t + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, 6.283);
        ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(-s, -s * 0.5);
        ctx.lineTo(s * 0.8, -s * 0.3);
        ctx.lineTo(s * 0.5, s * 0.7);
        ctx.lineTo(-s * 0.6, s * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  drawFloaters(ctx: CanvasRenderingContext2D, zoom: number): void {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of this.floaters) {
      const t = f.life / f.max;
      ctx.globalAlpha = Math.min(1, t * 2);
      const size = f.size / zoom;
      ctx.font = `bold ${size}px "Rajdhani", "Segoe UI", sans-serif`;
      ctx.lineWidth = 4 / zoom;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}
