import type { TransformComponent } from "../ecs/Entity";
import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { generateTrees, TREE_TRUNK_RADIUS, type TreePlacement } from "./forest";
import { generateVegetation, LEAF_TREE_TRUNK_RADIUS, type VegetationPlacement } from "./vegetation";

export const PLAYER_COLLISION_RADIUS = 0.38;

function chunksBetween(
  from: TransformComponent,
  to: TransformComponent,
  margin: number,
): readonly ChunkCoordinate[] {
  const chunks: ChunkCoordinate[] = [];
  const minX = Math.floor((Math.min(from.x, to.x) - margin) / CHUNK_SIZE);
  const maxX = Math.floor((Math.max(from.x, to.x) + margin) / CHUNK_SIZE);
  const minZ = Math.floor((Math.min(from.z, to.z) - margin) / CHUNK_SIZE);
  const maxZ = Math.floor((Math.max(from.z, to.z) + margin) / CHUNK_SIZE);
  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) chunks.push({ x, z });
  }
  return chunks;
}

type TrunkPlacement = TreePlacement | VegetationPlacement;

interface TrunkGroup {
  readonly placements: readonly TrunkPlacement[];
  readonly radius: number;
}

function overlapsTrunk(x: number, z: number, groups: readonly TrunkGroup[], playerRadius: number): boolean {
  return groups.some(({ placements, radius }) => placements.some((tree) => {
    const collisionRadius = playerRadius + radius * tree.scale;
    return (x - tree.x) ** 2 + (z - tree.z) ** 2 < collisionRadius ** 2;
  }));
}

/**
 * Resolves horizontal player movement against tree trunks. Resolving each axis
 * independently lets the player slide around a trunk instead of sticking to it;
 * crowns are intentionally ignored so walking beneath foliage remains possible.
 */
export function resolveTreeTrunkMovement(
  seed: number | string,
  from: TransformComponent,
  to: TransformComponent,
  playerRadius = PLAYER_COLLISION_RADIUS,
): TransformComponent {
  const chunks = chunksBetween(from, to, playerRadius + LEAF_TREE_TRUNK_RADIUS * 1.18);
  const trunks: TrunkGroup[] = [
    { placements: chunks.flatMap((coordinate) => generateTrees(seed, coordinate)), radius: TREE_TRUNK_RADIUS },
    {
      placements: chunks.flatMap((coordinate) => generateVegetation(seed, coordinate).leafTrees),
      radius: LEAF_TREE_TRUNK_RADIUS,
    },
  ];
  const x = overlapsTrunk(to.x, from.z, trunks, playerRadius) ? from.x : to.x;
  const z = overlapsTrunk(x, to.z, trunks, playerRadius) ? from.z : to.z;
  return { ...to, x, z };
}
