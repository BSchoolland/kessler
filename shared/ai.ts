import { ENEMY_DEFS } from "./enemies";
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
  if (e.kind === "flak") return updateFlak(ctx, e);
  if (e.kind === "accretor") return updateBoss(ctx, e);
  updateWalker(ctx, e, def.speed * (e.elite ? 1.2 : 1), def.leapSpeed, def.leapDelay);
}

function updateWalker(ctx: Ctx, e: Entity, speed: number, leapSpeed: number, leapDelay: number): void {
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
        if (e.kind === "hopper" && surfaceGap > 300 && ai.cooldown <= 0) {
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
        const speed = 560;
        const pr: Projectile = { id: s.nextId++, pos: add(e.pos, scale(n, e.radius + 6)), vel: scale(n, speed), radius: 5, life: 4, damage: def.damage, hue: def.hue, friendly: false, knockback: 320, slug: false };
        s.projectiles.push(pr);
        emit(s, { type: "shot", pos: pr.pos, dir: n });
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
  const { s, dt } = ctx;
  const p = player(s);
  const def = ENEMY_DEFS.orbiter;
  const ai = e.ai;

  if (!e.orbit) {
    // knocked loose: recapture once we're slow enough
    e.airTime += dt;
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
        const pr: Projectile = { id: s.nextId++, pos: add(e.pos, scale(dir, e.radius + 4)), vel: scale(dir, speed), radius: 5, life: 3.2, damage: def.damage, hue: def.hue, friendly: false, knockback: 320, slug: false };
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

function updateBoss(ctx: Ctx, e: Entity): void {
  const { s, dt } = ctx;
  const p = player(s);
  const def = ENEMY_DEFS.accretor;
  const ai = e.ai;
  const phase2 = ai.phase === 2;

  if (e.planet === null) {
    e.airTime += dt;
    if (e.airTime > 3) {
      const { planet } = nearestPlanet(s.planets, e.pos);
      e.vel = add(scale(e.vel, Math.exp(-1.2 * dt)), scale(norm(sub(planet.pos, e.pos)), 900 * dt));
    }
    return;
  }
  const planet = s.planets[e.planet];
  if (ai.state === "leaping") ai.state = "idle";
  const playerHere = p.planet === e.planet || (p.planet === null && dominantPlanet(s.planets, p.pos).id === e.planet);
  const abilityCd = phase2 ? 3.2 : 4.8;

  // special ability cycle runs on its own timer, on top of normal walker behaviour
  if (["idle", "walk", "leapWait"].includes(ai.state) && ai.cooldown <= 0 && (ai.t <= 0 || ai.state !== "leapWait")) {
    const choice = ai.rot % 3;
    ai.rot++;
    const kind = !playerHere ? "throw" : choice === 0 ? "pull" : choice === 1 ? "slam" : "throw";
    ai.state = kind;
    ai.t = kind === "pull" ? 1.0 : kind === "slam" ? 0.75 : 0.6;
    stopWalking(ctx, e);
    s.telegraphs.push({ id: s.nextId++, kind, pos: e.pos, radius: kind === "pull" ? 520 : kind === "slam" ? planet.r + 40 : 60, t: ai.t, total: ai.t, owner: e.id });
    emit(s, { type: "telegraph", kind, pos: e.pos });
    ai.cooldown = abilityCd;
    return;
  }

  switch (ai.state) {
    case "pull": {
      ai.t -= dt;
      if (ai.t <= 0) {
        if (ai.t > -1.4) {
          // pulling phase
          const toB = sub(e.pos, p.pos);
          const d = len(toB);
          if (d < 560 && !s.over) {
            p.vel = add(p.vel, scale(norm(toB), (phase2 ? 1900 : 1500) * dt));
            if (p.planet !== null && d > 90) {
              // drag the player off the surface so the pull is felt
              p.planet = null;
            }
          }
          for (const dbr of s.debris) {
            const td = sub(e.pos, dbr.pos);
            if (len(td) < 700) dbr.vel = add(dbr.vel, scale(norm(td), 900 * dt));
          }
        } else {
          ai.state = "slam";
          ai.t = 0.6;
          s.telegraphs.push({ id: s.nextId++, kind: "slam", pos: e.pos, radius: planet.r + 40, t: 0.6, total: 0.6, owner: e.id });
          emit(s, { type: "telegraph", kind: "slam", pos: e.pos });
        }
      }
      break;
    }
    case "slam": {
      ai.t -= dt;
      if (ai.t <= 0) {
        const a = angleAround(planet, e.pos);
        spawnShockwave(s, planet.id, a, def.damage * 0.85, false, phase2 ? 3.8 : 3.2);
        ai.state = "recover";
        ai.t = phase2 ? 0.35 : 0.6;
        ai.secondRing = phase2;
      }
      break;
    }
    case "throw": {
      ai.t -= dt;
      if (ai.t <= 0) {
        const n = phase2 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const spread = (i - (n - 1) / 2) * 0.18;
          const base = angleOf(sub(p.pos, e.pos)) + spread;
          const dir = fromAngle(base);
          const speed = 470 + i * 20;
          spawnDebris(ctx, add(e.pos, scale(dir, e.radius + 12)), { x: 0, y: 0 }, 1, def.hue, true, 0.01);
          const dbr = s.debris[s.debris.length - 1];
          dbr.vel = scale(dir, speed);
          dbr.life = 6;
        }
        ai.state = "recover";
        ai.t = 0.7;
      }
      break;
    }
    case "recover": {
      ai.t -= dt;
      if (ai.t <= 0) {
        if (ai.secondRing) {
          ai.secondRing = false;
          spawnShockwave(s, planet.id, angleAround(planet, e.pos) + Math.PI, def.damage * 0.6, false, 4.2);
        }
        ai.state = "idle";
      }
      break;
    }
    default: {
      // phase 2 escorts, once
      if (phase2 && !ai.escorted) {
        ai.escorted = true;
        spawnEnemyPod(ctx, "orbiter", planet.id, false);
        spawnEnemyPod(ctx, "orbiter", planet.id, false);
      }
      updateWalker(ctx, e, def.speed * (phase2 ? 1.25 : 1), def.leapSpeed, def.leapDelay);
    }
  }
}

