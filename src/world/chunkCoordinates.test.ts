import { describe, expect, it } from "vitest";

import { CHUNK_SIZE, chunkOrigin, worldToChunk } from "./chunkCoordinates";

describe("chunk coordinates", () => {
  it("maps exact positive boundaries to the next chunk", () => {
    expect(worldToChunk(CHUNK_SIZE - 0.001, CHUNK_SIZE)).toEqual({ x: 0, z: 1 });
    expect(worldToChunk(CHUNK_SIZE, CHUNK_SIZE * 2)).toEqual({ x: 1, z: 2 });
  });

  it("maps exact negative boundaries using mathematical floor division", () => {
    expect(worldToChunk(-CHUNK_SIZE, -CHUNK_SIZE * 2)).toEqual({ x: -1, z: -2 });
    expect(worldToChunk(-CHUNK_SIZE - 0.001, -CHUNK_SIZE + 0.001)).toEqual({ x: -2, z: -1 });
  });

  it("returns the exact world origin for positive and negative chunks", () => {
    expect(chunkOrigin({ x: 2, z: -3 })).toEqual({ x: 32, z: -48 });
  });
});
