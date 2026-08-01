export type CameraOrientationMode = "north-locked" | "follow-movement";
export type FollowResponsiveness = "slow" | "normal" | "fast";

export const CAMERA_ORIENTATION_STORAGE_KEY = "mobile-walker:camera-orientation";
export const FOLLOW_RESPONSIVENESS_STORAGE_KEY = "mobile-walker:follow-responsiveness";
export const FOLLOW_MOVEMENT_DEAD_ZONE = 0.25;
export const FOLLOW_MOVEMENT_INTENT_DELAY_SECONDS = 0.15;
export const FOLLOW_DIRECTION_FILTER_RESPONSE = 10;
export const FOLLOW_MEANINGFUL_HEADING_RADIANS = Math.PI / 22.5; // 8 degrees
export const FOLLOW_REVERSAL_RADIANS = Math.PI * 100 / 180;
export const FOLLOW_TURN_RESPONSE_MULTIPLIERS = {
  small: 0.65,
  medium: 0.85,
  large: 1.15,
} as const;
export const FOLLOW_RESPONSE_DAMPING: Readonly<Record<FollowResponsiveness, number>> = {
  // Keep the slow preset deliberately distinct from normal: it should feel like
  // a gradual camera pan rather than merely a softened version of the same turn.
  slow: 1.25,
  normal: 5.5,
  fast: 8.5,
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

export function dampAngle(from: number, to: number, response: number, deltaSeconds: number): number {
  if (deltaSeconds <= 0) return normalizeAngle(to);
  const amount = 1 - Math.exp(-Math.max(0, response) * deltaSeconds);
  return normalizeAngle(from + shortestAngleDifference(from, to) * amount);
}
