import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { chunkId, type ChunkId } from "./chunkId";
import { sampleBiome, type BiomeWeights } from "./biomes";
import { generateTrees, type TreePlacement } from "./forest";
import { normalizeSeed } from "./random";
import { isRiverRow, sampleRiverBoundary, sampleRiverSpine, type RiverBoundary, type RiverPoint } from "./river";
import {
  RIVER_TERRAIN_SEGMENTS,
  sampleChannelTerrainHeight,
  sampleRiverCrossSection,
  TERRAIN_SEGMENTS,
} from "./terrainSampling";
import { generateVegetation, type GeneratedVegetation } from "./vegetation";
import { generateWetlandPools, type WetlandPoolPlacement } from "./wetlands";

export { RIVER_TERRAIN_SEGMENTS, TERRAIN_SEGMENTS } from "./terrainSampling";

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
  readonly wetlandPools: readonly WetlandPoolPlacement[];
  readonly river?: {
    readonly entry: RiverBoundary;
    readonly exit: RiverBoundary;
    readonly spine: readonly RiverPoint[];
  };
}

function generateRenderedRiverSpine(seed: number, coordinate: ChunkCoordinate): readonly RiverPoint[] {
  const sourceSpine = sampleRiverSpine(seed, coordinate);
  const sampleXs = new Set(sourceSpine.map((point) => point.x));
  for (let index = 0; index <= RIVER_TERRAIN_SEGMENTS; index += 1) {
    sampleXs.add((coordinate.x + index / RIVER_TERRAIN_SEGMENTS) * CHUNK_SIZE);
  }
  const points: RiverPoint[] = [];
  for (const x of [...sampleXs].sort((left, right) => left - right)) {
    // Any z in row zero selects the same cross-section; centerZ is returned by
    // the sampler and becomes the actual ribbon position.
    const section = sampleRiverCrossSection(seed, x, CHUNK_SIZE / 2);
    if (section) points.push({
      x,
      z: section.centerZ,
      width: section.waterWidth,
      surfaceElevation: section.surfaceElevation,
    });
  }
  return points;
}

/** Pure, random-access generation: output is solely a function of seed and coordinate. */
export function generateChunk(seedInput: number | string, coordinate: ChunkCoordinate): GeneratedChunkData {
  const seed = normalizeSeed(seedInput);
  const terrainSegments = isRiverRow(coordinate) ? RIVER_TERRAIN_SEGMENTS : TERRAIN_SEGMENTS;
  const verticesPerSide = terrainSegments + 1;
  const terrainHeights: number[] = [];
  const terrainBiomeWeights: BiomeWeights[] = [];
  for (let z = 0; z < verticesPerSide; z += 1) {
    for (let x = 0; x < verticesPerSide; x += 1) {
      // Use global lattice coordinates so neighboring terrain edges also agree.
      const worldX = coordinate.x * CHUNK_SIZE + x * CHUNK_SIZE / terrainSegments;
      const worldZ = coordinate.z * CHUNK_SIZE + z * CHUNK_SIZE / terrainSegments;
      terrainHeights.push(sampleChannelTerrainHeight(seed, worldX, worldZ));
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
    wetlandPools: generateWetlandPools(seed, coordinate),
    river: isRiverRow(coordinate) ? {
      entry: sampleRiverBoundary(seed, coordinate, "west"),
      exit: sampleRiverBoundary(seed, coordinate, "east"),
      spine: generateRenderedRiverSpine(seed, coordinate),
    } : undefined,
  };
}
