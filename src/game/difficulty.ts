/**
 * Progressive difficulty driven by night count (1 = first night).
 *
 * Ramp (matches design):
 *   Night 1–2: tutorial pace
 *   Night 3:   spawn ~15% faster
 *   Night 4:   +1 max duck, petrify cost 12
 *   Night 5:   duck speed +10%, spawn ~25% faster
 *   Night 6+:  max ducks +2, cost 15, occasional double-spawn
 *
 * Duck speed always stays below PLAYER_SPEED (~13.05).
 */

export interface DifficultyParams {
  /** Seconds between duck spawns. */
  spawnInterval: number;
  /** Hard cap on live (non-petrified) ducks. */
  maxDucks: number;
  /** Horizontal chase speed. */
  duckSpeed: number;
  /** Garlic required to petrify one duck on contact. */
  petrifyCost: number;
  /** Chance (0–1) to spawn a second duck in the same tick when the timer fires. */
  doubleSpawnChance: number;
  /** Night number this profile was built for (1+). */
  night: number;
}

const BASE_SPAWN_INTERVAL = 6.5;
const BASE_MAX_DUCKS = 8;
const BASE_DUCK_SPEED = 5.2;
const BASE_PETRIFY_COST = 10;

/** Clamp night to a positive integer for lookups. */
export function normalizeNight(nightCount: number): number {
  if (!Number.isFinite(nightCount) || nightCount < 1) return 1;
  return Math.floor(nightCount);
}

/**
 * Resolve difficulty for the given night number (1 = first night of the run).
 * Pure and side-effect free — safe for tests and HUD readouts.
 */
export function getDifficulty(nightCount: number): DifficultyParams {
  const night = normalizeNight(nightCount);

  let spawnInterval = BASE_SPAWN_INTERVAL;
  let maxDucks = BASE_MAX_DUCKS;
  let duckSpeed = BASE_DUCK_SPEED;
  let petrifyCost = BASE_PETRIFY_COST;
  let doubleSpawnChance = 0;

  if (night >= 3) {
    // ~15% faster spawns
    spawnInterval = BASE_SPAWN_INTERVAL * 0.85;
  }
  if (night >= 4) {
    maxDucks = BASE_MAX_DUCKS + 1; // 9
    petrifyCost = 12;
  }
  if (night >= 5) {
    // +10% duck speed; ~25% faster spawns vs base
    duckSpeed = BASE_DUCK_SPEED * 1.1;
    spawnInterval = BASE_SPAWN_INTERVAL * 0.75;
  }
  if (night >= 6) {
    maxDucks = BASE_MAX_DUCKS + 2; // 10
    petrifyCost = 15;
    doubleSpawnChance = 0.28;
    // Slight extra pressure past night 6, soft cap
    const extra = Math.min(night - 6, 4);
    spawnInterval = Math.max(3.2, BASE_SPAWN_INTERVAL * 0.75 - extra * 0.15);
    duckSpeed = Math.min(7.2, BASE_DUCK_SPEED * 1.1 + extra * 0.15);
    maxDucks = Math.min(14, BASE_MAX_DUCKS + 2 + Math.floor(extra / 2));
  }

  return {
    spawnInterval,
    maxDucks,
    duckSpeed,
    petrifyCost,
    doubleSpawnChance,
    night,
  };
}
