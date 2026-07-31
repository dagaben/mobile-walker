import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { chunkId, type ChunkId } from "./chunkId";
import { sampleBiome, type BiomeWeights } from "./biomes";
import { generateTrees, type TreePlacement } from "./forest";
import { normalizeSeed } from "./random";
import { isRiverColumn, sampleRiverBoundary, sampleRiverSpine, type RiverBoundary, type RiverPoint } from "./river";
import {
  RIVER_BANK_WIDTH,
  RIVER_BED_DEPTH,
  RIVER_TRANSITION_WIDTH,
  sampleChannelTerrainHeight,
  sampleNaturalTerrainHeight,
  sampleRiverCrossSection,
  TERRAIN_SEGMENTS,
} from "./terrainSampling";
import { generateVegetation, type GeneratedVegetation } from "./vegetation";
import { generateWetlandPools, type WetlandPoolPlacement } from "./wetlands";
import {
  DEFAULT_TERRAIN_OCCLUSION_OPTIONS,
  sampleTerrainOcclusion,
  type TerrainOcclusionOptions,
} from "./terrainOcclusion";

export { TERRAIN_SEGMENTS } from "./terrainSampling";

export interface RiverChannelSection {
  readonly z: number;
  readonly centerX: number;
  readonly waterHalfWidth: number;
  readonly bankWidth: number;
  readonly surfaceElevation: number;
  readonly westShoulderHeight: number;
  readonly eastShoulderHeight: number;
  /** Terrain presentation inputs for the six channel cross-section vertices. */
  readonly terrainVertices: readonly Pick<IrregularTerrainVertex, "biomeWeights" | "occlusion">[];
}

export interface IrregularTerrainVertex {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly biomeWeights: BiomeWeights;
  readonly occlusion: number;
}

export interface GeneratedChunkData {
  readonly id: ChunkId;
  readonly coordinate: ChunkCoordinate;
  readonly size: number;
  readonly terrainHeights: readonly number[];
  /** Biome blend at each terrain vertex, using the same row-major layout as terrainHeights. */
  readonly terrainBiomeWeights: readonly BiomeWeights[];
  /** Worker-baked, global sunlight obstruction in the range [0, 1]. */
  readonly terrainOcclusion: readonly number[];
  readonly terrainMaximumDarkening: number;
  readonly terrainVerticesPerSide: number;
  /** Explicit coarse regions used when a rectangular grid would overlap the river channel. */
  readonly irregularTerrain?: {
    readonly vertices: readonly IrregularTerrainVertex[];
    readonly indices: readonly number[];
  };
  readonly pines: readonly TreePlacement[];
  readonly vegetation: GeneratedVegetation;
  readonly wetlandPools: readonly WetlandPoolPlacement[];
  readonly river?: {
    readonly entry: RiverBoundary;
    readonly exit: RiverBoundary;
    readonly spine: readonly RiverPoint[];
    readonly channelSections: readonly RiverChannelSection[];
  };
}

function generateRiverChannel(
  seed: number,
  coordinate: ChunkCoordinate,
  occlusionOptions: Readonly<TerrainOcclusionOptions>,
): {
  spine: readonly RiverPoint[];
  sections: readonly RiverChannelSection[];
} {
  // Eight longitudinal spans match the surrounding coarse terrain. The points
  // are only one-dimensional; no refined river-column terrain lattice is created.
  const sourceSpine = sampleRiverSpine(seed, coordinate, TERRAIN_SEGMENTS);
  const points: RiverPoint[] = [];
  const sections: RiverChannelSection[] = [];
  for (const { z } of sourceSpine) {
    // Any x in column zero selects the same cross-section; centerX is returned by
    // the sampler and becomes the actual ribbon position.
    const section = sampleRiverCrossSection(seed, CHUNK_SIZE / 2, z);
    if (!section) continue;
    const waterHalfWidth = section.waterWidth / 2;
    const bankWidth = RIVER_BANK_WIDTH + RIVER_TRANSITION_WIDTH;
    const westShoulderHeight = sampleNaturalTerrainHeight(seed, section.centerX - waterHalfWidth - bankWidth, z);
    const eastShoulderHeight = sampleNaturalTerrainHeight(seed, section.centerX + waterHalfWidth + bankWidth, z);
    points.push({ x: section.centerX, z, width: section.waterWidth, surfaceElevation: section.surfaceElevation });
    const crossSection = [
      [section.centerX - waterHalfWidth - bankWidth, westShoulderHeight],
      [section.centerX - waterHalfWidth, section.surfaceElevation + 0.04],
      [section.centerX - waterHalfWidth + waterHalfWidth * 0.1, section.surfaceElevation - RIVER_BED_DEPTH],
      [section.centerX + waterHalfWidth - waterHalfWidth * 0.1, section.surfaceElevation - RIVER_BED_DEPTH],
      [section.centerX + waterHalfWidth, section.surfaceElevation + 0.04],
      [section.centerX + waterHalfWidth + bankWidth, eastShoulderHeight],
    ] as const;
    sections.push({
      z,
      centerX: section.centerX,
      waterHalfWidth,
      bankWidth,
      surfaceElevation: section.surfaceElevation,
      westShoulderHeight,
      eastShoulderHeight,
      terrainVertices: crossSection.map(([x, height]) => ({
        biomeWeights: sampleBiome(seed, x, z).weights,
        occlusion: sampleTerrainOcclusion(
          x, z, height,
          (sampleX, sampleZ) => sampleChannelTerrainHeight(seed, sampleX, sampleZ),
          occlusionOptions,
        ),
      })),
    });
  }
  return { spine: points, sections };
}

function generateIrregularTerrain(
  seed: number,
  coordinate: ChunkCoordinate,
  sections: readonly RiverChannelSection[],
  occlusionOptions: Readonly<TerrainOcclusionOptions>,
): GeneratedChunkData["irregularTerrain"] {
  const vertices: IrregularTerrainVertex[] = [];
  const indices: number[] = [];
  const westEdge = coordinate.x * CHUNK_SIZE;
  const eastEdge = westEdge + CHUNK_SIZE;
  for (const section of sections) {
    const westShoulderX = section.centerX - section.waterHalfWidth - section.bankWidth;
    const eastShoulderX = section.centerX + section.waterHalfWidth + section.bankWidth;
    for (const [x, height] of [
      [westEdge, sampleNaturalTerrainHeight(seed, westEdge, section.z)],
      [westShoulderX, section.westShoulderHeight],
      [eastShoulderX, section.eastShoulderHeight],
      [eastEdge, sampleNaturalTerrainHeight(seed, eastEdge, section.z)],
    ] as const) {
      vertices.push({
        x, z: section.z, height,
        biomeWeights: sampleBiome(seed, x, section.z).weights,
        occlusion: sampleTerrainOcclusion(
          x, section.z, height,
          (sampleX, sampleZ) => sampleChannelTerrainHeight(seed, sampleX, sampleZ),
          occlusionOptions,
        ),
      });
    }
  }
  for (let z = 0; z < sections.length - 1; z += 1) {
    const start = z * 4;
    // West edge-to-shoulder and east shoulder-to-edge are separate quads.
    indices.push(start, start + 4, start + 1, start + 1, start + 4, start + 5);
    indices.push(start + 2, start + 6, start + 3, start + 3, start + 6, start + 7);
  }
  return { vertices, indices };
}

/** Pure, random-access generation: output is solely a function of seed and coordinate. */
export function generateChunk(
  seedInput: number | string,
  coordinate: ChunkCoordinate,
  occlusionOptions: Readonly<TerrainOcclusionOptions> = DEFAULT_TERRAIN_OCCLUSION_OPTIONS,
): GeneratedChunkData {
  const seed = normalizeSeed(seedInput);
  const terrainSegments = TERRAIN_SEGMENTS;
  const verticesPerSide = terrainSegments + 1;
  const terrainHeights: number[] = [];
  const terrainBiomeWeights: BiomeWeights[] = [];
  const terrainOcclusion: number[] = [];
  for (let z = 0; z < verticesPerSide; z += 1) {
    for (let x = 0; x < verticesPerSide; x += 1) {
      // Use global lattice coordinates so neighboring terrain edges also agree.
      const worldX = coordinate.x * CHUNK_SIZE + x * CHUNK_SIZE / terrainSegments;
      const worldZ = coordinate.z * CHUNK_SIZE + z * CHUNK_SIZE / terrainSegments;
      const height = sampleChannelTerrainHeight(seed, worldX, worldZ);
      terrainHeights.push(height);
      terrainBiomeWeights.push(sampleBiome(seed, worldX, worldZ).weights);
      terrainOcclusion.push(sampleTerrainOcclusion(
        worldX, worldZ, height,
        (sampleX, sampleZ) => sampleChannelTerrainHeight(seed, sampleX, sampleZ),
        occlusionOptions,
      ));
    }
  }

  const channel = isRiverColumn(coordinate) ? generateRiverChannel(seed, coordinate, occlusionOptions) : undefined;
  return {
    id: chunkId(coordinate),
    coordinate: { ...coordinate },
    size: CHUNK_SIZE,
    terrainHeights,
    terrainBiomeWeights,
    terrainOcclusion,
    terrainMaximumDarkening: occlusionOptions.maximumDarkening,
    terrainVerticesPerSide: verticesPerSide,
    irregularTerrain: channel ? generateIrregularTerrain(seed, coordinate, channel.sections, occlusionOptions) : undefined,
    pines: generateTrees(seed, coordinate),
    vegetation: generateVegetation(seed, coordinate),
    wetlandPools: generateWetlandPools(seed, coordinate),
    river: channel ? {
      entry: sampleRiverBoundary(seed, coordinate, "north"),
      exit: sampleRiverBoundary(seed, coordinate, "south"),
      spine: channel.spine,
      channelSections: channel.sections,
    } : undefined,
  };
}
