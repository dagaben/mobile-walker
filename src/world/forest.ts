import type { ChunkCoordinate } from "./chunkCoordinates";
import {
  generateVegetationKind,
  sampleForestDensity,
  treeChance,
  TREE_TRUNK_RADIUS,
  type VegetationPlacement,
} from "./vegetation";

/** @deprecated Prefer VegetationPlacement and generateVegetationKind("pine", ...). */
export type TreePlacement = VegetationPlacement;

/** Compatibility wrapper for callers that render pines separately. */
export function generateTrees(seed: number | string, coordinate: ChunkCoordinate): readonly TreePlacement[] {
  return generateVegetationKind("pine", seed, coordinate);
}

export { sampleForestDensity, treeChance, TREE_TRUNK_RADIUS };
