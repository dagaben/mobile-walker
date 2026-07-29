import { describe, expect, it } from "vitest";

import { integrateMovement, normalizeInput } from "./movement";

describe("normalizeInput", () => {
  it("normalizes diagonal input to unit magnitude", () => {
    const input = normalizeInput(1, 1);

    expect(Math.hypot(input.x, input.z)).toBeCloseTo(1);
    expect(input.x).toBeCloseTo(Math.SQRT1_2);
    expect(input.z).toBeCloseTo(Math.SQRT1_2);
  });

  it("preserves analog input below unit magnitude", () => {
    expect(normalizeInput(0.3, -0.4)).toEqual({ x: 0.3, z: -0.4 });
  });
});

describe("integrateMovement", () => {
  it("preserves yaw while input is inactive", () => {
    const velocity = { x: 9, y: 9, z: 9 };
    const result = integrateMovement(
      { x: 1, y: 2, z: 3, yaw: 1.25 },
      { moveX: 0, moveZ: 0, active: false, jump: false },
      velocity,
      0.5,
    );

    expect(result.yaw).toBe(1.25);
  });

  it("updates velocity from the current controls", () => {
    const velocity = { x: 0, y: 5, z: 0 };

    integrateMovement(
      { x: 0, y: 0, z: 0, yaw: 0 },
      { moveX: 0.25, moveZ: -0.5, active: true, jump: false },
      velocity,
      0.1,
      8,
    );

    expect(velocity).toEqual({ x: 2, y: -1.4000000000000001, z: -4 });
  });

  it("moves the same distance over equal time at different frame rates", () => {
    const control = { moveX: 0.6, moveZ: 0.8, active: true, jump: false };
    const simulate = (steps: number) => {
      let transform = { x: 0, y: 2, z: 0, yaw: 0 };
      const velocity = { x: 0, y: 0, z: 0 };
      for (let step = 0; step < steps; step += 1) {
        transform = integrateMovement(transform, control, velocity, 1 / steps);
      }
      return transform;
    };

    const atThirtyFps = simulate(30);
    const atOneHundredTwentyFps = simulate(120);
    expect(atThirtyFps.x).toBeCloseTo(atOneHundredTwentyFps.x);
    expect(atThirtyFps.z).toBeCloseTo(atOneHundredTwentyFps.z);
    expect(Math.hypot(atThirtyFps.x, atThirtyFps.z)).toBeCloseTo(4);
  });

  it("launches a grounded player and applies gravity in the air", () => {
    const velocity = { x: 0, y: 0, z: 0 };
    const launched = integrateMovement(
      { x: 0, y: 1, z: 0, yaw: 0 },
      { moveX: 0, moveZ: 0, active: false, jump: true },
      velocity,
      0.1,
    );
    expect(launched.y).toBeGreaterThan(1);
    const upwardVelocity = velocity.y;

    integrateMovement(launched, { moveX: 0, moveZ: 0, active: false, jump: false }, velocity, 0.1, 4, false);
    expect(velocity.y).toBeLessThan(upwardVelocity);
  });
});
