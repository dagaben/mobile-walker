import type { PlayerControlComponent, TransformComponent, VelocityComponent } from "../ecs/Entity";

export const PLAYER_SPEED = 4;

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
): TransformComponent {
  velocity.x = control.moveX * speed;
  velocity.y = 0;
  velocity.z = control.moveZ * speed;
  return {
    x: transform.x + velocity.x * deltaSeconds,
    y: transform.y,
    z: transform.z + velocity.z * deltaSeconds,
    yaw: control.active ? Math.atan2(control.moveX, control.moveZ) : transform.yaw,
  };
}
