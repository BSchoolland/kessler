import type { InputFrame } from "../../shared/types";
import { len, norm, sub, type Vec } from "../../shared/vec";

export interface InputSnapshot {
  frame: InputFrame;
  aimScreen: Vec | null; // null when aiming with a stick
  usingGamepad: boolean;
  pausePressed: boolean;
  menuConfirm: boolean;
  menuBack: boolean;
  menuNav: number; // -1 / 0 / +1
  numberKey: number; // 1..3 or 0
}

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private mouse: Vec = { x: 0, y: 0 };
  private mouseDown = new Set<number>();
  private mousePressed = new Set<number>();
  private padPrev: Record<string, boolean> = {};
  usingGamepad = false;
  lastGamepadAim: Vec = { x: 1, y: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.usingGamepad = false;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => { this.keys.clear(); this.mouseDown.clear(); });
    canvas.addEventListener("mousemove", (e) => { this.mouse = { x: e.clientX, y: e.clientY }; this.usingGamepad = false; });
    canvas.addEventListener("mousedown", (e) => { this.mouseDown.add(e.button); this.mousePressed.add(e.button); this.usingGamepad = false; e.preventDefault(); });
    window.addEventListener("mouseup", (e) => this.mouseDown.delete(e.button));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  get mousePos(): Vec {
    return this.mouse;
  }

  /** Build this tick's input. `playerScreen` is where the player is drawn, for mouse aim. */
  poll(playerScreen: Vec, aimAssist: Vec | null): InputSnapshot {
    const k = this.keys;
    let move: Vec = { x: 0, y: 0 };
    if (k.has("KeyA") || k.has("ArrowLeft")) move.x -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) move.x += 1;
    if (k.has("KeyW") || k.has("ArrowUp")) move.y -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) move.y += 1;
    let attack = this.mousePressed.has(0) || this.pressed.has("KeyJ");
    let dash = this.mousePressed.has(2) || this.pressed.has("Space") || this.pressed.has("ShiftLeft") || this.pressed.has("KeyK");
    let pausePressed = this.pressed.has("Escape") || this.pressed.has("KeyP");
    let menuConfirm = this.pressed.has("Enter") || this.pressed.has("Space");
    let menuBack = this.pressed.has("Escape");
    let menuNav = (this.pressed.has("ArrowDown") || this.pressed.has("KeyS") ? 1 : 0) - (this.pressed.has("ArrowUp") || this.pressed.has("KeyW") ? 1 : 0);
    let numberKey = this.pressed.has("Digit1") ? 1 : this.pressed.has("Digit2") ? 2 : this.pressed.has("Digit3") ? 3 : 0;
    let aim: Vec = norm(sub(this.mouse, playerScreen));
    let aimScreen: Vec | null = this.mouse;

    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
      const lx = dz(pad.axes[0] ?? 0), ly = dz(pad.axes[1] ?? 0);
      const rx = dz(pad.axes[2] ?? 0), ry = dz(pad.axes[3] ?? 0);
      const btn = (i: number) => !!pad.buttons[i]?.pressed;
      const edge = (name: string, down: boolean) => { const was = this.padPrev[name]; this.padPrev[name] = down; return down && !was; };
      const anyPad = lx || ly || rx || ry || pad.buttons.some((b) => b.pressed);
      if (anyPad) this.usingGamepad = true;
      if (this.usingGamepad) {
        move = { x: lx, y: ly };
        if (Math.hypot(rx, ry) > 0.3) this.lastGamepadAim = norm({ x: rx, y: ry });
        else if (aimAssist) this.lastGamepadAim = aimAssist;
        aim = this.lastGamepadAim;
        aimScreen = null;
        attack = edge("attack", btn(7) || btn(0) || btn(5));
        dash = edge("dash", btn(6) || btn(1) || btn(4));
        pausePressed = edge("pause", btn(9));
        menuConfirm = edge("confirm", btn(0)) || edge("start", btn(9));
        menuBack = edge("back", btn(1));
        menuNav = (edge("down", btn(13) || ly > 0.6) ? 1 : 0) - (edge("up", btn(12) || ly < -0.6) ? 1 : 0);
        numberKey = edge("n1", btn(2)) ? 1 : edge("n2", btn(3)) ? 2 : 0;
        if (edge("n3", btn(5))) numberKey = 3;
      }
    }
    if (len(move) > 1) move = norm(move);
    this.pressed.clear();
    this.mousePressed.clear();
    return { frame: { move, aim, attack, dash }, aimScreen, usingGamepad: this.usingGamepad, pausePressed, menuConfirm, menuBack, menuNav, numberKey };
  }
}
