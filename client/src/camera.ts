import { CAMERA } from "../../shared/config";
import { damp, type Vec } from "../../shared/vec";

export class Camera {
  pos: Vec = { x: 0, y: 0 };
  zoom = CAMERA.zoom;
  targetZoom = CAMERA.zoom;
  trauma = 0;
  shakeOffset: Vec = { x: 0, y: 0 };
  shakeRot = 0;
  private t = 0;
  shakeEnabled = true;
  width = 1;
  height = 1;

  snap(p: Vec): void {
    this.pos = { ...p };
  }

  addTrauma(x: number): void {
    this.trauma = Math.min(1, this.trauma + x);
  }

  update(target: Vec, aim: Vec, airborne: boolean, dt: number): void {
    this.t += dt;
    const look = { x: target.x + aim.x * CAMERA.lookahead, y: target.y + aim.y * CAMERA.lookahead };
    this.pos.x = damp(this.pos.x, look.x, 6, dt);
    this.pos.y = damp(this.pos.y, look.y, 6, dt);
    const dist = Math.hypot(target.x, target.y);
    this.targetZoom = CAMERA.zoom * (airborne ? 0.9 : 1) * (dist > 900 ? 0.86 : 1) * this.fitScale();
    this.zoom = damp(this.zoom, this.targetZoom, 2.5, dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.shakeEnabled ? this.trauma * this.trauma : 0;
    const n = (f: number, o: number) => Math.sin(this.t * f + o) * Math.sin(this.t * f * 0.37 + o * 2);
    this.shakeOffset = { x: n(61, 1) * 26 * s, y: n(53, 7) * 26 * s };
    this.shakeRot = n(47, 3) * 0.035 * s;
  }

  private fitScale(): number {
    const base = Math.min(this.width / 1280, this.height / 800);
    return Math.max(0.55, Math.min(1.25, base));
  }

  apply(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.width / 2 + this.shakeOffset.x, this.height / 2 + this.shakeOffset.y);
    ctx.rotate(this.shakeRot);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.pos.x, -this.pos.y);
  }

  toScreen(p: Vec): Vec {
    return { x: (p.x - this.pos.x) * this.zoom + this.width / 2 + this.shakeOffset.x, y: (p.y - this.pos.y) * this.zoom + this.height / 2 + this.shakeOffset.y };
  }

  toWorld(p: Vec): Vec {
    return { x: (p.x - this.width / 2 - this.shakeOffset.x) / this.zoom + this.pos.x, y: (p.y - this.height / 2 - this.shakeOffset.y) / this.zoom + this.pos.y };
  }
}
