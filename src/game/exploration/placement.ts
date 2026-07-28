import { CHUNK_SIZE, chunkOrigin, type ChunkCoordinate } from "../../world/chunkCoordinates";
import { chunkId } from "../../world/chunkId";
import { hashFloat, normalizeSeed } from "../../world/random";
import { sampleTerrainHeight } from "../../world/terrainSampling";

export interface LandmarkPlacement {
  readonly id: string;
  readonly chunkId: string;
  readonly kind: "waystone" | "memory";
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const LANDMARKS_PER_CHUNK = 2;
const EDGE_MARGIN = 2;

/** Pure, random-access generation: output depends only on seed and coordinate. */
export function placeLandmarks(seed: number | string, coordinate: ChunkCoordinate): LandmarkPlacement[] {
  const numericSeed = normalizeSeed(seed);
  const origin = chunkOrigin(coordinate);
  const id = chunkId(coordinate);
  return Array.from({ length: LANDMARKS_PER_CHUNK }, (_, index) => {
    const x = origin.x + EDGE_MARGIN + hashFloat(numericSeed, coordinate.x, coordinate.z, index, 0) * (CHUNK_SIZE - EDGE_MARGIN * 2);
    const z = origin.z + EDGE_MARGIN + hashFloat(numericSeed, coordinate.x, coordinate.z, index, 1) * (CHUNK_SIZE - EDGE_MARGIN * 2);
    return {
      id: `${id}:landmark:${index}`,
      chunkId: id,
      kind: index === 0 ? "waystone" : "memory",
      x,
      y: sampleTerrainHeight(seed, x, z) + 0.65,
      z,
    };
  });
}
