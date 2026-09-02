import { DT, FUEL, GUN, PLAYER, WAVES } from "./config";
import { damagePlayer, emit, healPlayer, launch, makeEntity, player, playerMaxHp, resolveContactForEnemy, spawnEdgeWave, spawnShockwave, killEnemy, damageEnemy, type Ctx } from "./actions";
import { updateEnemyAi } from "./ai";
import { resolveContactDamage, resolveEnemyCollisions, updateDebris, updateProjectiles, updateShockwaves, updateTelegraphs } from "./hazards";
import { findContact, gravityAt, inVoid, nearestPlanet, snapToSurface, surfaceNormal, tangentOnly } from "./physics";
import { Rng } from "./rng";
import type { Entity, GameState, InputFrame, Projectile, SwingState } from "./types";
import { applyOffer, defaultMods } from "./upgrades";
import { initialWave, updateWave } from "./waves";
import { generatePlanets } from "./world";
import { add, angleDelta, angleOf, clamp, dist, dot, fromAngle, len, norm, perp, scale, sub, type Vec } from "./vec";

export function createGame(seed: number, daily = false): GameState {
  const rng = new Rng(seed);
  const planets = generatePlanets(rng, 1);
  const s: GameState = {
    tick: 0, time: 0, seed, rngState: 0, freeze: 0, planets, entities: [], debris: [], projectiles: [], shockwaves: [],
    telegraphs: [], nextId: 1, wave: initialWave(), offers: null, mods: defaultMods(), taken: [], score: 0,
    stats: { kills: 0, voidKills: 0, impactKills: 0, debrisKills: 0, collisionKills: 0, bossKills: 0, damageDealt: 0, damageTaken: 0, swings: 0, dashes: 0, time: 0, bestCombo: 0 },
    over: false, daily, events: [], weapon: "sword", ammo: GUN.ammoStart, gunCd: 0, fuel: FUEL.max, fuelWarnT: 0, sinceHurt: 99,
  };
  const p = makeEntity(s, "player", { x: 0, y: 0 }, PLAYER.radius, PLAYER.maxHp, 190);
  p.pos = snapToSurface(planets[0], add(planets[0].pos, fromAngle(-Math.PI / 2)), p.radius);
  p.planet = 0;
  p.facing = -Math.PI / 2;
  s.entities.push(p);
  s.rngState = rng.s;
  return s;
}

export function chooseUpgrade(s: GameState, id: string): void {
  if (!s.offers || !s.offers.some((o) => o.id === id)) throw new Error(`offer ${id} not available`);
  applyOffer(id, s.mods, (frac, flat) => healPlayer(s, frac, flat));
  s.taken.push(id);
  if (id.startsWith("magazine:")) s.ammo = ammoMax(s);
  if (id.startsWith("fuel:")) s.fuel = fuelMax(s);
  s.offers = null;
  player(s).maxHp = playerMaxHp(s);
  s.wave.phase = "intermission";
  s.wave.phaseT = WAVES.intermission;
}

export function step(s: GameState, input: InputFrame): void {
  s.events = [];
  if (s.freeze > 0) {
    s.freeze -= DT;
    return;
  }
  const rng = new Rng(0);
  rng.s = s.rngState;
  const ctx: Ctx = { s, rng, dt: DT };
  s.tick++;
  s.time += DT;
  if (!s.over) s.stats.time += DT;

  updateWave(ctx);
  updatePlayer(ctx, input);
  for (const e of s.entities) if (e.kind !== "player") updateEnemyAi(ctx, e);
  integrateEntities(ctx);
  resolveEnemyCollisions(ctx);
  resolveContactDamage(ctx);
  updateDebris(ctx);
  updateProjectiles(ctx);
  updateShockwaves(ctx);
  updateTelegraphs(ctx);
  cullVoid(ctx);
  s.entities = s.entities.filter((e) => !e.dead || e.kind === "player");
  s.rngState = rng.s;
}

export function ammoMax(s: GameState): number {
  return GUN.ammoMax + s.mods.ammoMaxBonus;
}

export function fuelMax(s: GameState): number {
  return FUEL.max + s.mods.fuelMaxBonus;
}

function swingDurations(s: GameState) {
  const m = 1 / s.mods.swingSpeedMult;
  return { windup: PLAYER.swing.windup * m, active: PLAYER.swing.active * m, recovery: PLAYER.swing.recovery * m };
}

function updatePlayer(ctx: Ctx, input: InputFrame): void {
  const { s, dt } = ctx;
  const p = player(s);
  const mods = s.mods;
  p.sinceDash += dt;
  p.invuln -= dt;
  p.comboT -= dt;
  p.attackBuffer -= dt;
  p.dashBuffer -= dt;
  s.gunCd -= dt;
  s.fuelWarnT -= dt;
  s.sinceHurt += dt;
  if (s.over) return;
  if (s.sinceHurt > PLAYER.regenDelay && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + PLAYER.regen * dt);

  const grounded = p.planet !== null;
  s.weapon = grounded ? "sword" : "gun";
  const moving = len(input.move) > 0.2;

  // facing: on a planet you face up, or left/right while walking; in space you face your target
  let facingUp = false;
  if (grounded) {
    const n = surfaceNormal(s.planets[p.planet!], p.pos);
    const t = perp(n);
    const side = dot(input.move, t);
    if (moving && Math.abs(side) > 0.15) p.facing = angleOf(scale(t, Math.sign(side)));
    else { p.facing = angleOf(n); facingUp = true; }
  } else {
    const aim = len(input.aim) > 1e-6 ? norm(input.aim) : len(p.vel) > 40 ? norm(p.vel) : fromAngle(p.facing);
    p.facing = angleOf(aim);
  }
  const facingV = fromAngle(p.facing);
  if (input.attack) p.attackBuffer = 0.22;
  if (input.dash) p.dashBuffer = 0.2;
  const warnFuel = () => {
    if (s.fuelWarnT <= 0) {
      s.fuelWarnT = 1.5;
      emit(s, { type: "fuelEmpty", pos: p.pos });
    }
  };

  // launch: leave the planet where you're moving, else where you're facing. Ground only, no cooldown, needs fuel
  if (p.dashBuffer > 0 && grounded) {
    p.dashBuffer = 0;
    if (s.fuel <= 0) warnFuel();
    else {
      const speed = PLAYER.dashSpeed * mods.dashSpeedMult;
      p.dashT = PLAYER.dashDuration;
      p.sinceDash = 0;
      s.stats.dashes++;
      if (p.swing && p.swing.phase !== "active") p.swing = null;
      let dir = moving ? norm(input.move) : facingV;
      const n = surfaceNormal(s.planets[p.planet!], p.pos);
      if (dot(dir, n) < PLAYER.liftOff) {
        const t = perp(n);
        dir = norm(add(scale(t, dot(dir, t)), scale(n, PLAYER.liftOff)));
      }
      p.planet = null;
      p.vel = scale(dir, speed);
      emit(s, { type: "dash", pos: p.pos, dir });
    }
  } else if (p.dashBuffer > 0 && !grounded && s.fuel <= 0) {
    p.dashBuffer = 0;
    warnFuel();
  }

  if (p.dashT > 0) {
    p.dashT -= dt;
    if (p.dashT <= 0) {
      p.dashT = 0;
      if (p.planet === null) p.vel = scale(p.vel, 0.42);
    }
  } else if (p.planet !== null) {
    const planet = s.planets[p.planet];
    const n = surfaceNormal(planet, p.pos);
    const t = perp(n);
    const want = dot(input.move, t) * PLAYER.walkSpeed * mods.moveSpeedMult;
    const cur = dot(p.vel, t);
    const accel = PLAYER.walkAccel * dt;
    const nv = cur + clamp(want - cur, -accel, accel);
    p.vel = scale(t, nv);
  } else if (moving) {
    if (s.fuel > 0) {
      const steer = PLAYER.airAccel * mods.airControlMult;
      p.vel = add(p.vel, scale(input.move, steer * dt));
      s.fuel -= (FUEL.drain / mods.fuelEfficiency) * Math.min(1, len(input.move)) * dt;
      if (s.fuel <= 0) { s.fuel = 0; warnFuel(); }
    } else warnFuel();
  }
  if (p.planet !== null) s.fuel = Math.min(fuelMax(s), s.fuel + FUEL.regenGround * dt);

  // gun: in space
  if (!grounded && p.attackBuffer > 0 && !p.swing) {
    if (s.gunCd > 0) {
      // keep the press buffered until the gun is ready
    } else if (s.ammo <= 0) {
      p.attackBuffer = 0;
      emit(s, { type: "empty", pos: p.pos });
    } else {
      p.attackBuffer = 0;
      s.ammo--;
      s.gunCd = GUN.cooldown;
      const pr: Projectile = { id: s.nextId++, pos: add(p.pos, scale(facingV, p.radius + 6)), vel: add(scale(facingV, GUN.speed), scale(p.vel, 0.3)), radius: GUN.radius, life: GUN.life, damage: GUN.damage, hue: 190, friendly: true, knockback: GUN.knockback * mods.knockbackMult, slug: true };
      s.projectiles.push(pr);
      p.vel = sub(p.vel, scale(facingV, GUN.recoil));
      s.stats.swings++;
      emit(s, { type: "gunshot", pos: pr.pos, dir: facingV });
    }
  }

  // edge: on a planet
  if (grounded && !p.swing && p.attackBuffer > 0 && p.dashT <= 0) {
    p.attackBuffer = 0;
    const d = swingDurations(s);
    if (p.comboT > 0) p.comboIdx = (p.comboIdx + 1) % 2;
    else p.comboIdx = 0;
    const sw: SwingState = { phase: "windup", t: d.windup, angle: p.facing, dir: p.comboIdx === 0 ? 1 : -1, dashStrike: p.sinceDash < PLAYER.dashStrikeWindow, arc: facingUp ? PLAYER.swing.overheadArc : PLAYER.swing.arc, hit: [] };
    p.swing = sw;
    s.stats.swings++;
    emit(s, { type: "swing", pos: p.pos, angle: sw.angle, dashStrike: sw.dashStrike, arc: sw.arc });
  }
  if (p.swing) {
    const sw = p.swing;
    const d = swingDurations(s);
    sw.t -= dt;
    if (sw.phase === "active") resolveSwingHits(ctx, p, sw);
    if (sw.t <= 0) {
      if (sw.phase === "windup") {
        sw.phase = "active";
        sw.t = d.active;
        // the side attack also sends a wave running along the surface
        if (p.planet !== null && sw.arc < 3) {
          const planet = s.planets[p.planet];
          const n = surfaceNormal(planet, p.pos);
          const t = perp(n);
          const dir = (dot(fromAngle(sw.angle), t) >= 0 ? 1 : -1) as 1 | -1;
          const a = Math.atan2(n.y, n.x);
          const berserk = mods.berserk && p.hp < p.maxHp * 0.5 ? 1.35 : 1;
          const dmg = PLAYER.swing.damage * mods.damageMult * PLAYER.swing.waveDamageMult * (sw.dashStrike ? PLAYER.dashStrikeMult : 1) * berserk;
          spawnEdgeWave(s, p.planet, a, dir, dmg, PLAYER.swing.waveKnockback * mods.knockbackMult * (sw.dashStrike ? 1.45 : 1));
        }
      }
      else if (sw.phase === "active") { sw.phase = "recovery"; sw.t = d.recovery; }
      else { p.swing = null; p.comboT = PLAYER.swing.comboWindow; }
    }
  }
}

function inArc(origin: Vec, angle: number, halfArc: number, reach: number, target: Vec, targetRadius: number): boolean {
  const d = dist(origin, target);
  if (d > reach + targetRadius) return false;
  if (d < targetRadius + 6) return true;
  const a = angleOf(sub(target, origin));
  const extra = Math.asin(clamp(targetRadius / Math.max(d, 1e-3), 0, 1));
  return Math.abs(angleDelta(angle, a)) <= halfArc + extra;
}

function resolveSwingHits(ctx: Ctx, p: Entity, sw: SwingState): void {
  const { s } = ctx;
  // the side attack is only the surface wave; the arc belongs to the overhead sweep
  if (sw.arc < 3) return;
  const mods = s.mods;
  const reach = PLAYER.swing.reach * mods.reachMult;
  const half = sw.arc / 2;
  const berserk = mods.berserk && p.hp < p.maxHp * 0.5 ? 1.35 : 1;
  const dmg = PLAYER.swing.damage * mods.damageMult * (sw.dashStrike ? PLAYER.dashStrikeMult : 1) * berserk;
  const kb = PLAYER.swing.knockback * mods.knockbackMult * (sw.dashStrike ? 1.45 : 1);
  let combo = 0;
  for (const e of s.entities) {
    if (e.kind === "player" || e.dead || e.spawnT > 0 || sw.hit.includes(e.id)) continue;
    if (!inArc(p.pos, sw.angle, half, reach, e.pos, e.radius)) continue;
    sw.hit.push(e.id);
    const dir = norm(sub(e.pos, p.pos));
    const hitPos = add(p.pos, scale(dir, Math.min(dist(p.pos, e.pos), reach)));
    launch(e, add(dir, scale(fromAngle(sw.angle), 0.35)), kb, PLAYER.swing.stun);
    s.freeze = Math.max(s.freeze, sw.dashStrike ? 0.045 : 0.028);
    damageEnemy(ctx, e, dmg, "blade", hitPos, dir, sw.dashStrike);
    combo++;
    if (s.ammo < ammoMax(s)) {
      s.ammo = Math.min(ammoMax(s), s.ammo + mods.ammoPerHit);
      emit(s, { type: "ammo", pos: p.pos, ammo: s.ammo });
    }
  }
  for (const d of s.debris) {
    if (sw.hit.includes(d.id)) continue;
    if (!inArc(p.pos, sw.angle, half, reach, d.pos, d.radius)) continue;
    sw.hit.push(d.id);
    const dir = norm(add(norm(sub(d.pos, p.pos)), fromAngle(sw.angle)));
    d.vel = scale(dir, kb * 1.25);
    d.life = Math.max(d.life, 4);
    d.hitCd = 0;
    emit(s, { type: "debrisHit", pos: d.pos, damage: 0 });
  }
  for (const pr of s.projectiles) {
    if (pr.friendly || sw.hit.includes(pr.id)) continue;
    if (!inArc(p.pos, sw.angle, half, reach, pr.pos, pr.radius)) continue;
    sw.hit.push(pr.id);
    pr.friendly = true;
    pr.vel = scale(fromAngle(sw.angle), len(pr.vel) * 1.3);
    pr.life = 3;
    pr.knockback = 380;
    emit(s, { type: "hit", pos: pr.pos, dir: fromAngle(sw.angle), damage: 0, crit: false, target: "orbiter" });
  }
  if (combo > 1) {
    emit(s, { type: "combo", pos: p.pos, idx: combo });
    s.stats.bestCombo = Math.max(s.stats.bestCombo, combo);
  }
}

function integrateEntities(ctx: Ctx): void {
  const { s, dt } = ctx;
  for (const e of s.entities) {
    if (e.dead) continue;
    if (e.kind === "orbiter" && e.orbit) continue; // kinematic
    if (e.planet !== null) {
      const planet = s.planets[e.planet];
      if (e.stun > 0 && e.kind !== "player") {
        // sliding while stunned: friction
        const sp = len(e.vel);
        const drop = 900 * dt;
        e.vel = sp <= drop ? { x: 0, y: 0 } : scale(e.vel, (sp - drop) / sp);
      }
      e.pos = add(e.pos, scale(e.vel, dt));
      e.pos = snapToSurface(planet, e.pos, e.radius);
      e.vel = tangentOnly(planet, e.pos, e.vel);
      e.stun = Math.max(0, e.stun - dt);
      continue;
    }
    if (!(e.kind === "player" && e.dashT > 0)) e.vel = add(e.vel, scale(gravityAt(s.planets, e.pos), dt));
    if (e.kind === "player" && e.dashT <= 0) e.vel = scale(e.vel, Math.exp(-PLAYER.spaceDrag * dt));
    if (e.spawnT > 0) {
      e.airTime += dt;
      if (e.airTime > 4) {
        const { planet } = nearestPlanet(s.planets, e.pos);
        e.vel = add(scale(e.vel, Math.exp(-1.5 * dt)), scale(norm(sub(planet.pos, e.pos)), 900 * dt));
      }
    }
    e.pos = add(e.pos, scale(e.vel, dt));
    e.stun = Math.max(0, e.stun - dt);
    if (e.kind === "player") resolveContactForPlayer(ctx, e);
    else resolveContactForEnemy(ctx, e);
  }
}

function resolveContactForPlayer(ctx: Ctx, p: Entity): void {
  const { s } = ctx;
  const c = findContact(s.planets, p.pos, p.vel, p.radius);
  if (!c) return;
  p.pos = snapToSurface(c.planet, p.pos, p.radius);
  p.planet = c.planet.id;
  const vn = dot(p.vel, c.normal);
  p.vel = sub(p.vel, scale(c.normal, vn));
  if (p.dashT > 0) {
    p.dashT = 0;
    p.vel = scale(p.vel, 0.6);
  }
  emit(s, { type: "land", pos: p.pos, normal: c.normal, speed: c.speedIn, kind: "player" });
  if (c.speedIn > PLAYER.impactThreshold && !s.mods.gravityBoots) {
    damagePlayer(ctx, Math.round((c.speedIn - PLAYER.impactThreshold) * PLAYER.impactDamagePerUnit), "impact");
  }
  if (s.mods.aftershock && c.speedIn > 380) {
    const a = Math.atan2(c.normal.y, c.normal.x);
    spawnShockwave(s, c.planet.id, a, 18 + c.speedIn * 0.03, true, 4.5, Math.PI * 0.6);
  }
}

function cullVoid(ctx: Ctx): void {
  const { s } = ctx;
  for (const e of s.entities) {
    if (e.dead || !inVoid(e.pos)) continue;
    if (e.kind === "player") {
      emit(s, { type: "void", pos: e.pos, kind: "player" });
      s.over = true;
      e.hp = 0;
      emit(s, { type: "playerDead", pos: e.pos });
      continue;
    }
    emit(s, { type: "void", pos: e.pos, kind: e.kind });
    if (e.spawnT > 0) {
      // a pod that missed everything: nobody scores
      e.dead = true;
      s.wave.alive--;
    } else {
      killEnemy(ctx, e, "void");
    }
  }
}
