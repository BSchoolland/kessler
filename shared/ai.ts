import { ENEMY_DEFS, RAIDER_RING } from "./enemies";
import { damagePlayer, emit, player, spawnDebris, spawnEnemyPod, spawnShockwave, type Ctx } from "./actions";
import { dominantPlanet, nearestPlanet, orbitSpeed, surfaceNormal } from "./physics";
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
  if (e.kind === "orbiter") return updateOrbiter(ctx, e);
  if (e.kind === "raider") return updateRaider(ctx, e);
  if (e.kind === "flak") return updateFlak(ctx, e);
  if (e.kind === "hammer") return updateBoss(ctx, e);
  updateWalker(ctx, e, def.speed * (e.elite ? 1.2 : 1), def.leapSpeed, def.leapDelay, e.kind === "hopper" ? 300 : Infinity);
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
        const pr: Projectile = { id: s.nextId++, pos: add(e.pos, scale(n, e.radius + 6)), vel: scale(n, 440), radius: 6, life: 4.5, damage: def.damage, hue: def.hue, friendly: false, knockback: 340, slug: false, seek: 0.7 };
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

function updateOrbiter(ctx: Ctx, e: Entity): void {
  const { s, dt, rng } = ctx;
  const p = player(s);
  const def = ENEMY_DEFS.orbiter;
  const ai = e.ai;

  if (!e.orbit) {
    e.airTime += dt;
    if (ai.state === "leaping" && ai.target) {
      // hopping to the player's planet: fly at it and take up orbit on arrival
      const target = s.planets.find((pl) => pl.pos.x === ai.target!.x && pl.pos.y === ai.target!.y)!;
      e.vel = scale(norm(sub(target.pos, e.pos)), 420);
      if (dist(e.pos, target.pos) < target.r + 125) {
        e.orbit = { planet: target.id, radius: target.r + 110, angle: angleOf(sub(e.pos, target.pos)), dir: rng.sign() as 1 | -1 };
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
  // every so often, an orbiter circling a planet you're not on comes over to yours
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
        const speed = 400;
        const tof = clamp(dist(p.pos, e.pos) / speed, 0, 1.2);
        const target = add(p.pos, scale(p.vel, tof * 0.6));
        const dir = norm(sub(target, e.pos));
        const pr: Projectile = { id: s.nextId++, pos: add(e.pos, scale(dir, e.radius + 4)), vel: scale(dir, speed), radius: 5, life: 3.2, damage: def.damage, hue: def.hue, friendly: false, knockback: 320, slug: false, seek: 0 };
        s.projectiles.push(pr);
        emit(s, { type: "shot", pos: pr.pos, dir });
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
          const pr: Projectile = { id: s.nextId++, pos: add(e.pos, scale(dir, e.radius + 6)), vel: scale(dir, speed), radius: 5, life: 3, damage: def.damage, hue: def.hue, friendly: false, knockback: 320, slug: false, seek: 0 };
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

/**
 * The Hammer: a fast boss that chases and leaps at you, and pounds the ground on every landing
 * (a ring around the planet, both ways; be airborne). Throws heavy debris only with a clear
 * line to you, and keeps calling in pods while it lives. Phase two at half health: quicker
 * rings, four rocks, more pods.
 */
function updateBoss(ctx: Ctx, e: Entity): void {
  const { s, dt, rng } = ctx;
  const p = player(s);
  const def = ENEMY_DEFS.hammer;
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

  ai.timer -= dt;
  if (ai.timer <= 0) {
    ai.timer = phase2 ? 4.5 : 6.5;
    const others = s.entities.filter((x) => x.kind !== "player" && x.kind !== "hammer" && !x.dead).length;
    if (others < 4) spawnEnemyPod(ctx, rng.chance(0.6) ? "grunt" : "hopper", p.planet ?? dominantPlanet(s.planets, p.pos).id, false);
  }

  if (airborne) {
    e.airTime += dt;
    if (e.airTime > 3) {
      const { planet } = nearestPlanet(s.planets, e.pos);
      e.vel = add(scale(e.vel, Math.exp(-1.2 * dt)), scale(norm(sub(planet.pos, e.pos)), 900 * dt));
    }
    return;
  }
  const planet = s.planets[e.planet!];

  void planet;
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
      if (ai.cooldown <= 0 && dist(p.pos, e.pos) < 720 && hasLineOfSight(s.planets, e.pos, p.pos)) {
        ai.state = "throw";
        ai.t = 0.6;
        stopWalking(ctx, e);
        s.telegraphs.push({ id: s.nextId++, kind: "throw", pos: e.pos, radius: 60, t: ai.t, total: ai.t, owner: e.id });
        emit(s, { type: "telegraph", kind: "throw", pos: e.pos });
        ai.cooldown = phase2 ? 3 : 4;
        return;
      }
      updateWalker(ctx, e, def.speed * (phase2 ? 1.25 : 1), def.leapSpeed, def.leapDelay, 240);
    }
  }
}
