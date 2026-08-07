/**
 * Progressive difficulty driven by night count and lifetime garlic collected.
 *
 * Existing ramp (nights):
 *   Night 1–2: tutorial pace
 *   Night 3:   spawn ~15% faster
 *   Night 4:   +1 max duck, petrify cost 14
 *   Night 5:   duck speed +10%, spawn ~25% faster
 *   Night 6+:  max ducks +2, cost 16, occasional double-spawn
 *
 * New layers:
 *   - Night length grows from night 3 (+15% compounding) and from garlic (+10%/300)
 *   - Super Boss ducks (3× size, 30 garlic) with count doubling each night
 *   - Player speed penalties from lifetime garlic (per 400 and per 500)
 *   - Garlic density −5%/night, super-garlic chance −10%/night
 *   - Economy tighten (2026-08): base petrify 12, fewer garlics (~20% less base density)
 */

export interface DifficultyParams {
  /** Seconds between duck spawns. */
  spawnInterval: number;
  /** Hard cap on live (non-petrified) regular ducks. */
  maxDucks: number;
  /** Horizontal chase speed for regular ducks. */
  duckSpeed: number;
  /** Garlic required to petrify one regular duck on contact. */
  petrifyCost: number;
  /** Chance (0–1) to spawn a second regular duck in the same tick. */
  doubleSpawnChance: number;
  /** Night number this profile was built for (1+). */
  night: number;
  /** Max concurrent Super Boss ducks this night. */
  maxBosses: number;
  /** Garlic cost to petrify a Super Boss. */
  bossPetrifyCost: number;
  /** Boss visual/hit scale vs regular duck. */
  bossScale: number;
  /** Boss hit radius. */
  bossHitRadius: number;
  /** Regular duck hit radius. */
  regularHitRadius: number;
  /** Max concurrent high-altitude flyer ducks this night. */
  maxFlyers: number;
  /** Seconds between flyer spawns. */
  flyerSpawnInterval: number;
  /** Garlic cost to petrify a flyer. */
  flyerPetrifyCost: number;
  /** Flyer hit radius. */
  flyerHitRadius: number;
}

const BASE_SPAWN_INTERVAL = 6.5;
const BASE_MAX_DUCKS = 8;
const BASE_DUCK_SPEED = 5.2;
/** Raised so garlic is a spend resource, not a free pass. */
const BASE_PETRIFY_COST = 12;
const BASE_NIGHT_LENGTH = 50;
/** ~20% fewer placements than the previous base of 3. */
const BASE_COLLECTIBLES_PER_CHUNK = 2.4;
const BASE_SUPER_CHANCE = 0.08;
const BOSS_PETRIFY_COST = 30;
const BOSS_SCALE = 3;
const REGULAR_HIT_RADIUS = 1.15;
const BOSS_HIT_RADIUS = REGULAR_HIT_RADIUS * BOSS_SCALE;
/** Floor so the player never becomes immobile. */
const MIN_PLAYER_SPEED_MULT = 0.35;

/** Clamp night to a positive integer for lookups. */
export function normalizeNight(nightCount: number): number {
  if (!Number.isFinite(nightCount) || nightCount < 1) return 1;
  return Math.floor(nightCount);
}

/**
 * Night duration in seconds.
 * - From night 3 onward each night is 15% longer than the previous (compounding).
 * - Every 300 lifetime garlic adds another +10%.
 */
export function getNightLengthSeconds(nightCount: number, lifetimeGarlic = 0): number {
  const night = normalizeNight(nightCount);
  let length = BASE_NIGHT_LENGTH;
  // Night 3 → ×1.15, night 4 → ×1.15², …
  if (night >= 3) {
    length *= Math.pow(1.15, night - 2);
  }
  const garlicTiers = Math.max(0, Math.floor(lifetimeGarlic / 300));
  if (garlicTiers > 0) {
    length *= Math.pow(1.1, garlicTiers);
  }
  return length;
}

/**
 * Player horizontal speed multiplier from lifetime garlic collected.
 * - −5% for each full 400 garlic
 * - −10% for each full 500 garlic
 * Multiplicative, floored so movement never stops.
 */
export function getPlayerSpeedMultiplier(lifetimeGarlic: number): number {
  const g = Math.max(0, lifetimeGarlic);
  const per400 = Math.floor(g / 400);
  const per500 = Math.floor(g / 500);
  const mult = (1 - 0.05 * per400) * (1 - 0.1 * per500);
  return Math.max(MIN_PLAYER_SPEED_MULT, mult);
}

/**
 * Expected garlic placements per chunk after night density cuts (−5%/night).
 * Returned as a float; callers sample probabilistically.
 */
export function getGarlicDensityPerChunk(nightCount: number): number {
  const night = normalizeNight(nightCount);
  return BASE_COLLECTIBLES_PER_CHUNK * Math.pow(0.95, night - 1);
}

/**
 * Super-garlic probability (base 10%), reduced 10% of remaining each night.
 */
export function getSuperGarlicChance(nightCount: number): number {
  const night = normalizeNight(nightCount);
  return BASE_SUPER_CHANCE * Math.pow(0.9, night - 1);
}

/**
 * Resolve combat difficulty for the given night number (1 = first night).
 */
export function getDifficulty(nightCount: number): DifficultyParams {
  const night = normalizeNight(nightCount);

  let spawnInterval = BASE_SPAWN_INTERVAL;
  let maxDucks = BASE_MAX_DUCKS;
  let duckSpeed = BASE_DUCK_SPEED;
  let petrifyCost = BASE_PETRIFY_COST;
  let doubleSpawnChance = 0;

  if (night >= 3) {
    spawnInterval = BASE_SPAWN_INTERVAL * 0.85;
  }
  if (night >= 4) {
    maxDucks = BASE_MAX_DUCKS + 1;
    petrifyCost = 14;
  }
  if (night >= 5) {
    duckSpeed = BASE_DUCK_SPEED * 1.1;
    spawnInterval = BASE_SPAWN_INTERVAL * 0.75;
  }
  if (night >= 6) {
    maxDucks = BASE_MAX_DUCKS + 2;
    petrifyCost = 16;
    doubleSpawnChance = 0.28;
    const extra = Math.min(night - 6, 4);
    spawnInterval = Math.max(3.2, BASE_SPAWN_INTERVAL * 0.75 - extra * 0.15);
    duckSpeed = Math.min(7.2, BASE_DUCK_SPEED * 1.1 + extra * 0.15);
    maxDucks = Math.min(14, BASE_MAX_DUCKS + 2 + Math.floor(extra / 2));
  }

  // Super Boss count doubles each night: 1, 2, 4, 8… soft-capped
  const maxBosses = Math.min(8, Math.pow(2, night - 1));

  // Flyers: rarer canopy threats. 1 from night 1, +1 every 2 nights, soft-cap 4.
  const maxFlyers = Math.min(4, 1 + Math.floor((night - 1) / 2));
  // Slower spawn than regulars so the high cruise stays readable.
  const flyerSpawnInterval = Math.max(9, spawnInterval * 1.7);
  const flyerPetrifyCost = petrifyCost + 2;
  const flyerHitRadius = REGULAR_HIT_RADIUS * 1.05;

  return {
    spawnInterval,
    maxDucks,
    duckSpeed,
    petrifyCost,
    doubleSpawnChance,
    night,
    maxBosses,
    bossPetrifyCost: BOSS_PETRIFY_COST,
    bossScale: BOSS_SCALE,
    bossHitRadius: BOSS_HIT_RADIUS,
    regularHitRadius: REGULAR_HIT_RADIUS,
    maxFlyers,
    flyerSpawnInterval,
    flyerPetrifyCost,
    flyerHitRadius,
  };
}

export {
  BASE_NIGHT_LENGTH,
  BASE_COLLECTIBLES_PER_CHUNK,
  BOSS_PETRIFY_COST,
  BOSS_SCALE,
  REGULAR_HIT_RADIUS,
  BOSS_HIT_RADIUS,
};
