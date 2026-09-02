// All gameplay constants. Rates are per second; distances are world units.
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const ARENA = {
  voidRadius: 1500,        // past this you are lost
  minPlanets: 4,
  maxPlanets: 6,
};

export const GRAVITY = {
  surfaceG: 820,           // acceleration at every planet's surface
  centerPull: 80,          // weak pull toward the arena's barycenter so drifters come home
  maxAccel: 2600,          // clamp near a planet's center
  debrisScale: 1.0,
  projectileScale: 0.55,
};

export const PLAYER = {
  radius: 13,
  maxHp: 100,
  walkSpeed: 250,
  walkAccel: 2200,
  airAccel: 300,
  airMaxSteer: 220,
  liftOff: 0.5,            // minimum outward component of a dash off a surface
  contactKnock: 240,
  contactCd: 0.7,
  dashSpeed: 860,
  dashDuration: 0.15,
  dashCooldown: 1.7,
  dashStrikeWindow: 0.32,  // seconds after a dash during which a swing is a dash-strike
  dashStrikeMult: 2,
  impactThreshold: 620,
  impactDamagePerUnit: 0.09,
  invulnAfterHit: 0.5,
  swing: {
    windup: 0.13,
    active: 0.1,
    recovery: 0.17,
    arc: (120 * Math.PI) / 180,
    overheadArc: (215 * Math.PI) / 180,  // standing still: sweep over the top, both sides
    reach: 72,
    damage: 22,
    knockback: 540,
    stun: 0.85,
    comboWindow: 0.45,
    waveSpeed: 640,        // surface wave from the side attack: linear speed and travel distance
    waveRange: 330,
    waveDamageMult: 0.9,
    waveKnockback: 620,
    waveHeight: 52,        // 2× player height: how far above the surface the wave reaches
  },
};

export const FUEL = {
  max: 100,
  drain: 40,               // per second at full stick
  regenGround: 60,
};

export const GUN = {
  ammoStart: 3,
  ammoMax: 6,
  speed: 980,
  damage: 34,
  knockback: 760,
  stun: 0.7,
  cooldown: 0.32,
  radius: 5,
  life: 1.5,
  gravityScale: 0.55,
  recoil: 90,
  homingRate: 3.2,         // radians per second the slug can turn
  homingCone: 0.6,         // half-angle it will consider
  homingRange: 560,
  smallTargetBonus: 1.8,   // orbiters and hoppers pull harder
};

export const IMPACT = {
  enemyThreshold: 330,     // speed above which a planet impact hurts an enemy
  enemyDamagePerUnit: 0.16,
  enemyBounceSpeed: 420,   // above this a stunned enemy bounces instead of landing
  restitution: 0.42,
  collisionDamagePerUnit: 0.12, // enemy-on-enemy collisions
  collisionThreshold: 260,
};

export const DEBRIS = {
  count: 3,
  lifetime: 11,
  speedMin: 160,
  speedMax: 360,
  inherit: 0.55,
  radius: 6,
  baseDamage: 7,
  damagePerSpeed: 0.045,
  playerDamageMult: 0.35,
  restitution: 0.6,
  minLandSpeed: 90,        // slower than this on impact and the chunk is gone
  maxCount: 90,
};

export const SCORE = {
  kill: 10,
  voidKill: 30,
  impactKill: 20,
  debrisKill: 25,
  collisionKill: 25,
  waveClear: 50,
  boss: 400,
};

export const WAVES = {
  spawnSpread: 6,          // seconds over which a wave's pods arrive
  podSpeed: 380,
  intermission: 2.2,
  bossEvery: 5,
};

export const CAMERA = {
  zoom: 0.8,
  lookahead: 90,
};
