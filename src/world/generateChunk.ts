import { CHUNK_SIZE, type ChunkCoordinate } from "./chunkCoordinates";
import { chunkId, type ChunkId } from "./chunkId";
import { sampleBiome, type BiomeWeights } from "./biomes";
import { generateTrees, type TreePlacement } from "./forest";
import { normalizeSeed } from "./random";
import {
  sampleChannelTerrainHeight,
  TERRAIN_SEGMENTS,
} from "./terrainSampling";
import { generateVegetation, type GeneratedVegetation } from "./vegetation";
import { generatePois, isVegetationExcluded, type GeneratedPoi, type PoiDebugCandidate } from "./poi";
import { generateWetlandPools, type WetlandPoolPlacement } from "./wetlands";
import { placeCollectibles, type CollectiblePlacement } from "./collectibles";
import { generateBridges, type BridgeCrossingCandidate, type GeneratedBridge } from "./bridges";
import { validateStructureDefinition } from "./structureTypes";
import {
  DEFAULT_TERRAIN_OCCLUSION_OPTIONS,
  sampleTerrainOcclusion,
  type TerrainOcclusionOptions,
} from "./terrainOcclusion";

export { TERRAIN_SEGMENTS } from "./terrainSampling";

export interface IrregularTerrainVertex {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly biomeWeights: BiomeWeights;
  readonly occlusion: number;
}

export interface GeneratedChunkData {
  readonly seed: number;
  readonly id: ChunkId;
  readonly coordinate: ChunkCoordinate;
  readonly size: number;
  readonly terrainHeights: readonly number[];
  /** Biome blend at each terrain vertex, using the same row-major layout as terrainHeights. */
  readonly terrainBiomeWeights: readonly BiomeWeights[];
  /** Worker-baked, global sunlight obstruction in the range [0, 1]. */
  readonly terrainOcclusion: readonly number[];
  /** Presentation-neutral buffers baked off-thread and transferred without cloning. */
  readonly terrainMesh: { readonly positions: Float32Array; readonly indices: Uint16Array; readonly normals: Float32Array };
  readonly terrainMaximumDarkening: number;
  readonly terrainVerticesPerSide: number;
  /**
   * Optional refined terrain (unused after legacy column-river removal).
   * World-river carving is applied in sampleChannelTerrainHeight on the coarse lattice.
   */
  readonly irregularTerrain?: {
    readonly vertices: readonly IrregularTerrainVertex[];
    readonly indices: readonly number[];
  };
  readonly pines: readonly TreePlacement[];
  readonly pois: readonly GeneratedPoi[];
  /** Span POIs have their own crossing-oriented contract rather than pretending to be point POIs. */
  readonly bridges: readonly GeneratedBridge[];
  readonly poiCandidates?: readonly PoiDebugCandidate[];
  readonly bridgeCandidates?: readonly BridgeCrossingCandidate[];
  readonly collectibles: readonly CollectiblePlacement[];
  readonly vegetation: GeneratedVegetation;
  readonly wetlandPools: readonly WetlandPoolPlacement[];
}

/**
 * Pure, random-access generation: output is solely a function of seed and coordinate.
 * Terrain heights include world-river carving and R10 lake–river attachment via
 * sampleChannelTerrainHeight. Legacy fixed-column river data is not produced.
 */
export function generateChunk(
  seedInput: number | string,
  coordinate: ChunkCoordinate,
  occlusionOptions: Readonly<TerrainOcclusionOptions> = DEFAULT_TERRAIN_OCCLUSION_OPTIONS,
  includeDebugData = false,
): GeneratedChunkData {
  const seed = normalizeSeed(seedInput);
  const terrainSegments = TERRAIN_SEGMENTS;
  const verticesPerSide = terrainSegments + 1;
  const terrainHeights: number[] = [];
  const terrainBiomeWeights: BiomeWeights[] = [];
  const terrainOcclusion: number[] = [];
  for (let z = 0; z < verticesPerSide; z += 1) {
    for (let x = 0; x < verticesPerSide; x += 1) {
      // Use global lattice coordinates so neighboring terrain edges also agree.
      const worldX = coordinate.x * CHUNK_SIZE + x * CHUNK_SIZE / terrainSegments;
      const worldZ = coordinate.z * CHUNK_SIZE + z * CHUNK_SIZE / terrainSegments;
      const height = sampleChannelTerrainHeight(seed, worldX, worldZ);
      terrainHeights.push(height);
      terrainBiomeWeights.push(sampleBiome(seed, worldX, worldZ).weights);
      terrainOcclusion.push(sampleTerrainOcclusion(
        worldX, worldZ, height,
        (sampleX, sampleZ) => sampleChannelTerrainHeight(seed, sampleX, sampleZ),
        occlusionOptions,
      ));
    }
  }

  // POIs deliberately precede every placed-object pass. Their global zones may
  // cross this chunk even when the owning origin is in a neighbor.
  const poiNeighborhood = [] as GeneratedPoi[];
  let ownedCandidates: readonly PoiDebugCandidate[] = [];
  for (let dz = -1; dz <= 1; dz += 1) for (let dx = -1; dx <= 1; dx += 1) {
    const generated = generatePois(seed, { x: coordinate.x + dx, z: coordinate.z + dz });
    poiNeighborhood.push(...generated.pois);
    if (dx === 0 && dz === 0) ownedCandidates = generated.candidates;
  }
  const pois = poiNeighborhood.filter(poi => poi.ownerChunk.x === coordinate.x && poi.ownerChunk.z === coordinate.z);
  const bridgeNeighborhood: GeneratedBridge[] = [];
  let ownedBridgeCandidates: readonly BridgeCrossingCandidate[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    const generated = generateBridges(seed, { x: coordinate.x, z: coordinate.z + dz }, poiNeighborhood);
    bridgeNeighborhood.push(...generated.bridges);
    if (dz === 0) ownedBridgeCandidates = generated.candidates;
  }
  const bridges = bridgeNeighborhood.filter(
    bridge => bridge.ownerChunk.x === coordinate.x && bridge.ownerChunk.z === coordinate.z,
  );
  // Structural parity is checked once as records enter the generated repository,
  // never during rendering or a movement query.
  for (const definition of [...pois.map(poi => poi.structure), ...bridges.map(bridge => bridge.collision)]) {
    validateStructureDefinition(definition);
  }
  const exclusionZones = [
    ...poiNeighborhood.flatMap(poi => poi.zones),
    ...bridgeNeighborhood.flatMap(bridge => bridge.zones),
  ];

  const meshVertices = terrainHeights.map((height, vertexIndex) => ({
    x: coordinate.x * CHUNK_SIZE + (vertexIndex % verticesPerSide) * CHUNK_SIZE / terrainSegments,
    z: coordinate.z * CHUNK_SIZE + Math.floor(vertexIndex / verticesPerSide) * CHUNK_SIZE / terrainSegments,
    height,
  }));
  const meshIndices: number[] = [];
  for (let z = 0; z < terrainSegments; z++) {
    for (let x = 0; x < terrainSegments; x++) {
      const topLeft = z * verticesPerSide + x;
      meshIndices.push(
        topLeft, topLeft + verticesPerSide, topLeft + 1,
        topLeft + 1, topLeft + verticesPerSide, topLeft + verticesPerSide + 1,
      );
    }
  }
  const positions = new Float32Array(meshVertices.length * 3);
  meshVertices.forEach((vertex, index) => positions.set([vertex.x, vertex.height, vertex.z], index * 3));
  const indices = new Uint16Array(meshIndices);
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
    const abx = positions[b]! - positions[a]!, aby = positions[b + 1]! - positions[a + 1]!, abz = positions[b + 2]! - positions[a + 2]!;
    const acx = positions[c]! - positions[a]!, acy = positions[c + 1]! - positions[a + 1]!, acz = positions[c + 2]! - positions[a + 2]!;
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    for (const offset of [a, b, c]) {
      normals[offset]! += nx;
      normals[offset + 1]! += ny;
      normals[offset + 2]! += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1;
    normals[i]! /= length;
    normals[i + 1]! /= length;
    normals[i + 2]! /= length;
  }
  return {
    seed,
    id: chunkId(coordinate),
    coordinate: { ...coordinate },
    size: CHUNK_SIZE,
    terrainHeights,
    terrainBiomeWeights,
    terrainOcclusion,
    terrainMesh: { positions, indices, normals },
    terrainMaximumDarkening: occlusionOptions.maximumDarkening,
    terrainVerticesPerSide: verticesPerSide,
    pines: generateTrees(seed, coordinate).filter(tree => !isVegetationExcluded(tree.x, tree.z, exclusionZones)),
    pois,
    bridges,
    poiCandidates: includeDebugData ? ownedCandidates : undefined,
    bridgeCandidates: includeDebugData ? ownedBridgeCandidates : undefined,
    collectibles: placeCollectibles(seed, coordinate, exclusionZones),
    vegetation: generateVegetation(seed, coordinate, exclusionZones),
    wetlandPools: generateWetlandPools(seed, coordinate).filter(
      pool => !isVegetationExcluded(pool.x, pool.z, exclusionZones),
    ),
  };
}
