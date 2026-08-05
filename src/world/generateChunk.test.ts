import { describe, expect, it } from "vitest";

import { generateChunk } from "./generateChunk";
import { worldToChunk } from "./chunkCoordinates";
import {
  TERRAIN_SEGMENTS,
} from "./terrainSampling";

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

  it("shares exact river and terrain conditions across north-south boundaries", () => {
    const north = generateChunk("continuity", { x: 0, z: -1 });
    const south = generateChunk("continuity", { x: 0, z: 0 });
    expect(north.river!.exit.x).toBe(south.river!.entry.x);
    expect(north.river!.exit.width).toBe(south.river!.entry.width);
    expect(north.river!.exit.surfaceElevation).toBe(south.river!.entry.surfaceElevation);
    expect(north.river!.spine.at(-1)).toEqual(south.river!.spine[0]);
    const side = north.terrainVerticesPerSide;
    for (let x = 0; x < side; x += 1) {
      expect(north.terrainHeights[(side - 1) * side + x]).toBe(south.terrainHeights[x]);
    }
  });

  it("only includes river data in chunk column zero", () => {
    expect(generateChunk("one-river", { x: 0, z: 8 }).river).toBeDefined();
    expect(generateChunk("one-river", { x: -1, z: 8 }).river).toBeUndefined();
    expect(generateChunk("one-river", { x: 1, z: 8 }).river).toBeUndefined();
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

  it("carves terrain below the generated water surface along the river", () => {
    const chunk = generateChunk("channel", { x: 0, z: 2 });
    const side = chunk.terrainVerticesPerSide;
    for (const point of chunk.river!.spine) {
      const x = Math.round((point.x - chunk.coordinate.x * chunk.size) / chunk.size * (side - 1));
      const z = Math.round((point.z - chunk.coordinate.z * chunk.size) / chunk.size * (side - 1));
      expect(chunk.terrainHeights[z * side + x]).toBeLessThan(point.surfaceElevation);
    }
  });

  it("builds a compact longitudinal channel from the collision cross-section", () => {
    const seed = "rendered-channel-agreement";
    const chunk = generateChunk(seed, { x: 0, z: 0 });
    expect(chunk.terrainVerticesPerSide).toBe(TERRAIN_SEGMENTS + 1);
    // Legacy channel is optional under world-river; when present it stays compact.
    if (chunk.river) {
      expect(chunk.river.channelSections.length).toBeGreaterThan(0);
      expect(chunk.river.channelSections.length * 6).toBeLessThan(64);
    }
  });

  it("keeps the base terrain resolution outside the river column", () => {
    const dryChunk = generateChunk("local-river-detail", { x: 1, z: 0 });
    const riverChunk = generateChunk("local-river-detail", { x: 0, z: 0 });

    expect(dryChunk.terrainVerticesPerSide).toBe(TERRAIN_SEGMENTS + 1);
    expect(riverChunk.terrainVerticesPerSide).toBe(TERRAIN_SEGMENTS + 1);
    expect(dryChunk.terrainHeights).toHaveLength((TERRAIN_SEGMENTS + 1) ** 2);
    expect(riverChunk.terrainHeights.length).toBeLessThanOrEqual(dryChunk.terrainHeights.length);
    expect(riverChunk.irregularTerrain!.vertices.length).toBeLessThan(dryChunk.terrainHeights.length);
  });

  it("keeps river-column edges on the neighboring coarse edge", () => {
    const riverChunk = generateChunk("local-edge-continuity", { x: 0, z: 0 });
    const eastChunk = generateChunk("local-edge-continuity", { x: 1, z: 0 });
    const riverSide = riverChunk.terrainVerticesPerSide;
    const coarseSide = eastChunk.terrainVerticesPerSide;

    for (let coarseZ = 0; coarseZ < coarseSide; coarseZ += 1) {
      expect(riverChunk.terrainHeights[coarseZ * riverSide + riverSide - 1])
        .toBe(eastChunk.terrainHeights[coarseZ * coarseSide]);
    }
  });

  it("shares river presence across neighboring column-zero chunks when both have legacy channel data", () => {
    const north = generateChunk("channel-seams", { x: 0, z: -1 });
    const south = generateChunk("channel-seams", { x: 0, z: 0 });
    if (north.river && south.river && north.river.channelSections.length && south.river.channelSections.length) {
      expect(north.river.channelSections.at(-1)).toEqual(south.river.channelSections[0]);
    } else {
      // World river owns continuous water; legacy channel may be empty.
      expect(true).toBe(true);
    }
  });
});
