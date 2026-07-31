import type { TransformComponent } from "../ecs/Entity";
import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { chunkId } from "./chunkId";
import { generateVegetationKind, VEGETATION_PROFILES, type VegetationKind, type VegetationPlacement } from "./vegetation";
import type { GeneratedChunkRepository } from "./GeneratedChunkRepository";

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

interface TrunkGroup {
  readonly placements: readonly VegetationPlacement[];
  readonly radius: number;
}

type CachedTrunks = Readonly<Partial<Record<VegetationKind, readonly VegetationPlacement[]>>>;
const COLLIDABLE_KINDS = (Object.keys(VEGETATION_PROFILES) as VegetationKind[])
  .filter((kind) => VEGETATION_PROFILES[kind].collision !== undefined);

// Collision queries normally touch one to four chunks. Keep a modest LRU so
// nearby fixed updates are free while long walks and changing seeds stay bounded.
const MAX_CACHED_CHUNKS = 64;
const placementCache = new Map<string, CachedTrunks>();
let generatedChunkCount = 0;

function cacheKey(seed: number | string, coordinate: ChunkCoordinate): string {
  return JSON.stringify([typeof seed, seed, chunkId(coordinate)]);
}

function trunksForChunk(seed: number | string, coordinate: ChunkCoordinate, repository?: GeneratedChunkRepository): CachedTrunks {
  const shared = repository?.get(chunkId(coordinate));
  if (shared) return { pine: shared.pines, leafTree: shared.vegetation.leafTrees };
  const key = cacheKey(seed, coordinate);
  const cached = placementCache.get(key);
  if (cached) {
    // Reinsertion updates LRU order.
    placementCache.delete(key);
    placementCache.set(key, cached);
    return cached;
  }
  const generated = Object.fromEntries(COLLIDABLE_KINDS.map((kind) => [
    kind, generateVegetationKind(kind, seed, coordinate),
  ])) as CachedTrunks;
  generatedChunkCount += 1;
  placementCache.set(key, generated);
  while (placementCache.size > MAX_CACHED_CHUNKS) {
    placementCache.delete(placementCache.keys().next().value!);
  }
  return generated;
}

/** Test/diagnostic hook for observing placement reuse without exposing placements. */
export function treeCollisionCacheDiagnostics(): Readonly<{
  size: number;
  generatedChunkCount: number;
  keys: readonly string[];
}> {
  return { size: placementCache.size, generatedChunkCount, keys: [...placementCache.keys()] };
}

/** Clears cached collision placements, primarily to isolate deterministic tests. */
export function clearTreeCollisionCache(): void {
  placementCache.clear();
  generatedChunkCount = 0;
}

function overlapsTrunk(x: number, z: number, groups: readonly TrunkGroup[], playerRadius: number): boolean {
  return groups.some(({ placements, radius }) => placements.some((tree) => {
    const collisionRadius = playerRadius + radius * tree.scale;
    return (x - tree.x) ** 2 + (z - tree.z) ** 2 < collisionRadius ** 2;
  }));
}

/**
 * Pure stationary collision query against the same generated trunks used by
 * movement collision. A capsule is vertical, so only its horizontal radius is
 * relevant to the (vertical) trunk geometry.
 */
export function overlapsGeneratedTreeTrunk(
  seed: number | string,
  x: number,
  z: number,
  playerRadius = PLAYER_COLLISION_RADIUS,
): boolean {
  const maximumRadius = Math.max(...COLLIDABLE_KINDS.map(
    (kind) => VEGETATION_PROFILES[kind].collision!.radius,
  ));
  const point = { x, y: 0, z, yaw: 0 };
  const chunks = chunksBetween(point, point, playerRadius + maximumRadius * 1.18);
  const placements = chunks.map((coordinate) => trunksForChunk(seed, coordinate));
  const trunks: TrunkGroup[] = COLLIDABLE_KINDS.map((kind) => ({
    placements: placements.flatMap((byKind) => byKind[kind] ?? []),
    radius: VEGETATION_PROFILES[kind].collision!.radius,
  }));
  return overlapsTrunk(x, z, trunks, playerRadius);
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
  repository?: GeneratedChunkRepository,
): TransformComponent {
  const maximumRadius = Math.max(...COLLIDABLE_KINDS.map((kind) => VEGETATION_PROFILES[kind].collision!.radius));
  const chunks = chunksBetween(from, to, playerRadius + maximumRadius * 1.18);
  const placements = chunks.map((coordinate) => trunksForChunk(seed, coordinate, repository));
  const trunks: TrunkGroup[] = COLLIDABLE_KINDS.map((kind) => ({
    placements: placements.flatMap((byKind) => byKind[kind] ?? []),
    radius: VEGETATION_PROFILES[kind].collision!.radius,
  }));
  const x = overlapsTrunk(to.x, from.z, trunks, playerRadius) ? from.x : to.x;
  const z = overlapsTrunk(x, to.z, trunks, playerRadius) ? from.z : to.z;
  return { ...to, x, z };
}
