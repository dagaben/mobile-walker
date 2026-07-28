import { CHUNK_SIZE, worldToChunk } from "./chunkCoordinates";
import { hashFloat, normalizeSeed } from "./random";
import { sampleRiverSpine } from "./river";

export type TerrainSurface = "land" | "river";
export const TERRAIN_SEGMENTS = 8;

export interface TerrainSample {
  readonly height: number;
  readonly surface: TerrainSurface;
}

const LATTICE_SPACING = CHUNK_SIZE / TERRAIN_SEGMENTS;

/** Height at one vertex of the infinite, seeded terrain lattice. */
export function sampleTerrainLatticeHeight(seed: number, latticeX: number, latticeZ: number): number {
  const broad = hashFloat(seed, Math.floor(latticeX / 2), Math.floor(latticeZ / 2), 13);
  const detail = hashFloat(seed, latticeX, latticeZ, 29);
  return (broad - 0.5) * 0.8 + (detail - 0.5) * 0.22;
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
  const topLeft = sampleTerrainLatticeHeight(seed, x0, z0);
  const topRight = sampleTerrainLatticeHeight(seed, x0 + 1, z0);
  const bottomLeft = sampleTerrainLatticeHeight(seed, x0, z0 + 1);

  if (x + z <= 1) return topLeft + (topRight - topLeft) * x + (bottomLeft - topLeft) * z;
  const bottomRight = sampleTerrainLatticeHeight(seed, x0 + 1, z0 + 1);
  return bottomRight + (bottomLeft - bottomRight) * (1 - x) + (topRight - bottomRight) * (1 - z);
}

/** Rivers are solid hazards: movement may approach a bank but cannot enter water. */
export function isRiverAt(seedInput: number | string, worldX: number, worldZ: number): boolean {
  const seed = normalizeSeed(seedInput);
  const chunk = worldToChunk(worldX, worldZ);
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
  return {
    height: sampleTerrainHeight(seed, worldX, worldZ),
    surface: isRiverAt(seed, worldX, worldZ) ? "river" : "land",
  };
}
