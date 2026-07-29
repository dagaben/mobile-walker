import { hashFloat, normalizeSeed } from "./random";

/** Stable identifiers used by terrain rendering and world-generation systems. */
export type BiomeId = "plains" | "forest" | "wetland" | "highlands";

export interface BiomeDefinition {
  readonly id: BiomeId;
  readonly label: string;
  /** The center of this biome in the two continuous climate fields. */
  readonly moisture: number;
  readonly ruggedness: number;
}

export const BIOMES: Readonly<Record<BiomeId, BiomeDefinition>> = {
  plains: { id: "plains", label: "Plains", moisture: 0.28, ruggedness: 0.2 },
  forest: { id: "forest", label: "Forest", moisture: 0.72, ruggedness: 0.38 },
  wetland: { id: "wetland", label: "Wetland", moisture: 0.9, ruggedness: 0.08 },
  highlands: { id: "highlands", label: "Highlands", moisture: 0.42, ruggedness: 0.86 },
};

/** High-contrast colors shared by the biome debug terrain and its HUD legend. */
export const BIOME_DEBUG_COLORS: Readonly<Record<BiomeId, string>> = {
  plains: "#d7c66f",
  forest: "#2f8a57",
  wetland: "#45a9bd",
  highlands: "#9b75c8",
};

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];

export type BiomeWeights = Readonly<Record<BiomeId, number>>;

export interface BiomeSample {
  readonly dominant: BiomeId;
  readonly weights: BiomeWeights;
  readonly moisture: number;
  readonly ruggedness: number;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

/** Globally addressed value noise; it has no knowledge of chunk coordinates. */
function sampleField(seed: number, worldX: number, worldZ: number, spacing: number, salt: number): number {
  const latticeX = worldX / spacing;
  const latticeZ = worldZ / spacing;
  const x0 = Math.floor(latticeX);
  const z0 = Math.floor(latticeZ);
  const x = smoothstep(latticeX - x0);
  const z = smoothstep(latticeZ - z0);
  const top = hashFloat(seed, x0, z0, salt) * (1 - x)
    + hashFloat(seed, x0 + 1, z0, salt) * x;
  const bottom = hashFloat(seed, x0, z0 + 1, salt) * (1 - x)
    + hashFloat(seed, x0 + 1, z0 + 1, salt) * x;
  return top * (1 - z) + bottom * z;
}

function sampleClimateField(
  seed: number,
  worldX: number,
  worldZ: number,
  broadSalt: number,
  detailSalt: number,
): number {
  // Keep climate features relatively compact so explorers encounter biome
  // changes regularly instead of crossing one very large region at a time.
  return sampleField(seed, worldX, worldZ, 72, broadSalt) * 0.72
    + sampleField(seed, worldX, worldZ, 28, detailSalt) * 0.28;
}

/**
 * Samples the continuous biome climate at an arbitrary world position.
 *
 * Scores overlap deliberately: consumers can blend neighboring biome visuals
 * instead of introducing a hard edge where the dominant biome changes.
 */
export function sampleBiome(seedInput: number | string, worldX: number, worldZ: number): BiomeSample {
  const seed = normalizeSeed(seedInput);
  const moisture = sampleClimateField(seed, worldX, worldZ, 701, 702);
  const ruggedness = sampleClimateField(seed, worldX, worldZ, 711, 712);
  const scores = {} as Record<BiomeId, number>;
  let total = 0;

  for (const id of BIOME_IDS) {
    const definition = BIOMES[id];
    const moistureDistance = moisture - definition.moisture;
    const ruggednessDistance = ruggedness - definition.ruggedness;
    const score = Math.exp(-(moistureDistance ** 2 + ruggednessDistance ** 2) / 0.12);
    scores[id] = score;
    total += score;
  }

  const weights = {} as Record<BiomeId, number>;
  let dominant: BiomeId = BIOME_IDS[0];
  for (const id of BIOME_IDS) {
    weights[id] = scores[id] / total;
    if (weights[id] > (weights[dominant] ?? -1)) dominant = id;
  }

  return { dominant, weights, moisture, ruggedness };
}
