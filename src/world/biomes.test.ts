import { describe, expect, it } from "vitest";

import { CHUNK_SIZE } from "./chunkCoordinates";
import { BIOMES, sampleBiome } from "./biomes";

describe("biome sampling", () => {
  it("is deterministic", () => {
    expect(sampleBiome("climate", 123.5, -87.25)).toEqual(sampleBiome("climate", 123.5, -87.25));
  });

  it("varies across distant world coordinates", () => {
    const samples = [
      sampleBiome(91, -2048, -2048),
      sampleBiome(91, 2048, -2048),
      sampleBiome(91, -2048, 2048),
      sampleBiome(91, 2048, 2048),
    ];
    expect(new Set(samples.map(({ dominant }) => dominant)).size).toBeGreaterThan(1);
    expect(new Set(samples.map(({ moisture }) => moisture)).size).toBe(samples.length);
  });

  it.each([-CHUNK_SIZE, 0, CHUNK_SIZE])("is continuous around the x=%s chunk boundary", (x) => {
    const epsilon = 1e-6;
    const left = sampleBiome("boundary", x - epsilon, -35.75);
    const right = sampleBiome("boundary", x + epsilon, -35.75);
    expect(left.moisture).toBeCloseTo(right.moisture, 6);
    expect(left.ruggedness).toBeCloseTo(right.ruggedness, 6);
    for (const id of Object.keys(BIOMES) as (keyof typeof BIOMES)[]) {
      expect(left.weights[id]).toBeCloseTo(right.weights[id], 6);
    }
  });

  it("is continuous across negative x and z coordinates", () => {
    const epsilon = 1e-6;
    const before = sampleBiome(17, -CHUNK_SIZE - epsilon, -2 * CHUNK_SIZE - epsilon);
    const after = sampleBiome(17, -CHUNK_SIZE + epsilon, -2 * CHUNK_SIZE + epsilon);
    expect(before.moisture).toBeCloseTo(after.moisture, 6);
    expect(before.ruggedness).toBeCloseTo(after.ruggedness, 6);
  });

  it("returns finite, normalized blend weights and selects their maximum", () => {
    const sample = sampleBiome("weights", -731.2, 419.8);
    const weights = Object.values(sample.weights);
    expect(weights).toHaveLength(Object.keys(BIOMES).length);
    expect(weights.every((weight) => Number.isFinite(weight) && weight >= 0 && weight <= 1)).toBe(true);
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
    expect(sample.weights[sample.dominant]).toBe(Math.max(...weights));
  });
});
