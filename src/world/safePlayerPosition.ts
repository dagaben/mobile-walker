import type { TransformComponent } from "../ecs/Entity";
import { sampleTerrain } from "./terrainSampling";
import { overlapsGeneratedTreeTrunk } from "./treeCollision";

export const DEFAULT_PLAYER_SPAWN: TransformComponent = { x: 0, y: 0.76, z: 0, yaw: 0 };

export type PlayerTrunkOverlapQuery = (x: number, z: number, playerRadius: number) => boolean;

function grounded(seed: number | string, transform: TransformComponent, heightOffset: number): TransformComponent {
  return { ...transform, y: sampleTerrain(seed, transform.x, transform.z).height + heightOffset };
}

function findNear(
  seed: number | string,
  origin: TransformComponent,
  heightOffset: number,
  collisionRadius: number,
  searchStep: number,
  maximumSearchRadius: number,
  overlapsTrunk: PlayerTrunkOverlapQuery,
): TransformComponent | undefined {
  const initial = grounded(seed, origin, heightOffset);
  if (!overlapsTrunk(initial.x, initial.z, collisionRadius)) return initial;

  // Start due east and proceed counter-clockwise for a stable candidate order.
  for (let radius = searchStep; radius <= maximumSearchRadius + Number.EPSILON; radius += searchStep) {
    const candidateCount = Math.max(1, Math.ceil(2 * Math.PI * radius / searchStep));
    for (let index = 0; index < candidateCount; index += 1) {
      const angle = index * 2 * Math.PI / candidateCount;
      const candidate = grounded(seed, {
        x: origin.x + Math.cos(angle) * radius,
        y: origin.y,
        z: origin.z + Math.sin(angle) * radius,
        yaw: origin.yaw,
      }, heightOffset);
      if (!overlapsTrunk(candidate.x, candidate.z, collisionRadius)) return candidate;
    }
  }
  return undefined;
}

/** Grounds and, when necessary, deterministically relocates a restored player. */
export function findSafeRestoredTransform(
  seed: number | string,
  saved: TransformComponent,
  heightOffset: number,
  collisionRadius: number,
  searchStep = 0.5,
  maximumSearchRadius = 5,
  overlapsTrunk: PlayerTrunkOverlapQuery = (x, z, radius) =>
    overlapsGeneratedTreeTrunk(seed, x, z, radius),
): TransformComponent {
  if (!Number.isFinite(searchStep) || !Number.isFinite(maximumSearchRadius)
    || searchStep <= 0 || maximumSearchRadius < 0) {
    throw new RangeError("Safe-position search distances must be finite and non-negative.");
  }
  const restored = findNear(
    seed, saved, heightOffset, collisionRadius, searchStep, maximumSearchRadius, overlapsTrunk,
  );
  if (restored) return restored;

  // Validate the authored spawn with the same bounded search. It is known safe
  // for the production seed; its grounded form is the bounded final fallback.
  const fallback = { ...DEFAULT_PLAYER_SPAWN, yaw: saved.yaw };
  return findNear(
    seed, fallback, heightOffset, collisionRadius, searchStep, maximumSearchRadius, overlapsTrunk,
  )
    ?? grounded(seed, fallback, heightOffset);
}
