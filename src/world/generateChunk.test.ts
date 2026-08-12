import { describe, expect, it } from "vitest";

import { generateChunk } from "./generateChunk";
import { worldToChunk } from "./chunkCoordinates";
import {
  isRiverAt,
  sampleTerrainHeight,
  TERRAIN_SEGMENTS,
} from "./terrainSampling";
import { WORLD_RIVER_CARVING } from "./worldRiverCarving";
import { getWorldRiverOwner } from "./worldRiverOwner";
import { sampleHydrology } from "./hydrology";

describe("deterministic chunk generation", () => {
  it("repeats exactly for the same seed and coordinate", () => {
    expect(generateChunk("alpine", { x: 4, z: -2 })).toEqual(generateChunk("alpine", { x: 4, z: -2 }));
  });

  it("changes with the seed", () => {
    expect(generateChunk("alpine", { x: 0, z: 0 })).not.toEqual(generateChunk("coastal", { x: 0, z: 0 }));
  });

  it("uses mathematical floor for negative world coordinates", () => {
    expect(worldToChunk(-0.01, -16.01)).toEqual({ x: -1, z: -2 });
    expect(generateChunk(7, { x: -3, z: -5 }).id).toBe("-3,-5");
  });

  it("does not depend on generation order", () => {
    const coordinates = [{ x: 2, z: 1 }, { x: -1, z: 8 }, { x: 0, z: 0 }] as const;
    const forward = new Map(coordinates.map((coordinate) => [JSON.stringify(coordinate), generateChunk(42, coordinate)]));
    const reverse = new Map([...coordinates].reverse().map((coordinate) => [JSON.stringify(coordinate), generateChunk(42, coordinate)]));
    expect(forward).toEqual(reverse);
  });

  it("shares exact terrain vertices on north-south boundaries", () => {
    const north = generateChunk("continuity", { x: 0, z: -1 });
    const south = generateChunk("continuity", { x: 0, z: 0 });
    const side = north.terrainVerticesPerSide;
    for (let x = 0; x < side; x += 1) {
      expect(north.terrainHeights[(side - 1) * side + x]).toBe(south.terrainHeights[x]);
    }
  });

  it("no longer emits legacy fixed-column river records", () => {
    const chunk = generateChunk("one-river", { x: 0, z: 8 }) as { river?: unknown };
    expect(chunk.river).toBeUndefined();
    expect(generateChunk("one-river", { x: 1, z: 8 })).not.toHaveProperty("river");
  });

  it("shares exact terrain vertices on every edge of adjacent chunks", () => {
    const seed = "four-way-continuity";
    const center = generateChunk(seed, { x: -2, z: 1 });
    const east = generateChunk(seed, { x: -1, z: 1 });
    const south = generateChunk(seed, { x: -2, z: 2 });
    const side = center.terrainVerticesPerSide;

    for (let index = 0; index < side; index += 1) {
      expect(center.terrainHeights[index * side + side - 1])
        .toBe(east.terrainHeights[index * side]);
      expect(center.terrainHeights[(side - 1) * side + index])
        .toBe(south.terrainHeights[index]);
    }
  });

  it("carves terrain below the world-river water surface where the spine crosses", () => {
    const seed = "channel";
    const owner = getWorldRiverOwner(seed);
    const sample = owner.spine.sampleFrame(0.4);
    const height = sampleTerrainHeight(seed, sample.position.x, sample.position.z);
    expect(height).toBeLessThan(WORLD_RIVER_CARVING.surfaceElevation);
    expect(isRiverAt(seed, sample.position.x, sample.position.z)).toBe(true);
  });

  it("keeps uniform coarse resolution for all chunks (world-river carving is height-field based)", () => {
    const dryChunk = generateChunk("local-river-detail", { x: 1, z: 0 });
    const riverChunk = generateChunk("local-river-detail", { x: 0, z: 0 });

    expect(dryChunk.terrainVerticesPerSide).toBe(TERRAIN_SEGMENTS + 1);
    expect(riverChunk.terrainVerticesPerSide).toBe(TERRAIN_SEGMENTS + 1);
    expect(dryChunk.terrainHeights).toHaveLength((TERRAIN_SEGMENTS + 1) ** 2);
    expect(riverChunk.terrainHeights).toHaveLength((TERRAIN_SEGMENTS + 1) ** 2);
    expect(riverChunk.irregularTerrain).toBeUndefined();
  });

  it("keeps east-west edge continuity after legacy-column removal", () => {
    const westChunk = generateChunk("local-edge-continuity", { x: 0, z: 0 });
    const eastChunk = generateChunk("local-edge-continuity", { x: 1, z: 0 });
    const side = westChunk.terrainVerticesPerSide;
    for (let z = 0; z < side; z += 1) {
      expect(westChunk.terrainHeights[z * side + side - 1])
        .toBe(eastChunk.terrainHeights[z * side]);
    }
  });

  it("agrees with sampleHydrology on flooded river cells", () => {
    const seed = "hydro-agree";
    const owner = getWorldRiverOwner(seed);
    const frame = owner.spine.sampleFrame(0.35);
    const hydro = sampleHydrology(seed, frame.position.x, frame.position.z);
    expect(hydro.kind).toBe("river");
    expect(hydro.depth).toBeGreaterThan(0);
    expect(hydro.bedY).toBeLessThan(hydro.surfaceY);
  });
});
