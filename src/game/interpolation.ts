import type { TransformComponent } from "../ecs/Entity";

export function interpolateTransform(
  previous: TransformComponent,
  current: TransformComponent,
  alpha: number,
): TransformComponent {
  const t = Math.max(0, Math.min(1, alpha));
  let yawDelta = (current.yaw - previous.yaw) % (Math.PI * 2);
  if (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
  if (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
  return {
    x: previous.x + (current.x - previous.x) * t,
    y: previous.y + (current.y - previous.y) * t,
    z: previous.z + (current.z - previous.z) * t,
    yaw: previous.yaw + yawDelta * t,
  };
}
