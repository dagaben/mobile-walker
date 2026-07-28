import { describe, expect, it } from "vitest";

import { interpolateTransform } from "./interpolation";

describe("interpolateTransform", () => {
  const previous = { x: -2, y: 4, z: 8, yaw: 0 };
  const current = { x: 6, y: 0, z: -4, yaw: Math.PI / 2 };

  it("interpolates each position component", () => {
    expect(interpolateTransform(previous, current, 0.25)).toMatchObject({ x: 0, y: 3, z: 5 });
  });

  it("clamps alpha to the inclusive zero-to-one range", () => {
    expect(interpolateTransform(previous, current, -2)).toEqual(previous);
    expect(interpolateTransform(previous, current, 3)).toEqual(current);
  });

  it("takes the shortest yaw path across the -pi/pi boundary", () => {
    const result = interpolateTransform(
      { x: 0, y: 0, z: 0, yaw: Math.PI - 0.2 },
      { x: 0, y: 0, z: 0, yaw: -Math.PI + 0.2 },
      0.5,
    );

    expect(result.yaw).toBeCloseTo(Math.PI);
  });
});
