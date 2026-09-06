import { PLAYER } from "../../shared/config";
import type { GameState } from "../../shared/types";
import { len, type Vec } from "../../shared/vec";
import { PLAYER_COLOR } from "./render";

export type AttackKind = "sweep" | "wave" | "gun" | "pulse";

/** Which attack the attack button will produce right now, from the same rules the sim uses. */
export function attackKind(s: GameState, move: Vec): AttackKind {
  const p = s.entities[0];
  if (p.planet === null) return s.ammo > 0 ? "gun" : "pulse";
  return len(move) > 0.2 ? "wave" : "sweep";
}

const LABEL: Record<AttackKind, string> = { sweep: "SWEEP", wave: "WAVE", gun: "GUN", pulse: "PULSE" };
const CYAN = PLAYER_COLOR;
const GOLD = "#ffe07a";

/**
 * The two touch buttons draw themselves with the game's own shapes: the ship on a curved
 * surface, and the attack it will actually do (or the launch it can do) right now.
 */
export class TouchIcons {
  private ac: CanvasRenderingContext2D;
  private lc: CanvasRenderingContext2D;
  private t = 0;
  private last: AttackKind | null = null;
  private lastLaunch: boolean | null = null;

  constructor(private attackBtn: HTMLElement, private launchBtn: HTMLElement) {
    this.ac = (attackBtn.querySelector("canvas") as HTMLCanvasElement).getContext("2d")!;
    this.lc = (launchBtn.querySelector("canvas") as HTMLCanvasElement).getContext("2d")!;
  }

  update(s: GameState, move: Vec, dt: number): void {
    this.t += dt;
    const kind = attackKind(s, move);
    if (kind !== this.last) {
      this.last = kind;
      this.attackBtn.querySelector("span")!.textContent = LABEL[kind];
      this.attackBtn.classList.toggle("melee", kind === "sweep" || kind === "wave");
    }
    const canLaunch = s.entities[0].planet !== null && s.fuel > 0;
    if (canLaunch !== this.lastLaunch) {
      this.lastLaunch = canLaunch;
      this.launchBtn.classList.toggle("dim", !canLaunch);
      this.launchBtn.querySelector("span")!.textContent = canLaunch ? "LAUNCH" : s.entities[0].planet === null ? "IN FLIGHT" : "NO FUEL";
    }
    this.drawAttack(kind, s.ammo);
    this.drawLaunch(canLaunch);
  }

  /** Ground scene: a planet arc across the bottom with the ship standing on it at (cx, cy). */
  private ground(ctx: CanvasRenderingContext2D, W: number): { cx: number; cy: number; r: number } {
    const R = W * 1.05, cx = W / 2, pcy = W * 0.62 + R;
    ctx.fillStyle = "rgba(20,32,52,0.9)";
    ctx.strokeStyle = "rgba(120,160,220,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, pcy, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    return { cx, cy: pcy - R - W * 0.075, r: W * 0.075 };
  }

  private ship(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number, color = CYAN): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "#0a1a24";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0); ctx.lineTo(-r * 0.9, r * 0.95); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.9, -r * 0.95);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  private drawAttack(kind: AttackKind, ammo: number): void {
    const ctx = this.ac;
    const W = ctx.canvas.width;
    ctx.clearRect(0, 0, W, W);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    if (kind === "sweep" || kind === "wave") {
      const g = this.ground(ctx, W);
      if (kind === "sweep") {
        // standing still: the overhead crescent, both sides
        this.ship(ctx, g.cx, g.cy, g.r, -Math.PI / 2);
        const reach = g.r * 4.2;
        const half = PLAYER.swing.overheadArc / 2;
        ctx.save();
        ctx.translate(g.cx, g.cy);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(77,243,255,${0.10 + 0.08 * pulse})`;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, reach, -Math.PI / 2 - half, -Math.PI / 2 + half); ctx.closePath(); ctx.fill();
        for (const [w, a] of [[10, 0.25], [4, 0.7], [2, 1]] as const) {
          ctx.strokeStyle = `rgba(77,243,255,${a * (0.7 + 0.3 * pulse)})`;
          ctx.lineWidth = w;
          ctx.beginPath(); ctx.arc(0, 0, reach, -Math.PI / 2 - half, -Math.PI / 2 + half); ctx.stroke();
        }
        ctx.restore();
      } else {
        // moving: the ship faces along the ground and a wall of light runs ahead of it
        this.ship(ctx, g.cx - W * 0.16, g.cy, g.r, 0);
        const R = W * 1.05, pcy = g.cy + g.r + R;
        const H = W * 0.16;
        const a0 = -Math.PI / 2 + 0.12, a1 = -Math.PI / 2 + 0.42 + 0.06 * pulse;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const grad = ctx.createRadialGradient(g.cx, pcy, R, g.cx, pcy, R + H);
        grad.addColorStop(0, "rgba(77,243,255,0.6)");
        grad.addColorStop(1, "rgba(77,243,255,0.05)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(g.cx, pcy, R + H, a0, a1); ctx.arc(g.cx, pcy, R, a1, a0, true); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(g.cx + Math.cos(a1) * R, pcy + Math.sin(a1) * R); ctx.lineTo(g.cx + Math.cos(a1) * (R + H), pcy + Math.sin(a1) * (R + H)); ctx.stroke();
        ctx.restore();
      }
      return;
    }
    // in space: stars, the ship, and either the gun or the dry pulse
    ctx.fillStyle = "rgba(200,215,255,0.5)";
    for (let i = 0; i < 9; i++) ctx.fillRect(((i * 53) % W), ((i * 37 + 11) % W), 2, 2);
    const cx = W / 2, cy = W * 0.5, r = W * 0.085;
    if (kind === "gun") {
      this.ship(ctx, cx - W * 0.1, cy, r, 0);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(cx - W * 0.1 + r * 0.3, cy); ctx.lineTo(cx - W * 0.1 + r * 2.2, cy); ctx.stroke();
      const sx = cx + W * 0.12 + W * 0.08 * pulse;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(255,224,122,0.55)";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(sx - W * 0.16, cy); ctx.lineTo(sx, cy); ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(sx, cy, 4.5, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(sx, cy, 2, 0, 6.283); ctx.fill();
      ctx.restore();
      ctx.fillStyle = GOLD;
      ctx.font = `700 ${Math.round(W * 0.16)}px Rajdhani, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(`${ammo}`, W - W * 0.12, W * 0.3);
    } else {
      this.ship(ctx, cx, cy, r, -Math.PI / 2);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const rr = r * 2.2 + r * 1.6 * pulse;
      ctx.strokeStyle = `rgba(77,243,255,${0.9 - 0.6 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = "rgba(77,243,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, 6.283); ctx.stroke();
      ctx.restore();
    }
  }

  private drawLaunch(can: boolean): void {
    const ctx = this.lc;
    const W = ctx.canvas.width;
    ctx.clearRect(0, 0, W, W);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    const g = this.ground(ctx, W);
    const lift = can ? W * 0.16 + W * 0.05 * pulse : 0;
    const y = g.cy - lift;
    if (can) {
      // exhaust between the hull and the ground
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const grad = ctx.createLinearGradient(0, y + g.r, 0, g.cy + g.r);
      grad.addColorStop(0, "rgba(255,240,180,0.95)");
      grad.addColorStop(0.5, "rgba(255,170,60,0.6)");
      grad.addColorStop(1, "rgba(255,80,40,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(g.cx - g.r * 0.5, y + g.r * 0.6); ctx.lineTo(g.cx, g.cy + g.r + W * 0.02); ctx.lineTo(g.cx + g.r * 0.5, y + g.r * 0.6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    this.ship(ctx, g.cx, y, g.r, -Math.PI / 2, can ? CYAN : "rgba(120,140,170,0.8)");
  }
}
