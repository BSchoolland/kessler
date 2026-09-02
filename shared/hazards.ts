import { DEBRIS, GRAVITY, GUN, IMPACT, PLAYER } from "./config";
import { damageEnemy, damagePlayer, emit, launch, player, type Ctx } from "./actions";
import { findContact, gravityAt, inVoid, snapToSurface, surfaceNormal } from "./physics";
import { add, angleDelta, angleOf, clamp, dist, dot, fromAngle, len, norm, scale, sub } from "./vec";
import type { Entity, EnemyKind, GameState, Projectile } from "./types";
import { ENEMY_DEFS } from "./enemies";

export function updateDebris(ctx: Ctx): void {
  const { s, dt } = ctx;
  const p = player(s);
  const keep = [];
  for (const d of s.debris) {
    d.life -= dt;
    d.hitCd -= dt;
    d.rot += d.spin * dt;
    d.vel = add(d.vel, scale(gravityAt(s.planets, d.pos, GRAVITY.debrisScale), dt));
    d.pos = add(d.pos, scale(d.vel, dt));
    if (d.life <= 0) continue;
    if (inVoid(d.pos)) { emit(s, { type: "void", pos: d.pos, kind: "debris" }); continue; }

    const c = findContact(s.planets, d.pos, d.vel, d.radius);
    if (c) {
      if (c.speedIn < DEBRIS.minLandSpeed) {
        emit(s, { type: "impact", pos: d.pos, normal: c.normal, speed: c.speedIn, kind: "debris" });
        continue;
      }
      const vn = -c.speedIn;
      d.pos = snapToSurface(c.planet, d.pos, d.radius);
      d.vel = add(d.vel, scale(c.normal, -(1 + DEBRIS.restitution) * vn));
      d.life -= 1.5;
      d.spin *= -0.7;
      emit(s, { type: "impact", pos: d.pos, normal: c.normal, speed: c.speedIn, kind: "debris" });
    }

    if (d.hitCd <= 0) {
      const speed = len(d.vel);
      const dmgBase = (DEBRIS.baseDamage + speed * DEBRIS.damagePerSpeed) * (d.heavy ? 1.6 : 1);
      let hitSomething = false;
      for (const e of s.entities) {
        if (e.id === p.id || e.dead || e.spawnT > 0) continue;
        if (dist(e.pos, d.pos) < e.radius + d.radius) {
          const dmg = dmgBase * s.mods.debrisDamageMult;
          const dir = { x: d.vel.x / (speed || 1), y: d.vel.y / (speed || 1) };
          e.vel = add(e.vel, scale(d.vel, 0.3 * (1 - e.knockbackResist)));
          if (e.orbit) e.orbit = null;
          if (len(e.vel) > 140 && e.knockbackResist < 0.5) { e.planet = null; e.launched = true; }
          e.stun = Math.max(e.stun, 0.25);
          emit(s, { type: "debrisHit", pos: d.pos, damage: dmg });
          damageEnemy(ctx, e, dmg, "debris", d.pos, dir);
          d.vel = add(scale(d.vel, -0.35), scale(e.vel, 0.2));
          d.life -= 2;
          d.hitCd = 0.3;
          hitSomething = true;
          break;
        }
      }
      if (!hitSomething && !s.over && dist(p.pos, d.pos) < p.radius + d.radius && speed > 170) {
        if (damagePlayer(ctx, Math.round(dmgBase * DEBRIS.playerDamageMult), "debris")) {
          d.vel = scale(d.vel, -0.4);
          d.hitCd = 0.4;
        }
      }
    }
    keep.push(d);
  }
  s.debris = keep;
}

export function updateProjectiles(ctx: Ctx): void {
  const { s, dt } = ctx;
  const p = player(s);
  const keep = [];
  for (const pr of s.projectiles) {
    pr.life -= dt;
    // rockets fly under power: little gravity, and a gentle turn toward the player
    pr.vel = add(pr.vel, scale(gravityAt(s.planets, pr.pos, pr.slug ? GUN.gravityScale : pr.seek > 0 ? 0.15 : GRAVITY.projectileScale), dt));
    if (pr.friendly) homeProjectile(s, pr, dt);
    else if (pr.seek > 0 && !s.over) {
      const speed = len(pr.vel);
      const heading = angleOf(pr.vel);
      const want = angleOf(sub(add(p.pos, scale(p.vel, 0.2)), pr.pos));
      const turn = clamp(angleDelta(heading, want), -pr.seek * dt, pr.seek * dt);
      pr.vel = fromAngle(heading + turn, speed);
    }
    pr.pos = add(pr.pos, scale(pr.vel, dt));
    if (pr.life <= 0 || inVoid(pr.pos)) continue;
    const c = findContact(s.planets, pr.pos, pr.vel, pr.radius);
    if (c) { emit(s, { type: "impact", pos: pr.pos, normal: c.normal, speed: c.speedIn, kind: "debris" }); continue; }
    if (pr.friendly) {
      let hit = false;
      for (const e of s.entities) {
        if (e.id === p.id || e.dead || e.spawnT > 0) continue;
        if (dist(e.pos, pr.pos) < e.radius + pr.radius) {
          const dir = scale(pr.vel, 1 / (len(pr.vel) || 1));
          launch(e, dir, pr.knockback, pr.slug ? GUN.stun : 0.4);
          s.freeze = Math.max(s.freeze, pr.slug ? 0.035 : 0.02);
          damageEnemy(ctx, e, pr.slug ? pr.damage * s.mods.slugDamageMult : pr.damage * 1.5, "projectile", pr.pos, dir, pr.slug);
          hit = true;
          break;
        }
      }
      if (hit) continue;
    } else if (!s.over && dist(p.pos, pr.pos) < p.radius + pr.radius) {
      if (damagePlayer(ctx, pr.damage, "projectile")) continue;
    }
    keep.push(pr);
  }
  s.projectiles = keep;
}

/** Slight aimbot: bend a friendly projectile toward the best enemy in its forward cone. */
function homeProjectile(s: GameState, pr: Projectile, dt: number): void {
  const speed = len(pr.vel);
  if (speed < 1) return;
  const heading = angleOf(pr.vel);
  let best: Entity | null = null;
  let bestScore = Infinity;
  for (const e of s.entities) {
    if (e.kind === "player" || e.dead || e.spawnT > 0) continue;
    const to = sub(e.pos, pr.pos);
    const d = len(to);
    if (d > GUN.homingRange) continue;
    const off = Math.abs(angleDelta(heading, angleOf(to)));
    if (off > GUN.homingCone) continue;
    const score = d * (0.4 + off);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  if (!best) return;
  const small = best.kind === "orbiter" || best.kind === "hopper";
  const lead = scale(best.vel, Math.min(0.5, dist(best.pos, pr.pos) / speed) * 0.6);
  const want = angleOf(sub(add(best.pos, lead), pr.pos));
  const maxTurn = GUN.homingRate * (small ? GUN.smallTargetBonus : 1) * dt;
  const turn = clamp(angleDelta(heading, want), -maxTurn, maxTurn);
  pr.vel = fromAngle(heading + turn, speed);
}

/** Enemies hurt on touch; launched ones are your projectiles and don't. */
export function resolveContactDamage(ctx: Ctx): void {
  const { s, dt } = ctx;
  const p = player(s);
  for (const e of s.entities) {
    if (e.kind === "player" || e.dead || e.spawnT > 0) continue;
    e.contactCd -= dt;
    if (e.stun > 0 || e.launched || e.contactCd > 0 || s.over) continue;
    if (dist(e.pos, p.pos) >= e.radius + p.radius + 2) continue;
    const def = ENEMY_DEFS[e.kind as EnemyKind];
    // the boss also pulls you into itself, so its touch is softer than its slam
    const mult = (e.elite ? 1.2 : 1) * (e.kind === "accretor" ? 0.6 : 1);
    if (damagePlayer(ctx, Math.round(def.damage * mult), "contact")) {
      e.contactCd = PLAYER.contactCd;
      const away = norm(sub(p.pos, e.pos));
      p.vel = add(p.vel, scale(away, PLAYER.contactKnock));
    }
  }
}

export function updateShockwaves(ctx: Ctx): void {
  const { s, dt } = ctx;
  const p = player(s);
  const keep = [];
  for (const w of s.shockwaves) {
    const prev = w.spread;
    w.spread += w.speed * dt;
    const planet = s.planets[w.planet];
    const height = w.edge ? PLAYER.swing.waveHeight : 26;
    const band = (e: { pos: { x: number; y: number }; radius: number }) => {
      const gap = dist(e.pos, planet.pos) - planet.r - e.radius;
      if (gap > height) return false;
      const a = Math.atan2(e.pos.y - planet.pos.y, e.pos.x - planet.pos.x);
      const signed = angleDelta(w.angle, a);
      if (w.dir !== 0 && Math.sign(signed) !== w.dir && Math.abs(signed) > 0.02) return false;
      const da = Math.abs(signed);
      const margin = (e.radius + 10) / planet.r;
      return da <= w.spread + margin && da >= prev - margin;
    };
    if (w.friendly) {
      for (const e of s.entities) {
        if (e.id === p.id || e.dead || e.spawnT > 0 || w.hit.includes(e.id)) continue;
        if (band(e)) {
          w.hit.push(e.id);
          const n = surfaceNormal(planet, e.pos);
          if (w.edge) {
            // shove along the wave's travel with a bit of lift, like a hit from the edge itself
            const t = { x: -n.y * w.dir, y: n.x * w.dir };
            launch(e, add(t, scale(n, 0.45)), w.knockback, 0.6);
            s.freeze = Math.max(s.freeze, 0.025);
            damageEnemy(ctx, e, w.damage, "blade", e.pos, t);
            if (s.ammo < GUN.ammoMax + s.mods.ammoMaxBonus) {
              s.ammo = Math.min(GUN.ammoMax + s.mods.ammoMaxBonus, s.ammo + s.mods.ammoPerHit);
              emit(s, { type: "ammo", pos: p.pos, ammo: s.ammo });
            }
          } else {
            e.vel = add(e.vel, scale(n, w.knockback * (1 - e.knockbackResist)));
            if (e.knockbackResist < 0.5) { e.planet = null; e.launched = true; }
            e.stun = Math.max(e.stun, 0.5);
            damageEnemy(ctx, e, w.damage, "shockwave", e.pos, n);
          }
        }
      }
      if (w.edge) {
        // the wave is a wall: it bats enemy shots back and sends debris flying
        for (const pr of s.projectiles) {
          if (pr.friendly || w.hit.includes(pr.id) || !band(pr)) continue;
          w.hit.push(pr.id);
          const n = surfaceNormal(planet, pr.pos);
          const t = { x: -n.y * w.dir, y: n.x * w.dir };
          pr.friendly = true;
          pr.knockback = 380;
          pr.life = 3;
          pr.vel = scale(norm(add(t, scale(n, 0.5))), len(pr.vel) * 1.3);
          emit(s, { type: "hit", pos: pr.pos, dir: t, damage: 0, crit: false, target: "orbiter" });
        }
        for (const d of s.debris) {
          if (w.hit.includes(d.id) || !band(d)) continue;
          w.hit.push(d.id);
          const n = surfaceNormal(planet, d.pos);
          const t = { x: -n.y * w.dir, y: n.x * w.dir };
          d.vel = scale(norm(add(t, scale(n, 0.35))), w.knockback * 1.15);
          d.life = Math.max(d.life, 4);
          d.hitCd = 0;
          emit(s, { type: "debrisHit", pos: d.pos, damage: 0 });
        }
      }
    } else if (!s.over && !w.hit.includes(p.id) && p.planet === w.planet && band(p)) {
      w.hit.push(p.id);
      if (damagePlayer(ctx, w.damage, "shockwave")) {
        const n = surfaceNormal(planet, p.pos);
        p.vel = add(p.vel, scale(n, 300));
        p.planet = null;
      }
    }
    if (w.spread < w.maxSpread) keep.push(w);
  }
  s.shockwaves = keep;
}

export function updateTelegraphs(ctx: Ctx): void {
  const { s, dt } = ctx;
  for (const t of s.telegraphs) t.t -= dt;
  s.telegraphs = s.telegraphs.filter((t) => t.t > 0 && s.entities.some((e) => e.id === t.owner && !e.dead));
}

/** Two launched enemies smacking into each other: bowling. */
export function resolveEnemyCollisions(ctx: Ctx): void {
  const { s } = ctx;
  const es = s.entities;
  for (let i = 1; i < es.length; i++) {
    const a = es[i];
    if (a.dead || a.spawnT > 0) continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j];
      if (b.dead || b.spawnT > 0) continue;
      const d = dist(a.pos, b.pos);
      const minD = a.radius + b.radius;
      if (d >= minD || d < 1e-6) continue;
      const n = scale(sub(b.pos, a.pos), 1 / d);
      const rel = dot(sub(a.vel, b.vel), n);
      const push = (minD - d) / 2;
      a.pos = sub(a.pos, scale(n, push));
      b.pos = add(b.pos, scale(n, push));
      if (rel <= 0) continue;
      const launched = a.stun > 0 || b.stun > 0;
      const ma = a.radius * a.radius;
      const mb = b.radius * b.radius;
      const jimp = (rel * (1 + IMPACT.restitution)) / (1 / ma + 1 / mb);
      a.vel = sub(a.vel, scale(n, jimp / ma));
      b.vel = add(b.vel, scale(n, jimp / mb));
      if (launched && rel > IMPACT.collisionThreshold) {
        const dmg = (rel - IMPACT.collisionThreshold) * IMPACT.collisionDamagePerUnit * s.mods.impactMult;
        const mid = scale(add(a.pos, b.pos), 0.5);
        emit(s, { type: "impact", pos: mid, normal: n, speed: rel, kind: a.kind });
        for (const e of [a, b]) {
          e.stun = Math.max(e.stun, 0.6);
          e.orbit = null;
          if (len(e.vel) > 140 && e.knockbackResist < 0.5) { e.planet = null; e.launched = true; }
        }
        damageEnemy(ctx, a, dmg, "collision", mid, scale(n, -1));
        damageEnemy(ctx, b, dmg, "collision", mid, n);
      }
    }
  }
}
