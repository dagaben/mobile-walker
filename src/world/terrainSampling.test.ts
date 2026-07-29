import { describe, expect, it } from "vitest";

import { CHUNK_SIZE } from "./chunkCoordinates";
import { generateChunk } from "./generateChunk";
import {
  isRiverAt,
  RIVER_BED_DEPTH,
  sampleTerrain,
  sampleTerrainHeight,
} from "./terrainSampling";

describe("terrain sampling", () => {
  it("returns the exact generated lattice heights on both sides of a negative chunk boundary", () => {
    const seed = "boundary";
    const left = generateChunk(seed, { x: -1, z: -2 });
    const right = generateChunk(seed, { x: 0, z: -2 });
    const side = left.terrainVerticesPerSide;

    for (let z = 0; z < side; z += 1) {
      const worldZ = -2 * CHUNK_SIZE + z * CHUNK_SIZE / (side - 1);
      const sampled = sampleTerrainHeight(seed, 0, worldZ);
      expect(sampled).toBe(left.terrainHeights[z * side + side - 1]);
      expect(sampled).toBe(right.terrainHeights[z * side]);
    }
  });

  it("matches every generated vertex with the random-access height sampler", () => {
    const seed = "vertex-agreement";
    const coordinate = { x: -3, z: 2 };
    const chunk = generateChunk(seed, coordinate);
    const side = chunk.terrainVerticesPerSide;

    for (let z = 0; z < side; z += 1) for (let x = 0; x < side; x += 1) {
      const worldX = (coordinate.x + x / (side - 1)) * CHUNK_SIZE;
      const worldZ = (coordinate.z + z / (side - 1)) * CHUNK_SIZE;
      expect(chunk.terrainHeights[z * side + x])
        .toBe(sampleTerrainHeight(seed, worldX, worldZ));
    }
  });

  it.each([-CHUNK_SIZE, 0, CHUNK_SIZE])("is continuous around the x=%s chunk boundary", (boundaryX) => {
    const epsilon = 1e-7;
    const z = -5.375;
    expect(sampleTerrainHeight(73, boundaryX - epsilon, z))
      .toBeCloseTo(sampleTerrainHeight(73, boundaryX + epsilon, z), 6);
  });

  it("keeps river collision classification stable across an east-west boundary", () => {
    const seed = "river-boundary";
    const left = generateChunk(seed, { x: -1, z: -1 });
    const riverZ = left.river.exit.z;
    const epsilon = 1e-7;

    expect(isRiverAt(seed, -epsilon, riverZ)).toBe(true);
    expect(isRiverAt(seed, epsilon, riverZ)).toBe(true);
    expect(sampleTerrain(seed, -epsilon, riverZ).surface)
      .toBe(sampleTerrain(seed, epsilon, riverZ).surface);
  });

  it("sets the walkable river bed deep enough to submerge about 30% of the player", () => {
    const chunk = generateChunk("deeper-river", { x: 0, z: 0 });
    const side = chunk.terrainVerticesPerSide;
    const river = chunk.river.entry;
    const z = Math.round(river.z / CHUNK_SIZE * (side - 1));

    expect(chunk.terrainHeights[z * side]).toBeCloseTo(
      river.surfaceElevation - RIVER_BED_DEPTH,
    );
    expect(RIVER_BED_DEPTH).toBeGreaterThanOrEqual(1.5 * 0.2);
    expect(RIVER_BED_DEPTH).toBeLessThanOrEqual(1.5 * 0.4);
  });

  it("does not invent a collision jump at negative north-south boundaries", () => {
    const seed = "river-boundary";
    const epsilon = 1e-7;
    for (const boundaryZ of [-CHUNK_SIZE, 0]) {
      expect(isRiverAt(seed, -3.25, boundaryZ - epsilon)).toBe(false);
      expect(isRiverAt(seed, -3.25, boundaryZ + epsilon)).toBe(false);
    }
  });
});
