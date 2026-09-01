import { DEBRIS, GRAVITY, IMPACT } from "./config";
import { damageEnemy, damagePlayer, emit, player, type Ctx } from "./actions";
import { findContact, gravityAt, inVoid, snapToSurface, surfaceNormal } from "./physics";
import { add, angleDelta, dist, dot, len, scale, sub } from "./vec";

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
          if (len(e.vel) > 140 && e.knockbackResist < 0.5) e.planet = null;
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
    pr.vel = add(pr.vel, scale(gravityAt(s.planets, pr.pos, GRAVITY.projectileScale), dt));
    pr.pos = add(pr.pos, scale(pr.vel, dt));
    if (pr.life <= 0 || inVoid(pr.pos)) continue;
    const c = findContact(s.planets, pr.pos, pr.vel, pr.radius);
    if (c) { emit(s, { type: "impact", pos: pr.pos, normal: c.normal, speed: c.speedIn, kind: "debris" }); continue; }
    if (pr.friendly) {
      let hit = false;
      for (const e of s.entities) {
        if (e.id === p.id || e.dead || e.spawnT > 0) continue;
        if (dist(e.pos, pr.pos) < e.radius + pr.radius) {
          damageEnemy(ctx, e, pr.damage * 1.5, "projectile", pr.pos, scale(pr.vel, 1 / (len(pr.vel) || 1)), true);
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

export function updateShockwaves(ctx: Ctx): void {
  const { s, dt } = ctx;
  const p = player(s);
  const keep = [];
  for (const w of s.shockwaves) {
    const prev = w.spread;
    w.spread += w.speed * dt;
    const planet = s.planets[w.planet];
    const band = (e: { pos: { x: number; y: number }; radius: number }) => {
      const gap = dist(e.pos, planet.pos) - planet.r - e.radius;
      if (gap > 26) return false;
      const a = Math.atan2(e.pos.y - planet.pos.y, e.pos.x - planet.pos.x);
      const da = Math.abs(angleDelta(w.angle, a));
      const margin = (e.radius + 10) / planet.r;
      return da <= w.spread + margin && da >= prev - margin;
    };
    if (w.friendly) {
      for (const e of s.entities) {
        if (e.id === p.id || e.dead || e.spawnT > 0 || w.hit.includes(e.id)) continue;
        if (band(e)) {
          w.hit.push(e.id);
          const n = surfaceNormal(planet, e.pos);
          e.vel = add(e.vel, scale(n, 380 * (1 - e.knockbackResist)));
          if (e.knockbackResist < 0.5) e.planet = null;
          e.stun = Math.max(e.stun, 0.5);
          damageEnemy(ctx, e, w.damage, "shockwave", e.pos, n);
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
          if (len(e.vel) > 140 && e.knockbackResist < 0.5) e.planet = null;
        }
        damageEnemy(ctx, a, dmg, "collision", mid, scale(n, -1));
        damageEnemy(ctx, b, dmg, "collision", mid, n);
      }
    }
  }
}
