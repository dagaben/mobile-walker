import { describe, expect, it } from "vitest";
import {
  FOLLOW_RESPONSE_DAMPING, FOLLOW_TURN_RESPONSE_MULTIPLIERS,
  followMovementStrength, isCameraOrientationMode, isFollowResponsiveness,
  shortestAngleDifference, dampAngle,
} from "./cameraOrientation";

describe("camera orientation settings", () => {
  it("accepts only stable persisted orientation values", () => {
    expect(isCameraOrientationMode("north-locked")).toBe(true);
    expect(isCameraOrientationMode("follow-movement")).toBe(true);
    expect(isCameraOrientationMode("sideways")).toBe(false);
    expect(isCameraOrientationMode(null)).toBe(false);
  });

  it("accepts only stable persisted responsiveness values", () => {
    expect(["slow", "normal", "fast"].every(isFollowResponsiveness)).toBe(true);
    expect(isFollowResponsiveness("instant")).toBe(false);
  });

  it("maps responsiveness choices in increasing order", () => {
    expect(FOLLOW_RESPONSE_DAMPING.slow).toBeLessThan(FOLLOW_RESPONSE_DAMPING.normal);
    expect(FOLLOW_RESPONSE_DAMPING.normal).toBeLessThan(FOLLOW_RESPONSE_DAMPING.fast);
  });

  it("makes slow turning substantially gentler than normal turning", () => {
    const dt = 1 / 60;
    const target = Math.PI / 2;
    const slowStep = dampAngle(0, target, FOLLOW_RESPONSE_DAMPING.slow, dt);
    const normalStep = dampAngle(0, target, FOLLOW_RESPONSE_DAMPING.normal, dt);
    expect(slowStep).toBeLessThan(normalStep * 0.3);
  });

  it("uses progressively stronger but reduced response multipliers for wider turns", () => {
    expect(FOLLOW_TURN_RESPONSE_MULTIPLIERS.small).toBe(0.65);
    expect(FOLLOW_TURN_RESPONSE_MULTIPLIERS.medium).toBe(0.85);
    expect(FOLLOW_TURN_RESPONSE_MULTIPLIERS.large).toBe(1.15);
    expect(FOLLOW_TURN_RESPONSE_MULTIPLIERS.small).toBeLessThan(FOLLOW_TURN_RESPONSE_MULTIPLIERS.medium);
    expect(FOLLOW_TURN_RESPONSE_MULTIPLIERS.medium).toBeLessThan(FOLLOW_TURN_RESPONSE_MULTIPLIERS.large);
  });

  it("ramps follow strength smoothly from the movement dead zone", () => {
    expect(followMovementStrength(0.2)).toBe(0);
    expect(followMovementStrength(0.25)).toBe(0);
    expect(followMovementStrength(0.5)).toBeCloseTo(1 / 3);
    expect(followMovementStrength(1)).toBe(1);
    expect(followMovementStrength(2)).toBe(1);
  });

  it("gives a large reversal a stronger bounded step than a small correction", () => {
    const dt = 1 / 60;
    const small = Math.abs(shortestAngleDifference(0, dampAngle(0, Math.PI / 6, FOLLOW_RESPONSE_DAMPING.normal * FOLLOW_TURN_RESPONSE_MULTIPLIERS.small, dt)));
    const reversal = Math.abs(shortestAngleDifference(0, dampAngle(0, Math.PI, FOLLOW_RESPONSE_DAMPING.normal * FOLLOW_TURN_RESPONSE_MULTIPLIERS.large, dt)));
    expect(reversal / Math.PI).toBeGreaterThan(small / (Math.PI / 6));
    expect(reversal).toBeLessThan(Math.PI);
  });
});
