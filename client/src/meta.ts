export interface Settings {
  shake: boolean;
  damageNumbers: boolean;
  sfx: number;
  music: number;
  aimAssist: boolean;
  showFps: boolean;
  autoAim: boolean;   // gun locks onto a target; no mouse needed
}

export interface Profile {
  name: string;
  bestScore: number;
  bestWave: number;
  runs: number;
  totalKills: number;
  voidKills: number;
  bossKills: number;
  wins: number;
  iosHintShown: boolean;
  settings: Settings;
  tutorialDone: boolean;
}

const KEY = "kessler.profile.v1";

const defaults: Profile = {
  name: "", bestScore: 0, bestWave: 0, runs: 0, totalKills: 0, voidKills: 0, bossKills: 0, wins: 0, iosHintShown: false,
  settings: { shake: true, damageNumbers: true, sfx: 0.8, music: 0.5, aimAssist: true, showFps: false, autoAim: true },
  tutorialDone: false,
};

// JSON round-trip rather than structuredClone: that API is missing on Safari before 15.4 (older iPads)
const clone = (p: Profile): Profile => JSON.parse(JSON.stringify(p)) as Profile;

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(defaults);
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return { ...clone(defaults), ...parsed, settings: { ...defaults.settings, ...(parsed.settings ?? {}) } };
  } catch (err) {
    console.warn("profile unreadable, starting fresh:", err);
    return clone(defaults);
  }
}

export function saveProfile(p: Profile): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}
