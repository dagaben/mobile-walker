import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { chunkId, type ChunkId } from "./chunkId";
import { sampleBiome, type BiomeWeights } from "./biomes";
import { generateTrees, type TreePlacement } from "./forest";
import { normalizeSeed } from "./random";
import { isRiverRow, sampleRiverBoundary, sampleRiverSpine, type RiverBoundary, type RiverPoint } from "./river";
import {
  RIVER_BANK_WIDTH,
  RIVER_TRANSITION_WIDTH,
  sampleChannelTerrainHeight,
  sampleNaturalTerrainHeight,
  sampleRiverCrossSection,
  TERRAIN_SEGMENTS,
} from "./terrainSampling";
import { generateVegetation, type GeneratedVegetation } from "./vegetation";
import { generateWetlandPools, type WetlandPoolPlacement } from "./wetlands";

export { TERRAIN_SEGMENTS } from "./terrainSampling";

export interface RiverChannelSection {
  readonly x: number;
  readonly centerZ: number;
  readonly waterHalfWidth: number;
  readonly bankWidth: number;
  readonly surfaceElevation: number;
  readonly northShoulderHeight: number;
  readonly southShoulderHeight: number;
}

export interface IrregularTerrainVertex {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly biomeWeights: BiomeWeights;
}

export interface GeneratedChunkData {
  readonly id: ChunkId;
  readonly coordinate: ChunkCoordinate;
  readonly size: number;
  readonly terrainHeights: readonly number[];
  /** Biome blend at each terrain vertex, using the same row-major layout as terrainHeights. */
  readonly terrainBiomeWeights: readonly BiomeWeights[];
  readonly terrainVerticesPerSide: number;
  /** Explicit coarse regions used when a rectangular grid would overlap the river channel. */
  readonly irregularTerrain?: {
    readonly vertices: readonly IrregularTerrainVertex[];
    readonly indices: readonly number[];
  };
  readonly trees: readonly TreePlacement[];
  readonly vegetation: GeneratedVegetation;
  readonly wetlandPools: readonly WetlandPoolPlacement[];
  readonly river?: {
    readonly entry: RiverBoundary;
    readonly exit: RiverBoundary;
    readonly spine: readonly RiverPoint[];
    readonly channelSections: readonly RiverChannelSection[];
  };
}

function generateRiverChannel(seed: number, coordinate: ChunkCoordinate): {
  spine: readonly RiverPoint[];
  sections: readonly RiverChannelSection[];
} {
  // Eight longitudinal spans match the surrounding coarse terrain. The points
  // are only one-dimensional; no refined river-row terrain lattice is created.
  const sourceSpine = sampleRiverSpine(seed, coordinate, TERRAIN_SEGMENTS);
  const points: RiverPoint[] = [];
  const sections: RiverChannelSection[] = [];
  for (const { x } of sourceSpine) {
    // Any z in row zero selects the same cross-section; centerZ is returned by
    // the sampler and becomes the actual ribbon position.
    const section = sampleRiverCrossSection(seed, x, CHUNK_SIZE / 2);
    if (!section) continue;
    const waterHalfWidth = section.waterWidth / 2;
    const bankWidth = RIVER_BANK_WIDTH + RIVER_TRANSITION_WIDTH;
    points.push({ x, z: section.centerZ, width: section.waterWidth, surfaceElevation: section.surfaceElevation });
    sections.push({
      x,
      centerZ: section.centerZ,
      waterHalfWidth,
      bankWidth,
      surfaceElevation: section.surfaceElevation,
      northShoulderHeight: sampleNaturalTerrainHeight(
        seed, x, section.centerZ - waterHalfWidth - bankWidth,
      ),
      southShoulderHeight: sampleNaturalTerrainHeight(
        seed, x, section.centerZ + waterHalfWidth + bankWidth,
      ),
    });
  }
  return { spine: points, sections };
}

function generateIrregularTerrain(
  seed: number,
  coordinate: ChunkCoordinate,
  sections: readonly RiverChannelSection[],
): GeneratedChunkData["irregularTerrain"] {
  const vertices: IrregularTerrainVertex[] = [];
  const indices: number[] = [];
  const northEdge = coordinate.z * CHUNK_SIZE;
  const southEdge = northEdge + CHUNK_SIZE;
  for (const section of sections) {
    const northShoulderZ = section.centerZ - section.waterHalfWidth - section.bankWidth;
    const southShoulderZ = section.centerZ + section.waterHalfWidth + section.bankWidth;
    for (const [z, height] of [
      [northEdge, sampleNaturalTerrainHeight(seed, section.x, northEdge)],
      [northShoulderZ, section.northShoulderHeight],
      [southShoulderZ, section.southShoulderHeight],
      [southEdge, sampleNaturalTerrainHeight(seed, section.x, southEdge)],
    ] as const) {
      vertices.push({ x: section.x, z, height, biomeWeights: sampleBiome(seed, section.x, z).weights });
    }
  }
  for (let x = 0; x < sections.length - 1; x += 1) {
    const start = x * 4;
    // North edge-to-shoulder and south shoulder-to-edge are separate quads.
    indices.push(start, start + 1, start + 4, start + 1, start + 5, start + 4);
    indices.push(start + 2, start + 3, start + 6, start + 3, start + 7, start + 6);
  }
  return { vertices, indices };
}

/** Pure, random-access generation: output is solely a function of seed and coordinate. */
export function generateChunk(seedInput: number | string, coordinate: ChunkCoordinate): GeneratedChunkData {
  const seed = normalizeSeed(seedInput);
  const terrainSegments = TERRAIN_SEGMENTS;
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

  const channel = isRiverRow(coordinate) ? generateRiverChannel(seed, coordinate) : undefined;
  return {
    id: chunkId(coordinate),
    coordinate: { ...coordinate },
    size: CHUNK_SIZE,
    terrainHeights,
    terrainBiomeWeights,
    terrainVerticesPerSide: verticesPerSide,
    irregularTerrain: channel ? generateIrregularTerrain(seed, coordinate, channel.sections) : undefined,
    trees: generateTrees(seed, coordinate),
    vegetation: generateVegetation(seed, coordinate),
    wetlandPools: generateWetlandPools(seed, coordinate),
    river: channel ? {
      entry: sampleRiverBoundary(seed, coordinate, "west"),
      exit: sampleRiverBoundary(seed, coordinate, "east"),
      spine: channel.spine,
      channelSections: channel.sections,
    } : undefined,
  };
}
