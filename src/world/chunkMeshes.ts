import * as THREE from "three";

import { BIOME_DEBUG_COLORS, type BiomeId, type BiomeWeights } from "./biomes";
import { TREE_TRUNK_RADIUS } from "./forest";
import type { GeneratedChunkData, RiverChannelSection } from "./generateChunk";
import type { RiverPoint } from "./river";
import { LEAF_TREE_TRUNK_RADIUS } from "./vegetation";
import { LAKE_SURFACE_ELEVATION, LAKE_WATER_WEIGHT, mountainSnowCoverage, RIVER_BED_DEPTH } from "./terrainSampling";

export interface DebugViewOptions {
  readonly wireframe: boolean;
  readonly boundaries: boolean;
  readonly riverPlacement: boolean;
  readonly biomeGuide: boolean;
}

const DEBUG_BOUNDARIES_NAME = "debug:walkable-boundaries";
const DEBUG_CHUNK_BOUNDARY_NAME = "debug:chunk-boundary";
const DEBUG_RIVER_NAME = "debug:river-placement";
const SNOW_COLOR = new THREE.Color(0xf4f6f7);
const TERRAIN_COLOR_BLEND_DISTANCE_SCALE = 0.5;

/** Muted natural colors keep blended biome transitions subtle rather than candy-bright. */
const TERRAIN_PALETTE: Readonly<Record<BiomeId, THREE.Color>> = {
  plains: new THREE.Color(0x829b69),
  forest: new THREE.Color(0x315f41),
  wetland: new THREE.Color(0x665746),
  lake: new THREE.Color(0x536b50),
  highlands: new THREE.Color(0x8b7358),
  mountain: new THREE.Color(0x34383d),
};

const DEBUG_TERRAIN_PALETTE: Readonly<Record<BiomeId, THREE.Color>> = {
  plains: new THREE.Color(BIOME_DEBUG_COLORS.plains),
  forest: new THREE.Color(BIOME_DEBUG_COLORS.forest),
  wetland: new THREE.Color(BIOME_DEBUG_COLORS.wetland),
  lake: new THREE.Color(BIOME_DEBUG_COLORS.lake),
  highlands: new THREE.Color(BIOME_DEBUG_COLORS.highlands),
  mountain: new THREE.Color(BIOME_DEBUG_COLORS.mountain),
};

/** Narrows terrain color transitions without changing biome-driven world generation. */
export function terrainColorWeights(weights: BiomeWeights): BiomeWeights {
  // Biome scores use Gaussian distance falloff. Raising each score to the
  // inverse square of the desired distance scale halves that falloff's radius.
  const exponent = 1 / TERRAIN_COLOR_BLEND_DISTANCE_SCALE ** 2;
  const sharpened = {} as Record<BiomeId, number>;
  let total = 0;
  for (const id of Object.keys(TERRAIN_PALETTE) as BiomeId[]) {
    sharpened[id] = weights[id] ** exponent;
    total += sharpened[id];
  }
  for (const id of Object.keys(TERRAIN_PALETTE) as BiomeId[]) sharpened[id] /= total;
  return sharpened;
}

function blendBiomeColor(weights: BiomeWeights, target: THREE.Color): THREE.Color {
  const colorWeights = terrainColorWeights(weights);
  target.setRGB(0, 0, 0);
  for (const id of Object.keys(TERRAIN_PALETTE) as BiomeId[]) {
    const color = TERRAIN_PALETTE[id];
    target.r += color.r * colorWeights[id];
    target.g += color.g * colorWeights[id];
    target.b += color.b * colorWeights[id];
  }
  return target;
}

/** Builds the shared river ribbon with front faces and normals pointing upward. */
export function createRiverRibbonGeometry(
  spine: readonly RiverPoint[],
  elevationOffset = 0,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const point of spine) {
    const elevation = point.surfaceElevation + elevationOffset;
    positions.push(
      point.x, elevation, point.z - point.width / 2,
      point.x, elevation, point.z + point.width / 2,
    );
  }
  for (let index = 0; index < spine.length - 1; index += 1) {
    const left = index * 2;
    indices.push(left + 1, left + 2, left, left + 3, left + 2, left + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Builds the banks and bed as one deliberately faceted six-vertex strip. */
export function createRiverChannelGeometry(
  sections: readonly RiverChannelSection[],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const section of sections) {
    const northWater = section.centerZ - section.waterHalfWidth;
    const southWater = section.centerZ + section.waterHalfWidth;
    const bedHeight = section.surfaceElevation - RIVER_BED_DEPTH;
    const lipHeight = section.surfaceElevation + 0.04;
    positions.push(
      section.x, section.northShoulderHeight, northWater - section.bankWidth,
      section.x, lipHeight, northWater,
      section.x, bedHeight, northWater + section.waterHalfWidth * 0.1,
      section.x, bedHeight, southWater - section.waterHalfWidth * 0.1,
      section.x, lipHeight, southWater,
      section.x, section.southShoulderHeight, southWater + section.bankWidth,
    );
  }
  for (let section = 0; section < sections.length - 1; section += 1) {
    for (let cross = 0; cross < 5; cross += 1) {
      const current = section * 6 + cross;
      const next = current + 6;
      indices.push(current, current + 1, next, current + 1, next + 1, next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Presentation-only conversion of plain generated data into disposable Three.js objects. */
export class ChunkMeshFactory {
  private readonly groups = new Set<THREE.Group>();
  private readonly terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, flatShading: true, roughness: 1,
  });
  private readonly debugTerrainMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, flatShading: true, roughness: 1,
  });
  private readonly riverMaterial = new THREE.MeshStandardMaterial({
    color: 0x5da9c9, flatShading: true, roughness: 0.65,
  });
  private readonly riverChannelMaterial = new THREE.MeshStandardMaterial({
    color: 0x71875c, flatShading: true, roughness: 1,
  });
  private readonly wetlandWaterMaterial = new THREE.MeshStandardMaterial({
    color: 0x6599a0, flatShading: true, roughness: 0.42, transparent: true, opacity: 0.82,
  });
  private readonly trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x77553d, flatShading: true, roughness: 1,
  });
  private readonly foliageMaterial = new THREE.MeshStandardMaterial({
    color: 0x386f4b, flatShading: true, roughness: 1,
  });
  private readonly leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x5d8244, flatShading: true, roughness: 1,
  });
  private readonly bushMaterial = new THREE.MeshStandardMaterial({
    color: 0x527747, flatShading: true, roughness: 1,
  });
  private readonly flowerStemMaterial = new THREE.MeshStandardMaterial({
    color: 0x668653, flatShading: true, roughness: 1,
  });
  private readonly flowerHeadMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, flatShading: true, roughness: 0.9,
  });
  private readonly boundaryMaterial = new THREE.LineBasicMaterial({ color: 0xff4f4f, depthTest: false });
  private readonly chunkBoundaryMaterial = new THREE.LineBasicMaterial({ color: 0x8b0000, depthTest: false });
  private readonly riverPlacementMaterial = new THREE.MeshBasicMaterial({
    color: 0x1677ff, depthTest: false, transparent: true, opacity: 0.72, side: THREE.DoubleSide,
  });
  private debugView: DebugViewOptions = { wireframe: false, boundaries: false, riverPlacement: false, biomeGuide: false };

  create(data: GeneratedChunkData): THREE.Group {
    const group = new THREE.Group();
    group.name = `chunk:${data.id}`;
    group.add(this.createTerrain(data));
    group.add(this.createChunkBoundary(data));
    if (data.river) group.add(this.createRiver(data.river.spine));
    if (data.river) group.add(this.createRiverChannel(data.river.channelSections));
    group.add(this.createLake(data));
    group.add(this.createWetlandPools(data));
    group.add(this.createTrees(data));
    group.add(this.createVegetation(data));
    if (data.river) group.add(this.createBoundaries(data.river.spine), this.createRiverPlacement(data.river.spine));
    return group;
  }

  setDebugView(options: DebugViewOptions): void {
    this.debugView = { ...options };
    this.terrainMaterial.wireframe = options.wireframe;
    this.debugTerrainMaterial.wireframe = options.wireframe;
    this.terrainMaterial.needsUpdate = true;
    this.debugTerrainMaterial.needsUpdate = true;
    // Debug objects share stable names, including chunks streamed after a toggle.
    for (const group of this.groups) this.applyDebugVisibility(group);
  }

  disposeChunk(group: THREE.Group): void {
    group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) object.geometry.dispose();
    });
    group.removeFromParent();
  }

  dispose(): void {
    this.terrainMaterial.dispose();
    this.debugTerrainMaterial.dispose();
    this.riverMaterial.dispose();
    this.riverChannelMaterial.dispose();
    this.wetlandWaterMaterial.dispose();
    this.trunkMaterial.dispose();
    this.foliageMaterial.dispose();
    this.leafMaterial.dispose();
    this.bushMaterial.dispose();
    this.flowerStemMaterial.dispose();
    this.flowerHeadMaterial.dispose();
    this.boundaryMaterial.dispose();
    this.chunkBoundaryMaterial.dispose();
    this.riverPlacementMaterial.dispose();
  }

  private createTerrain(data: GeneratedChunkData): THREE.Mesh {
    const side = data.terrainVerticesPerSide;
    const positions: number[] = [];
    const colors: number[] = [];
    const debugColors: number[] = [];
    const indices: number[] = [];
    const color = new THREE.Color();
    const renderedVertices = data.irregularTerrain?.vertices ?? data.terrainHeights.map((height, vertexIndex) => ({
      x: data.coordinate.x * data.size + vertexIndex % side * data.size / (side - 1),
      z: data.coordinate.z * data.size + Math.floor(vertexIndex / side) * data.size / (side - 1),
      height,
      biomeWeights: data.terrainBiomeWeights[vertexIndex],
    }));
    for (const vertex of renderedVertices) {
      positions.push(vertex.x, vertex.height, vertex.z);
      blendBiomeColor(vertex.biomeWeights, color);
      const snow = mountainSnowCoverage(vertex.height, vertex.biomeWeights);
      color.lerp(SNOW_COLOR, snow);
      colors.push(color.r, color.g, color.b);
      const dominant = (Object.keys(vertex.biomeWeights) as BiomeId[])
        .reduce((best, id) => vertex.biomeWeights[id] > vertex.biomeWeights[best] ? id : best);
      const debugColor = DEBUG_TERRAIN_PALETTE[dominant];
      debugColors.push(debugColor.r, debugColor.g, debugColor.b);
    }
    if (data.irregularTerrain) indices.push(...data.irregularTerrain.indices);
    else for (let z = 0; z < side - 1; z += 1) for (let x = 0; x < side - 1; x += 1) {
        const topLeft = z * side + x;
        indices.push(topLeft, topLeft + side, topLeft + 1, topLeft + 1, topLeft + side, topLeft + side + 1);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const biomeColorAttribute = new THREE.Float32BufferAttribute(colors, 3);
    geometry.setAttribute("biomeColor", biomeColorAttribute);
    geometry.setAttribute("color", biomeColorAttribute);
    geometry.setAttribute("debugColor", new THREE.Float32BufferAttribute(debugColors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.terrainMaterial);
    mesh.name = "terrain";
    mesh.receiveShadow = true;
    return mesh;
  }

  private createChunkBoundary(data: GeneratedChunkData): THREE.LineLoop {
    const side = data.terrainVerticesPerSide;
    const step = data.size / (side - 1);
    const originX = data.coordinate.x * data.size;
    const originZ = data.coordinate.z * data.size;
    const pointAt = (x: number, z: number): THREE.Vector3 => {
      const height = data.terrainHeights[z * side + x]!;
      return new THREE.Vector3(originX + x * step, height + 0.12, originZ + z * step);
    };
    const points: THREE.Vector3[] = [];
    for (let x = 0; x < side; x += 1) points.push(pointAt(x, 0));
    for (let z = 1; z < side; z += 1) points.push(pointAt(side - 1, z));
    for (let x = side - 2; x >= 0; x -= 1) points.push(pointAt(x, side - 1));
    for (let z = side - 2; z > 0; z -= 1) points.push(pointAt(0, z));

    const boundary = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      this.chunkBoundaryMaterial,
    );
    boundary.name = DEBUG_CHUNK_BOUNDARY_NAME;
    boundary.renderOrder = 22;
    boundary.visible = this.debugView.wireframe;
    return boundary;
  }

  private createRiver(spine: readonly RiverPoint[]): THREE.Mesh {
    const mesh = new THREE.Mesh(createRiverRibbonGeometry(spine), this.riverMaterial);
    mesh.name = "river";
    return mesh;
  }

  private createRiverChannel(sections: readonly RiverChannelSection[]): THREE.Mesh {
    // Channel geometry does not carry the biome vertex-color attribute used by
    // the base terrain. A dedicated material keeps its banks naturally colored
    // instead of allowing the missing attribute to multiply them to black.
    const mesh = new THREE.Mesh(createRiverChannelGeometry(sections), this.riverChannelMaterial);
    mesh.name = "river-channel";
    mesh.receiveShadow = true;
    return mesh;
  }

  private createWetlandPools(data: GeneratedChunkData): THREE.Group {
    const group = new THREE.Group();
    group.name = "wetland-pools";
    if (data.wetlandPools.length === 0) return group;
    const pools = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 10), this.wetlandWaterMaterial, data.wetlandPools.length,
    );
    const transform = new THREE.Object3D();
    for (const [index, pool] of data.wetlandPools.entries()) {
      transform.position.set(pool.x, pool.y, pool.z);
      transform.rotation.set(-Math.PI / 2, 0, pool.rotation);
      transform.scale.set(pool.radiusX, pool.radiusZ, 1);
      transform.updateMatrix();
      pools.setMatrixAt(index, transform.matrix);
    }
    pools.receiveShadow = true;
    pools.renderOrder = 1;
    group.add(pools);
    return group;
  }

  /** Floods contiguous lake-biome cells with the exact material used by wetland puddles. */
  private createLake(data: GeneratedChunkData): THREE.Mesh {
    const side = data.terrainVerticesPerSide;
    const step = data.size / (side - 1);
    const originX = data.coordinate.x * data.size;
    const originZ = data.coordinate.z * data.size;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let z = 0; z < side - 1; z += 1) for (let x = 0; x < side - 1; x += 1) {
      const corners = [z * side + x, z * side + x + 1, (z + 1) * side + x, (z + 1) * side + x + 1];
      if (!corners.every((index) => data.terrainBiomeWeights[index]!.lake >= LAKE_WATER_WEIGHT)) continue;
      const vertex = positions.length / 3;
      positions.push(
        originX + x * step, LAKE_SURFACE_ELEVATION, originZ + z * step,
        originX + (x + 1) * step, LAKE_SURFACE_ELEVATION, originZ + z * step,
        originX + x * step, LAKE_SURFACE_ELEVATION, originZ + (z + 1) * step,
        originX + (x + 1) * step, LAKE_SURFACE_ELEVATION, originZ + (z + 1) * step,
      );
      indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const lake = new THREE.Mesh(geometry, this.wetlandWaterMaterial);
    lake.name = "lake";
    lake.receiveShadow = true;
    lake.renderOrder = 1;
    return lake;
  }

  private createTrees(data: GeneratedChunkData): THREE.Group {
    const group = new THREE.Group();
    group.name = "trees";
    if (data.trees.length === 0) return group;

    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.11, TREE_TRUNK_RADIUS, 1.1, 5), this.trunkMaterial, data.trees.length,
    );
    const crowns = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.82, 2.25, 7), this.foliageMaterial, data.trees.length,
    );
    const upperCrowns = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.59, 1.75, 7), this.foliageMaterial, data.trees.length,
    );
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    data.trees.forEach((tree, index) => {
      transform.position.set(tree.x, tree.y + 0.55 * tree.scale, tree.z);
      transform.rotation.y = tree.rotation;
      transform.scale.setScalar(tree.scale);
      transform.updateMatrix();
      trunks.setMatrixAt(index, transform.matrix);

      transform.position.y = tree.y + 1.45 * tree.scale;
      transform.updateMatrix();
      crowns.setMatrixAt(index, transform.matrix);
      color.setHSL(0.36 + tree.shade * 0.025, 0.34, 0.27 + tree.shade * 0.08);
      crowns.setColorAt(index, color);

      transform.position.y = tree.y + 2.15 * tree.scale;
      transform.updateMatrix();
      upperCrowns.setMatrixAt(index, transform.matrix);
      upperCrowns.setColorAt(index, color);
    });
    trunks.castShadow = crowns.castShadow = upperCrowns.castShadow = true;
    trunks.receiveShadow = crowns.receiveShadow = upperCrowns.receiveShadow = true;
    group.add(trunks, crowns, upperCrowns);
    return group;
  }

  private createVegetation(data: GeneratedChunkData): THREE.Group {
    const group = new THREE.Group();
    group.name = "vegetation";
    group.add(
      this.createLeafTrees(data),
      this.createBushes(data),
      this.createFlowers(data),
    );
    return group;
  }

  private createLeafTrees(data: GeneratedChunkData): THREE.Group {
    const group = new THREE.Group();
    group.name = "leaf-trees";
    const placements = data.vegetation.leafTrees;
    if (placements.length === 0) return group;
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.13, LEAF_TREE_TRUNK_RADIUS, 1.35, 6), this.trunkMaterial, placements.length,
    );
    const crown = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.9, 1), this.leafMaterial, placements.length,
    );
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    placements.forEach((tree, index) => {
      transform.position.set(tree.x, tree.y + 0.675 * tree.scale, tree.z);
      transform.rotation.y = tree.rotation;
      transform.scale.setScalar(tree.scale);
      transform.updateMatrix();
      trunk.setMatrixAt(index, transform.matrix);
      transform.position.set(tree.x, tree.y + 1.65 * tree.scale, tree.z);
      transform.scale.set(1.15 * tree.scale, 0.92 * tree.scale, tree.scale);
      transform.updateMatrix();
      crown.setMatrixAt(index, transform.matrix);
      color.setHSL(0.25 + tree.shade * 0.05, 0.36, 0.33 + tree.shade * 0.08);
      crown.setColorAt(index, color);
    });
    trunk.castShadow = crown.castShadow = true;
    trunk.receiveShadow = crown.receiveShadow = true;
    group.add(trunk, crown);
    return group;
  }

  private createBushes(data: GeneratedChunkData): THREE.Group {
    const group = new THREE.Group();
    group.name = "bushes";
    const placements = data.vegetation.bushes;
    if (placements.length === 0) return group;
    const bushes = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.42, 0), this.bushMaterial, placements.length,
    );
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    placements.forEach((bush, index) => {
      transform.position.set(bush.x, bush.y + 0.3 * bush.scale, bush.z);
      transform.rotation.y = bush.rotation;
      transform.scale.set(1.3 * bush.scale, 0.72 * bush.scale, bush.scale);
      transform.updateMatrix();
      bushes.setMatrixAt(index, transform.matrix);
      color.setHSL(0.27 + bush.shade * 0.04, 0.32, 0.31 + bush.shade * 0.08);
      bushes.setColorAt(index, color);
    });
    bushes.castShadow = bushes.receiveShadow = true;
    group.add(bushes);
    return group;
  }

  private createFlowers(data: GeneratedChunkData): THREE.Group {
    const group = new THREE.Group();
    group.name = "flowers";
    const placements = data.vegetation.flowers;
    if (placements.length === 0) return group;
    const stems = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.018, 0.025, 0.3, 4), this.flowerStemMaterial, placements.length,
    );
    const heads = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.105, 0), this.flowerHeadMaterial, placements.length,
    );
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    placements.forEach((flower, index) => {
      transform.position.set(flower.x, flower.y + 0.15 * flower.scale, flower.z);
      transform.rotation.y = flower.rotation;
      transform.scale.setScalar(flower.scale);
      transform.updateMatrix();
      stems.setMatrixAt(index, transform.matrix);
      transform.position.y = flower.y + 0.34 * flower.scale;
      transform.updateMatrix();
      heads.setMatrixAt(index, transform.matrix);
      heads.setColorAt(index, color.setHex(flower.color));
    });
    group.add(stems, heads);
    return group;
  }

  private createBoundaries(spine: readonly RiverPoint[]): THREE.Group {
    const group = new THREE.Group();
    group.name = DEBUG_BOUNDARIES_NAME;
    const makeBank = (direction: -1 | 1): THREE.Line => {
      const points = spine.map((point) => new THREE.Vector3(
        point.x, point.surfaceElevation + 0.08, point.z + direction * point.width / 2,
      ));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), this.boundaryMaterial);
      line.renderOrder = 20;
      return line;
    };
    group.add(makeBank(-1), makeBank(1));
    group.visible = this.debugView.boundaries;
    return group;
  }

  private createRiverPlacement(spine: readonly RiverPoint[]): THREE.Mesh {
    const geometry = createRiverRibbonGeometry(spine, 0.04);
    const mesh = new THREE.Mesh(geometry, this.riverPlacementMaterial);
    mesh.name = DEBUG_RIVER_NAME;
    mesh.renderOrder = 21;
    mesh.visible = this.debugView.riverPlacement;
    return mesh;
  }

  registerGroup(group: THREE.Group): void {
    this.groups.add(group);
    this.applyDebugVisibility(group);
  }

  unregisterGroup(group: THREE.Group): void {
    this.groups.delete(group);
  }

  private applyDebugVisibility(group: THREE.Group): void {
    const boundaries = group.getObjectByName(DEBUG_BOUNDARIES_NAME);
    const riverPlacement = group.getObjectByName(DEBUG_RIVER_NAME);
    const chunkBoundary = group.getObjectByName(DEBUG_CHUNK_BOUNDARY_NAME);
    if (boundaries) boundaries.visible = this.debugView.boundaries;
    if (riverPlacement) riverPlacement.visible = this.debugView.riverPlacement;
    if (chunkBoundary) chunkBoundary.visible = this.debugView.wireframe;
    const terrain = group.getObjectByName("terrain") as THREE.Mesh | undefined;
    if (terrain) {
      const geometry = terrain.geometry as THREE.BufferGeometry;
      geometry.setAttribute("color", geometry.getAttribute(this.debugView.biomeGuide ? "debugColor" : "biomeColor"));
      terrain.material = this.debugView.biomeGuide ? this.debugTerrainMaterial : this.terrainMaterial;
    }
  }
}
