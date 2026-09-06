import type { Vec } from "./vec";

export interface InputFrame {
  move: Vec;          // unit-ish vector in world axes
  aim: Vec;           // unit vector from the player
  attack: boolean;    // pressed this frame
  dash: boolean;      // pressed this frame
}

export interface Planet {
  id: number;
  pos: Vec;
  r: number;
  hue: number;
  seed: number;
}

export type EnemyKind = "grunt" | "hopper" | "orbiter" | "bulwark" | "flak" | "raider" | "accretor";

export type EntityKind = "player" | EnemyKind;

export interface SwingState {
  phase: "windup" | "active" | "recovery";
  t: number;                 // time remaining in phase
  angle: number;             // center of the arc
  dir: 1 | -1;               // sweep direction
  dashStrike: boolean;
  arc: number;               // full sweep width; standing still gives the wide overhead sweep
  hit: number[];             // entity ids already hit by this swing
}

export interface Entity {
  id: number;
  kind: EntityKind;
  pos: Vec;
  vel: Vec;
  radius: number;
  hp: number;
  maxHp: number;
  facing: number;            // radians, aim/look direction
  planet: number | null;     // grounded on this planet, or airborne
  stun: number;
  invuln: number;
  dead: boolean;
  // combat
  swing: SwingState | null;
  dashT: number;             // remaining launch burst time
  sinceDash: number;
  comboT: number;
  comboIdx: number;
  // ai
  ai: AiState;
  knockbackResist: number;
  lastHitBy: HitSource;
  elite: boolean;
  // orbiter
  orbit: OrbitState | null;
  spawnT: number;            // pod descent guard; enemies are inert until they land the first time
  attackBuffer: number;
  dashBuffer: number;
  launched: boolean;         // knocked flying by the player (impacts hurt, bounces)
  contactCd: number;
  airTime: number;
  hue: number;
}

export type HitSource = "blade" | "impact" | "debris" | "collision" | "void" | "shockwave" | "projectile" | "contact" | "none";

export interface OrbitState {
  planet: number;            // -1 = the arena itself (raiders patrol the outer ring)
  radius: number;
  angle: number;
  dir: 1 | -1;
}

export interface AiState {
  state: "idle" | "walk" | "leapWait" | "leaping" | "windup" | "attack" | "recover" | "aim" | "cast" | "pull" | "slam" | "throw";
  t: number;
  target: Vec | null;
  cooldown: number;
  phase: number;
  rot: number;
  secondRing: boolean;
  escorted: boolean;
  hop: number;               // orbiters: seconds until they consider hopping to the player's planet
}

export interface Debris {
  id: number;
  pos: Vec;
  vel: Vec;
  radius: number;
  life: number;
  spin: number;
  rot: number;
  hue: number;
  hitCd: number;
  heavy: boolean;
}

export interface Projectile {
  id: number;
  pos: Vec;
  vel: Vec;
  radius: number;
  life: number;
  damage: number;
  hue: number;
  friendly: boolean;
  knockback: number;
  slug: boolean;
  seek: number;       // rad/s it can turn toward its target (player while hostile, enemies once batted back)
}

export interface Pickup {
  id: number;
  pos: Vec;
  vel: Vec;
  planet: number | null;   // resting on this planet, or still falling
  life: number;
}

export interface Shockwave {
  id: number;
  planet: number;
  angle: number;
  spread: number;     // half-width in radians reached so far
  maxSpread: number;
  speed: number;      // radians per second
  damage: number;
  hit: number[];
  friendly: boolean;
  dir: -1 | 0 | 1;    // 0 = both ways around the planet, else one way
  edge: boolean;      // the player's side-attack wave: knocks along its travel and earns ammo
  knockback: number;
}

export interface Telegraph {
  id: number;
  kind: "pull" | "slam" | "throw" | "shot";
  pos: Vec;
  radius: number;
  t: number;
  total: number;
  owner: number;
}

export type GameEvent =
  | { type: "swing"; pos: Vec; angle: number; dashStrike: boolean; arc: number }
  | { type: "hit"; pos: Vec; dir: Vec; damage: number; crit: boolean; target: EntityKind }
  | { type: "kill"; pos: Vec; kind: EntityKind; source: HitSource; vel: Vec }
  | { type: "impact"; pos: Vec; normal: Vec; speed: number; kind: EntityKind | "debris" }
  | { type: "void"; pos: Vec; kind: EntityKind | "debris" }
  | { type: "dash"; pos: Vec; dir: Vec }
  | { type: "land"; pos: Vec; normal: Vec; speed: number; kind: EntityKind }
  | { type: "playerHurt"; pos: Vec; damage: number; source: HitSource }
  | { type: "fuelEmpty"; pos: Vec }
  | { type: "playerDead"; pos: Vec }
  | { type: "waveStart"; wave: number; boss: boolean }
  | { type: "waveClear"; wave: number }
  | { type: "sector"; sector: number }
  | { type: "pod"; pos: Vec; kind: EnemyKind }
  | { type: "shot"; pos: Vec; dir: Vec }
  | { type: "rocket"; pos: Vec; dir: Vec }
  | { type: "telegraph"; kind: Telegraph["kind"]; pos: Vec }
  | { type: "shockwave"; pos: Vec }
  | { type: "edgeWave"; pos: Vec; dir: Vec }
  | { type: "bossPhase"; pos: Vec }
  | { type: "debrisHit"; pos: Vec; damage: number }
  | { type: "combo"; pos: Vec; idx: number }
  | { type: "gunshot"; pos: Vec; dir: Vec }
  | { type: "pulse"; pos: Vec }
  | { type: "pickup"; pos: Vec; ammo: number }
  | { type: "ammo"; pos: Vec; ammo: number }
  | { type: "tutorial"; step: TutorialStep };

export type Weapon = "sword" | "gun";

export type TutorialStep = "walk" | "launch" | "fly" | "sweep" | "debris" | "wave" | "brawl" | "gun" | "done";

/** Where a tutorial pod is steered while it descends: an angle around the small planet, the player's head, or nowhere (plain pod). */
export type PodAim = number | "player" | null;

export interface TutorialState {
  step: TutorialStep;
  t: number;                                   // sim seconds spent in the current step
  goal: { planet: number; angle: number } | null;
  keys: number;                                // steering directions pressed during the flight lesson (W=1 A=2 S=4 D=8)
  timeScale: number;                           // sim seconds per real second; lessons slow the clock while they wait on the player
  queue: { at: number; kind: EnemyKind; start: Vec; aim: PodAim }[];
  guided: { id: number; aim: PodAim }[];       // pods in flight that are being steered
  hover: number | null;                        // the sweep lesson's grunt, held over the player's head until they swing
  waved: boolean;                              // the wave lesson has seen a wave fired
}

export interface UpgradeMods {
  reachMult: number;
  damageMult: number;
  knockbackMult: number;
  dashSpeedMult: number;
  maxHpBonus: number;
  debrisExtra: number;
  debrisDamageMult: number;
  lifesteal: number;
  aftershock: boolean;
  airControlMult: number;
  voidBonusMult: number;
  berserk: boolean;
  ammoMaxBonus: number;
  slugDamageMult: number;
  fuelMaxBonus: number;
  fuelEfficiency: number;
}

export interface UpgradeOffer {
  id: string;
  name: string;
  desc: string;
  rarity: "common" | "rare" | "epic";
}

export interface WaveState {
  n: number;
  sector: number;
  queue: { at: number; kind: EnemyKind; elite: boolean }[];
  t: number;
  alive: number;
  phase: "spawning" | "fighting" | "cleared" | "choosing" | "intermission";
  phaseT: number;
  boss: boolean;
}

export interface Stats {
  kills: number;
  voidKills: number;
  impactKills: number;
  debrisKills: number;
  collisionKills: number;
  bossKills: number;
  damageDealt: number;
  damageTaken: number;
  swings: number;
  dashes: number;
  time: number;
  bestCombo: number;
}

export interface GameState {
  tick: number;
  time: number;
  seed: number;
  rngState: number;
  freeze: number;
  planets: Planet[];
  entities: Entity[];
  debris: Debris[];
  pickups: Pickup[];
  projectiles: Projectile[];
  shockwaves: Shockwave[];
  telegraphs: Telegraph[];
  nextId: number;
  wave: WaveState;
  offers: UpgradeOffer[] | null;
  mods: UpgradeMods;
  taken: string[];
  score: number;
  stats: Stats;
  over: boolean;
  daily: boolean;
  events: GameEvent[];
  weapon: Weapon;
  ammo: number;
  gunCd: number;
  fuel: number;
  fuelWarnT: number;
  sinceHurt: number;
  reloadT: number;
  pulseT: number;          // dry-thruster clock: a short push every second when the tank is empty
  tutorial: TutorialState | null;
}
