import { describe, expect, it } from "vitest";

import { sampleBiome } from "./biomes";
import { generateWetlandPools, sampleWetlandSpeedMultiplier, WETLAND_SPEED_MULTIPLIER } from "./wetlands";

function findWetlandPosition(seed: string): { x: number; z: number } {
  for (let z = -640; z <= 640; z += 8) for (let x = -640; x <= 640; x += 8) {
    if (sampleBiome(seed, x, z).weights.wetland > 0.65) return { x, z };
  }
  throw new Error("Expected the test seed to contain a wetland");
}

describe("wetlands", () => {
  it("slows movement continuously according to wetland biome weight", () => {
    const seed = "mud-speed";
    const position = findWetlandPosition(seed);
    const weight = sampleBiome(seed, position.x, position.z).weights.wetland;
    const multiplier = sampleWetlandSpeedMultiplier(seed, position.x, position.z);

    expect(multiplier).toBeCloseTo(1 - weight * (1 - WETLAND_SPEED_MULTIPLIER));
    expect(multiplier).toBeLessThan(0.71);
    expect(multiplier).toBeGreaterThanOrEqual(WETLAND_SPEED_MULTIPLIER);
  });

  it("generates deterministic clusters of small standing-water pools", () => {
    const seed = "standing-water";
    let populated: ReturnType<typeof generateWetlandPools> = [];
    for (let z = -20; z <= 20 && populated.length === 0; z += 1) for (let x = -20; x <= 20; x += 1) {
      const pools = generateWetlandPools(seed, { x, z });
      if (pools.length >= 4) populated = pools;
    }

    expect(populated.length).toBeGreaterThanOrEqual(4);
    expect(populated).toEqual(populated.length > 0
      ? generateWetlandPools(seed, {
          x: Math.floor(populated[0]!.x / 16),
          z: Math.floor(populated[0]!.z / 16),
        })
      : []);
    expect(populated.every((pool) => pool.radiusX < 1 && pool.radiusZ < 1)).toBe(true);
  });
});
