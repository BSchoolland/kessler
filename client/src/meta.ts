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
  dailyBest: Record<string, number>;
  settings: Settings;
  seenHowTo: boolean;
}

const KEY = "kessler.profile.v1";

const defaults: Profile = {
  name: "", bestScore: 0, bestWave: 0, runs: 0, totalKills: 0, voidKills: 0, bossKills: 0, dailyBest: {},
  settings: { shake: true, damageNumbers: true, sfx: 0.8, music: 0.5, aimAssist: true, showFps: false, autoAim: true },
  seenHowTo: false,
};

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(defaults);
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return { ...structuredClone(defaults), ...parsed, settings: { ...defaults.settings, ...(parsed.settings ?? {}) } };
  } catch {
    return structuredClone(defaults);
  }
}

export function saveProfile(p: Profile): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}
