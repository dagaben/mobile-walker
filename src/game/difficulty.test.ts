import { describe, expect, it } from "vitest";

import {
  getDifficulty,
  getGarlicDensityPerChunk,
  getNightLengthSeconds,
  getPlayerSpeedMultiplier,
  getSuperGarlicChance,
  normalizeNight,
  BASE_NIGHT_LENGTH,
  BASE_COLLECTIBLES_PER_CHUNK,
} from "./difficulty";

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
    expect(n1.maxBosses).toBe(1);
    expect(n2.maxBosses).toBe(2);
  });

  it("night 3 spawns ~15% faster", () => {
    const n3 = getDifficulty(3);
    expect(n3.spawnInterval).toBeCloseTo(6.5 * 0.85);
    expect(n3.maxBosses).toBe(4);
  });

  it("night 4 raises max ducks and petrify cost", () => {
    const n4 = getDifficulty(4);
    expect(n4.maxDucks).toBe(9);
    expect(n4.petrifyCost).toBe(12);
    expect(n4.maxBosses).toBe(8);
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
    expect(n6.bossPetrifyCost).toBe(30);
    expect(n6.bossScale).toBe(3);
  });
});

describe("getNightLengthSeconds", () => {
  it("base nights 1–2 use base length", () => {
    expect(getNightLengthSeconds(1)).toBeCloseTo(BASE_NIGHT_LENGTH);
    expect(getNightLengthSeconds(2)).toBeCloseTo(BASE_NIGHT_LENGTH);
  });

  it("from night 3 compounds +15% per night", () => {
    expect(getNightLengthSeconds(3)).toBeCloseTo(BASE_NIGHT_LENGTH * 1.15);
    expect(getNightLengthSeconds(4)).toBeCloseTo(BASE_NIGHT_LENGTH * 1.15 * 1.15);
  });

  it("adds +10% per 300 lifetime garlic", () => {
    expect(getNightLengthSeconds(1, 300)).toBeCloseTo(BASE_NIGHT_LENGTH * 1.1);
    expect(getNightLengthSeconds(1, 600)).toBeCloseTo(BASE_NIGHT_LENGTH * 1.1 * 1.1);
  });
});

describe("getPlayerSpeedMultiplier", () => {
  it("is 1 with no garlic", () => {
    expect(getPlayerSpeedMultiplier(0)).toBeCloseTo(1);
  });

  it("applies −5% per 400 and −10% per 500", () => {
    expect(getPlayerSpeedMultiplier(400)).toBeCloseTo(0.95);
    expect(getPlayerSpeedMultiplier(500)).toBeCloseTo(0.95 * 0.9);
    expect(getPlayerSpeedMultiplier(800)).toBeCloseTo(0.9 * 0.9);
  });

  it("never drops below floor", () => {
    expect(getPlayerSpeedMultiplier(50_000)).toBeGreaterThanOrEqual(0.35);
  });
});

describe("garlic density scaling", () => {
  it("reduces density ~5% per night", () => {
    expect(getGarlicDensityPerChunk(1)).toBeCloseTo(BASE_COLLECTIBLES_PER_CHUNK);
    expect(getGarlicDensityPerChunk(2)).toBeCloseTo(BASE_COLLECTIBLES_PER_CHUNK * 0.95);
  });

  it("reduces super chance ~10% per night", () => {
    expect(getSuperGarlicChance(1)).toBeCloseTo(0.1);
    expect(getSuperGarlicChance(2)).toBeCloseTo(0.09);
  });
});
