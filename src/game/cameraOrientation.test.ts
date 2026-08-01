import { describe, expect, it } from "vitest";
import {
  FOLLOW_BACKPEDAL_START_RADIANS, FOLLOW_FRONT_DEAD_ZONE_RADIANS,
  FOLLOW_PEAK_ANGLE_RADIANS, FOLLOW_PEAK_SHAPED_ERROR_RADIANS,
  FOLLOW_RESPONSE_DAMPING, followMovementStrength, shapeFollowAngularError,
  isCameraOrientationMode, isFollowResponsiveness, dampAngle,
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

  it("keeps normal and fast turning fractionally quicker than slow turning", () => {
    const dt = 1 / 60;
    const target = Math.PI / 2;
    const slowStep = dampAngle(0, target, FOLLOW_RESPONSE_DAMPING.slow, dt);
    const normalStep = dampAngle(0, target, FOLLOW_RESPONSE_DAMPING.normal, dt);
    const fastStep = dampAngle(0, target, FOLLOW_RESPONSE_DAMPING.fast, dt);
    expect(normalStep / slowStep).toBeGreaterThan(1);
    expect(normalStep / slowStep).toBeLessThan(1.25);
    expect(fastStep / slowStep).toBeGreaterThan(1);
    expect(fastStep / slowStep).toBeLessThan(1.5);
  });

  it("ramps follow strength smoothly from the movement dead zone", () => {
    expect(followMovementStrength(0.2)).toBe(0);
    expect(followMovementStrength(0.25)).toBe(0);
    expect(followMovementStrength(0.5)).toBeCloseTo(1 / 3);
    expect(followMovementStrength(1)).toBe(1);
    expect(followMovementStrength(2)).toBe(1);
  });

});

describe("follow angular-error curve", () => {
  const radians = (degrees: number): number => degrees * Math.PI / 180;
  const expectedRise = (degrees: number): number => FOLLOW_PEAK_SHAPED_ERROR_RADIANS
    * (degrees - 8) / (90 - 8);
  const expectedFall = (degrees: number): number => FOLLOW_PEAK_SHAPED_ERROR_RADIANS
    * (155 - degrees) / (155 - 90);

  it.each([[0, 0], [7.999, 0], [8, 0], [49, expectedRise(49)],
    [90, FOLLOW_PEAK_SHAPED_ERROR_RADIANS], [122.5, expectedFall(122.5)],
    [155, 0], [180, 0]] as const)("shapes %s degrees to its interpolated value", (degrees, expected) => {
    expect(shapeFollowAngularError(radians(degrees))).toBeCloseTo(expected, 12);
  });

  it("is continuous immediately around every control point", () => {
    const epsilon = 1e-9;
    for (const point of [FOLLOW_FRONT_DEAD_ZONE_RADIANS, FOLLOW_PEAK_ANGLE_RADIANS,
      FOLLOW_BACKPEDAL_START_RADIANS]) {
      const atPoint = shapeFollowAngularError(point);
      expect(Math.abs(shapeFollowAngularError(point - epsilon) - atPoint)).toBeLessThan(2e-9);
      expect(Math.abs(shapeFollowAngularError(point + epsilon) - atPoint)).toBeLessThan(2e-9);
    }
  });

  it("is bounded over normalized and out-of-range finite inputs", () => {
    for (let degrees = -720; degrees <= 720; degrees += 0.25) {
      const shaped = shapeFollowAngularError(radians(degrees));
      expect(shaped).toBeGreaterThanOrEqual(0);
      expect(shaped).toBeLessThanOrEqual(FOLLOW_PEAK_SHAPED_ERROR_RADIANS);
    }
  });

  it("has equal magnitude for left and right errors", () => {
    for (const degrees of [10, 45, 90, 120, 150, 170]) {
      expect(shapeFollowAngularError(radians(degrees)))
        .toBeCloseTo(shapeFollowAngularError(radians(-degrees)), 12);
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "returns zero safely for non-finite input %s", (angle) => {
      expect(shapeFollowAngularError(angle)).toBe(0);
    },
  );
});
