export const CHUNK_SIZE = 16;

// A center must be crossed by a meaningful distance before its neighborhood changes.
// This is deliberately smaller than normal traversal movement, while filtering seam jitter.
export const CHUNK_CENTER_HYSTERESIS = 0.5;

export interface ChunkCoordinate {
  readonly x: number;
  readonly z: number;
}

export function worldToChunk(x: number, z: number): ChunkCoordinate {
  return { x: Math.floor(x / CHUNK_SIZE), z: Math.floor(z / CHUNK_SIZE) };
}

/** Selects a neighborhood center while retaining the current center through seam jitter. */
export function selectChunkCenter(
  x: number,
  z: number,
  current?: ChunkCoordinate,
): ChunkCoordinate {
  const candidate = worldToChunk(x, z);
  if (!current) return candidate;
  const stableAxis = (position: number, currentAxis: number, candidateAxis: number): number => {
    const lower = currentAxis * CHUNK_SIZE - CHUNK_CENTER_HYSTERESIS;
    const upper = (currentAxis + 1) * CHUNK_SIZE + CHUNK_CENTER_HYSTERESIS;
    return position < lower || position >= upper ? candidateAxis : currentAxis;
  };
  return {
    x: stableAxis(x, current.x, candidate.x),
    z: stableAxis(z, current.z, candidate.z),
  };
}

export function chunkOrigin(coordinate: ChunkCoordinate): { x: number; z: number } {
  return { x: coordinate.x * CHUNK_SIZE, z: coordinate.z * CHUNK_SIZE };
}
