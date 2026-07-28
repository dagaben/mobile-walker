import type { ChunkCoordinate } from "./chunkCoordinates";

export type ChunkId = `${number},${number}`;

export function chunkId({ x, z }: ChunkCoordinate): ChunkId {
  return `${x},${z}`;
}

export function parseChunkId(id: ChunkId): ChunkCoordinate {
  const [x, z] = id.split(",").map(Number);
  return { x, z };
}
