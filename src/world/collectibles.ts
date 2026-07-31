import { CHUNK_SIZE, chunkOrigin, type ChunkCoordinate } from "./chunkCoordinates";
import { chunkId } from "./chunkId";
import { isVegetationExcluded, type PoiZone } from "./poi";
import { hashFloat, normalizeSeed } from "./random";
import { sampleTerrainHeight } from "./terrainSampling";

export interface CollectiblePlacement { readonly id: string; readonly chunkId: string; readonly x: number; readonly y: number; readonly z: number; }
const COLLECTIBLES_PER_CHUNK = 2;

export function placeCollectibles(seedInput: number | string, coordinate: ChunkCoordinate, poiZones: readonly PoiZone[] = []): readonly CollectiblePlacement[] {
  const seed = normalizeSeed(seedInput), origin = chunkOrigin(coordinate), owner = chunkId(coordinate);
  return Array.from({ length: COLLECTIBLES_PER_CHUNK }, (_, index) => {
    const x = origin.x + 2 + hashFloat(seed, coordinate.x, coordinate.z, index, 101) * (CHUNK_SIZE - 4);
    const z = origin.z + 2 + hashFloat(seed, coordinate.x, coordinate.z, index, 211) * (CHUNK_SIZE - 4);
    return { id: `${owner}:waypoint:${index}`, chunkId: owner, x, y: sampleTerrainHeight(seed, x, z), z };
  }).filter(placement => !isVegetationExcluded(placement.x, placement.z, poiZones));
}
