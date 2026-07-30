import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { worldToChunk } from "./chunkCoordinates";
import { ChunkMeshFactory } from "./chunkMeshes";
import { generateChunk } from "./generateChunk";
import { normalizeSeed } from "./random";
import {
  isLakeAt,
  LAKE_BED_DEPTH,
  LAKE_SURFACE_ELEVATION,
  sampleNaturalTerrainHeight,
  sampleTerrain,
} from "./terrainSampling";

function findLake(seed: string): { x: number; z: number } {
  for (let z = -256; z <= 256; z += 2) for (let x = -256; x <= 256; x += 2) {
    if (isLakeAt(seed, x, z)) return { x, z };
  }
  throw new Error("Expected a generated lake");
}

describe("lake biome", () => {
  it("carves a submerged, walkable basin and blends through surrounding banks", () => {
    const seed = "large-lake";
    const center = findLake(seed);
    const sample = sampleTerrain(seed, center.x, center.z);

    expect(sample.biome).toBe("lake");
    expect(sample.surface).toBe("lake");
    expect(sample.height).toBeLessThanOrEqual(LAKE_SURFACE_ELEVATION - LAKE_BED_DEPTH + 0.01);

    // A ray out of the core must encounter a shaped bank before untouched land.
    const ray = Array.from({ length: 129 }, (_, index) => center.x + index * 0.5);
    const shore = ray.find((x) => !isLakeAt(seed, x, center.z));
    expect(shore).toBeDefined();
    expect(sampleTerrain(seed, shore!, center.z).height)
      .toBeLessThanOrEqual(sampleNaturalTerrainHeight(normalizeSeed(seed), shore!, center.z));
  });

  it("renders lake water with the same shared material as wetland puddles", () => {
    const seed = "shared-water-material";
    const center = findLake(seed);
    const coordinate = worldToChunk(center.x, center.z);
    const factory = new ChunkMeshFactory();
    const group = factory.create(generateChunk(seed, coordinate));
    const lake = group.getObjectByName("lake") as THREE.Mesh;
    const pools = group.getObjectByName("wetland-pools")?.children[0] as THREE.InstancedMesh | undefined;

    expect(lake.geometry.getAttribute("position").count).toBeGreaterThan(0);
    if (pools) expect(lake.material).toBe(pools.material);
    factory.disposeChunk(group);
    factory.dispose();
  });
});
