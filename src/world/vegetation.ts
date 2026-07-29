import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { sampleBiome, type BiomeId, type BiomeWeights } from "./biomes";
import { hashFloat, normalizeSeed } from "./random";
import { isRiverAt, sampleTerrainHeight } from "./terrainSampling";

export interface VegetationPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotation: number;
  readonly shade: number;
}

export interface FlowerPlacement extends VegetationPlacement {
  readonly color: number;
}

export interface GeneratedVegetation {
  readonly leafTrees: readonly VegetationPlacement[];
  readonly bushes: readonly VegetationPlacement[];
  readonly flowers: readonly FlowerPlacement[];
}

type Profile = Readonly<Record<BiomeId, number>>;

// Leaf trees favor damp lowlands and mixed forest edges, while shrubs can
// survive almost everywhere. Flowers deliberately blanket open meadows.
const LEAF_TREE_CHANCE: Profile = { plains: 0.035, forest: 0.23, wetland: 0.14, highlands: 0.015 };
const BUSH_CHANCE: Profile = { plains: 0.12, forest: 0.34, wetland: 0.28, highlands: 0.16 };
const FLOWER_CHANCE: Profile = { plains: 0.72, forest: 0.07, wetland: 0.22, highlands: 0.08 };
const FLOWER_COLORS = [0xf1d36b, 0xf0eee4, 0xd99ab3, 0x9cadd8, 0xd97862] as const;

function blendedChance(weights: BiomeWeights, profile: Profile): number {
  return (Object.keys(profile) as BiomeId[])
    .reduce((chance, biome) => chance + weights[biome] * profile[biome], 0);
}

function generateLayer<T extends VegetationPlacement>(
  seed: number,
  coordinate: ChunkCoordinate,
  cellSize: number,
  salt: number,
  profile: Profile,
  minScale: number,
  maxScale: number,
  create: (placement: VegetationPlacement, cellX: number, cellZ: number) => T,
): T[] {
  const cellsPerSide = Math.ceil(CHUNK_SIZE / cellSize);
  const startX = coordinate.x * CHUNK_SIZE;
  const startZ = coordinate.z * CHUNK_SIZE;
  const placements: T[] = [];

  for (let localZ = 0; localZ < cellsPerSide; localZ += 1) {
    for (let localX = 0; localX < cellsPerSide; localX += 1) {
      const cellX = coordinate.x * cellsPerSide + localX;
      const cellZ = coordinate.z * cellsPerSide + localZ;
      const x = startX + (localX + 0.15 + hashFloat(seed, cellX, cellZ, salt) * 0.7) * cellSize;
      const z = startZ + (localZ + 0.15 + hashFloat(seed, cellX, cellZ, salt + 1) * 0.7) * cellSize;
      if (x >= startX + CHUNK_SIZE || z >= startZ + CHUNK_SIZE || isRiverAt(seed, x, z)) continue;
      const weights = sampleBiome(seed, x, z).weights;
      if (hashFloat(seed, cellX, cellZ, salt + 2) >= blendedChance(weights, profile)) continue;
      const scale = minScale + hashFloat(seed, cellX, cellZ, salt + 3) * (maxScale - minScale);
      placements.push(create({
        x, y: sampleTerrainHeight(seed, x, z), z, scale,
        rotation: hashFloat(seed, cellX, cellZ, salt + 4) * Math.PI * 2,
        shade: hashFloat(seed, cellX, cellZ, salt + 5),
      }, cellX, cellZ));
    }
  }
  return placements;
}

/** Deterministic biome-aware ground cover and broadleaf vegetation. */
export function generateVegetation(seedInput: number | string, coordinate: ChunkCoordinate): GeneratedVegetation {
  const seed = normalizeSeed(seedInput);
  return {
    leafTrees: generateLayer(seed, coordinate, 2.5, 501, LEAF_TREE_CHANCE, 0.72, 1.18, (placement) => placement),
    bushes: generateLayer(seed, coordinate, 1.6, 521, BUSH_CHANCE, 0.62, 1.2, (placement) => placement),
    flowers: generateLayer(seed, coordinate, 0.8, 541, FLOWER_CHANCE, 0.72, 1.18, (placement, x, z) => ({
      ...placement,
      color: FLOWER_COLORS[Math.floor(hashFloat(seed, x, z, 547) * FLOWER_COLORS.length)]!,
    })),
  };
}
