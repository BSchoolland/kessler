import { DT } from "../../shared/config";
import { chooseUpgrade, createGame, step } from "../../shared/sim";
import { damageEnemy, placePlayer } from "../../shared/actions";
import { isBoss } from "../../shared/enemies";
import { createTutorial } from "../../shared/tutorial";
import type { EnemyKind, GameState } from "../../shared/types";
import { add, dist, fromAngle, len, norm, scale, sub, type Vec } from "../../shared/vec";
import { submitScore } from "./api";
import { Camera } from "./camera";
import { applyEvents } from "./fx";
import { Input } from "./input";
import { loadProfile, saveProfile } from "./meta";
import { Particles } from "./particles";
import { Renderer } from "./render";
import { audioContext, play, setIntensity, setMusicVolume, setSfxVolume, setThrust, startMusic } from "./sound";
import { UI } from "./ui";
import { Bestiary } from "./bestiary";
import { TouchIcons } from "./touchicons";
import { botInput } from "../../shared/bot";
import { Rng } from "../../shared/rng";

// debug/playtest params: ?bot=1 drives the player with the balance bot, ?seed=N fixes the seed, ?wave=N starts there,
// ?god=1 keeps the player alive, ?smite=1 chips bosses down so a boss wave can be watched end to end
const params = new URLSearchParams(location.search);
const BOT = params.get("bot") === "1";
const GOD = params.get("god") === "1";
const SMITE = params.get("smite") === "1";
const debugRng = new Rng(4);
const botRng = new Rng(99);

type Mode = "menu" | "playing" | "paused" | "offers" | "over" | "won";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const profile = loadProfile();
const cam = new Camera();
const particles = new Particles();
const renderer = new Renderer(canvas, cam, particles);
const input = new Input(canvas);
const ui = new UI();
const bestiary = new Bestiary(document.getElementById("bestiary")!);
const touchIcons = new TouchIcons(document.getElementById("t-attack")!, document.getElementById("t-dash")!);

let mode: Mode = "menu";
let state: GameState | null = null;
let acc = 0;
let last = performance.now();
let fpsAvg = 60;
let voidDeath = false;
let submitted = false;
let finishing = false;
let pending = { attack: false, dash: false };
let lockedTarget: number | null = null;

function applySettings(): void {
  const st = profile.settings;
  cam.shakeEnabled = st.shake;
  renderer.showDamageNumbers = st.damageNumbers;
  setSfxVolume(st.sfx);
  setMusicVolume(st.music);
  (document.getElementById("set-shake") as HTMLInputElement).checked = st.shake;
  (document.getElementById("set-dmg") as HTMLInputElement).checked = st.damageNumbers;
  (document.getElementById("set-assist") as HTMLInputElement).checked = st.aimAssist;
  (document.getElementById("set-autoaim") as HTMLInputElement).checked = st.autoAim;
  (document.getElementById("set-fps") as HTMLInputElement).checked = st.showFps;
  (document.getElementById("set-sfx") as HTMLInputElement).value = `${st.sfx}`;
  (document.getElementById("set-music") as HTMLInputElement).value = `${st.music}`;
}

function bindSettings(): void {
  const on = (id: string, fn: (el: HTMLInputElement) => void) => document.getElementById(id)!.addEventListener("input", (e) => { fn(e.target as HTMLInputElement); applySettings(); saveProfile(profile); });
  on("set-shake", (el) => (profile.settings.shake = el.checked));
  on("set-dmg", (el) => (profile.settings.damageNumbers = el.checked));
  on("set-assist", (el) => (profile.settings.aimAssist = el.checked));
  on("set-autoaim", (el) => (profile.settings.autoAim = el.checked));
  on("set-fps", (el) => (profile.settings.showFps = el.checked));
  on("set-sfx", (el) => { profile.settings.sfx = Number(el.value); play("click"); });
  on("set-music", (el) => (profile.settings.music = Number(el.value)));
}

function showMenu(): void {
  mode = "menu";
  setThrust(0);
  ui.hideAllScreens();
  ui.show("menu");
  ui.showHud(false);
  ui.show("tut", false);
  ui.show("tut-badge", !profile.tutorialDone);
  document.getElementById("menu-best")!.textContent = profile.bestScore ? `BEST ${profile.bestScore} · WAVE ${profile.bestWave} · ${profile.runs} RUNS${profile.wins ? ` · ${profile.wins} CLEARS` : ""}` : "no runs yet";
  canvas.style.cursor = "default";
}

function startRun(): void {
  const seed = params.get("seed") ? Number(params.get("seed")) : (Math.random() * 2 ** 31) >>> 0;
  const s = createGame(seed);
  if (params.get("wave")) s.wave.n = Number(params.get("wave")) - 1;
  enter(s);
}

function startTutorial(): void {
  enter(createTutorial());
}

function enter(s: GameState): void {
  audioContext();
  startMusic();
  enterFullscreen();
  state = s;
  particles.list = [];
  particles.floaters = [];
  cam.snap(state.entities[0].pos);
  cam.trauma = 0;
  voidDeath = false;
  submitted = false;
  finishing = false;
  lockedTarget = null;
  pending = { attack: false, dash: false };
  mode = "playing";
  ui.hideAllScreens();
  ui.showHud(true);
  canvas.style.cursor = "none";
  acc = 0;
  ui.updateTutorial(state, input.usingTouch);
}

function showWon(s: GameState): void {
  profile.wins++;
  saveProfile(profile);
  const st = s.stats;
  const rows: [string, number | string][] = [["SCORE", s.score], ["KILLS", st.kills], ["VOID", st.voidKills], ["BOSSES", st.bossKills], ["TIME", `${Math.round(st.time)}s`], ["LAUNCHES", st.dashes]];
  document.getElementById("won-stats")!.innerHTML = rows.map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join("");
  window.setTimeout(() => { if (state === s && !s.over) { mode = "won"; ui.show("won"); canvas.style.cursor = "default"; setThrust(0); } }, 2600);
}

function finishTutorial(): void {
  mode = "over";
  setThrust(0);
  profile.tutorialDone = true;
  saveProfile(profile);
  canvas.style.cursor = "default";
  window.setTimeout(() => { if (state?.tutorial?.step === "done") ui.show("tutdone"); }, 1500);
}

function finishRun(): void {
  if (!state) return;
  mode = "over";
  setThrust(0);
  const s = state;
  profile.runs++;
  profile.totalKills += s.stats.kills;
  profile.voidKills += s.stats.voidKills;
  profile.bossKills += s.stats.bossKills;
  const isBest = s.score > profile.bestScore;
  ui.showGameOver(s, profile, voidDeath);
  if (isBest) { profile.bestScore = s.score; profile.bestWave = Math.max(profile.bestWave, s.wave.n); }
  saveProfile(profile);
  canvas.style.cursor = "default";
  const list = document.getElementById("go-list")!;
  if (!submitted && s.score > 0) {
    submitted = true;
    submitScore({ name: profile.name || "anonymous", score: s.score, wave: s.wave.n, kills: s.stats.kills, voidKills: s.stats.voidKills })
      .then((r) => { ui.setRank(`${isBest ? "NEW PERSONAL BEST · " : ""}RANK #${r.rank} ALL TIME`); return ui.loadLeaderboard(list, profile.name || "anonymous"); })
      .catch(() => ui.loadLeaderboard(list, profile.name || "anonymous"));
  } else {
    void ui.loadLeaderboard(list, profile.name || "anonymous");
  }
}

function aimAssistTarget(s: GameState): Vec | null {
  if (!profile.settings.aimAssist && !input.usingTouch) return null;
  const p = s.entities[0];
  let best: Vec | null = null;
  let bd = 260;
  for (const e of s.entities) {
    if (e.kind === "player" || e.dead || e.spawnT > 0) continue;
    const d = dist(e.pos, p.pos);
    if (d < bd) { bd = d; best = norm(sub(e.pos, p.pos)); }
  }
  return best;
}

function liveTargets(s: GameState) {
  const p = s.entities[0];
  return s.entities.filter((e) => e.kind !== "player" && !e.dead && e.spawnT <= 0).sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos));
}

/** The gun's target is always the nearest living enemy. */
function updateLock(s: GameState): void {
  const targets = liveTargets(s);
  lockedTarget = targets.length ? targets[0].id : null;
}

/**
 * Only the gun aims, and only in space. Auto-aim points at the nearest enemy;
 * with it off the mouse / right stick aims. On a planet the sim derives facing from movement.
 */
function resolveAim(s: GameState, snap: ReturnType<Input["poll"]>): Vec {
  const p = s.entities[0];
  if (p.planet !== null) return fromAngle(p.facing);
  if (profile.settings.autoAim) {
    const t = lockedTarget !== null ? s.entities.find((e) => e.id === lockedTarget) : undefined;
    if (t) return norm(sub(add(t.pos, scale(t.vel, 0.15)), p.pos));
    return len(snap.frame.move) > 0.2 ? norm(snap.frame.move) : len(p.vel) > 40 ? norm(p.vel) : fromAngle(p.facing);
  }
  return snap.frame.aim;
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsAvg = fpsAvg * 0.95 + (1 / Math.max(rawDt, 1e-3)) * 0.05;

  if (state) {
    const s = state;
    const p = s.entities[0];
    const playerScreen = cam.toScreen(p.pos);
    const snap = input.poll(playerScreen, mode === "playing" ? aimAssistTarget(s) : null);
    if (mode === "playing") {
      updateLock(s);
      snap.frame.aim = resolveAim(s, snap);
    }
    renderer.lockedTarget = profile.settings.autoAim ? lockedTarget : null;
    renderer.thrust = mode === "playing" ? snap.frame.move : { x: 0, y: 0 };

    if (mode === "playing") {
      if (snap.pausePressed) { mode = "paused"; ui.show("pause"); canvas.style.cursor = "default"; setThrust(0); }
      else {
        acc += rawDt;
        let steps = 0;
        // Edges are latched until a sim step actually consumes them: on a 120Hz+ display or during
        // a hit-stop freeze a frame may run zero steps, and the press must not be lost.
        pending.attack ||= snap.frame.attack;
        pending.dash ||= snap.frame.dash;
        while (acc >= DT && steps < 6) {
          const frozen = s.freeze > 0;
          let frameInput = { ...snap.frame, attack: pending.attack && !frozen, dash: pending.dash && !frozen };
          if (BOT) { frameInput = botInput(s, () => botRng.next()); renderer.thrust = frameInput.move; }
          step(s, frameInput);
          if (GOD) { p.hp = p.maxHp; if (len(p.pos) > 1350) placePlayer(s, 0, -Math.PI / 2); }
          if (SMITE) for (const e of s.entities) if (isBoss(e.kind as EnemyKind) && !e.dead && e.spawnT <= 0 && s.tick % 6 === 0) damageEnemy({ s, rng: debugRng, dt: DT }, e, e.maxHp / 400, "blade");
          if (!frozen) pending = { attack: false, dash: false };
          applyEvents(s, s.events, particles, cam, { banner: (t, sub, k) => ui.banner(t, sub, k), hurtFlash: () => (renderer.hurtFlash = 1) });
          for (const ev of s.events) {
            if (ev.type === "void" && ev.kind === "player" && s.over) voidDeath = true;
            if (ev.type === "tutorial" && ev.step === "done") finishTutorial();
            if (ev.type === "won") showWon(s);
          }
          acc -= DT;
          steps++;
        }
        if (acc > DT * 6) acc = 0;
        if (s.offers && !s.over) { mode = "offers"; ui.showOffers(s.offers); canvas.style.cursor = "default"; }
        if (s.over && !finishing) {
          // keep simulating the death scene for a beat before the results screen
          finishing = true;
          window.setTimeout(() => { if (state === s) finishRun(); }, 1300);
        }
      }
    } else if (mode === "offers") {
      if (snap.numberKey && s.offers && s.offers[snap.numberKey - 1]) pickOffer(s.offers[snap.numberKey - 1].id);
      else if (snap.menuNav) ui.setFocus(ui.focusIdx + snap.menuNav);
      else if (snap.menuConfirm && s.offers) pickOffer(s.offers[ui.focusIdx].id);
    } else if (mode === "paused") {
      if (snap.pausePressed || snap.menuBack) resume();
    } else if (mode === "won") {
      if (snap.menuConfirm || snap.pausePressed) { ui.show("won", false); resume(); }
    }

    if (mode === "playing" || mode === "over" || mode === "offers" || mode === "won") {
      particles.update(rawDt);
      const aimWorld = fromAngle(p.facing);
      cam.update(p.pos, aimWorld, p.planet === null, rawDt);
      const enemies = s.entities.length - 1;
      setIntensity(s.over ? 0 : Math.min(1, 0.2 + enemies * 0.08 + (s.wave.boss ? 0.4 : 0)));
      const thrusting = mode === "playing" && !s.over && p.planet === null && s.fuel > 0 ? Math.min(1, len(renderer.thrust)) : 0;
      setThrust(thrusting > 0.2 ? thrusting : 0);
    }
    const showCursor = mode === "playing" && !BOT && s.weapon === "gun" && !profile.settings.autoAim;
    renderer.draw(s, showCursor ? snap.aimScreen : null, rawDt, { paused: mode !== "playing" });
    ui.updateHud(s, profile.bestScore, profile.settings.showFps ? fpsAvg : null);
    ui.updateTutorial(s, input.usingTouch);
    const touchOn = mode === "playing" && input.usingTouch;
    ui.show("touch", touchOn);
    if (touchOn) touchIcons.update(s, snap.frame.move, rawDt);
  } else {
    // menu backdrop: an idle demo world
    if (!demo) { demo = createGame(7); cam.snap({ x: 0, y: 0 }); }
    step(demo, { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: false, dash: false });
    if (demo.wave.n > 3 || demo.over) demo = createGame((Math.random() * 1e9) >>> 0);
    cam.targetZoom = 0.42;
    cam.zoom += (cam.targetZoom - cam.zoom) * 0.02;
    cam.pos.x += (Math.sin(performance.now() / 9000) * 200 - cam.pos.x) * 0.01;
    cam.pos.y += (Math.cos(performance.now() / 11000) * 150 - cam.pos.y) * 0.01;
    particles.update(rawDt);
    applyEventsSilently(demo);
    renderer.draw(demo, null, rawDt, { paused: true });
    ui.show("touch", false);
  }
}
let demo: GameState | null = null;

function applyEventsSilently(s: GameState): void {
  // menu demo: particles only, no sound or shake
  for (const ev of s.events) {
    if (ev.type === "kill") particles.burst(ev.pos, 16, { color: "#fff", speed: 300, shape: "shard", size: 4, max: 0.7 });
    if (ev.type === "impact" && ev.kind !== "debris") particles.burst(ev.pos, 10, { color: "#ffd9a0", speed: 200, dir: ev.normal, spread: 2, shape: "spark", size: 2.5, max: 0.4 });
  }
}

function pickOffer(id: string): void {
  if (!state || !state.offers) return;
  chooseUpgrade(state, id);
  play("upgrade");
  ui.hideOffers();
  mode = "playing";
  canvas.style.cursor = "none";
  acc = 0;
}

function resume(): void {
  mode = "playing";
  ui.show("pause", false);
  canvas.style.cursor = "none";
  acc = 0;
  last = performance.now();
}

function bindMenu(): void {
  const nameEl = document.getElementById("name") as HTMLInputElement;
  nameEl.value = profile.name;
  nameEl.addEventListener("input", () => { profile.name = nameEl.value.replace(/[^\w \-.!?]/g, "").slice(0, 16); saveProfile(profile); });
  nameEl.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") nameEl.blur(); });
  nameEl.addEventListener("focus", updateSwipeHint);
  nameEl.addEventListener("blur", () => { window.setTimeout(updateSwipeHint, 250); window.scrollTo(0, document.documentElement.scrollHeight); });
  if (input.usingTouch || "ontouchstart" in window) document.getElementById("offer-hint")!.textContent = "tap a card";
  document.getElementById("btn-play")!.addEventListener("click", startRun);
  document.getElementById("btn-tutorial")!.addEventListener("click", startTutorial);
  document.getElementById("btn-tut-play")!.addEventListener("click", startRun);
  document.getElementById("btn-tut-menu")!.addEventListener("click", () => { state = null; showMenu(); });
  document.getElementById("btn-howto")!.addEventListener("click", () => { ui.show("menu", false); ui.show("howto"); bestiary.start(); });
  document.getElementById("btn-settings")!.addEventListener("click", () => { ui.show("menu", false); ui.show("settings"); });
  document.getElementById("btn-leaderboard")!.addEventListener("click", () => { ui.show("menu", false); ui.show("leaderboard"); void ui.loadLeaderboard(document.getElementById("lb-list")!, profile.name); });
  document.querySelectorAll(".modal .close").forEach((b) => b.addEventListener("click", () => { ui.hideAllScreens(); ui.show("menu"); bestiary.stop(); }));
  document.getElementById("btn-resume")!.addEventListener("click", resume);
  document.getElementById("btn-won-go")!.addEventListener("click", () => { ui.show("won", false); resume(); });
  document.getElementById("btn-won-menu")!.addEventListener("click", () => { state = null; showMenu(); });
  document.getElementById("btn-quit")!.addEventListener("click", () => { state = null; showMenu(); });
  document.getElementById("btn-again")!.addEventListener("click", startRun);
  document.getElementById("btn-menu")!.addEventListener("click", () => { state = null; showMenu(); });
  document.querySelectorAll("button").forEach((b) => b.addEventListener("mouseenter", () => play("click", 0.3)));
  ui.onOffer = pickOffer;
  window.addEventListener("keydown", (e) => {
    if (mode !== "menu") return;
    if (e.code === "Enter" && document.activeElement !== nameEl && !document.getElementById("menu")!.classList.contains("hidden")) startRun();
    if (e.code === "Escape") { ui.hideAllScreens(); ui.show("menu"); bestiary.stop(); }
  });
}

// the stage fills the window; on a touch device held portrait it is rotated so the game stays landscape
const stage = document.getElementById("stage")!;
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !("MSStream" in window);
function layout(): void {
  const w = window.innerWidth, h = window.innerHeight;
  const rot = input.usingTouch && h > w;
  stage.classList.toggle("rot", rot);
  const sw = rot ? h : w, sh = rot ? w : h;
  stage.style.width = `${sw}px`;
  stage.style.height = `${sh}px`;
  // compact layouts key off the stage, not the window, so a rotated phone gets them too
  stage.classList.toggle("narrow", sw <= 760);
  stage.classList.toggle("short", sh <= 560);
  renderer.sizeTo(rot ? h : w, rot ? w : h);
}
const STANDALONE = window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches;
if (IOS && !STANDALONE) document.documentElement.classList.add("ios-browser");
/**
 * iPhone Safari in landscape keeps its address bar (and tab bar) over a quarter of the screen until the
 * page is scrolled by a finger. The page is taller than the viewport for exactly that; this overlay asks
 * for the swipe and goes away once the viewport has grown to the full screen height.
 */
function updateSwipeHint(): void {
  const el = document.getElementById("swipe")!;
  const landscape = window.innerWidth > window.innerHeight;
  const full = Math.min(screen.width, screen.height);
  const barsVisible = window.innerHeight < full - 6;
  // the on-screen keyboard also shrinks the viewport; that's not Safari's bars
  const typing = document.activeElement instanceof HTMLInputElement;
  const show = IOS && !STANDALONE && landscape && barsVisible && !typing;
  el.classList.toggle("hidden", !show);
}
function collapseBar(): void {
  updateSwipeHint();
}
window.addEventListener("resize", () => { layout(); updateSwipeHint(); });
window.addEventListener("scroll", updateSwipeHint, { passive: true });
window.visualViewport?.addEventListener("resize", updateSwipeHint);
window.addEventListener("orientationchange", () => { window.setTimeout(layout, 50); collapseBar(); });
window.addEventListener("touchstart", () => window.setTimeout(layout, 0), { passive: true, once: true });
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("dblclick", (e) => e.preventDefault());

/** Phones: go fullscreen and lock landscape where the browser allows it; iPhone Safari allows neither, so it gets a hint instead. */
function enterFullscreen(): void {
  if (!input.usingTouch) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  const standalone = STANDALONE;
  collapseBar();
  if (req && !document.fullscreenElement) {
    req().then(() => {
      const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      return so.lock?.("landscape");
    }).catch((err: unknown) => console.info("fullscreen/orientation not available:", err));
  } else if (IOS && !standalone && !profile.iosHintShown) {
    profile.iosHintShown = true;
    saveProfile(profile);
    const hint = document.getElementById("ios-hint")!;
    hint.classList.remove("hidden");
    window.setTimeout(() => hint.classList.add("hidden"), 7000);
  }
}
layout();
applySettings();
bindSettings();
bindMenu();
showMenu();
requestAnimationFrame(frame);
