import { DT } from "../../shared/config";
import { hashString } from "../../shared/rng";
import { chooseUpgrade, createGame, step } from "../../shared/sim";
import type { GameState } from "../../shared/types";
import { dist, fromAngle, norm, sub, type Vec } from "../../shared/vec";
import { submitScore, todayKey } from "./api";
import { Camera } from "./camera";
import { applyEvents } from "./fx";
import { Input } from "./input";
import { loadProfile, saveProfile } from "./meta";
import { Particles } from "./particles";
import { Renderer } from "./render";
import { audioContext, play, setIntensity, setMusicVolume, setSfxVolume, startMusic } from "./sound";
import { UI } from "./ui";
import { botInput } from "../../shared/bot";
import { Rng } from "../../shared/rng";

// debug/playtest params: ?bot=1 drives the player with the balance bot, ?seed=N fixes the seed, ?wave=N starts there
const params = new URLSearchParams(location.search);
const BOT = params.get("bot") === "1";
const botRng = new Rng(99);

type Mode = "menu" | "playing" | "paused" | "offers" | "over";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const profile = loadProfile();
const cam = new Camera();
const particles = new Particles();
const renderer = new Renderer(canvas, cam, particles);
const input = new Input(canvas);
const ui = new UI();

let mode: Mode = "menu";
let state: GameState | null = null;
let acc = 0;
let last = performance.now();
let fpsAvg = 60;
let voidDeath = false;
let submitted = false;

function applySettings(): void {
  const st = profile.settings;
  cam.shakeEnabled = st.shake;
  renderer.showDamageNumbers = st.damageNumbers;
  setSfxVolume(st.sfx);
  setMusicVolume(st.music);
  (document.getElementById("set-shake") as HTMLInputElement).checked = st.shake;
  (document.getElementById("set-dmg") as HTMLInputElement).checked = st.damageNumbers;
  (document.getElementById("set-assist") as HTMLInputElement).checked = st.aimAssist;
  (document.getElementById("set-fps") as HTMLInputElement).checked = st.showFps;
  (document.getElementById("set-sfx") as HTMLInputElement).value = `${st.sfx}`;
  (document.getElementById("set-music") as HTMLInputElement).value = `${st.music}`;
}

function bindSettings(): void {
  const on = (id: string, fn: (el: HTMLInputElement) => void) => document.getElementById(id)!.addEventListener("input", (e) => { fn(e.target as HTMLInputElement); applySettings(); saveProfile(profile); });
  on("set-shake", (el) => (profile.settings.shake = el.checked));
  on("set-dmg", (el) => (profile.settings.damageNumbers = el.checked));
  on("set-assist", (el) => (profile.settings.aimAssist = el.checked));
  on("set-fps", (el) => (profile.settings.showFps = el.checked));
  on("set-sfx", (el) => { profile.settings.sfx = Number(el.value); play("click"); });
  on("set-music", (el) => (profile.settings.music = Number(el.value)));
}

function showMenu(): void {
  mode = "menu";
  ui.hideAllScreens();
  ui.show("menu");
  ui.showHud(false);
  document.getElementById("menu-best")!.textContent = profile.bestScore ? `BEST ${profile.bestScore} · WAVE ${profile.bestWave} · ${profile.runs} RUNS` : "no runs yet";
  canvas.style.cursor = "default";
}

function startRun(daily: boolean): void {
  audioContext();
  startMusic();
  const seed = params.get("seed") ? Number(params.get("seed")) : daily ? hashString(`kessler-${todayKey()}`) : (Math.random() * 2 ** 31) >>> 0;
  state = createGame(seed, daily);
  if (params.get("wave")) state.wave.n = Number(params.get("wave")) - 1;
  particles.list = [];
  particles.floaters = [];
  cam.snap(state.entities[0].pos);
  cam.trauma = 0;
  voidDeath = false;
  submitted = false;
  mode = "playing";
  ui.hideAllScreens();
  ui.showHud(true);
  canvas.style.cursor = "none";
  acc = 0;
  if (!profile.seenHowTo) {
    profile.seenHowTo = true;
    saveProfile(profile);
    ui.banner("WASD · AIM · CLICK TO SWING", "space to dash · dash then swing to launch", "wave");
  }
}

function finishRun(): void {
  if (!state) return;
  mode = "over";
  const s = state;
  profile.runs++;
  profile.totalKills += s.stats.kills;
  profile.voidKills += s.stats.voidKills;
  profile.bossKills += s.stats.bossKills;
  const isBest = s.score > profile.bestScore;
  if (s.daily) profile.dailyBest[todayKey()] = Math.max(profile.dailyBest[todayKey()] ?? 0, s.score);
  ui.showGameOver(s, profile, voidDeath);
  if (isBest && !s.daily) { profile.bestScore = s.score; profile.bestWave = Math.max(profile.bestWave, s.wave.n); }
  saveProfile(profile);
  canvas.style.cursor = "default";
  const board = s.daily ? "daily" : "endless";
  const list = document.getElementById("go-list")!;
  if (!submitted && s.score > 0) {
    submitted = true;
    submitScore(board, { name: profile.name || "anonymous", score: s.score, wave: s.wave.n, kills: s.stats.kills, voidKills: s.stats.voidKills }, s.daily ? todayKey() : undefined)
      .then((r) => { ui.setRank(`${isBest ? "NEW PERSONAL BEST · " : ""}RANK #${r.rank} ${s.daily ? "TODAY" : "ALL TIME"}`); return ui.loadLeaderboard(board, list, profile.name || "anonymous"); })
      .catch(() => ui.loadLeaderboard(board, list, profile.name || "anonymous"));
  } else {
    void ui.loadLeaderboard(board, list, profile.name || "anonymous");
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
      if (snap.pausePressed) { mode = "paused"; ui.show("pause"); canvas.style.cursor = "default"; }
      else {
        acc += rawDt;
        let steps = 0;
        // input edges must only fire once even if several sim steps run this frame
        let frameInput = snap.frame;
        while (acc >= DT && steps < 6) {
          if (BOT) frameInput = botInput(s, () => botRng.next());
          step(s, frameInput);
          frameInput = { ...frameInput, attack: false, dash: false };
          applyEvents(s, s.events, particles, cam, { banner: (t, sub, k) => ui.banner(t, sub, k), hurtFlash: () => (renderer.hurtFlash = 1) });
          for (const ev of s.events) if (ev.type === "void" && ev.kind === "player") voidDeath = true;
          acc -= DT;
          steps++;
        }
        if (acc > DT * 6) acc = 0;
        if (s.offers && !s.over) { mode = "offers"; ui.showOffers(s.offers); canvas.style.cursor = "default"; }
        if (s.over && mode === "playing") {
          window.setTimeout(() => { if (mode === "playing") finishRun(); }, 1300);
          mode = "playing";
          // keep simulating the death scene until the timeout fires; block input
          s.over = true;
        }
      }
    } else if (mode === "offers") {
      if (snap.numberKey && s.offers && s.offers[snap.numberKey - 1]) pickOffer(s.offers[snap.numberKey - 1].id);
      else if (snap.menuNav) ui.setFocus(ui.focusIdx + snap.menuNav);
      else if (snap.menuConfirm && s.offers) pickOffer(s.offers[ui.focusIdx].id);
    } else if (mode === "paused") {
      if (snap.pausePressed || snap.menuBack) resume();
    }

    if (mode === "playing" || mode === "over" || mode === "offers") {
      particles.update(rawDt);
      const aimWorld = snap.aimScreen && !BOT ? norm(sub(cam.toWorld(snap.aimScreen), p.pos)) : fromAngle(p.facing);
      cam.update(p.pos, aimWorld, p.planet === null, rawDt);
      const enemies = s.entities.length - 1;
      setIntensity(s.over ? 0 : Math.min(1, 0.2 + enemies * 0.08 + (s.wave.boss ? 0.4 : 0)));
    }
    renderer.draw(s, mode === "playing" && !BOT ? snap.aimScreen : null, rawDt, { paused: mode !== "playing" });
    ui.updateHud(s, profile.bestScore, profile.settings.showFps ? fpsAvg : null);
    ui.show("touch", mode === "playing" && input.usingTouch);
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
  nameEl.addEventListener("keydown", (e) => e.stopPropagation());
  document.getElementById("btn-play")!.addEventListener("click", () => startRun(false));
  document.getElementById("btn-daily")!.addEventListener("click", () => startRun(true));
  document.getElementById("btn-howto")!.addEventListener("click", () => { ui.show("menu", false); ui.show("howto"); });
  document.getElementById("btn-settings")!.addEventListener("click", () => { ui.show("menu", false); ui.show("settings"); });
  document.getElementById("btn-leaderboard")!.addEventListener("click", () => { ui.show("menu", false); ui.show("leaderboard"); void ui.loadLeaderboard("endless", document.getElementById("lb-list")!, profile.name); });
  document.querySelectorAll(".modal .close").forEach((b) => b.addEventListener("click", () => { ui.hideAllScreens(); ui.show("menu"); }));
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    void ui.loadLeaderboard(t.dataset.board as "endless" | "daily", document.getElementById("lb-list")!, profile.name);
  }));
  document.getElementById("btn-resume")!.addEventListener("click", resume);
  document.getElementById("btn-quit")!.addEventListener("click", () => { state = null; showMenu(); });
  document.getElementById("btn-again")!.addEventListener("click", () => startRun(state?.daily ?? false));
  document.getElementById("btn-menu")!.addEventListener("click", () => { state = null; showMenu(); });
  document.querySelectorAll("button").forEach((b) => b.addEventListener("mouseenter", () => play("click", 0.3)));
  ui.onOffer = pickOffer;
  window.addEventListener("keydown", (e) => {
    if (mode !== "menu") return;
    if (e.code === "Enter" && document.activeElement !== nameEl && !document.getElementById("menu")!.classList.contains("hidden")) startRun(false);
    if (e.code === "Escape") { ui.hideAllScreens(); ui.show("menu"); }
  });
}

window.addEventListener("resize", () => renderer.resize());
renderer.resize();
applySettings();
bindSettings();
bindMenu();
showMenu();
requestAnimationFrame(frame);
