import { describe, expect, it } from "vitest";

import { CHUNK_SIZE } from "./chunkCoordinates";
import { generateChunk } from "./generateChunk";
import {
  DEFAULT_TERRAIN_OCCLUSION_OPTIONS,
  sampleTerrainOcclusion,
  terrainDarkening,
  TERRAIN_SUN_DIRECTION,
  type TerrainOcclusionOptions,
} from "./terrainOcclusion";

const options = (changes: Partial<TerrainOcclusionOptions> = {}): TerrainOcclusionOptions => ({
  ...DEFAULT_TERRAIN_OCCLUSION_OPTIONS,
  sampleCount: 4,
  sampleDistance: 16,
  ...changes,
});

describe("static terrain sunlight occlusion", () => {
  it("ignores flat, gentle, and sub-threshold terrain variation", () => {
    expect(sampleTerrainOcclusion(0, 0, 2, () => 2, options())).toBe(0);
    expect(sampleTerrainOcclusion(0, 0, 2, (x, z) => 2 + Math.sin(x + z) * 0.25, options())).toBe(0);
  });

  it("darkens terrain behind a significant ridge along the sunlight direction", () => {
    const ridgeX = TERRAIN_SUN_DIRECTION.x * 8;
    const ridgeZ = TERRAIN_SUN_DIRECTION.z * 8;
    const occlusion = sampleTerrainOcclusion(0, 0, 0, (x, z) =>
      Math.hypot(x - ridgeX, z - ridgeZ) < 1 ? 20 : 0, options());
    expect(occlusion).toBe(1);
  });

  it("caps fully occluded darkening at the configurable 70% default", () => {
    expect(terrainDarkening(1)).toBe(0.7);
    expect(terrainDarkening(2)).toBe(0.7);
  });

  it("uses a smooth transition for partial obstruction", () => {
    const atObstruction = (obstruction: number) => sampleTerrainOcclusion(
      0, 0, 0,
      (x, z) => Math.abs(Math.hypot(x, z) - 4) < 0.001
        ? TERRAIN_SUN_DIRECTION.rise * 4 + obstruction
        : -100,
      options({ heightThreshold: 1, softness: 4 }),
    );
    expect(atObstruction(1)).toBe(0);
    expect(atObstruction(3)).toBeCloseTo(0.5);
    expect(atObstruction(5)).toBe(1);
  });

  it("is deterministic", () => {
    const sampler = (x: number, z: number) => Math.sin(x * 0.3) * 8 + Math.cos(z * 0.2) * 6;
    expect(sampleTerrainOcclusion(7, -3, 1, sampler, options()))
      .toBe(sampleTerrainOcclusion(7, -3, 1, sampler, options()));
  });

  it("matches exactly across independently generated chunk boundaries", () => {
    const left = generateChunk("occlusion-seam", { x: 2, z: -1 });
    const right = generateChunk("occlusion-seam", { x: 3, z: -1 });
    const side = left.terrainVerticesPerSide;
    for (let z = 0; z < side; z += 1) {
      expect(left.terrainOcclusion[z * side + side - 1]).toBe(right.terrainOcclusion[z * side]);
    }
    expect(left.coordinate.x * CHUNK_SIZE + CHUNK_SIZE).toBe(right.coordinate.x * CHUNK_SIZE);
  });
});
