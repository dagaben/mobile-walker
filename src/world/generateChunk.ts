import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { chunkId, type ChunkId } from "./chunkId";
import { sampleBiome, type BiomeWeights } from "./biomes";
import { generateTrees, type TreePlacement } from "./forest";
import { normalizeSeed } from "./random";
import { isRiverRow, sampleRiverBoundary, sampleRiverSpine, type RiverBoundary, type RiverPoint } from "./river";
import { sampleChannelTerrainLatticeHeight, TERRAIN_SEGMENTS } from "./terrainSampling";
import { generateVegetation, type GeneratedVegetation } from "./vegetation";

export { TERRAIN_SEGMENTS } from "./terrainSampling";

export interface GeneratedChunkData {
  readonly id: ChunkId;
  readonly coordinate: ChunkCoordinate;
  readonly size: number;
  readonly terrainHeights: readonly number[];
  /** Biome blend at each terrain vertex, using the same row-major layout as terrainHeights. */
  readonly terrainBiomeWeights: readonly BiomeWeights[];
  readonly terrainVerticesPerSide: number;
  readonly trees: readonly TreePlacement[];
  readonly vegetation: GeneratedVegetation;
  readonly river?: {
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
  const terrainBiomeWeights: BiomeWeights[] = [];
  for (let z = 0; z < verticesPerSide; z += 1) {
    for (let x = 0; x < verticesPerSide; x += 1) {
      // Use global lattice coordinates so neighboring terrain edges also agree.
      const globalX = coordinate.x * TERRAIN_SEGMENTS + x;
      const globalZ = coordinate.z * TERRAIN_SEGMENTS + z;
      terrainHeights.push(sampleChannelTerrainLatticeHeight(seed, globalX, globalZ));
      const worldX = coordinate.x * CHUNK_SIZE + x * CHUNK_SIZE / TERRAIN_SEGMENTS;
      const worldZ = coordinate.z * CHUNK_SIZE + z * CHUNK_SIZE / TERRAIN_SEGMENTS;
      terrainBiomeWeights.push(sampleBiome(seed, worldX, worldZ).weights);
    }
  }

  return {
    id: chunkId(coordinate),
    coordinate: { ...coordinate },
    size: CHUNK_SIZE,
    terrainHeights,
    terrainBiomeWeights,
    terrainVerticesPerSide: verticesPerSide,
    trees: generateTrees(seed, coordinate),
    vegetation: generateVegetation(seed, coordinate),
    river: isRiverRow(coordinate) ? {
      entry: sampleRiverBoundary(seed, coordinate, "west"),
      exit: sampleRiverBoundary(seed, coordinate, "east"),
      spine: sampleRiverSpine(seed, coordinate),
    } : undefined,
  };
}
