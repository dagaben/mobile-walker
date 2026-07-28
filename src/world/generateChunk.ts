import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { chunkId, type ChunkId } from "./chunkId";
import { normalizeSeed } from "./random";
import { sampleRiverBoundary, sampleRiverSpine, type RiverBoundary, type RiverPoint } from "./river";
import { sampleTerrainLatticeHeight, TERRAIN_SEGMENTS } from "./terrainSampling";

export { TERRAIN_SEGMENTS } from "./terrainSampling";

export interface GeneratedChunkData {
  readonly id: ChunkId;
  readonly coordinate: ChunkCoordinate;
  readonly size: number;
  readonly terrainHeights: readonly number[];
  readonly terrainVerticesPerSide: number;
  readonly river: {
    readonly entry: RiverBoundary;
    readonly exit: RiverBoundary;
    readonly spine: readonly RiverPoint[];
  };
}

/** Pure, random-access generation: output is solely a function of seed and coordinate. */
export function generateChunk(seedInput: number | string, coordinate: ChunkCoordinate): GeneratedChunkData {
  const seed = normalizeSeed(seedInput);
  const verticesPerSide = TERRAIN_SEGMENTS + 1;
  const terrainHeights: number[] = [];
  for (let z = 0; z < verticesPerSide; z += 1) {
    for (let x = 0; x < verticesPerSide; x += 1) {
      // Use global lattice coordinates so neighboring terrain edges also agree.
      const globalX = coordinate.x * TERRAIN_SEGMENTS + x;
      const globalZ = coordinate.z * TERRAIN_SEGMENTS + z;
      terrainHeights.push(sampleTerrainLatticeHeight(seed, globalX, globalZ));
    }
  }

  return {
    id: chunkId(coordinate),
    coordinate: { ...coordinate },
    size: CHUNK_SIZE,
    terrainHeights,
    terrainVerticesPerSide: verticesPerSide,
    river: {
      entry: sampleRiverBoundary(seed, coordinate, "west"),
      exit: sampleRiverBoundary(seed, coordinate, "east"),
      spine: sampleRiverSpine(seed, coordinate),
    },
  };
}
