import type { GameState, UpgradeOffer } from "../../shared/types";
import { ammoMax } from "../../shared/sim";
import { fetchLeaderboard, todayKey, type ScoreEntry } from "./api";
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
    this.waveLabel.textContent = s.wave.n > 0 ? `WAVE ${s.wave.n}` : "INCOMING";
    this.sectorLabel.textContent = `SECTOR ${s.wave.sector}${s.daily ? " · DAILY" : ""}`;
    if (s.score !== this.lastScore) {
      this.scoreEl.textContent = `${s.score}`;
      this.scoreEl.style.transform = "scale(1.15)";
      window.setTimeout(() => (this.scoreEl.style.transform = ""), 90);
      this.lastScore = s.score;
    }
    this.bestEl.textContent = `BEST ${Math.max(best, s.score)}`;
    const boss = s.entities.find((e) => e.kind === "accretor" && !e.dead && e.spawnT <= 0);
    this.bossBar.classList.toggle("hidden", !boss);
    if (boss) this.bossFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    this.fpsEl.classList.toggle("hidden", fps === null);
    if (fps !== null) this.fpsEl.textContent = `${Math.round(fps)} fps · ${s.debris.length} debris`;
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
    $("#go-sub").textContent = `wave ${s.wave.n} · sector ${s.wave.sector} · ${Math.round(s.stats.time)}s${s.daily ? " · daily" : ""}`;
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

  async loadLeaderboard(board: "endless" | "daily", into: HTMLElement, myName: string): Promise<void> {
    into.innerHTML = "<li><span></span><span>loading…</span></li>";
    try {
      const entries = await fetchLeaderboard(board, board === "daily" ? todayKey() : undefined);
      this.renderList(into, entries, myName);
    } catch {
      into.innerHTML = "<li><span></span><span>leaderboard offline</span></li>";
    }
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
