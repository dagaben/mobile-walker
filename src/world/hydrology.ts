/**
 * Unified hydrology classification for gameplay, spawn, movement, and AI.
 *
 * River, lake, and wetland pools were previously queried through separate APIs
 * that could disagree on edges. Every consumer that cares about "is this wet?"
 * should go through sampleHydrology.
 */
import { sampleBiome } from "./biomes";
import { normalizeSeed } from "./random";
import {
  LAKE_BED_DEPTH,
  LAKE_RIVER_ATTACHMENT_MARGIN,
  LAKE_SURFACE_ELEVATION,
  LAKE_WATER_WEIGHT,
  sampleTerrainHeight,
} from "./terrainSampling";
import {
  sampleWorldRiverCarving,
  WORLD_RIVER_CARVING,
  type WorldRiverCarvingContext,
} from "./worldRiverCarving";
import { getCachedWorldRiverCarvingContext } from "./worldRiverContextCache";
import { getWorldRiverOwner } from "./worldRiverOwner";
import type { WorldRiverPlacementZone } from "./worldRiverEnvironment";
import { sampleRiverWidth } from "./worldRiverWidth";

export type HydrologyKind = "dry" | "river" | "lake" | "wetland-pool";

export type HydrologyZone =
  | WorldRiverPlacementZone
  | "lake-basin"
  | "lake-bank"
  | "dry";

export interface HydrologySample {
  readonly kind: HydrologyKind;
  readonly depth: number;
  readonly surfaceY: number;
  readonly bedY: number;
  readonly zone: HydrologyZone;
  readonly lakeRiverConnected: boolean;
  readonly distanceToRiverCentreline: number | undefined;
  readonly riverWaterHalfWidth: number | undefined;
}

const LAKE_BANK_WEIGHT = 0.18;

function riverContext(seed: number | string, x: number, z: number): WorldRiverCarvingContext {
  return getCachedWorldRiverCarvingContext(getWorldRiverOwner(seed), x, z);
}

function zoneFromRiverDistance(
  distance: number,
  waterHalfWidth: number,
): WorldRiverPlacementZone {
  const { shoreTransitionWidth, bankWidth, falloffWidth } = WORLD_RIVER_CARVING;
  if (distance <= waterHalfWidth) return "water";
  if (distance <= waterHalfWidth + shoreTransitionWidth) return "shoreTransition";
  if (distance <= waterHalfWidth + bankWidth) return "walkableBank";
  if (distance <= waterHalfWidth + bankWidth + falloffWidth) return "outerFalloff";
  return "outsideRiverInfluence";
}

export function sampleHydrology(
  seedInput: number | string,
  worldX: number,
  worldZ: number,
  carvingContext?: WorldRiverCarvingContext,
): HydrologySample {
  const seed = normalizeSeed(seedInput);
  const biome = sampleBiome(seed, worldX, worldZ);
  const lakeWeight = biome.weights.lake;
  const wetlandWeight = biome.weights.wetland;
  const bedY = sampleTerrainHeight(seed, worldX, worldZ);

  const context = carvingContext ?? riverContext(seed, worldX, worldZ);
  const carving = sampleWorldRiverCarving(worldX, worldZ, context);

  let waterHalfWidth: number | undefined;
  let distanceToCentreline: number | undefined;
  let riverZone: WorldRiverPlacementZone = "outsideRiverInfluence";
  let insideRiverWater = false;

  if (carving) {
    distanceToCentreline = carving.distanceToCentreline;
    waterHalfWidth = carving.waterHalfWidth;
    riverZone = zoneFromRiverDistance(carving.distanceToCentreline, carving.waterHalfWidth);
    insideRiverWater = carving.distanceToCentreline <= carving.waterHalfWidth;
  } else {
    const owner = getWorldRiverOwner(seed);
    const nearest = owner.spine.nearestPointToRiver(worldX, worldZ);
    const half = sampleRiverWidth(owner.widthProfile, nearest.distanceAlongRiver, owner.spine).halfWidth;
    distanceToCentreline = nearest.distanceToRiver;
    waterHalfWidth = half;
    riverZone = zoneFromRiverDistance(nearest.distanceToRiver, half);
    insideRiverWater = nearest.distanceToRiver <= half;
  }

  const insideLakeWater = lakeWeight >= LAKE_WATER_WEIGHT;
  const insideLakeBank = lakeWeight > LAKE_BANK_WEIGHT && !insideLakeWater;

  const lakeRiverConnected = lakeWeight > LAKE_BANK_WEIGHT
    && waterHalfWidth !== undefined
    && distanceToCentreline !== undefined
    && distanceToCentreline <= waterHalfWidth + LAKE_RIVER_ATTACHMENT_MARGIN + WORLD_RIVER_CARVING.falloffWidth;

  const riverSurfaceY = WORLD_RIVER_CARVING.surfaceElevation;
  const lakeSurfaceY = lakeRiverConnected
    ? riverSurfaceY + (LAKE_SURFACE_ELEVATION - riverSurfaceY) * 0.25
    : LAKE_SURFACE_ELEVATION;

  if (insideRiverWater) {
    const surfaceY = riverSurfaceY;
    return {
      kind: "river",
      depth: Math.max(0, surfaceY - bedY),
      surfaceY,
      bedY,
      zone: "water",
      lakeRiverConnected,
      distanceToRiverCentreline: distanceToCentreline,
      riverWaterHalfWidth: waterHalfWidth,
    };
  }

  if (insideLakeWater) {
    const surfaceY = lakeSurfaceY;
    return {
      kind: "lake",
      depth: Math.max(0, surfaceY - bedY),
      surfaceY,
      bedY,
      zone: "lake-basin",
      lakeRiverConnected,
      distanceToRiverCentreline: distanceToCentreline,
      riverWaterHalfWidth: waterHalfWidth,
    };
  }

  if (wetlandWeight >= 0.55 && !insideLakeBank && riverZone === "outsideRiverInfluence") {
    return {
      kind: "wetland-pool",
      depth: 0.04,
      surfaceY: bedY + 0.04,
      bedY,
      zone: "dry",
      lakeRiverConnected: false,
      distanceToRiverCentreline: distanceToCentreline,
      riverWaterHalfWidth: waterHalfWidth,
    };
  }

  if (insideLakeBank) {
    return {
      kind: "dry",
      depth: 0,
      surfaceY: bedY,
      bedY,
      zone: "lake-bank",
      lakeRiverConnected,
      distanceToRiverCentreline: distanceToCentreline,
      riverWaterHalfWidth: waterHalfWidth,
    };
  }

  if (riverZone !== "outsideRiverInfluence") {
    return {
      kind: "dry",
      depth: 0,
      surfaceY: bedY,
      bedY,
      zone: riverZone,
      lakeRiverConnected,
      distanceToRiverCentreline: distanceToCentreline,
      riverWaterHalfWidth: waterHalfWidth,
    };
  }

  return {
    kind: "dry",
    depth: 0,
    surfaceY: bedY,
    bedY,
    zone: "dry",
    lakeRiverConnected: false,
    distanceToRiverCentreline: distanceToCentreline,
    riverWaterHalfWidth: waterHalfWidth,
  };
}

export function isFloodedAt(seedInput: number | string, worldX: number, worldZ: number): boolean {
  const kind = sampleHydrology(seedInput, worldX, worldZ).kind;
  return kind === "river" || kind === "lake";
}

export function isOpenWaterAt(seedInput: number | string, worldX: number, worldZ: number): boolean {
  return isFloodedAt(seedInput, worldX, worldZ);
}

export { LAKE_BED_DEPTH, LAKE_SURFACE_ELEVATION, LAKE_WATER_WEIGHT };
