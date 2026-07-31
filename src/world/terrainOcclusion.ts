/** Horizontal direction from a terrain point toward the fixed sunlight at (-4, 8, 5). */
export const TERRAIN_SUN_DIRECTION = Object.freeze({
  x: -4 / Math.hypot(4, 5),
  z: 5 / Math.hypot(4, 5),
  rise: 8 / Math.hypot(4, 5),
});

export interface TerrainOcclusionOptions {
  /** Samples along the sunlight ray. Keep this modest because it runs once per generated vertex. */
  readonly sampleCount: number;
  readonly sampleDistance: number;
  /** Obstructions below this height above the sunlight ray are treated as insignificant detail. */
  readonly heightThreshold: number;
  /** Height range over which the shadow fades from clear to fully occluded. */
  readonly softness: number;
  /** Greatest proportional reduction applied to each original colour channel. */
  readonly maximumDarkening: number;
}

export const DEFAULT_TERRAIN_OCCLUSION_OPTIONS: Readonly<TerrainOcclusionOptions> = Object.freeze({
  sampleCount: 8,
  sampleDistance: 32,
  heightThreshold: 1.5,
  softness: 3,
  maximumDarkening: 0.5,
});

export type TerrainHeightSampler = (worldX: number, worldZ: number) => number;

const smoothstep = (value: number): number => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
};

/**
 * Estimates large-scale terrain obstruction along the rising ray toward the sun.
 * It deliberately ignores local slope and small bumps; the result is pure and can
 * be baked by the chunk worker without any renderer or neighbouring chunk data.
 */
export function sampleTerrainOcclusion(
  worldX: number,
  worldZ: number,
  vertexHeight: number,
  sampleHeight: TerrainHeightSampler,
  options: Readonly<TerrainOcclusionOptions> = DEFAULT_TERRAIN_OCCLUSION_OPTIONS,
): number {
  const count = Math.max(1, Math.floor(options.sampleCount));
  let greatestObstruction = -Infinity;
  for (let index = 1; index <= count; index += 1) {
    const distance = options.sampleDistance * index / count;
    const terrainHeight = sampleHeight(
      worldX + TERRAIN_SUN_DIRECTION.x * distance,
      worldZ + TERRAIN_SUN_DIRECTION.z * distance,
    );
    const rayHeight = vertexHeight + TERRAIN_SUN_DIRECTION.rise * distance;
    greatestObstruction = Math.max(greatestObstruction, terrainHeight - rayHeight);
  }
  return smoothstep(
    (greatestObstruction - options.heightThreshold) / Math.max(Number.EPSILON, options.softness),
  );
}

export function terrainDarkening(
  occlusion: number,
  maximumDarkening = DEFAULT_TERRAIN_OCCLUSION_OPTIONS.maximumDarkening,
): number {
  return Math.max(0, Math.min(1, occlusion)) * Math.max(0, Math.min(1, maximumDarkening));
}
