import { describe, expect, it } from "vitest";

import { getDifficulty, normalizeNight } from "./difficulty";

describe("normalizeNight", () => {
  it("clamps invalid values to 1", () => {
    expect(normalizeNight(0)).toBe(1);
    expect(normalizeNight(-3)).toBe(1);
    expect(normalizeNight(Number.NaN)).toBe(1);
  });

  it("floors positive values", () => {
    expect(normalizeNight(3.9)).toBe(3);
  });
});

describe("getDifficulty ramp", () => {
  it("nights 1–2 stay at tutorial values", () => {
    const n1 = getDifficulty(1);
    const n2 = getDifficulty(2);
    expect(n1.spawnInterval).toBeCloseTo(6.5);
    expect(n1.maxDucks).toBe(8);
    expect(n1.duckSpeed).toBeCloseTo(5.2);
    expect(n1.petrifyCost).toBe(10);
    expect(n1.doubleSpawnChance).toBe(0);
    expect(n2.spawnInterval).toBeCloseTo(n1.spawnInterval);
    expect(n2.maxDucks).toBe(n1.maxDucks);
  });

  it("night 3 spawns ~15% faster", () => {
    const n3 = getDifficulty(3);
    expect(n3.spawnInterval).toBeCloseTo(6.5 * 0.85);
    expect(n3.petrifyCost).toBe(10);
    expect(n3.maxDucks).toBe(8);
  });

  it("night 4 raises max ducks and petrify cost", () => {
    const n4 = getDifficulty(4);
    expect(n4.maxDucks).toBe(9);
    expect(n4.petrifyCost).toBe(12);
  });

  it("night 5 raises duck speed and tightens spawns", () => {
    const n5 = getDifficulty(5);
    expect(n5.duckSpeed).toBeCloseTo(5.2 * 1.1);
    expect(n5.spawnInterval).toBeCloseTo(6.5 * 0.75);
    expect(n5.duckSpeed).toBeLessThan(13.05);
  });

  it("night 6+ enables double spawn and harder caps", () => {
    const n6 = getDifficulty(6);
    expect(n6.petrifyCost).toBe(15);
    expect(n6.maxDucks).toBeGreaterThanOrEqual(10);
    expect(n6.doubleSpawnChance).toBeGreaterThan(0);
    expect(n6.duckSpeed).toBeLessThan(13.05);
  });
});
