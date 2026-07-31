import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  BLOB_SHADOW_MAX_STRETCH,
  BLOB_SHADOW_MIN_STRETCH,
  blobShadowProjection,
  SunlightDirection,
} from "./sunlightDirection";

describe("directional blob-shadow projection", () => {
  it("reverses rotation and offset direction when horizontal sunlight reverses", () => {
    const first = blobShadowProjection(new THREE.Vector3(1, 1, -2));
    const reverse = blobShadowProjection(new THREE.Vector3(-1, 1, 2));

    expect(reverse.directionX).toBeCloseTo(-first.directionX);
    expect(reverse.directionZ).toBeCloseTo(-first.directionZ);
    expect(Math.abs(THREE.MathUtils.euclideanModulo(reverse.rotationY - first.rotationY, Math.PI * 2) - Math.PI))
      .toBeLessThan(1e-6);
  });

  it("lengthens toward the horizon without exceeding configured limits", () => {
    const high = blobShadowProjection(new THREE.Vector3(1, 8, 0));
    const low = blobShadowProjection(new THREE.Vector3(8, 1, 0));

    expect(low.stretch).toBeGreaterThan(high.stretch);
    expect(high.stretch).toBeGreaterThanOrEqual(BLOB_SHADOW_MIN_STRETCH);
    expect(low.stretch).toBeLessThanOrEqual(BLOB_SHADOW_MAX_STRETCH);
  });

  it("keeps a nearly overhead projection short, finite, and azimuth-stable", () => {
    const projection = blobShadowProjection(new THREE.Vector3(1e-12, 10, -1e-12), 0.73);

    expect(projection.stretch).toBeCloseTo(BLOB_SHADOW_MIN_STRETCH);
    expect(Object.values(projection).every(Number.isFinite)).toBe(true);
    expect(projection.rotationY).toBeCloseTo(0.73);
  });

  it("does not notify consumers repeatedly for an unchanged direction", () => {
    const sunlight = new SunlightDirection();
    const changed = vi.fn();
    sunlight.subscribe(changed);

    sunlight.set(new THREE.Vector3(-4, 8, 5));
    sunlight.set(new THREE.Vector3(-4, 8, 5));
    expect(changed).not.toHaveBeenCalled();
    sunlight.set(new THREE.Vector3(4, 8, -5));
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
