import { CHUNK_SIZE, worldToChunk } from "./chunkCoordinates";
import { sampleBiome, type BiomeId, type BiomeWeights } from "./biomes";
import { hashFloat, normalizeSeed } from "./random";
import { isRiverRow, sampleRiverSpine } from "./river";

export type TerrainSurface = "land" | "river";
export const TERRAIN_SEGMENTS = 8;

export interface TerrainSample {
  readonly height: number;
  readonly surface: TerrainSurface;
  readonly biome: BiomeId;
  readonly biomeWeights: BiomeWeights;
}

const LATTICE_SPACING = CHUNK_SIZE / TERRAIN_SEGMENTS;
/**
 * Vertical distance from the water surface to the walkable river bed.
 *
 * The player is approximately 1.5 world units tall, so this submerges them by
 * roughly 30% of their height while they cross a river.
 */
export const RIVER_BED_DEPTH = 0.45;
/** Terrain at and above this elevation is rendered as snow and has no vegetation. */
export const MOUNTAIN_SNOW_LINE = 5.5;

const ELEVATION_PROFILES: Readonly<Record<BiomeId, {
  readonly base: number;
  readonly broad: number;
  readonly detail: number;
}>> = {
  plains: { base: -0.04, broad: 0.42, detail: 0.1 },
  forest: { base: 0.04, broad: 0.68, detail: 0.18 },
  wetland: { base: -0.12, broad: 0.25, detail: 0.07 },
  // Highlands deliberately have enough relief for tall hills and locally
  // steep faces, while biome blending still eases the transition into them.
  highlands: { base: 0.5, broad: 2.35, detail: 0.78 },
  // A high base and two strong noise bands create tall, broken summits rather
  // than simply recoloring the existing highland hills.
  mountain: { base: 6.2, broad: 8.8, detail: 3.1 },
};

/** Height at one vertex of the infinite, seeded terrain lattice. */
export function sampleTerrainLatticeHeight(seed: number, latticeX: number, latticeZ: number): number {
  const broad = hashFloat(seed, Math.floor(latticeX / 2), Math.floor(latticeZ / 2), 13);
  const detail = hashFloat(seed, latticeX, latticeZ, 29);
  const worldX = latticeX * LATTICE_SPACING;
  const worldZ = latticeZ * LATTICE_SPACING;
  const weights = sampleBiome(seed, worldX, worldZ).weights;

  let base = 0;
  let broadAmplitude = 0;
  let detailAmplitude = 0;
  for (const id of Object.keys(ELEVATION_PROFILES) as BiomeId[]) {
    const profile = ELEVATION_PROFILES[id];
    base += weights[id] * profile.base;
    broadAmplitude += weights[id] * profile.broad;
    detailAmplitude += weights[id] * profile.detail;
  }

  return base + (broad - 0.5) * broadAmplitude + (detail - 0.5) * detailAmplitude;
}

/**
 * Height of a rendered terrain-lattice vertex after carving the river channel.
 * The extra lattice-cell margin ensures every terrain triangle beneath the
 * water ribbon is capped below the surface rather than poking through it.
 */
export function sampleChannelTerrainLatticeHeight(
  seed: number,
  latticeX: number,
  latticeZ: number,
): number {
  const worldX = latticeX * LATTICE_SPACING;
  const worldZ = latticeZ * LATTICE_SPACING;
  const coordinate = worldToChunk(worldX, worldZ);
  const naturalHeight = sampleTerrainLatticeHeight(seed, latticeX, latticeZ);
  if (!isRiverRow(coordinate)) return naturalHeight;
  const spine = sampleRiverSpine(seed, coordinate);
  const local = (worldX - coordinate.x * CHUNK_SIZE) / CHUNK_SIZE;
  const segmentPosition = Math.max(0, Math.min(1, local)) * (spine.length - 1);
  const index = Math.min(spine.length - 2, Math.floor(segmentPosition));
  const fraction = segmentPosition - index;
  const start = spine[index];
  const end = spine[index + 1];
  if (!start || !end) return naturalHeight;

  const centerZ = start.z + (end.z - start.z) * fraction;
  const width = start.width + (end.width - start.width) * fraction;
  if (Math.abs(worldZ - centerZ) > width / 2 + LATTICE_SPACING) return naturalHeight;
  const surfaceElevation = start.surfaceElevation
    + (end.surfaceElevation - start.surfaceElevation) * fraction;
  return surfaceElevation - RIVER_BED_DEPTH;
}

/**
 * Pure random-access terrain query. The triangular interpolation matches the
 * terrain mesh and uses global lattice coordinates, including for negatives.
 */
export function sampleTerrainHeight(seedInput: number | string, worldX: number, worldZ: number): number {
  const seed = normalizeSeed(seedInput);
  const latticeX = worldX / LATTICE_SPACING;
  const latticeZ = worldZ / LATTICE_SPACING;
  const x0 = Math.floor(latticeX);
  const z0 = Math.floor(latticeZ);
  const x = latticeX - x0;
  const z = latticeZ - z0;
  const topLeft = sampleChannelTerrainLatticeHeight(seed, x0, z0);
  const topRight = sampleChannelTerrainLatticeHeight(seed, x0 + 1, z0);
  const bottomLeft = sampleChannelTerrainLatticeHeight(seed, x0, z0 + 1);

  if (x + z <= 1) return topLeft + (topRight - topLeft) * x + (bottomLeft - topLeft) * z;
  const bottomRight = sampleChannelTerrainLatticeHeight(seed, x0 + 1, z0 + 1);
  return bottomRight + (bottomLeft - bottomRight) * (1 - x) + (topRight - bottomRight) * (1 - z);
}

/** Returns whether a point is inside the generated river ribbon. */
export function isRiverAt(seedInput: number | string, worldX: number, worldZ: number): boolean {
  const seed = normalizeSeed(seedInput);
  const chunk = worldToChunk(worldX, worldZ);
  if (!isRiverRow(chunk)) return false;
  const spine = sampleRiverSpine(seed, chunk);
  const local = (worldX - chunk.x * CHUNK_SIZE) / CHUNK_SIZE;
  const segmentPosition = Math.max(0, Math.min(1, local)) * (spine.length - 1);
  const index = Math.min(spine.length - 2, Math.floor(segmentPosition));
  const fraction = segmentPosition - index;
  const start = spine[index];
  const end = spine[index + 1];
  if (!start || !end) return false;
  const centerZ = start.z + (end.z - start.z) * fraction;
  const width = start.width + (end.width - start.width) * fraction;
  return Math.abs(worldZ - centerZ) <= width / 2;
}

export function sampleTerrain(seed: number | string, worldX: number, worldZ: number): TerrainSample {
  const biome = sampleBiome(seed, worldX, worldZ);
  return {
    height: sampleTerrainHeight(seed, worldX, worldZ),
    surface: isRiverAt(seed, worldX, worldZ) ? "river" : "land",
    biome: biome.dominant,
    biomeWeights: biome.weights,
  };
}
