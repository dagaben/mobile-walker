import { CHUNK_SIZE, chunkOrigin, type ChunkCoordinate } from "./chunkCoordinates";
import { chunkId } from "./chunkId";
import { isVegetationExcluded, type PoiZone } from "./poi";
import { hashFloat, normalizeSeed } from "./random";
import { sampleTerrainHeight } from "./terrainSampling";

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

/** Was 4; −20% overall density → 3 per chunk. */
const COLLECTIBLES_PER_CHUNK = 3;
/** Lift garlic so the bulb sits just above the terrain instead of half-buried. */
const GARLIC_HOVER_OFFSET = 0.55;

export function placeCollectibles(
  seedInput: number | string,
  coordinate: ChunkCoordinate,
  poiZones: readonly PoiZone[] = [],
): readonly CollectiblePlacement[] {
  const seed = normalizeSeed(seedInput);
  const origin = chunkOrigin(coordinate);
  const owner = chunkId(coordinate);
  return Array.from({ length: COLLECTIBLES_PER_CHUNK }, (_, index) => {
    const x = origin.x + 2 + hashFloat(seed, coordinate.x, coordinate.z, index, 101) * (CHUNK_SIZE - 4);
    const z = origin.z + 2 + hashFloat(seed, coordinate.x, coordinate.z, index, 211) * (CHUNK_SIZE - 4);
    const roll = hashFloat(seed, coordinate.x, coordinate.z, index, 307);
    // Roughly 1 super per ~10 garlic
    const isSuper = roll > 0.9;
    return {
      id: `${owner}:garlic:${index}`,
      chunkId: owner,
      x,
      y: sampleTerrainHeight(seed, x, z) + GARLIC_HOVER_OFFSET,
      z,
      value: isSuper ? 10 : 1,
      isSuper,
    };
  }).filter((placement) => !isVegetationExcluded(placement.x, placement.z, poiZones));
}
