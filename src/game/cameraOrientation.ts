export type CameraOrientationMode = "north-locked" | "follow-movement";
export type FollowResponsiveness = "slow" | "normal" | "fast";

export const CAMERA_ORIENTATION_STORAGE_KEY = "mobile-walker:camera-orientation";
export const FOLLOW_RESPONSIVENESS_STORAGE_KEY = "mobile-walker:follow-responsiveness";
export const FOLLOW_MOVEMENT_DEAD_ZONE = 0.25;
export const FOLLOW_MOVEMENT_INTENT_DELAY_SECONDS = 0.15;
export const FOLLOW_DIRECTION_FILTER_RESPONSE = 10;
export const FOLLOW_NO_TURN_MAX_RADIANS = Math.PI * 8 / 180;
export const FOLLOW_SLOW_FRONT_MAX_RADIANS = Math.PI * 45 / 180;
export const FOLLOW_NORMAL_MAX_RADIANS = Math.PI * 100 / 180;
export const FOLLOW_FAST_MAX_RADIANS = Math.PI * 135 / 180;
export const FOLLOW_BACKPEDAL_START_RADIANS = Math.PI * 155 / 180;
export const FOLLOW_TURN_RESPONSE_MULTIPLIERS = {
  small: 0.65,
  medium: 0.85,
  large: 1.15,
} as const;
export type FollowTurnZone = "none" | "slow-front" | "normal" | "fast" | "slow-rear" | "backpedal";

/** Classifies an absolute shortest-path heading error in the range [0, PI]. */
export function classifyFollowTurnZone(angleRadians: number): FollowTurnZone {
  const angle = Math.min(Math.PI, Math.max(0, Math.abs(angleRadians)));
  if (angle < FOLLOW_NO_TURN_MAX_RADIANS) return "none";
  if (angle < FOLLOW_SLOW_FRONT_MAX_RADIANS) return "slow-front";
  if (angle < FOLLOW_NORMAL_MAX_RADIANS) return "normal";
  if (angle < FOLLOW_FAST_MAX_RADIANS) return "fast";
  if (angle < FOLLOW_BACKPEDAL_START_RADIANS) return "slow-rear";
  return "backpedal";
}

export function followTurnZoneMultiplier(zone: FollowTurnZone): number {
  if (zone === "slow-front" || zone === "slow-rear") return FOLLOW_TURN_RESPONSE_MULTIPLIERS.small;
  if (zone === "normal") return FOLLOW_TURN_RESPONSE_MULTIPLIERS.medium;
  if (zone === "fast") return FOLLOW_TURN_RESPONSE_MULTIPLIERS.large;
  return 0;
}
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
