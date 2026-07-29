import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { CHUNK_SIZE } from "./chunkCoordinates";
import { ChunkStreamingSystem } from "./ChunkStreamingSystem";

describe("loaded neighborhood boundary", () => {
  it("derives its world extent and fade width from the chunk radius and size", () => {
    const chunks = new ChunkStreamingSystem(new THREE.Scene(), "extent", 2);

    expect(chunks.getLoadedCenter()).toEqual({ x: CHUNK_SIZE / 2, z: CHUNK_SIZE / 2 });
    expect(chunks.getLoadedHalfExtent()).toBe(2.5 * CHUNK_SIZE);
    expect(ChunkStreamingSystem.EDGE_FADE_WIDTH).toBe(0.75 * CHUNK_SIZE);

    chunks.dispose();
  });
});
