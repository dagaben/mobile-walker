export const CHUNK_SIZE = 16;

export interface ChunkCoordinate {
  readonly x: number;
  readonly z: number;
}

export function worldToChunk(x: number, z: number): ChunkCoordinate {
  return { x: Math.floor(x / CHUNK_SIZE), z: Math.floor(z / CHUNK_SIZE) };
}

export function chunkOrigin(coordinate: ChunkCoordinate): { x: number; z: number } {
  return { x: coordinate.x * CHUNK_SIZE, z: coordinate.z * CHUNK_SIZE };
}
