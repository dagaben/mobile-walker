import { describe, expect, it } from "vitest";

import { sampleBiome } from "./biomes";
import { CHUNK_SIZE } from "./chunkCoordinates";
import { isRiverAt, sampleTerrainHeight } from "./terrainSampling";
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
});
