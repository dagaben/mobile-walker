export type CameraOrientationMode = "north-locked" | "follow-movement";
export type FollowResponsiveness = "slow" | "normal" | "fast";

export const CAMERA_ORIENTATION_STORAGE_KEY = "mobile-walker:camera-orientation";
export const FOLLOW_RESPONSIVENESS_STORAGE_KEY = "mobile-walker:follow-responsiveness";
export const FOLLOW_MOVEMENT_DEAD_ZONE = 0.25;
export const FOLLOW_MOVEMENT_INTENT_DELAY_SECONDS = 0.15;
export const FOLLOW_DIRECTION_FILTER_RESPONSE = 10;
export const FOLLOW_FRONT_DEAD_ZONE_RADIANS = Math.PI * 8 / 180;
export const FOLLOW_PEAK_ANGLE_RADIANS = Math.PI / 2;
export const FOLLOW_BACKPEDAL_START_RADIANS = Math.PI * 155 / 180;
export const FOLLOW_PEAK_SHAPED_ERROR_RADIANS = Math.PI * 76.5 / 180;
export const FOLLOW_RESPONSE_DAMPING: Readonly<Record<FollowResponsiveness, number>> = {
  // Keep each step modest so normal and fast retain slow's controlled feel while
  // still providing a perceptible increase in rotation speed.
  slow: 1.25,
  normal: 1.5,
  fast: 1.8,
};

export function isCameraOrientationMode(value: unknown): value is CameraOrientationMode {
  return value === "north-locked" || value === "follow-movement";
}

export function isFollowResponsiveness(value: unknown): value is FollowResponsiveness {
  return value === "slow" || value === "normal" || value === "fast";
}

export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  return ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

export function shortestAngleDifference(from: number, to: number): number {
  return normalizeAngle(to - from);
}

/** Shapes any heading error into the triangular follow-camera turn demand. */
export function shapeFollowAngularError(angleRadians: number): number {
  if (!Number.isFinite(angleRadians)) return 0;
  const angle = Math.abs(normalizeAngle(angleRadians));
  if (angle <= FOLLOW_FRONT_DEAD_ZONE_RADIANS || angle >= FOLLOW_BACKPEDAL_START_RADIANS) return 0;
  if (angle <= FOLLOW_PEAK_ANGLE_RADIANS) {
    return FOLLOW_PEAK_SHAPED_ERROR_RADIANS
      * (angle - FOLLOW_FRONT_DEAD_ZONE_RADIANS)
      / (FOLLOW_PEAK_ANGLE_RADIANS - FOLLOW_FRONT_DEAD_ZONE_RADIANS);
  }
  return FOLLOW_PEAK_SHAPED_ERROR_RADIANS
    * (FOLLOW_BACKPEDAL_START_RADIANS - angle)
    / (FOLLOW_BACKPEDAL_START_RADIANS - FOLLOW_PEAK_ANGLE_RADIANS);
}

/** Maps joystick travel beyond the dead zone to a smooth camera-turn strength. */
export function followMovementStrength(magnitude: number): number {
  return Math.min(1, Math.max(0,
    (magnitude - FOLLOW_MOVEMENT_DEAD_ZONE) / (1 - FOLLOW_MOVEMENT_DEAD_ZONE),
  ));
}

export function dampAngle(from: number, to: number, response: number, deltaSeconds: number): number {
  if (deltaSeconds <= 0) return normalizeAngle(to);
  const amount = 1 - Math.exp(-Math.max(0, response) * deltaSeconds);
  return normalizeAngle(from + shortestAngleDifference(from, to) * amount);
}
