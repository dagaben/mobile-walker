export * from "./biomes";
export * from "./chunkCoordinates";
export * from "./chunkId";
export * from "./generateChunk";
export * from "./forest";
export * from "./random";
// Legacy fixed-column river (src/world/river.ts) is quarantined — do not re-export.
// Production code uses worldRiver* + sampleHydrology.
export * from "./terrainSampling";
export * from "./terrainOcclusion";
export * from "./hydrology";
export * from "./vegetation";
export * from "./poi";
export * from "./poiMeshes";
export * from "./bridges";
export * from "./bridgeMeshes";
export * from "./riverSpineGeometry";
export * from "./worldRiverSpine";
export * from "./worldRiverGeneration";
export * from "./worldRiverWidth";
export * from "./worldRiverCarving";
export * from "./worldRiverWater";
export * from "./worldRiverOwner";
export * from "./worldRiverEnvironment";
