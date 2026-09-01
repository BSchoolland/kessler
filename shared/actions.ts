import { DEBRIS, IMPACT, PLAYER, SCORE } from "./config";
import { ENEMY_DEFS } from "./enemies";
import { findContact, snapToSurface } from "./physics";
import type { Rng } from "./rng";
import type { Debris, EnemyKind, Entity, GameEvent, GameState, HitSource, Shockwave } from "./types";
import { add, fromAngle, len, norm, scale, type Vec } from "./vec";

export interface Ctx {
  s: GameState;
  rng: Rng;
  dt: number;
}

export const player = (s: GameState): Entity => s.entities[0];

export function emit(s: GameState, ev: GameEvent): void {
  s.events.push(ev);
}

export function makeEntity(s: GameState, kind: Entity["kind"], pos: Vec, radius: number, hp: number, hue: number): Entity {
  return {
    id: s.nextId++, kind, pos: { ...pos }, vel: { x: 0, y: 0 }, radius, hp, maxHp: hp, facing: 0, planet: null,
    stun: 0, invuln: 0, dead: false, swing: null, dashT: 0, dashCd: 0, sinceDash: 99, comboT: 0, comboIdx: 0,
    ai: { state: "idle", t: 0, target: null, cooldown: 0, phase: 1, rot: 0, secondRing: false, escorted: false }, knockbackResist: 0, lastHitBy: "none",
    elite: false, orbit: null, spawnT: 0, attackBuffer: 0, dashBuffer: 0, airTime: 0, hue,
  };
}

export function playerMaxHp(s: GameState): number {
  return PLAYER.maxHp + s.mods.maxHpBonus;
}

export function healPlayer(s: GameState, frac: number, flat: number): void {
  const p = player(s);
  p.maxHp = playerMaxHp(s);
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * frac + flat);
}

export function spawnEnemyPod(ctx: Ctx, kind: EnemyKind, targetPlanet: number, elite: boolean): Entity {
  const { s, rng } = ctx;
  const def = ENEMY_DEFS[kind];
  const target = s.planets[targetPlanet];
  const ang = rng.range(0, Math.PI * 2);
  const start = fromAngle(ang, 1450);
  const sectorScale = kind === "accretor" ? 1 + 0.4 * (s.wave.sector - 1) : 1 + 0.06 * (s.wave.sector - 1);
  const e = makeEntity(s, kind, start, def.radius, Math.round(def.hp * (elite ? 1.6 : 1) * sectorScale), def.hue);
  e.knockbackResist = def.knockbackResist;
  e.elite = elite;
  e.spawnT = 1;
  e.vel = scale(norm(add(target.pos, scale(start, -1))), 380);
  e.ai.cooldown = kind === "orbiter" ? 1.2 : 0.4;
  s.entities.push(e);
  s.wave.alive++;
  emit(s, { type: "pod", pos: e.pos, kind });
  return e;
}

export function spawnDebris(ctx: Ctx, pos: Vec, inherit: Vec, count: number, hue: number, heavy = false, speedMult = 1): void {
  const { s, rng } = ctx;
  for (let i = 0; i < count; i++) {
    const dir = fromAngle(rng.range(0, Math.PI * 2));
    const speed = rng.range(DEBRIS.speedMin, DEBRIS.speedMax) * speedMult;
    const d: Debris = {
      id: s.nextId++,
      pos: add(pos, scale(dir, 4)),
      vel: add(scale(inherit, DEBRIS.inherit), scale(dir, speed)),
      radius: heavy ? 10 : DEBRIS.radius * rng.range(0.75, 1.3),
      life: DEBRIS.lifetime * rng.range(0.8, 1.15),
      spin: rng.range(-9, 9),
      rot: rng.range(0, 6.28),
      hue,
      hitCd: 0.15,
      heavy,
    };
    s.debris.push(d);
  }
  while (s.debris.length > DEBRIS.maxCount) s.debris.shift();
}

export function spawnShockwave(s: GameState, planet: number, angle: number, damage: number, friendly: boolean, speed = 3.2, maxSpread = Math.PI): Shockwave {
  const w: Shockwave = { id: s.nextId++, planet, angle, spread: 0, maxSpread, speed, damage, hit: [], friendly };
  s.shockwaves.push(w);
  emit(s, { type: "shockwave", pos: snapToSurface(s.planets[planet], add(s.planets[planet].pos, fromAngle(angle)), 0) });
  return w;
}

export function killEnemy(ctx: Ctx, e: Entity, source: HitSource): void {
  const { s } = ctx;
  if (e.dead) return;
  e.dead = true;
  s.wave.alive--;
  const def = ENEMY_DEFS[e.kind as EnemyKind];
  const boss = e.kind === "accretor";
  let pts = def.score * (e.elite ? 2 : 1);
  s.stats.kills++;
  if (source === "void") { pts += SCORE.voidKill * s.mods.voidBonusMult; s.stats.voidKills++; }
  else if (source === "impact") { pts += SCORE.impactKill; s.stats.impactKills++; }
  else if (source === "debris") { pts += SCORE.debrisKill; s.stats.debrisKills++; }
  else if (source === "collision") { pts += SCORE.collisionKill; s.stats.collisionKills++; }
  if (boss) { pts += SCORE.boss; s.stats.bossKills++; }
  s.score += pts;
  if (source !== "void") {
    const count = (boss ? 12 : DEBRIS.count) + s.mods.debrisExtra;
    spawnDebris(ctx, e.pos, e.vel, count, e.hue, boss);
  }
  s.freeze = Math.max(s.freeze, boss ? 0.4 : 0.075);
  emit(s, { type: "kill", pos: e.pos, kind: e.kind, source, vel: e.vel });
}

export function damageEnemy(ctx: Ctx, e: Entity, dmg: number, source: HitSource, at?: Vec, dir?: Vec, crit = false): void {
  if (e.dead || e.spawnT > 0) return;
  e.hp -= dmg;
  e.lastHitBy = source;
  ctx.s.stats.damageDealt += dmg;
  if (source === "blade" && ctx.s.mods.lifesteal > 0) healPlayer(ctx.s, 0, dmg * ctx.s.mods.lifesteal);
  emit(ctx.s, { type: "hit", pos: at ?? e.pos, dir: dir ?? { x: 0, y: -1 }, damage: dmg, crit, target: e.kind });
  if (e.hp <= 0) killEnemy(ctx, e, source);
  else if (e.kind === "accretor" && e.ai.phase === 1 && e.hp < e.maxHp * 0.5) {
    e.ai.phase = 2;
    emit(ctx.s, { type: "bossPhase", pos: e.pos });
  }
}

export function damagePlayer(ctx: Ctx, dmg: number, source: HitSource): boolean {
  const { s } = ctx;
  const p = player(s);
  if (s.over || p.invuln > 0 || p.dashT > 0) return false;
  p.hp -= dmg;
  p.invuln = PLAYER.invulnAfterHit;
  s.stats.damageTaken += dmg;
  emit(s, { type: "playerHurt", pos: p.pos, damage: dmg, source });
  if (p.hp <= 0) {
    p.hp = 0;
    s.over = true;
    s.freeze = Math.max(s.freeze, 0.45);
    emit(s, { type: "playerDead", pos: p.pos });
  }
  return true;
}

/** Shove an entity: sets velocity (scaled by its knockback resistance) and lifts it off the ground if the shove is strong. */
export function launch(e: Entity, dir: Vec, speed: number, stun: number): void {
  const eff = speed * (1 - e.knockbackResist);
  e.vel = scale(norm(dir), eff);
  // heavy enemies shrug off stun too, otherwise a fast blade locks them down forever
  e.stun = Math.max(e.stun, stun * (1 - e.knockbackResist));
  e.orbit = null;
  if (e.knockbackResist < 0.5) {
    // light enemies get interrupted; heavies keep doing what they were doing
    e.swing = null;
    e.ai.state = "idle";
    e.ai.t = 0;
  }
  if (eff > 140) e.planet = null;
}

export function enemyImpact(ctx: Ctx, e: Entity, speedIn: number, normal: Vec): void {
  if (speedIn > IMPACT.enemyThreshold) {
    const dmg = (speedIn - IMPACT.enemyThreshold) * IMPACT.enemyDamagePerUnit * ctx.s.mods.impactMult;
    emit(ctx.s, { type: "impact", pos: e.pos, normal, speed: speedIn, kind: e.kind });
    damageEnemy(ctx, e, dmg, "impact", e.pos, normal);
  }
}

export function resolveContactForEnemy(ctx: Ctx, e: Entity): void {
  const c = findContact(ctx.s.planets, e.pos, e.vel, e.radius);
  if (!c) return;
  const wasPod = e.spawnT > 0;
  e.spawnT = 0;
  if (!wasPod) enemyImpact(ctx, e, c.speedIn, c.normal);
  if (e.dead) return;
  const bounce = e.stun > 0 && c.speedIn > IMPACT.enemyBounceSpeed;
  e.pos = snapToSurface(c.planet, e.pos, e.radius);
  if (bounce) {
    const vn = -c.speedIn;
    e.vel = add(e.vel, scale(c.normal, -(1 + IMPACT.restitution) * vn));
    e.planet = null;
  } else {
    e.planet = c.planet.id;
    const vn = e.vel.x * c.normal.x + e.vel.y * c.normal.y;
    e.vel = add(e.vel, scale(c.normal, -vn));
    e.airTime = 0;
    if (e.kind === "orbiter") {
      e.orbit = { planet: c.planet.id, radius: c.planet.r + 110, angle: Math.atan2(c.normal.y, c.normal.x), dir: ctx.rng.sign() as 1 | -1 };
      e.planet = null;
    }
    emit(ctx.s, { type: "land", pos: e.pos, normal: c.normal, speed: c.speedIn, kind: e.kind });
    if (wasPod && len(e.vel) > 0) e.vel = { x: 0, y: 0 };
  }
}
