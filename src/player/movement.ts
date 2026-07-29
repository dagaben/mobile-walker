import type { PlayerControlComponent, TransformComponent, VelocityComponent } from "../ecs/Entity";

export const PLAYER_SPEED = 4;
export const JUMP_SPEED = 5.5;
export const GRAVITY = 14;

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
