import type { PlayerControlComponent, TransformComponent, VelocityComponent } from "../ecs/Entity";
import type { TreePlacement } from "../world/forest";

export const PLAYER_SPEED = 4;
export const JUMP_SPEED = 5.5;
export const GRAVITY = 14;
export const PLAYER_COLLISION_RADIUS = 0.38;
export const TREE_TRUNK_BASE_RADIUS = 0.16;

export function normalizeInput(x: number, z: number): { x: number; z: number } {
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z };
  return { x: x / length, z: z / length };
}

/** Pure movement boundary, suitable for unit tests without a DOM or Three.js. */
export function integrateMovement(
  transform: TransformComponent,
  control: PlayerControlComponent,
  velocity: VelocityComponent,
  deltaSeconds: number,
  speed = PLAYER_SPEED,
  grounded = true,
): TransformComponent {
  velocity.x = control.moveX * speed;
  if (grounded) velocity.y = control.jump ? JUMP_SPEED : 0;
  velocity.y -= GRAVITY * deltaSeconds;
  velocity.z = control.moveZ * speed;
  return {
    x: transform.x + velocity.x * deltaSeconds,
    y: transform.y + velocity.y * deltaSeconds,
    z: transform.z + velocity.z * deltaSeconds,
    yaw: control.active ? Math.atan2(control.moveX, control.moveZ) : transform.yaw,
  };
}

/** Pushes a player out of tree trunks; foliage deliberately has no collider. */
export function resolveTreeTrunkCollisions(
  x: number,
  z: number,
  trees: readonly TreePlacement[],
  playerRadius = PLAYER_COLLISION_RADIUS,
): { x: number; z: number } {
  let resolvedX = x;
  let resolvedZ = z;

  // A few passes handle the uncommon case where neighboring trunk colliders overlap.
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const tree of trees) {
      const minimumDistance = playerRadius + TREE_TRUNK_BASE_RADIUS * tree.scale;
      const dx = resolvedX - tree.x;
      const dz = resolvedZ - tree.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= minimumDistance) continue;

      // Deterministic fallback for a player positioned exactly at a trunk center.
      const normalX = distance > 1e-8 ? dx / distance : 1;
      const normalZ = distance > 1e-8 ? dz / distance : 0;
      resolvedX = tree.x + normalX * minimumDistance;
      resolvedZ = tree.z + normalZ * minimumDistance;
      changed = true;
    }
    if (!changed) break;
  }
  return { x: resolvedX, z: resolvedZ };
}
