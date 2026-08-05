import { CHUNK_SIZE, chunkOrigin, type ChunkCoordinate } from "./chunkCoordinates";
import { chunkId } from "./chunkId";
import { isVegetationExcluded, type PoiZone } from "./poi";
import { hashFloat, normalizeSeed } from "./random";
import { sampleTerrainHeight } from "./terrainSampling";
import {
  createWorldRiverEnvironmentContext,
  decideWorldRiverObjectPlacement,
} from "./worldRiverEnvironment";
import {
  BASE_COLLECTIBLES_PER_CHUNK,
  getGarlicDensityPerChunk,
  getSuperGarlicChance,
  normalizeNight,
} from "../game/difficulty";

export interface CollectiblePlacement {
  readonly id: string;
  readonly chunkId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Garlic value: 1 normal, 10 super garlic. */
  readonly value: number;
  readonly isSuper: boolean;
}

/** Lift garlic so the bulb sits just above the terrain instead of half-buried. */
const GARLIC_HOVER_OFFSET = 0.55;

/**
 * Place garlic in a chunk. Density and super-garlic chance scale down with nightCount
 * (−5% garlic / night, −10% super chance / night).
 */
export function placeCollectibles(
  seedInput: number | string,
  coordinate: ChunkCoordinate,
  poiZones: readonly PoiZone[] = [],
  nightCount = 1,
): readonly CollectiblePlacement[] {
  const seed = normalizeSeed(seedInput);
  const origin = chunkOrigin(coordinate);
  const owner = chunkId(coordinate);
  const night = normalizeNight(nightCount);
  const density = getGarlicDensityPerChunk(night);
  // Candidate slots stay fixed so IDs remain stable; density decides which spawn.
  const candidates = BASE_COLLECTIBLES_PER_CHUNK;
  const superChance = getSuperGarlicChance(night);
  const riverContext = createWorldRiverEnvironmentContext({
    minX: origin.x, maxX: origin.x + CHUNK_SIZE, minZ: origin.z, maxZ: origin.z + CHUNK_SIZE,
  });
  const placements: CollectiblePlacement[] = [];

  for (let index = 0; index < candidates; index += 1) {
    // Probabilistic keep so expected count ≈ density
    const keepRoll = hashFloat(seed, coordinate.x, coordinate.z, index, 401);
    if (keepRoll > density / candidates) continue;

    const x = origin.x + 2 + hashFloat(seed, coordinate.x, coordinate.z, index, 101) * (CHUNK_SIZE - 4);
    const z = origin.z + 2 + hashFloat(seed, coordinate.x, coordinate.z, index, 211) * (CHUNK_SIZE - 4);
    const structureExcluded = isVegetationExcluded(x, z, poiZones);
    const riverDecision = decideWorldRiverObjectPlacement({
      seed,
      category: "collectible",
      worldX: x,
      worldZ: z,
      identityX: coordinate.x * 16 + index,
      identityZ: coordinate.z * 16 + index,
      structureExcluded,
      context: riverContext,
    });
    if (!riverDecision.accepted) continue;

    const roll = hashFloat(seed, coordinate.x, coordinate.z, index, 307);
    const isSuper = roll > 1 - superChance;
    placements.push({
      id: `${owner}:garlic:${index}`,
      chunkId: owner,
      x,
      y: sampleTerrainHeight(seed, x, z) + GARLIC_HOVER_OFFSET,
      z,
      value: isSuper ? 10 : 1,
      isSuper,
    });
  }

  return placements;
}
