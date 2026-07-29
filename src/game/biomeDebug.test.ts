import { describe, expect, it } from "vitest";

import { BIOME_IDS, sampleBiome } from "../world/biomes";
import { findNearestBiomes } from "./biomeDebug";

describe("findNearestBiomes", () => {
  it("finds a matching nearby region for every generated biome", () => {
    const result = findNearestBiomes("mobile-walker-v1", 0, 0);

    expect([...result.keys()].sort()).toEqual([...BIOME_IDS].sort());
    for (const [id, direction] of result) {
      expect(sampleBiome("mobile-walker-v1", direction.x, direction.z).dominant).toBe(id);
      expect(direction.distance).toBeLessThanOrEqual(256);
    }
  });

  it("reports the player's biome at zero distance", () => {
    const result = findNearestBiomes(42, 12, -7);
    const current = sampleBiome(42, 12, -7).dominant;

    expect(result.get(current)).toMatchObject({ x: 12, z: -7, distance: 0 });
  });
});
