import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { chunkId, type ChunkId } from "./chunkId";
import { hashFloat, normalizeSeed } from "./random";
import { sampleRiverBoundary, sampleRiverSpine, type RiverBoundary, type RiverPoint } from "./river";

export const TERRAIN_SEGMENTS = 8;

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
      const broad = hashFloat(seed, Math.floor(globalX / 2), Math.floor(globalZ / 2), 13);
      const detail = hashFloat(seed, globalX, globalZ, 29);
      terrainHeights.push((broad - 0.5) * 0.8 + (detail - 0.5) * 0.22);
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
