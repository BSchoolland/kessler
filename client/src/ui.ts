import type { GameState, TutorialStep, UpgradeOffer } from "../../shared/types";
import { ammoMax } from "../../shared/sim";
import { fetchLeaderboard, type ScoreEntry } from "./api";
import type { Profile } from "./meta";

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

export class UI {
  private hud = $("#hud");
  private hpFill = $("#hp-fill");
  private hpText = $("#hp-text");
  private dashText = $("#dash-text");
  private waveLabel = $("#wave-label");
  private sectorLabel = $("#sector-label");
  private scoreEl = $("#score");
  private bestEl = $("#best");
  private bossBar = $("#boss-bar");
  private bossFill = $("#boss-fill");
  private fpsEl = $("#fps");
  private wpnSword = $("#weapon-sword");
  private wpnGun = $("#weapon-gun");
  private ammoEl = $("#ammo-pips");
  private lastAmmoKey = "";
  private bannerEl = $("#banner");
  private offersEl = $("#offers");
  private cardsEl = $("#offer-cards");
  private bannerTimer = 0;
  private lastScore = -1;
  private tutEl = $("#tut");
  private tutKeys = $("#tut-keys");
  private lastTutKey = "";
  private scoreWrap = $(".score-wrap");
  focusIdx = 0;
  onOffer: ((id: string) => void) | null = null;

  showHud(v: boolean): void { this.hud.classList.toggle("hidden", !v); }
  show(id: string, v = true): void { $(`#${id}`).classList.toggle("hidden", !v); }
  hideAllScreens(): void { document.querySelectorAll(".screen").forEach((el) => el.classList.add("hidden")); }

  banner(title: string, sub = "", kind = "wave"): void {
    this.bannerEl.className = kind;
    $("#banner-title").textContent = title;
    $("#banner-sub").textContent = sub;
    // restart animation
    this.bannerEl.classList.remove("hidden");
    void this.bannerEl.offsetWidth;
    this.bannerEl.style.animation = "none";
    void this.bannerEl.offsetWidth;
    this.bannerEl.style.animation = "";
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.add("hidden"), 2200);
  }

  updateHud(s: GameState, best: number, fps: number | null): void {
    const p = s.entities[0];
    const frac = Math.max(0, p.hp / p.maxHp);
    this.hpFill.style.width = `${frac * 100}%`;
    this.hpFill.classList.toggle("low", frac < 0.3);
    this.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    const canLaunch = p.planet !== null && s.fuel > 0;
    this.dashText.classList.toggle("ready", canLaunch);
    this.dashText.textContent = p.planet === null ? "IN FLIGHT" : s.fuel > 0 ? "LAUNCH READY" : "NO FUEL";
    this.wpnSword.classList.toggle("active", s.weapon === "sword");
    this.wpnGun.classList.toggle("active", s.weapon === "gun");
    const reload = s.reloadT > 0 ? Math.floor((s.reloadT / 5) * 10) : 0;
    const ammoKey = `${s.ammo}/${ammoMax(s)}/${reload}`;
    if (ammoKey !== this.lastAmmoKey) {
      this.lastAmmoKey = ammoKey;
      // the next pip to fill shows the reload progress
      this.ammoEl.innerHTML = Array.from({ length: ammoMax(s) }, (_, i) => `<i class="${i < s.ammo ? "full" : ""}"${i === s.ammo && reload ? ` style="background:linear-gradient(to top,var(--gold) ${reload * 10}%,transparent ${reload * 10}%)"` : ""}></i>`).join("");
    }
    this.waveLabel.textContent = s.tutorial ? "TUTORIAL" : s.wave.n > 0 ? `WAVE ${s.wave.n}` : "INCOMING";
    this.sectorLabel.textContent = s.tutorial ? "" : `SECTOR ${s.wave.sector}`;
    this.scoreWrap.classList.toggle("hidden", !!s.tutorial);
    if (s.score !== this.lastScore) {
      this.scoreEl.textContent = `${s.score}`;
      this.scoreEl.style.transform = "scale(1.15)";
      window.setTimeout(() => (this.scoreEl.style.transform = ""), 90);
      this.lastScore = s.score;
    }
    this.bestEl.textContent = `BEST ${Math.max(best, s.score)}`;
    const boss = s.entities.find((e) => e.kind === "hammer" && !e.dead && e.spawnT <= 0);
    this.bossBar.classList.toggle("hidden", !boss);
    if (boss) this.bossFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    this.fpsEl.classList.toggle("hidden", fps === null);
    if (fps !== null) this.fpsEl.textContent = `${Math.round(fps)} fps · ${s.debris.length} debris`;
  }

  /** The persistent lesson card; rebuilt only when the step or the pressed-keys set changes. */
  updateTutorial(s: GameState): void {
    const tut = s.tutorial;
    this.tutEl.classList.toggle("hidden", !tut || tut.step === "done");
    if (!tut) { this.lastTutKey = ""; return; }
    const key = `${tut.step}:${tut.keys}`;
    if (key === this.lastTutKey) return;
    this.lastTutKey = key;
    const lesson = LESSONS[tut.step];
    this.tutEl.dataset.step = tut.step;
    $("#tut-step").textContent = lesson.n ? `${lesson.n} / 8` : "";
    $("#tut-title").textContent = lesson.title;
    $("#tut-body").innerHTML = lesson.body;
    this.tutKeys.classList.toggle("hidden", tut.step !== "fly");
    this.tutKeys.querySelectorAll<HTMLElement>("i").forEach((k) => k.classList.toggle("hit", (tut.keys & Number(k.dataset.key)) !== 0));
  }

  showOffers(offers: UpgradeOffer[]): void {
    this.cardsEl.innerHTML = "";
    this.focusIdx = 0;
    offers.forEach((o, i) => {
      const card = document.createElement("div");
      card.className = `card ${o.rarity}`;
      card.innerHTML = `<div class="rarity">${o.rarity.toUpperCase()}</div><div class="name">${o.name}</div><div class="desc">${o.desc}</div><div class="key">[ ${i + 1} ]</div>`;
      card.addEventListener("click", () => this.onOffer?.(o.id));
      card.addEventListener("mouseenter", () => this.setFocus(i));
      this.cardsEl.appendChild(card);
    });
    this.setFocus(0);
    this.offersEl.classList.remove("hidden");
  }

  setFocus(i: number): void {
    const cards = Array.from(this.cardsEl.children);
    if (!cards.length) return;
    this.focusIdx = ((i % cards.length) + cards.length) % cards.length;
    cards.forEach((c, j) => c.classList.toggle("focus", j === this.focusIdx));
  }

  hideOffers(): void { this.offersEl.classList.add("hidden"); }

  showGameOver(s: GameState, profile: Profile, voidDeath: boolean): void {
    $("#go-title").textContent = voidDeath ? "LOST TO THE VOID" : "LOST";
    $("#go-sub").textContent = `wave ${s.wave.n} · sector ${s.wave.sector} · ${Math.round(s.stats.time)}s`;
    const st = s.stats;
    const rows: [string, number | string][] = [
      ["SCORE", s.score], ["KILLS", st.kills], ["VOID", st.voidKills], ["SPLATS", st.impactKills],
      ["DEBRIS", st.debrisKills], ["BOWLED", st.collisionKills], ["BOSSES", st.bossKills], ["LAUNCHES", st.dashes],
    ];
    $("#go-stats").innerHTML = rows.map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join("");
    $("#go-rank").textContent = s.score > profile.bestScore ? "NEW PERSONAL BEST" : "";
    $("#go-list").innerHTML = "";
    this.show("gameover");
  }

  setRank(text: string): void { $("#go-rank").textContent = text; }

  renderList(el: HTMLElement, entries: ScoreEntry[], myName: string): void {
    el.innerHTML = entries.length
      ? entries.map((e, i) => `<li class="${e.name === myName ? "me" : ""}"><span>${i + 1}</span><span>${escapeHtml(e.name || "anonymous")}</span><span>${e.score}</span><span>w${e.wave}</span></li>`).join("")
      : "<li><span></span><span>nobody yet. be first.</span></li>";
  }

  async loadLeaderboard(into: HTMLElement, myName: string): Promise<void> {
    into.innerHTML = "<li><span></span><span>loading…</span></li>";
    try {
      const entries = await fetchLeaderboard();
      this.renderList(into, entries, myName);
    } catch {
      into.innerHTML = "<li><span></span><span>leaderboard offline</span></li>";
    }
  }
}

const LESSONS: Record<TutorialStep, { n: number; title: string; body: string }> = {
  walk: { n: 1, title: "WALK TO THE BEACON", body: "<b>W A S D</b> walk you along the surface, whichever way you push. It's round, so keep steering; the beacon is over the top." },
  launch: { n: 2, title: "LAUNCH", body: "<b>SHIFT</b> (or K, or right click) leaves the planet the way you're moving. Standing still, that's straight up. The beacon is straight up, a long way up." },
  fly: { n: 3, title: "STEER", body: "In space <b>W A S D</b> fire the thrusters: W to hurry, S to brake, A / D to drift. They burn fuel, and fuel only refills on the ground. Come in too fast and the landing hurts." },
  sweep: { n: 4, title: "MELEE: THE SWEEP", body: "Something's dropping right on top of you. <b>Stand still</b> and press <b>SPACE</b> (or J, or click): the melee sweeps over your head, both sides." },
  debris: { n: 5, title: "DEBRIS", body: "Every kill shatters into debris. It obeys the same gravity as everything else, it hurts whatever it hits (you included), and a swing bats it. The better you're doing, the messier it gets. Hence the name." },
  wave: { n: 6, title: "MELEE: THE WAVE", body: "That one's landing down the surface. <b>Move toward it</b> and press <b>SPACE</b> while moving: the melee becomes a wave that runs along the ground ahead of you." },
  brawl: { n: 7, title: "THREE AT ONCE", body: "Sweep when they're on you, wave when they're coming. Hits <b>launch</b> enemies: into the planet, into each other, into the void." },
  gun: { n: 8, title: "AN ORBITER", body: "It circles out of melee reach. <b>LAUNCH</b>, then <b>SPACE</b> in space fires the gun. It aims itself at the nearest enemy. Kills sometimes drop gold rounds; standing on a planet reloads you slowly." },
  done: { n: 0, title: "", body: "" },
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
