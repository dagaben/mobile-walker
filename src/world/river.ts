import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { hashFloat } from "./random";

export interface RiverBoundary {
  readonly edge: "west" | "east";
  /** World-space z coordinate, shared verbatim by the chunks touching this boundary. */
  readonly z: number;
  readonly width: number;
  /** World-space water elevation, shared by both chunks at this boundary. */
  readonly surfaceElevation: number;
}

export interface RiverPoint {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly surfaceElevation: number;
}

/** The single chunk row that carries the world's continuous west-to-east river. */
export function isRiverRow(coordinate: Pick<ChunkCoordinate, "z">): boolean {
  return coordinate.z === 0;
}

/**
 * Samples a boundary from its world-grid identity, not from either owning chunk.
 * Thus (x,z).east is exactly (x+1,z).west, including at negative coordinates.
 */
export function sampleRiverBoundary(seed: number, coordinate: ChunkCoordinate, edge: "west" | "east"): RiverBoundary {
  const boundaryX = coordinate.x + (edge === "east" ? 1 : 0);
  const row = coordinate.z;
  const z = (row + 0.18 + hashFloat(seed, boundaryX, row, 71) * 0.64) * CHUNK_SIZE;
  const width = 1.4 + hashFloat(seed, boundaryX, row, 89) * 1.5;
  const surfaceElevation = -0.12 + hashFloat(seed, boundaryX, row, 97) * 0.18;
  return { edge, z, width, surfaceElevation };
}

export function sampleRiverSpine(seed: number, coordinate: ChunkCoordinate, subdivisions = 5): readonly RiverPoint[] {
  const west = sampleRiverBoundary(seed, coordinate, "west");
  const east = sampleRiverBoundary(seed, coordinate, "east");
  const points: RiverPoint[] = [];
  for (let index = 0; index <= subdivisions; index += 1) {
    const t = index / subdivisions;
    const bend = index === 0 || index === subdivisions
      ? 0
      : (hashFloat(seed, coordinate.x, coordinate.z, index, 107) - 0.5) * 1.25;
    points.push({
      x: (coordinate.x + t) * CHUNK_SIZE,
      z: west.z + (east.z - west.z) * t + bend,
      width: west.width + (east.width - west.width) * t,
      surfaceElevation: west.surfaceElevation
        + (east.surfaceElevation - west.surfaceElevation) * t,
    });
  }
  return points;
}
