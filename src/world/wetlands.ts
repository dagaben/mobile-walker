import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { sampleBiome } from "./biomes";
import { hashFloat, normalizeSeed } from "./random";
import { isRiverAt, sampleTerrainHeight } from "./terrainSampling";

export interface WetlandPoolPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly rotation: number;
}

/** Movement multiplier at the saturated center of a wetland. */
export const WETLAND_SPEED_MULTIPLIER = 0.55;

/**
 * Blends mud resistance in with the continuous biome weights, avoiding an
 * abrupt speed change at a biome boundary.
 */
export function sampleWetlandSpeedMultiplier(
  seed: number | string,
  worldX: number,
  worldZ: number,
): number {
  const wetlandWeight = sampleBiome(seed, worldX, worldZ).weights.wetland;
  return 1 - wetlandWeight * (1 - WETLAND_SPEED_MULTIPLIER);
}

/** Generates many small, deterministic pools only where the wetland blend is strong. */
export function generateWetlandPools(
  seedInput: number | string,
  coordinate: ChunkCoordinate,
): readonly WetlandPoolPlacement[] {
  const seed = normalizeSeed(seedInput);
  const pools: WetlandPoolPlacement[] = [];
  const candidates = 36;
  const originX = coordinate.x * CHUNK_SIZE;
  const originZ = coordinate.z * CHUNK_SIZE;

  for (let index = 0; index < candidates; index += 1) {
    const x = originX + 0.45 + hashFloat(seed, coordinate.x, coordinate.z, 8100 + index * 6) * (CHUNK_SIZE - 0.9);
    const z = originZ + 0.45 + hashFloat(seed, coordinate.x, coordinate.z, 8101 + index * 6) * (CHUNK_SIZE - 0.9);
    const wetlandWeight = sampleBiome(seed, x, z).weights.wetland;
    if (wetlandWeight < 0.32) continue;
    if (hashFloat(seed, coordinate.x, coordinate.z, 8102 + index * 6) > wetlandWeight * 1.15) continue;
    if (isRiverAt(seed, x, z)) continue;

    const radius = 0.22 + hashFloat(seed, coordinate.x, coordinate.z, 8103 + index * 6) * 0.48;
    pools.push({
      x,
      y: sampleTerrainHeight(seed, x, z) + 0.035,
      z,
      radiusX: radius * (0.75 + hashFloat(seed, coordinate.x, coordinate.z, 8104 + index * 6) * 0.65),
      radiusZ: radius * (0.75 + hashFloat(seed, coordinate.x, coordinate.z, 8105 + index * 6) * 0.65),
      rotation: hashFloat(seed, coordinate.x, coordinate.z, 8190 + index) * Math.PI,
    });
  }
  return pools;
}
