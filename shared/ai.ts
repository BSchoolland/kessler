import { BLAST } from "./config";
import { ENEMY_DEFS, isBoss, ORBIT_HEIGHT, RAIDER_RING } from "./enemies";
import { damagePlayer, emit, explode, player, spawnDebris, spawnEnemyPod, spawnShockwave, type Ctx } from "./actions";
import { dominantPlanet, nearestPlanet, orbitSpeed, surfaceNormal } from "./physics";
import type { EnemyDef } from "./enemies";
import type { Entity, EnemyKind, Planet, Projectile } from "./types";
import { add, angleDelta, angleOf, clamp, dist, dot, fromAngle, len, norm, perp, scale, sub, type Vec } from "./vec";

function angleAround(planet: Planet, pos: Vec): number {
  return Math.atan2(pos.y - planet.pos.y, pos.x - planet.pos.x);
}

/** Walk along the surface toward a world position; returns remaining angular gap. */
function walkToward(ctx: Ctx, e: Entity, planet: Planet, target: Vec, speed: number): number {
  const my = angleAround(planet, e.pos);
  const to = angleAround(planet, target);
  const da = angleDelta(my, to);
  const n = surfaceNormal(planet, e.pos);
  const t = perp(n); // counter-clockwise tangent
  const dir = Math.sign(da) || 1;
  const want = scale(t, dir * speed);
  const cur = dot(e.vel, t);
  const nv = cur + clamp(dir * speed - cur, -1800 * ctx.dt, 1800 * ctx.dt);
  e.vel = scale(t, nv);
  void want;
  return da;
}

function stopWalking(ctx: Ctx, e: Entity): void {
  const drop = 1400 * ctx.dt;
  const sp = len(e.vel);
  e.vel = sp <= drop ? { x: 0, y: 0 } : scale(e.vel, (sp - drop) / sp);
}

function leapAt(e: Entity, target: Vec, speed: number, planet: Planet): void {
  const n = surfaceNormal(planet, e.pos);
  let dir = norm(sub(target, e.pos));
  // don't try to leap through the planet
  if (dot(dir, n) < 0.25) dir = norm(add(dir, scale(n, 0.6)));
  e.vel = scale(dir, speed);
  e.planet = null;
  e.ai.state = "leaping";
  e.ai.t = 0;
  e.airTime = 0;
}

export function updateEnemyAi(ctx: Ctx, e: Entity): void {
  const { s, dt } = ctx;
  if (e.spawnT > 0 || e.dead || s.over) return;
  const def = ENEMY_DEFS[e.kind as EnemyKind];
  const p = player(s);
  e.facing = angleOf(sub(p.pos, e.pos));
  e.ai.cooldown -= dt;
  if (e.stun > 0) {
    if (e.planet !== null) stopWalking(ctx, e);
    return;
  }
  switch (e.kind) {
    case "orbiter":
    case "bomber": return updateOrbital(ctx, e);
    case "aegis": return updateAegis(ctx, e);
    case "raider": return updateRaider(ctx, e);
    case "flak": return updateFlak(ctx, e);
    case "lancer": return updateLancer(ctx, e);
    case "mine": return updateMine(ctx, e);
    case "sweeper": return updateSweeper(ctx, e);
    case "hammer": return updatePounder(ctx, e, ENEMY_DEFS.hammer, { throws: true, pods: true });
    case "twin": return updateTwin(ctx, e);
    case "warden": return updateWarden(ctx, e);
    case "belt": return updateBelt(ctx, e);
    default: updateWalker(ctx, e, def.speed * (e.elite ? 1.2 : 1), def.leapSpeed, def.leapDelay, e.kind === "hopper" ? 300 : Infinity);
  }
}

/** Player's planet, counting a low hover over one as being on it. */
function playerPlanetId(ctx: Ctx): number {
  const { s } = ctx;
  const p = player(s);
  if (p.planet !== null) return p.planet;
  return dominantPlanet(s.planets, p.pos).id;
}

/** Advance an owner's beam and hit the player if they're in its path on that planet. */
function updateBeam(ctx: Ctx, e: Entity, planet: Planet): void {
  const { s, dt } = ctx;
  const b = e.ai.beam!;
  b.t -= dt;
  if (b.t <= 0) { e.ai.beam = null; return; }
  b.angle += b.dir * b.speed * dt;
  const p = player(s);
  if (s.over || p.invuln > 0) return;
  const gap = dist(p.pos, planet.pos) - planet.r - p.radius;
  if (gap > b.height) return;
  const pa = angleAround(planet, p.pos);
  const margin = (p.radius + 6) / planet.r;
  for (let i = 0; i < b.blades; i++) {
    const a = b.angle + (i / b.blades) * Math.PI * 2;
    if (Math.abs(angleDelta(a, pa)) > margin) continue;
    if (damagePlayer(ctx, ENEMY_DEFS[e.kind as EnemyKind].damage, "beam")) {
      const n = surfaceNormal(planet, p.pos);
      p.vel = add(p.vel, scale(n, 380));
      p.planet = null;
    }
    return;
  }
}

/**
 * Lancer: closes on foot, then telegraphs and charges along the surface at speed.
 * The charge is a straight run in one direction; step off the ground or swing it away.
 */
function updateLancer(ctx: Ctx, e: Entity): void {
  const { s, dt } = ctx;
  const p = player(s);
  const def = ENEMY_DEFS.lancer;
  const ai = e.ai;
  if (e.planet !== null && (ai.state === "windup" || ai.state === "attack" || ai.state === "recover")) {
    const planet = s.planets[e.planet];
    ai.t -= dt;
    if (ai.state === "windup") {
      stopWalking(ctx, e);
      if (ai.t <= 0) {
        ai.state = "attack";
        ai.t = def.attack;
        const n = surfaceNormal(planet, e.pos);
        const t = perp(n);
        const dir = Math.sign(angleDelta(angleAround(planet, e.pos), angleAround(planet, p.pos))) || 1;
        e.vel = scale(t, dir * 620);
        emit(s, { type: "charge", pos: e.pos, dir: scale(t, dir) });
      }
    } else if (ai.state === "attack") {
      // keep the run going along the surface; friction in integrate only applies while stunned
      const n = surfaceNormal(planet, e.pos);
      const t = perp(n);
      const sp = dot(e.vel, t);
      e.vel = scale(t, Math.sign(sp || 1) * 620);
      if (ai.t <= 0) { ai.state = "recover"; ai.t = def.recover; }
    } else if (ai.t <= 0) ai.state = "idle";
    else stopWalking(ctx, e);
    return;
  }
  if (ai.state === "windup" || ai.state === "attack" || ai.state === "recover") ai.state = "idle";
  if (e.planet !== null && ai.cooldown <= 0 && playerPlanetId(ctx) === e.planet && p.planet !== null) {
    const planet = s.planets[e.planet];
    const gap = Math.abs(angleDelta(angleAround(planet, e.pos), angleAround(planet, p.pos))) * planet.r;
    if (gap > 90 && gap < def.reach) {
      ai.state = "windup";
      ai.t = def.windup;
      ai.cooldown = def.windup + def.attack + def.recover + 1.6;
      s.telegraphs.push({ id: s.nextId++, kind: "charge", pos: e.pos, radius: 0, t: def.windup, total: def.windup, owner: e.id });
      emit(s, { type: "telegraph", kind: "charge", pos: e.pos });
      return;
    }
  }
  updateWalker(ctx, e, def.speed * (e.elite ? 1.2 : 1), def.leapSpeed, def.leapDelay, Infinity);
}

/**
 * Mine: drifts toward you through space and goes off when it gets close. Hit it and it becomes
 * a bomb you've thrown: it explodes on whatever it touches, or when its splat window runs out.
 */
function updateMine(ctx: Ctx, e: Entity): void {
  const { s, dt } = ctx;
  const p = player(s);
  const def = ENEMY_DEFS.mine;
  if (e.launched) {
    // thrown: any contact is a detonation, and so is the end of the flight window
    const c = s.entities.find((x) => x !== e && x.kind !== "player" && !x.dead && x.spawnT <= 0 && dist(x.pos, e.pos) < x.radius + e.radius + 4);
    const { gap } = nearestPlanet(s.planets, e.pos);
    if (c || gap < e.radius + 2 || e.splatT < 0.05) detonate(ctx, e);
    return;
  }
  if (e.planet !== null) { e.planet = null; }
  const to = sub(add(p.pos, scale(p.vel, 0.25)), e.pos);
  const want = scale(norm(to), def.speed * (e.elite ? 1.3 : 1));
  e.vel = add(e.vel, scale(sub(want, e.vel), Math.min(1, 1.6 * dt)));
  e.pos = add(e.pos, scale(e.vel, dt));
  if (!s.over && dist(p.pos, e.pos) < BLAST.fuse + p.radius) detonate(ctx, e);
}

/** A mine going off on its own terms: it's gone first, so the blast can't kill it a second time. */
function detonate(ctx: Ctx, e: Entity): void {
  const { s } = ctx;
  if (e.dead) return;
  e.dead = true;
  s.wave.alive--;
  s.stats.kills++;
  s.score += ENEMY_DEFS[e.kind as EnemyKind].score;
  emit(s, { type: "kill", pos: e.pos, kind: e.kind, source: "blast", vel: e.vel });
  explode(ctx, e.pos, e.hue);
}

/**
 * Sweeper: a turret that lands on your planet and runs a low laser around the surface.
 * Standing still gets you hit; hop over it, or launch it off the ground to switch it off.
 */
function updateSweeper(ctx: Ctx, e: Entity): void {
  const { s, dt, rng } = ctx;
  const def = ENEMY_DEFS.sweeper;
  const ai = e.ai;
  if (e.planet === null) {
    ai.beam = null;
    e.airTime += dt;
    if (e.airTime > 3) {
      const { planet } = nearestPlanet(s.planets, e.pos);
      e.vel = add(scale(e.vel, Math.exp(-1.2 * dt)), scale(norm(sub(planet.pos, e.pos)), 700 * dt));
    }
    return;
  }
  const planet = s.planets[e.planet];
  stopWalking(ctx, e);
  e.facing = angleOf(surfaceNormal(planet, e.pos));
  if (!ai.beam) {
    ai.t -= dt;
    if (ai.state !== "aim") { ai.state = "aim"; ai.t = def.windup; emit(s, { type: "telegraph", kind: "shot", pos: e.pos }); }
    if (ai.t <= 0) {
      ai.beam = { angle: angleAround(planet, e.pos), dir: rng.sign() as 1 | -1, height: 36, speed: 1.15 * (e.elite ? 1.3 : 1), blades: 1, t: Infinity };
      emit(s, { type: "beam", pos: e.pos });
    }
    return;
  }
  updateBeam(ctx, e, planet);
}

/**
 * Pounders (the Hammer, each Twin): fast chasers that leap at you and hit the ground on every
 * landing with a ring around the planet. Options add the rock shotgun (line of sight only)
 * and pod calls.
 */
function updatePounder(ctx: Ctx, e: Entity, def: EnemyDef, opts: { throws: boolean; pods: boolean }): void {
  const { s, dt, rng } = ctx;
  const p = player(s);
  const ai = e.ai;
  const phase2 = ai.phase === 2;
  const airborne = e.planet === null;

  // the landing is the telegraph: the pound goes off the moment it touches down
  if (ai.wasAirborne && !airborne) {
    const pl = s.planets[e.planet!];
    const n = surfaceNormal(pl, e.pos);
    stopWalking(ctx, e);
    spawnShockwave(s, pl.id, angleAround(pl, e.pos), def.damage * 0.85, false, phase2 ? 4 : 3.4, Math.PI, true);
    spawnDebris(ctx, e.pos, { x: 0, y: 0 }, phase2 ? 6 : 4, def.hue, false, 0.8);
    s.freeze = Math.max(s.freeze, 0.11);
    emit(s, { type: "pound", pos: e.pos, normal: n });
    ai.state = "recover";
    ai.t = phase2 ? 0.35 : 0.6;
  }
  ai.wasAirborne = airborne;

  if (opts.pods) {
    ai.timer -= dt;
    if (ai.timer <= 0) {
      ai.timer = phase2 ? 4.5 : 6.5;
      const others = s.entities.filter((x) => x.kind !== "player" && !isBoss(x.kind as EnemyKind) && !x.dead).length;
      if (others < 4) spawnEnemyPod(ctx, rng.chance(0.6) ? "grunt" : "hopper", playerPlanetId(ctx), false);
    }
  }

  if (airborne) {
    e.airTime += dt;
    if (e.airTime > 3) {
      const { planet } = nearestPlanet(s.planets, e.pos);
      e.vel = add(scale(e.vel, Math.exp(-1.2 * dt)), scale(norm(sub(planet.pos, e.pos)), 900 * dt));
    }
    return;
  }

  switch (ai.state) {
    case "throw": {
      ai.t -= dt;
      if (ai.t <= 0) {
        const n = phase2 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const spread = (i - (n - 1) / 2) * 0.18;
          const dir = fromAngle(angleOf(sub(p.pos, e.pos)) + spread);
          spawnDebris(ctx, add(e.pos, scale(dir, e.radius + 12)), { x: 0, y: 0 }, 1, def.hue, true, 0.01);
          const dbr = s.debris[s.debris.length - 1];
          dbr.vel = scale(dir, 470 + i * 20);
          dbr.life = 6;
        }
        ai.state = "recover";
        ai.t = 0.6;
      }
      break;
    }
    case "recover":
      ai.t -= dt;
      if (ai.t <= 0) ai.state = "idle";
      break;
    default: {
      if (opts.throws && ai.cooldown <= 0 && dist(p.pos, e.pos) < 720 && hasLineOfSight(s.planets, e.pos, p.pos)) {
        ai.state = "throw";
        ai.t = 0.6;
        stopWalking(ctx, e);
        s.telegraphs.push({ id: s.nextId++, kind: "throw", pos: e.pos, radius: 60, t: ai.t, total: ai.t, owner: e.id });
        emit(s, { type: "telegraph", kind: "throw", pos: e.pos });
        ai.cooldown = phase2 ? 3 : 4;
        return;
      }
      // even with you close by it hops every few seconds, because the landing is the attack
      ai.rot -= dt;
      if (ai.rot <= 0 && e.planet === playerPlanetId(ctx) && p.planet !== null) {
        ai.rot = phase2 ? 3.5 : 5.5;
        const planet = s.planets[e.planet!];
        const n = surfaceNormal(planet, e.pos);
        const lead = add(p.pos, scale(p.vel, 0.35));
        const dir = norm(add(norm(sub(lead, e.pos)), scale(n, 1.1)));
        e.vel = scale(dir, def.leapSpeed * 0.8);
        e.planet = null;
        ai.state = "leaping";
        e.airTime = 0;
        return;
      }
      updateWalker(ctx, e, def.speed * (phase2 ? 1.25 : 1), def.leapSpeed, def.leapDelay, 240);
    }
  }
}

/** The Twins: two pounders. When one falls the other goes to phase two. */
function updateTwin(ctx: Ctx, e: Entity): void {
  const { s } = ctx;
  const other = s.entities.find((x) => x !== e && x.kind === "twin" && !x.dead);
  if (!other && e.ai.phase === 1) { e.ai.phase = 2; emit(s, { type: "bossPhase", pos: e.pos }); }
  updatePounder(ctx, e, ENEMY_DEFS.twin, { throws: false, pods: e.ai.phase === 2 });
}

/**
 * The Warden: a gunship in a wide orbit around whatever planet you're on. Fans of shots from
 * orbit, mines dropped on a clock, and a dive onto your planet every so often: it lands with
 * a small pound and sits there for a couple of seconds, which is when melee gets its turn.
 */
function updateWarden(ctx: Ctx, e: Entity): void {
  const { s, dt, rng } = ctx;
  const p = player(s);
  const def = ENEMY_DEFS.warden;
  const ai = e.ai;
  const phase2 = ai.phase === 2;

  if (e.orbit) {
    const o = e.orbit;
    const homeId = playerPlanetId(ctx);
    if (o.planet !== homeId) {
      // slide over to your planet: re-anchor the orbit, the radius eases across
      o.planet = homeId;
      o.angle = angleAround(s.planets[homeId], e.pos);
    }
    const planet = s.planets[o.planet];
    const R0 = dist(e.pos, planet.pos);
    const R = R0 + clamp(planet.r + 260 - R0, -220 * dt, 220 * dt);
    o.angle += o.dir * (def.speed / Math.max(R, 1)) * dt;
    const np = add(planet.pos, fromAngle(o.angle, R));
    e.vel = scale(sub(np, e.pos), 1 / dt);
    e.pos = np;

    ai.rot -= dt;
    if (ai.rot <= 0) {
      ai.rot = phase2 ? 6 : 8;
      for (let i = 0; i < (phase2 ? 3 : 2); i++) {
        const m = spawnEnemyPod(ctx, "mine", planet.id, false, add(e.pos, fromAngle(rng.range(0, 6.283), 30)));
        m.vel = fromAngle(rng.range(0, 6.283), 60);
      }
    }
    ai.timer -= dt;
    if (ai.timer <= 0 && ai.state === "idle") {
      // dive at where you're standing
      ai.timer = phase2 ? 6.5 : 9.5;
      e.orbit = null;
      ai.state = "leaping";
      e.vel = scale(norm(sub(add(p.pos, scale(p.vel, 0.3)), e.pos)), def.leapSpeed);
      e.airTime = 0;
      ai.wasAirborne = true;
      return;
    }
    switch (ai.state) {
      case "idle":
        if (ai.cooldown <= 0 && dist(p.pos, e.pos) < def.reach) {
          ai.state = "aim";
          ai.t = def.windup;
          s.telegraphs.push({ id: s.nextId++, kind: "shot", pos: e.pos, radius: 0, t: def.windup, total: def.windup, owner: e.id });
          emit(s, { type: "telegraph", kind: "shot", pos: e.pos });
        }
        break;
      case "aim": {
        ai.t -= dt;
        if (ai.t <= 0) {
          const n = phase2 ? 7 : 5;
          const speed = 480;
          const base = angleOf(sub(add(p.pos, scale(p.vel, 0.4)), e.pos));
          for (let i = 0; i < n; i++) {
            const dir = fromAngle(base + (i - (n - 1) / 2) * 0.13);
            s.projectiles.push({ id: s.nextId++, pos: add(e.pos, scale(dir, e.radius + 6)), vel: scale(dir, speed), radius: 5, life: 3, damage: def.damage, hue: def.hue, friendly: false, knockback: 320, slug: false, seek: 0, bomb: false });
          }
          emit(s, { type: "shot", pos: e.pos, dir: fromAngle(base) });
          ai.state = "idle";
          ai.cooldown = def.recover * (phase2 ? 0.75 : 1);
        }
        break;
      }
      default:
        ai.state = "idle";
    }
    return;
  }

  // off the orbit: diving, landed, or knocked loose
  const airborne = e.planet === null;
  if (ai.wasAirborne && !airborne) {
    const pl = s.planets[e.planet!];
    stopWalking(ctx, e);
    spawnShockwave(s, pl.id, angleAround(pl, e.pos), 16, false, 3.2, Math.PI, true);
    spawnDebris(ctx, e.pos, { x: 0, y: 0 }, 4, def.hue, false, 0.8);
    s.freeze = Math.max(s.freeze, 0.08);
    emit(s, { type: "pound", pos: e.pos, normal: surfaceNormal(pl, e.pos) });
    ai.state = "recover";
    ai.t = phase2 ? 2 : 2.6;
  }
  ai.wasAirborne = airborne;
  if (!airborne) {
    stopWalking(ctx, e);
    ai.t -= dt;
    if (ai.t <= 0) {
      // take off, back to orbit
      const pl = s.planets[e.planet!];
      const n = surfaceNormal(pl, e.pos);
      e.planet = null;
      e.vel = scale(n, 260);
      e.airTime = 0;
      ai.state = "idle";
      e.orbit = { planet: pl.id, radius: pl.r + 260, angle: angleAround(pl, e.pos), dir: rng.sign() as 1 | -1 };
    }
    return;
  }
  e.airTime += dt;
  if (ai.state !== "leaping" && (len(e.vel) < 300 || e.airTime > 2.5)) {
    // knocked loose: climb back to orbit from wherever we are
    const { planet } = nearestPlanet(s.planets, e.pos);
    e.orbit = { planet: planet.id, radius: planet.r + 260, angle: angleAround(planet, e.pos), dir: rng.sign() as 1 | -1 };
    e.launched = false;
    ai.state = "idle";
  } else if (ai.state === "leaping" && e.airTime > 3) {
    const { planet } = nearestPlanet(s.planets, e.pos);
    e.vel = add(scale(e.vel, Math.exp(-1.2 * dt)), scale(norm(sub(planet.pos, e.pos)), 900 * dt));
  }
}

/**
 * The Belt: the finale. A slow giant on the main planet that cycles a sweeping laser, a leap
 * straight up that lands as a pound, and a ring of heavy debris thrown into orbit around its
 * planet. Calls pods throughout. Phase two: two blades, faster cycle.
 */
function updateBelt(ctx: Ctx, e: Entity): void {
  const { s, dt, rng } = ctx;
  const p = player(s);
  const def = ENEMY_DEFS.belt;
  const ai = e.ai;
  const phase2 = ai.phase === 2;
  const airborne = e.planet === null;

  if (ai.wasAirborne && !airborne) {
    const pl = s.planets[e.planet!];
    stopWalking(ctx, e);
    spawnShockwave(s, pl.id, angleAround(pl, e.pos), def.damage * 0.85, false, phase2 ? 4.2 : 3.6, Math.PI, true);
    spawnDebris(ctx, e.pos, { x: 0, y: 0 }, 8, def.hue, false, 0.9);
    s.freeze = Math.max(s.freeze, 0.14);
    emit(s, { type: "pound", pos: e.pos, normal: surfaceNormal(pl, e.pos) });
    ai.state = "recover";
    ai.t = 0.8;
  }
  ai.wasAirborne = airborne;

  ai.timer -= dt;
  if (ai.timer <= 0) {
    ai.timer = phase2 ? 4 : 5.5;
    const others = s.entities.filter((x) => x.kind !== "player" && !isBoss(x.kind as EnemyKind) && !x.dead).length;
    if (others < 5) spawnEnemyPod(ctx, rng.pick(["grunt", "hopper", "lancer"] as const), playerPlanetId(ctx), false);
  }

  if (airborne) {
    e.airTime += dt;
    if (e.airTime > 2.5) {
      const { planet } = nearestPlanet(s.planets, e.pos);
      e.vel = add(scale(e.vel, Math.exp(-1.2 * dt)), scale(norm(sub(planet.pos, e.pos)), 1100 * dt));
    }
    return;
  }
  const planet = s.planets[e.planet!];
  if (ai.beam) updateBeam(ctx, e, planet);

  switch (ai.state) {
    case "recover":
      stopWalking(ctx, e);
      ai.t -= dt;
      if (ai.t <= 0) ai.state = "idle";
      break;
    case "cast":
      // holding still while the beam runs
      stopWalking(ctx, e);
      if (!ai.beam) ai.state = "idle";
      break;
    default: {
      if (ai.cooldown <= 0) {
        ai.cooldown = phase2 ? 4.5 : 6;
        const pick = ai.rot++ % 3;
        if (pick === 0) {
          ai.beam = { angle: angleAround(planet, e.pos), dir: rng.sign() as 1 | -1, height: 60, speed: phase2 ? 1.6 : 1.3, blades: phase2 ? 2 : 1, t: 5 };
          ai.state = "cast";
          emit(s, { type: "beam", pos: e.pos });
        } else if (pick === 1) {
          // straight up, and the landing is the attack
          const n = surfaceNormal(planet, e.pos);
          e.vel = scale(n, def.leapSpeed);
          e.planet = null;
          e.airTime = 0;
          ai.state = "leaping";
          emit(s, { type: "telegraph", kind: "throw", pos: e.pos });
        } else {
          // the belt: heavy rocks into orbit around this planet
          const R = planet.r + 150;
          const v = orbitSpeed(planet, R);
          const n = phase2 ? 10 : 8;
          const dir = rng.sign();
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            spawnDebris(ctx, add(planet.pos, fromAngle(a, R)), { x: 0, y: 0 }, 1, def.hue, true, 0.01);
            const d = s.debris[s.debris.length - 1];
            d.vel = scale(perp(fromAngle(a)), dir * v);
            d.life = 11;
          }
          emit(s, { type: "shockwave", pos: e.pos });
          ai.state = "recover";
          ai.t = 0.7;
        }
        return;
      }
      updateWalker(ctx, e, def.speed, def.leapSpeed, def.leapDelay, Infinity);
    }
  }
}

/** Ground AI shared by everything that walks: chase on the same planet, leap across otherwise. `samePlanetLeapGap`: surface distance beyond which it leaps at you even on your planet. */
function updateWalker(ctx: Ctx, e: Entity, speed: number, leapSpeed: number, leapDelay: number, samePlanetLeapGap: number): void {
  const { s, dt } = ctx;
  const p = player(s);
  const ai = e.ai;

  if (e.planet === null) {
    // airborne: wait for landing; nudge toward a planet if it's taking too long
    e.airTime += dt;
    if (e.airTime > 3.5) {
      const { planet } = nearestPlanet(s.planets, e.pos);
      e.vel = add(scale(e.vel, Math.exp(-1.2 * dt)), scale(norm(sub(planet.pos, e.pos)), 700 * dt));
    }
    return;
  }
  const planet = s.planets[e.planet];
  if (ai.state === "leaping") { ai.state = "idle"; ai.cooldown = Math.max(ai.cooldown, 0.25); }
  // where is the player, planet-wise? null = out in space, not worth leaping at
  const pDom = dominantPlanet(s.planets, p.pos);
  const pGap = dist(p.pos, pDom.pos) - pDom.r;
  const playerPlanet = p.planet !== null ? p.planet : pGap < 200 ? pDom.id : null;
  const playerHere = playerPlanet === e.planet;

  switch (ai.state) {
    case "idle":
    case "walk": {
      if (playerHere) {
        ai.state = "walk";
        const surfaceGap = Math.abs(angleDelta(angleAround(planet, e.pos), angleAround(planet, p.pos))) * planet.r;
        if (surfaceGap > samePlanetLeapGap && ai.cooldown <= 0) {
          ai.state = "leapWait";
          ai.t = 0.15;
          break;
        }
        walkToward(ctx, e, planet, p.pos, speed);
      } else if (playerPlanet !== null) {
        ai.state = "leapWait";
        ai.t = leapDelay;
      } else {
        // player is floating: pace toward their side of the planet and wait for them to come down
        walkToward(ctx, e, planet, p.pos, speed * 0.6);
      }
      break;
    }
    case "leapWait": {
      if (playerHere && ai.t > 0.3) { ai.state = "walk"; break; }
      if (playerPlanet === null) { ai.state = "walk"; break; }
      ai.t -= dt;
      const da = walkToward(ctx, e, planet, p.pos, speed);
      const facing = Math.abs(da) < 0.35;
      if (ai.t <= 0 && (facing || ai.t < -2)) {
        const lead = scale(p.vel, clamp(dist(p.pos, e.pos) / leapSpeed, 0, 0.9) * 0.5);
        leapAt(e, add(p.pos, lead), leapSpeed, planet);
      }
      break;
    }
    default:
      ai.state = "idle";
  }
}

/**
 * Flak: gets to a planet the player is NOT on, walks until it's directly under them,
 * and fires straight up along its surface normal. Relocates if the player comes over.
 */
function updateFlak(ctx: Ctx, e: Entity): void {
  const { s, dt } = ctx;
  const p = player(s);
  const def = ENEMY_DEFS.flak;
  const ai = e.ai;

  if (e.planet === null) {
    e.airTime += dt;
    if (e.airTime > 3.5) {
      const { planet } = nearestPlanet(s.planets, e.pos);
      e.vel = add(scale(e.vel, Math.exp(-1.2 * dt)), scale(norm(sub(planet.pos, e.pos)), 700 * dt));
    }
    return;
  }
  const planet = s.planets[e.planet];
  if (ai.state === "leaping") ai.state = "idle";
  const pDom = dominantPlanet(s.planets, p.pos);
  const playerPlanet = p.planet !== null ? p.planet : dist(p.pos, pDom.pos) - pDom.r < 200 ? pDom.id : null;
  const sharing = playerPlanet === e.planet;
  // barrel always points up
  e.facing = angleOf(surfaceNormal(planet, e.pos));

  switch (ai.state) {
    case "idle":
    case "walk": {
      if (sharing && s.planets.length > 1) {
        ai.state = "leapWait";
        ai.t = def.leapDelay;
        break;
      }
      ai.state = "walk";
      const da = walkToward(ctx, e, planet, p.pos, def.speed);
      if (Math.abs(da) < 0.1) {
        stopWalking(ctx, e);
        if (ai.cooldown <= 0) {
          ai.state = "aim";
          ai.t = def.windup;
          s.telegraphs.push({ id: s.nextId++, kind: "shot", pos: e.pos, radius: 0, t: def.windup, total: def.windup, owner: e.id });
          emit(s, { type: "telegraph", kind: "shot", pos: e.pos });
        }
      }
      break;
    }
    case "leapWait": {
      ai.t -= dt;
      // pick the nearest planet that isn't the player's and hop to it
      let target: Planet | null = null;
      let bd = Infinity;
      for (const pl of s.planets) {
        if (pl.id === e.planet || pl.id === playerPlanet) continue;
        const d = dist(pl.pos, e.pos);
        if (d < bd) { bd = d; target = pl; }
      }
      if (!target) { ai.state = "walk"; break; }
      const da = walkToward(ctx, e, planet, target.pos, def.speed);
      if (ai.t <= 0 && (Math.abs(da) < 0.4 || ai.t < -2)) leapAt(e, target.pos, def.leapSpeed, planet);
      break;
    }
    case "aim": {
      stopWalking(ctx, e);
      ai.t -= dt;
      if (ai.t <= 0) {
        const n = surfaceNormal(planet, e.pos);
        // a rocket: launched straight up, then gently bends toward the player
        const pr: Projectile = { id: s.nextId++, pos: add(e.pos, scale(n, e.radius + 6)), vel: scale(n, 440), radius: 6, life: 4.5, damage: def.damage, hue: def.hue, friendly: false, knockback: 340, slug: false, seek: 0.7, bomb: false };
        s.projectiles.push(pr);
        emit(s, { type: "rocket", pos: pr.pos, dir: n });
        ai.state = "walk";
        ai.cooldown = def.recover * (e.elite ? 0.7 : 1);
      }
      break;
    }
    default:
      ai.state = "idle";
  }
}

/**
 * Orbital units (Orbiter, Bomber): kinematic circling of a planet, hops to the player's planet
 * every so often, and an attack on a cooldown: the orbiter's aimed shot or the bomber's bomb.
 */
function updateOrbital(ctx: Ctx, e: Entity): void {
  const { s, dt, rng } = ctx;
  const p = player(s);
  const def = ENEMY_DEFS[e.kind as EnemyKind];
  const height = ORBIT_HEIGHT[e.kind as EnemyKind]!;
  const ai = e.ai;

  if (!e.orbit) {
    e.airTime += dt;
    if (ai.state === "leaping" && ai.target) {
      // hopping to the player's planet: fly at it and take up orbit on arrival
      const target = s.planets.find((pl) => pl.pos.x === ai.target!.x && pl.pos.y === ai.target!.y)!;
      e.vel = scale(norm(sub(target.pos, e.pos)), 420);
      if (dist(e.pos, target.pos) < target.r + height + 15) {
        e.orbit = { planet: target.id, radius: target.r + height, angle: angleOf(sub(e.pos, target.pos)), dir: rng.sign() as 1 | -1 };
        ai.state = "idle";
        ai.target = null;
        ai.cooldown = Math.max(ai.cooldown, 0.8);
      }
      return;
    }
    // knocked loose: recapture once we're slow enough
    if (len(e.vel) < 320 || e.airTime > 2.5) {
      const { planet } = nearestPlanet(s.planets, e.pos);
      const R = clamp(dist(e.pos, planet.pos), planet.r + 90, planet.r + 240);
      const rel = sub(e.pos, planet.pos);
      const dir = (rel.x * e.vel.y - rel.y * e.vel.x) >= 0 ? 1 : -1;
      e.orbit = { planet: planet.id, radius: R, angle: angleOf(rel), dir };
      e.planet = null;
    }
    return;
  }
  const o = e.orbit;
  const planet = s.planets[o.planet];
  // every so often, one circling a planet you're not on comes over to yours
  ai.timer -= dt;
  if (ai.timer <= 0) {
    ai.timer = rng.range(7, 12);
    const pd = p.planet ?? dominantPlanet(s.planets, p.pos).id;
    if (pd !== o.planet && ai.state === "idle") {
      const target = s.planets[pd];
      e.orbit = null;
      ai.state = "leaping";
      ai.target = { ...target.pos };
      e.vel = scale(norm(sub(target.pos, e.pos)), 420);
      e.airTime = 0;
      return;
    }
  }
  // ease radius to the target and advance along the orbit (kinematic, a bit slower than physical for readability)
  const rel = sub(e.pos, planet.pos);
  const curR = len(rel);
  const R = curR + clamp(o.radius - curR, -120 * dt, 120 * dt);
  const w = (orbitSpeed(planet, o.radius) / o.radius) * 0.75;
  o.angle += o.dir * w * dt;
  const np = add(planet.pos, fromAngle(o.angle, R));
  e.vel = scale(sub(np, e.pos), 1 / dt);
  e.pos = np;

  switch (ai.state) {
    case "idle": {
      const ready = e.kind === "bomber" ? (p.planet === planet.id || dominantPlanet(s.planets, p.pos).id === planet.id) : dist(p.pos, e.pos) < def.reach;
      if (ai.cooldown <= 0 && ready) {
        ai.state = "aim";
        ai.t = def.windup;
        s.telegraphs.push({ id: s.nextId++, kind: "shot", pos: e.pos, radius: 0, t: def.windup, total: def.windup, owner: e.id });
        emit(s, { type: "telegraph", kind: "shot", pos: e.pos });
      }
      break;
    }
    case "aim": {
      ai.t -= dt;
      if (ai.t <= 0) {
        if (e.kind === "bomber") {
          // a bomb, let go straight down: gravity does the aiming, the burst does the rest
          const down = norm(sub(planet.pos, e.pos));
          const pr: Projectile = { id: s.nextId++, pos: add(e.pos, scale(down, e.radius + 6)), vel: add(scale(down, 60), scale(e.vel, 0.5)), radius: 7, life: 5, damage: def.damage, hue: def.hue, friendly: false, knockback: 380, slug: false, seek: 0, bomb: true };
          s.projectiles.push(pr);
          emit(s, { type: "shot", pos: pr.pos, dir: down });
        } else {
          const speed = 400;
          const tof = clamp(dist(p.pos, e.pos) / speed, 0, 1.2);
          const target = add(p.pos, scale(p.vel, tof * 0.6));
          const dir = norm(sub(target, e.pos));
          const pr: Projectile = { id: s.nextId++, pos: add(e.pos, scale(dir, e.radius + 4)), vel: scale(dir, speed), radius: 5, life: 3.2, damage: def.damage, hue: def.hue, friendly: false, knockback: 320, slug: false, seek: 0, bomb: false };
          s.projectiles.push(pr);
          emit(s, { type: "shot", pos: pr.pos, dir });
        }
        ai.state = "idle";
        ai.cooldown = def.recover * (e.elite ? 0.7 : 1);
      }
      break;
    }
    default:
      ai.state = "idle";
  }
}

/**
 * Aegis: a walker behind a shield that turns toward you, but slowly. Slugs and the wave break
 * on the shield's front; the overhead sweep, anything from behind, and debris all get through.
 */
function updateAegis(ctx: Ctx, e: Entity): void {
  const { s, dt } = ctx;
  const p = player(s);
  const def = ENEMY_DEFS.aegis;
  const want = angleOf(sub(p.pos, e.pos));
  const turn = clamp(angleDelta(e.ai.rot, want), -2.2 * dt, 2.2 * dt);
  e.ai.rot += turn;
  updateWalker(ctx, e, def.speed * (e.elite ? 1.2 : 1), def.leapSpeed, def.leapDelay, Infinity);
}

/**
 * Raider: a gunship that patrols the outer ring, sliding around toward the player's bearing
 * and firing spreads inward. Being on the outside of an outer planet puts you in its lane.
 */
function updateRaider(ctx: Ctx, e: Entity): void {
  const { s, dt } = ctx;
  const p = player(s);
  const def = ENEMY_DEFS.raider;
  const ai = e.ai;

  if (!e.orbit) {
    // knocked off the ring: drift under gravity until slow, then climb back onto it
    e.airTime += dt;
    if (len(e.vel) < 300 || e.airTime > 2) {
      e.orbit = { planet: -1, radius: RAIDER_RING, angle: angleOf(e.pos), dir: 1 };
      e.planet = null;
      e.launched = false;
    }
    return;
  }
  const o = e.orbit;
  const curR = len(e.pos);
  const R = curR + clamp(o.radius - curR, -160 * dt, 160 * dt);
  const da = angleDelta(o.angle, angleOf(p.pos));
  if (Math.abs(da) > 0.2) o.angle += Math.sign(da) * (def.speed / o.radius) * dt;
  const np = fromAngle(o.angle, R);
  e.vel = scale(sub(np, e.pos), 1 / dt);
  e.pos = np;

  switch (ai.state) {
    case "idle":
      if (ai.cooldown <= 0 && dist(p.pos, e.pos) < def.reach) {
        ai.state = "aim";
        ai.t = def.windup;
        s.telegraphs.push({ id: s.nextId++, kind: "shot", pos: e.pos, radius: 0, t: def.windup, total: def.windup, owner: e.id });
        emit(s, { type: "telegraph", kind: "shot", pos: e.pos });
      }
      break;
    case "aim": {
      ai.t -= dt;
      if (ai.t <= 0) {
        const speed = 520;
        const tof = clamp(dist(p.pos, e.pos) / speed, 0, 1.5);
        const base = angleOf(sub(add(p.pos, scale(p.vel, tof * 0.5)), e.pos));
        for (const spread of [-0.11, 0, 0.11]) {
          const dir = fromAngle(base + spread);
          const pr: Projectile = { id: s.nextId++, pos: add(e.pos, scale(dir, e.radius + 6)), vel: scale(dir, speed), radius: 5, life: 3, damage: def.damage, hue: def.hue, friendly: false, knockback: 320, slug: false, seek: 0, bomb: false };
          s.projectiles.push(pr);
        }
        emit(s, { type: "shot", pos: e.pos, dir: fromAngle(base) });
        ai.state = "idle";
        ai.cooldown = def.recover * (e.elite ? 0.7 : 1);
      }
      break;
    }
    default:
      ai.state = "idle";
  }
}

function hasLineOfSight(planets: Planet[], a: Vec, b: Vec): boolean {
  const ab = sub(b, a);
  const L2 = ab.x * ab.x + ab.y * ab.y || 1;
  for (const pl of planets) {
    const t = clamp(dot(sub(pl.pos, a), ab) / L2, 0, 1);
    if (dist(add(a, scale(ab, t)), pl.pos) < pl.r - 4) return false;
  }
  return true;
}

