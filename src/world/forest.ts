import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { hashFloat, normalizeSeed } from "./random";
import { isRiverAt, sampleTerrainHeight } from "./terrainSampling";

export interface TreePlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotation: number;
  readonly shade: number;
}

const TREE_CELL_SIZE = 2;
const FOREST_CELL_SIZE = 32;
const RIVER_CLEARANCE = 1.15;
/** Radius of the trunk geometry at ground level, before tree scaling. */
export const TREE_TRUNK_RADIUS = 0.16;

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

/** A broad, continuous value field used to form meadows and forest stands. */
export function sampleForestDensity(seed: number, worldX: number, worldZ: number): number {
  const latticeX = worldX / FOREST_CELL_SIZE;
  const latticeZ = worldZ / FOREST_CELL_SIZE;
  const x0 = Math.floor(latticeX);
  const z0 = Math.floor(latticeZ);
  const x = smoothstep(latticeX - x0);
  const z = smoothstep(latticeZ - z0);
  const top = hashFloat(seed, x0, z0, 401) * (1 - x) + hashFloat(seed, x0 + 1, z0, 401) * x;
  const bottom = hashFloat(seed, x0, z0 + 1, 401) * (1 - x) + hashFloat(seed, x0 + 1, z0 + 1, 401) * x;
  return top * (1 - z) + bottom * z;
}

function treeChance(density: number): number {
  if (density < 0.38) return 0.01;
  if (density < 0.58) return 0.08 + (density - 0.38) * 0.8;
  return Math.min(0.78, 0.42 + (density - 0.58) * 1.2);
}

/** Deterministic, globally addressed tree placements for one chunk. */
export function generateTrees(
  seedInput: number | string,
  coordinate: ChunkCoordinate,
): readonly TreePlacement[] {
  const seed = normalizeSeed(seedInput);
  const cellsPerSide = CHUNK_SIZE / TREE_CELL_SIZE;
  const firstCellX = coordinate.x * cellsPerSide;
  const firstCellZ = coordinate.z * cellsPerSide;
  const trees: TreePlacement[] = [];

  for (let localZ = 0; localZ < cellsPerSide; localZ += 1) {
    for (let localX = 0; localX < cellsPerSide; localX += 1) {
      const cellX = firstCellX + localX;
      const cellZ = firstCellZ + localZ;
      const x = (cellX + 0.5) * TREE_CELL_SIZE + (hashFloat(seed, cellX, cellZ, 411) - 0.5) * 1.3;
      const z = (cellZ + 0.5) * TREE_CELL_SIZE + (hashFloat(seed, cellX, cellZ, 412) - 0.5) * 1.3;
      const density = sampleForestDensity(seed, x, z);
      if (hashFloat(seed, cellX, cellZ, 413) >= treeChance(density)) continue;

      // Keep the banks readable and leave room to walk beside the water.
      if (
        isRiverAt(seed, x, z)
        || isRiverAt(seed, x, z - RIVER_CLEARANCE)
        || isRiverAt(seed, x, z + RIVER_CLEARANCE)
      ) continue;

      trees.push({
        x,
        y: sampleTerrainHeight(seed, x, z),
        z,
        scale: 0.78 + hashFloat(seed, cellX, cellZ, 414) * 0.48,
        rotation: hashFloat(seed, cellX, cellZ, 415) * Math.PI * 2,
        shade: hashFloat(seed, cellX, cellZ, 416),
      });
    }
  }
  return trees;
}
