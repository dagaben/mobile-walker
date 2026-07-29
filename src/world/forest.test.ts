import { describe, expect, it } from "vitest";

import { CHUNK_SIZE } from "./chunkCoordinates";
import { generateTrees, sampleForestDensity } from "./forest";
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
});
