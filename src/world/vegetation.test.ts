import { describe, expect, it } from "vitest";

import { sampleBiome } from "./biomes";
import { CHUNK_SIZE } from "./chunkCoordinates";
import { generateTrees } from "./forest";
import { isRiverAt, mountainSnowCoverage, sampleTerrainHeight } from "./terrainSampling";
import { generateVegetation } from "./vegetation";

describe("biome vegetation", () => {
  it("creates a dense carpet of flowers in the most meadow-like nearby chunk", () => {
    const seed = "summer-meadows";
    const coordinates = Array.from({ length: 121 }, (_, index) => ({
      x: index % 11 - 5,
      z: Math.floor(index / 11) - 5,
    }));
    const meadow = coordinates.reduce((best, coordinate) => {
      const plains = sampleBiome(seed,
        (coordinate.x + 0.5) * CHUNK_SIZE,
        (coordinate.z + 0.5) * CHUNK_SIZE).weights.plains;
      return plains > best.plains ? { coordinate, plains } : best;
    }, { coordinate: coordinates[0]!, plains: -1 });
    const vegetation = generateVegetation(seed, meadow.coordinate);

    expect(meadow.plains).toBeGreaterThan(0.5);
    expect(vegetation.flowers.length).toBeGreaterThan(100);
    expect(vegetation.flowers.length).toBeGreaterThan(vegetation.leafTrees.length * 8);
    expect(vegetation.bushes.length).toBeLessThan(vegetation.leafTrees.length);
  });

  it("uses only broadleaf trees throughout plains", () => {
    const seed = "summer-meadows";
    const coordinates = Array.from({ length: 121 }, (_, index) => ({
      x: index % 11 - 5,
      z: Math.floor(index / 11) - 5,
    }));
    const conifers = coordinates.flatMap((coordinate) => generateTrees(seed, coordinate));

    expect(conifers.length).toBeGreaterThan(0);
    expect(conifers.every((tree) => sampleBiome(seed, tree.x, tree.z).dominant !== "plains")).toBe(true);
  });

  it("places every plant on the terrain and outside water", () => {
    const seed = "grounded-garden";
    const vegetation = generateVegetation(seed, { x: 0, z: 0 });
    const all = [...vegetation.leafTrees, ...vegetation.bushes, ...vegetation.flowers];

    expect(all.length).toBeGreaterThan(0);
    for (const plant of all) {
      expect(plant.y).toBe(sampleTerrainHeight(seed, plant.x, plant.z));
      expect(isRiverAt(seed, plant.x, plant.z)).toBe(false);
    }
  });

  it("limits mountain rock to bushes and pines and clears all plants from snow", () => {
    const seed = "snow-capped-mountains";
    const coordinates = Array.from({ length: 41 * 41 }, (_, index) => ({
      x: index % 41 - 20,
      z: Math.floor(index / 41) - 20,
    }));
    const mountain = coordinates.find((coordinate) => sampleBiome(
      seed,
      (coordinate.x + 0.5) * CHUNK_SIZE,
      (coordinate.z + 0.5) * CHUNK_SIZE,
    ).dominant === "mountain");

    expect(mountain).toBeDefined();
    const vegetation = generateVegetation(seed, mountain!);
    const all = [...vegetation.leafTrees, ...vegetation.bushes, ...vegetation.flowers];
    expect(all.every((plant) => mountainSnowCoverage(
      plant.y,
      sampleBiome(seed, plant.x, plant.z).weights,
    ) < 1)).toBe(true);
    expect(vegetation.leafTrees.every((plant) =>
      sampleBiome(seed, plant.x, plant.z).dominant !== "mountain")).toBe(true);
    expect(vegetation.flowers.every((plant) =>
      sampleBiome(seed, plant.x, plant.z).dominant !== "mountain")).toBe(true);
  });
});
