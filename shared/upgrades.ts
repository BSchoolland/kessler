import type { Rng } from "./rng";
import type { UpgradeMods, UpgradeOffer } from "./types";

export function defaultMods(): UpgradeMods {
  return {
    reachMult: 1, swingSpeedMult: 1, damageMult: 1, knockbackMult: 1, moveSpeedMult: 1,
    dashCooldownMult: 1, dashSpeedMult: 1, maxHpBonus: 0, impactMult: 1, debrisExtra: 0,
    debrisDamageMult: 1, lifesteal: 0, aftershock: false, gravityBoots: false, airControlMult: 1,
    voidBonusMult: 1, berserk: false,
  };
}

type Rarity = UpgradeOffer["rarity"];
const RARITIES: Rarity[] = ["common", "rare", "epic"];

interface Family {
  key: string;
  name: string;
  rarities: Rarity[];
  once?: boolean;
  desc: (r: Rarity) => string;
  apply: (m: UpgradeMods, r: Rarity, heal: (frac: number, flat: number) => void) => void;
}

const tier = (r: Rarity, a: number, b: number, c: number) => (r === "common" ? a : r === "rare" ? b : c);
const pct = (x: number) => `${Math.round(x * 100)}%`;

export const FAMILIES: Family[] = [
  { key: "reach", name: "Long Arm", rarities: RARITIES, desc: (r) => `Blade reach +${pct(tier(r, 0.12, 0.2, 0.32))}`, apply: (m, r) => { m.reachMult *= 1 + tier(r, 0.12, 0.2, 0.32); } },
  { key: "swing", name: "Quick Hands", rarities: RARITIES, desc: (r) => `Swing speed +${pct(tier(r, 0.1, 0.18, 0.28))}`, apply: (m, r) => { m.swingSpeedMult *= 1 + tier(r, 0.1, 0.18, 0.28); } },
  { key: "damage", name: "Sharpened", rarities: RARITIES, desc: (r) => `Blade damage +${pct(tier(r, 0.12, 0.2, 0.32))}`, apply: (m, r) => { m.damageMult *= 1 + tier(r, 0.12, 0.2, 0.32); } },
  { key: "knockback", name: "Heavy Hands", rarities: RARITIES, desc: (r) => `Knockback +${pct(tier(r, 0.15, 0.25, 0.4))}. Send them somewhere.`, apply: (m, r) => { m.knockbackMult *= 1 + tier(r, 0.15, 0.25, 0.4); } },
  { key: "speed", name: "Fleet", rarities: RARITIES, desc: (r) => `Move speed +${pct(tier(r, 0.08, 0.14, 0.22))}`, apply: (m, r) => { m.moveSpeedMult *= 1 + tier(r, 0.08, 0.14, 0.22); } },
  { key: "dashcd", name: "Slingshot", rarities: RARITIES, desc: (r) => `Dash cooldown -${pct(tier(r, 0.12, 0.2, 0.3))}`, apply: (m, r) => { m.dashCooldownMult *= 1 - tier(r, 0.12, 0.2, 0.3); } },
  { key: "dashspeed", name: "Escape Velocity", rarities: RARITIES, desc: (r) => `Dash speed and distance +${pct(tier(r, 0.12, 0.2, 0.32))}`, apply: (m, r) => { m.dashSpeedMult *= 1 + tier(r, 0.12, 0.2, 0.32); } },
  { key: "hp", name: "Vitality", rarities: RARITIES, desc: (r) => `Max HP +${tier(r, 15, 25, 40)} and heal that much`, apply: (m, r, heal) => { m.maxHpBonus += tier(r, 15, 25, 40); heal(0, tier(r, 15, 25, 40)); } },
  { key: "heal", name: "Patch Up", rarities: RARITIES, desc: (r) => `Heal ${pct(tier(r, 0.4, 0.65, 1))} of max HP`, apply: (_m, r, heal) => heal(tier(r, 0.4, 0.65, 1), 0) },
  { key: "impact", name: "Meteor", rarities: RARITIES, desc: (r) => `Impact damage +${pct(tier(r, 0.3, 0.5, 0.8))}`, apply: (m, r) => { m.impactMult *= 1 + tier(r, 0.3, 0.5, 0.8); } },
  { key: "debris", name: "Fragmentation", rarities: RARITIES, desc: (r) => `+${tier(r, 1, 2, 3)} debris per kill`, apply: (m, r) => { m.debrisExtra += tier(r, 1, 2, 3); } },
  { key: "shrapnel", name: "Shrapnel", rarities: RARITIES, desc: (r) => `Debris damage +${pct(tier(r, 0.3, 0.5, 0.8))}`, apply: (m, r) => { m.debrisDamageMult *= 1 + tier(r, 0.3, 0.5, 0.8); } },
  { key: "thrusters", name: "Thrusters", rarities: RARITIES, desc: (r) => `Air control +${pct(tier(r, 0.5, 0.9, 1.5))}`, apply: (m, r) => { m.airControlMult *= 1 + tier(r, 0.5, 0.9, 1.5); } },
  { key: "leech", name: "Leech", rarities: ["rare", "epic"], desc: (r) => `Heal ${pct(tier(r, 0, 0.06, 0.1))} of blade damage dealt`, apply: (m, r) => { m.lifesteal += tier(r, 0, 0.06, 0.1); } },
  { key: "voidtax", name: "Void Tax", rarities: ["rare"], once: true, desc: () => `Void kills are worth triple`, apply: (m) => { m.voidBonusMult = 3; } },
  { key: "boots", name: "Gravity Boots", rarities: ["rare"], once: true, desc: () => `No impact damage from landings, air control +60%`, apply: (m) => { m.gravityBoots = true; m.airControlMult *= 1.6; } },
  { key: "aftershock", name: "Aftershock", rarities: ["epic"], once: true, desc: () => `Landing hard sends a shockwave around the planet`, apply: (m) => { m.aftershock = true; } },
  { key: "berserk", name: "Berserk", rarities: ["epic"], once: true, desc: () => `+35% blade damage while under half HP`, apply: (m) => { m.berserk = true; } },
];

export function rollOffers(rng: Rng, taken: string[], n = 3): UpgradeOffer[] {
  const offers: UpgradeOffer[] = [];
  const usedKeys = new Set<string>();
  for (let guard = 0; guard < 200 && offers.length < n; guard++) {
    const fam = rng.pick(FAMILIES);
    if (usedKeys.has(fam.key)) continue;
    if (fam.once && taken.some((t) => t.startsWith(fam.key + ":"))) continue;
    const roll = rng.next();
    const wanted: Rarity = roll < 0.6 ? "common" : roll < 0.9 ? "rare" : "epic";
    if (!fam.rarities.includes(wanted)) {
      if (fam.rarities.length === 1 && rng.chance(0.75)) continue;
      if (!fam.rarities.includes(wanted) && rng.chance(0.5)) continue;
    }
    const rarity = fam.rarities.includes(wanted) ? wanted : fam.rarities[0];
    usedKeys.add(fam.key);
    offers.push({ id: `${fam.key}:${rarity}`, name: fam.name, desc: fam.desc(rarity), rarity });
  }
  return offers;
}

export function applyOffer(id: string, mods: UpgradeMods, heal: (frac: number, flat: number) => void): void {
  const [key, rarity] = id.split(":") as [string, Rarity];
  const fam = FAMILIES.find((f) => f.key === key);
  if (!fam) throw new Error(`unknown upgrade ${id}`);
  fam.apply(mods, rarity, heal);
}
