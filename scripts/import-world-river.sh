#!/usr/bin/env bash
set -euo pipefail
UPSTREAM=https://raw.githubusercontent.com/durrri/mobile-walker/main/src/world
for f in \
  riverSpineGeometry.ts \
  worldRiverGeneration.ts \
  worldRiverWidth.ts \
  worldRiverCarving.ts \
  worldRiverWater.ts \
  worldRiverEnvironment.ts \
  worldRiverGameplay.ts \
  worldRiverRelationship.ts \
  worldRiverSpine.ts \
  worldRiverOwner.ts \
  worldRiverContextCache.ts \
  terrainSampling.ts \
  vegetation.ts \
  chunkMeshes.ts
do
  echo "Fetching $f"
  curl -fsSL "$UPSTREAM/$f" -o "src/world/$f"
done
if ! grep -q 'WORLD_RIVER_CARVING,' src/world/terrainSampling.ts; then
  sed -i 's/WORLD_RIVER_MAX_CARVING_RADIUS,/WORLD_RIVER_CARVING,\n  WORLD_RIVER_MAX_CARVING_RADIUS,/' src/world/terrainSampling.ts
fi
if ! grep -q 'export function isRiverAt' src/world/terrainSampling.ts; then
  cat >> src/world/terrainSampling.ts << 'EOF'

/** Compatibility aliases used by bridges, vegetation, and POI systems. */
export const RIVER_BANK_WIDTH = WORLD_RIVER_CARVING.bankWidth;
export const RIVER_TRANSITION_WIDTH = WORLD_RIVER_CARVING.falloffWidth;
export const RIVER_BED_DEPTH = WORLD_RIVER_CARVING.nominalBedDepth;

export interface RiverCrossSectionSample {
  readonly centerX: number;
  readonly waterWidth: number;
  readonly surfaceElevation: number;
  readonly normalizedLateralDistance: number;
}

export function isRiverAt(seedInput: number | string, worldX: number, worldZ: number): boolean {
  return sampleTerrain(seedInput, worldX, worldZ).surface === "river";
}

export function sampleRiverCrossSection(
  seedInput: number | string,
  worldX: number,
  worldZ: number,
): RiverCrossSectionSample | undefined {
  const owner = getWorldRiverOwner(seedInput);
  const nearest = owner.spine.nearestPointToRiver(worldX, worldZ);
  const halfWidth = sampleRiverWidth(owner.widthProfile, nearest.distanceAlongRiver, owner.spine).halfWidth;
  if (nearest.distanceToRiver > halfWidth + WORLD_RIVER_MAX_CARVING_RADIUS) return undefined;
  return {
    centerX: nearest.position.x,
    waterWidth: halfWidth * 2,
    surfaceElevation: WORLD_RIVER_CARVING.surfaceElevation,
    normalizedLateralDistance: nearest.distanceToRiver / Math.max(1e-6, halfWidth),
  };
}
EOF
fi
