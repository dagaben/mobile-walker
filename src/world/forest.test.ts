import { describe, expect, it } from "vitest";

import { CHUNK_SIZE } from "./chunkCoordinates";
import { sampleBiomeWeights } from "./biomes";
import { generateTrees, sampleForestDensity, treeChance } from "./forest";
import { normalizeSeed } from "./random";
import { isRiverAt, sampleTerrainHeight } from "./terrainSampling";

describe("forest generation", () => {
  it("is deterministic and keeps trees inside their owning chunk", () => {
    const coordinate = { x: -2, z: 3 };
    const trees = generateTrees("pine-country", coordinate);
    expect(trees).toEqual(generateTrees("pine-country", coordinate));
    for (const tree of trees) {
      expect(tree.x).toBeGreaterThanOrEqual(coordinate.x * CHUNK_SIZE);
      expect(tree.x).toBeLessThan((coordinate.x + 1) * CHUNK_SIZE);
      expect(tree.z).toBeGreaterThanOrEqual(coordinate.z * CHUNK_SIZE);
      expect(tree.z).toBeLessThan((coordinate.z + 1) * CHUNK_SIZE);
      expect(tree.y).toBe(sampleTerrainHeight("pine-country", tree.x, tree.z));
      expect(isRiverAt("pine-country", tree.x, tree.z)).toBe(false);
    }
  });

  it("creates broad meadow, sparse, and dense regions", () => {
    const seed = normalizeSeed("forest-biomes");
    const densities: number[] = [];
    const counts: number[] = [];
    for (let z = -6; z <= 6; z += 1) for (let x = -6; x <= 6; x += 1) {
      densities.push(sampleForestDensity(seed, (x + 0.5) * CHUNK_SIZE, (z + 0.5) * CHUNK_SIZE));
      counts.push(generateTrees(seed, { x, z }).length);
    }

    expect(Math.min(...densities)).toBeLessThan(0.2);
    expect(Math.max(...densities)).toBeGreaterThan(0.8);
    expect(Math.min(...counts)).toBeLessThanOrEqual(2);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(25);
  });

  it("gives biome blends distinct tree density and scale ranges", () => {
    const density = 0.7;
    const meadow = { meadow: 1, forest: 0, highland: 0 };
    const forest = { meadow: 0, forest: 1, highland: 0 };
    const highland = { meadow: 0, forest: 0, highland: 1 };

    expect(treeChance(density, forest)).toBeGreaterThan(treeChance(density, highland));
    expect(treeChance(density, highland)).toBeGreaterThan(treeChance(density, meadow));

    const seed = normalizeSeed("biome-scale-ranges");
    const forestScales: number[] = [];
    const meadowScales: number[] = [];
    const highlandScales: number[] = [];
    for (let z = -12; z <= 12; z += 1) for (let x = -12; x <= 12; x += 1) {
      for (const tree of generateTrees(seed, { x, z })) {
        const weights = sampleBiomeWeights(seed, tree.x, tree.z);
        if (weights.forest > 0.65) forestScales.push(tree.scale);
        if (weights.meadow > 0.65) meadowScales.push(tree.scale);
        if (weights.highland > 0.65) highlandScales.push(tree.scale);
      }
    }
    expect(forestScales.length).toBeGreaterThan(0);
    expect(meadowScales.length).toBeGreaterThan(0);
    expect(highlandScales.length).toBeGreaterThan(0);
    const average = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(average(forestScales)).toBeGreaterThan(average(meadowScales));
    expect(average(forestScales)).toBeGreaterThan(average(highlandScales));
  });
});
