import { hashFloat } from "./random";

export interface BiomeWeights {
  readonly meadow: number;
  readonly forest: number;
  readonly highland: number;
}

const BIOME_CELL_SIZE = 64;

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Samples the continuous biome blend shared by terrain and vegetation.
 *
 * The value field is globally addressed, so a biome sample never depends on
 * which chunk happens to contain the requested world position.
 */
export function sampleBiomeWeights(seed: number, worldX: number, worldZ: number): BiomeWeights {
  const latticeX = worldX / BIOME_CELL_SIZE;
  const latticeZ = worldZ / BIOME_CELL_SIZE;
  const x0 = Math.floor(latticeX);
  const z0 = Math.floor(latticeZ);
  const x = smoothstep(latticeX - x0);
  const z = smoothstep(latticeZ - z0);
  const top = hashFloat(seed, x0, z0, 101) * (1 - x)
    + hashFloat(seed, x0 + 1, z0, 101) * x;
  const bottom = hashFloat(seed, x0, z0 + 1, 101) * (1 - x)
    + hashFloat(seed, x0 + 1, z0 + 1, 101) * x;
  const value = top * (1 - z) + bottom * z;

  // Overlapping triangular bands avoid hard biome borders. Normalization also
  // makes the weights convenient for blending any biome-specific parameters.
  const meadow = clamp01(1 - Math.abs(value - 0.12) / 0.48);
  const forest = clamp01(1 - Math.abs(value - 0.52) / 0.4);
  const highland = clamp01(1 - Math.abs(value - 0.9) / 0.48);
  const total = meadow + forest + highland;
  return {
    meadow: meadow / total,
    forest: forest / total,
    highland: highland / total,
  };
}
