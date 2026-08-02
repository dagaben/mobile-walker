import type { TransformComponent } from "../ecs/Entity";
import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { chunkId } from "./chunkId";
import { generateVegetationKind, VEGETATION_PROFILES, type VegetationKind, type VegetationPlacement } from "./vegetation";
import type { GeneratedChunkRepository } from "./GeneratedChunkRepository";

export const PLAYER_COLLISION_RADIUS = 0.38;
export const TREE_TRUNK_TANGENTIAL_RETENTION = 0.95;
export const TREE_TRUNK_MAX_COLLISION_ITERATIONS = 5;
export const TREE_TRUNK_SEPARATION_EPSILON = 1e-5;

interface CircularCollider {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

const MINIMUM_DISPLACEMENT_SQUARED = 1e-12;

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
 * Sweeps a point through expanded circular colliders. Penetrations are corrected
 * first, then each contact rejects inward movement while retaining 95% of its
 * tangent. The bounded iteration count permits curved and multi-trunk sliding.
 */
export function resolveSweptCircularMovement(
  fromX: number,
  fromZ: number,
  displacementX: number,
  displacementZ: number,
  colliders: readonly CircularCollider[],
): Readonly<{ x: number; z: number }> {
  let x = fromX;
  let z = fromZ;
  let remainingX = displacementX;
  let remainingZ = displacementZ;

  // Old saves and newly activated chunks can begin inside a collider. Resolve
  // overlapping circles one at a time in stable placement order.
  for (let iteration = 0; iteration < TREE_TRUNK_MAX_COLLISION_ITERATIONS; iteration += 1) {
    let overlap: CircularCollider | undefined;
    for (const collider of colliders) {
      const dx = x - collider.x;
      const dz = z - collider.z;
      if (dx * dx + dz * dz < collider.radius * collider.radius) {
        overlap = collider;
        break;
      }
    }
    if (!overlap) break;
    let normalX = x - overlap.x;
    let normalZ = z - overlap.z;
    const normalLength = Math.hypot(normalX, normalZ);
    if (normalLength > 0) {
      normalX /= normalLength;
      normalZ /= normalLength;
    } else {
      const movementLength = Math.hypot(remainingX, remainingZ);
      if (movementLength > 0) {
        normalX = -remainingX / movementLength;
        normalZ = -remainingZ / movementLength;
      } else {
        normalX = 1;
        normalZ = 0;
      }
    }
    const correctedRadius = overlap.radius + TREE_TRUNK_SEPARATION_EPSILON;
    x = overlap.x + normalX * correctedRadius;
    z = overlap.z + normalZ * correctedRadius;
  }

  for (let iteration = 0; iteration < TREE_TRUNK_MAX_COLLISION_ITERATIONS; iteration += 1) {
    const movementSquared = remainingX * remainingX + remainingZ * remainingZ;
    if (movementSquared <= MINIMUM_DISPLACEMENT_SQUARED) break;

    let earliestTime = Number.POSITIVE_INFINITY;
    let hit: CircularCollider | undefined;
    for (const collider of colliders) {
      const offsetX = x - collider.x;
      const offsetZ = z - collider.z;
      const b = 2 * (offsetX * remainingX + offsetZ * remainingZ);
      if (b >= 0) continue; // Moving parallel to or away from this trunk.
      const c = offsetX * offsetX + offsetZ * offsetZ - collider.radius * collider.radius;
      const discriminant = b * b - 4 * movementSquared * c;
      if (discriminant < 0) continue;
      const time = (-b - Math.sqrt(discriminant)) / (2 * movementSquared);
      if (time >= 0 && time <= 1 && time < earliestTime) {
        earliestTime = time;
        hit = collider;
      }
    }

    if (!hit) {
      x += remainingX;
      z += remainingZ;
      break;
    }

    x += remainingX * earliestTime;
    z += remainingZ * earliestTime;
    let normalX = x - hit.x;
    let normalZ = z - hit.z;
    const normalLength = Math.hypot(normalX, normalZ);
    if (normalLength > 0) {
      normalX /= normalLength;
      normalZ /= normalLength;
    } else {
      const movementLength = Math.sqrt(movementSquared);
      normalX = -remainingX / movementLength;
      normalZ = -remainingZ / movementLength;
    }
    x += normalX * TREE_TRUNK_SEPARATION_EPSILON;
    z += normalZ * TREE_TRUNK_SEPARATION_EPSILON;

    remainingX *= 1 - earliestTime;
    remainingZ *= 1 - earliestTime;
    const inwardComponent = remainingX * normalX + remainingZ * normalZ;
    if (inwardComponent < 0) {
      remainingX -= normalX * inwardComponent;
      remainingZ -= normalZ * inwardComponent;
    }
    remainingX *= TREE_TRUNK_TANGENTIAL_RETENTION;
    remainingZ *= TREE_TRUNK_TANGENTIAL_RETENTION;
  }
  return { x, z };
}

/**
 * Resolves horizontal player movement with swept circular trunk collision.
 * Rendered crowns are intentionally absent, so foliage remains non-collidable.
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
  const colliders: CircularCollider[] = [];
  for (const group of trunks) {
    for (const tree of group.placements) {
      colliders.push({ x: tree.x, z: tree.z, radius: playerRadius + group.radius * tree.scale });
    }
  }
  const resolved = resolveSweptCircularMovement(from.x, from.z, to.x - from.x, to.z - from.z, colliders);
  return { ...to, ...resolved };
}
