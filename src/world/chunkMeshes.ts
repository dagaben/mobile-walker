import * as THREE from "three";

import { BIOME_DEBUG_COLORS, type BiomeId, type BiomeWeights } from "./biomes";
import type { GeneratedChunkData } from "./generateChunk";
import type { RiverPoint } from "./river";

export interface DebugViewOptions {
  readonly wireframe: boolean;
  readonly boundaries: boolean;
  readonly riverPlacement: boolean;
  readonly biomeGuide: boolean;
}

const DEBUG_BOUNDARIES_NAME = "debug:walkable-boundaries";
const DEBUG_RIVER_NAME = "debug:river-placement";

/** Muted natural colors keep blended biome transitions subtle rather than candy-bright. */
const TERRAIN_PALETTE: Readonly<Record<BiomeId, THREE.Color>> = {
  plains: new THREE.Color(0x829b69),
  forest: new THREE.Color(0x35563b),
  wetland: new THREE.Color(0x71866a),
  highlands: new THREE.Color(0x8b7358),
};

const DEBUG_TERRAIN_PALETTE: Readonly<Record<BiomeId, THREE.Color>> = {
  plains: new THREE.Color(BIOME_DEBUG_COLORS.plains),
  forest: new THREE.Color(BIOME_DEBUG_COLORS.forest),
  wetland: new THREE.Color(BIOME_DEBUG_COLORS.wetland),
  highlands: new THREE.Color(BIOME_DEBUG_COLORS.highlands),
};

function blendBiomeColor(weights: BiomeWeights, target: THREE.Color): THREE.Color {
  target.setRGB(0, 0, 0);
  for (const id of Object.keys(TERRAIN_PALETTE) as BiomeId[]) {
    const color = TERRAIN_PALETTE[id];
    target.r += color.r * weights[id];
    target.g += color.g * weights[id];
    target.b += color.b * weights[id];
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
  private readonly trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x77553d, flatShading: true, roughness: 1,
  });
  private readonly foliageMaterial = new THREE.MeshStandardMaterial({
    color: 0x386f4b, flatShading: true, roughness: 1,
  });
  private readonly leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x5d8244, flatShading: true, roughness: 1, vertexColors: true,
  });
  private readonly bushMaterial = new THREE.MeshStandardMaterial({
    color: 0x527747, flatShading: true, roughness: 1, vertexColors: true,
  });
  private readonly flowerStemMaterial = new THREE.MeshStandardMaterial({
    color: 0x668653, flatShading: true, roughness: 1,
  });
  private readonly flowerHeadMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, flatShading: true, roughness: 0.9, vertexColors: true,
  });
  private readonly boundaryMaterial = new THREE.LineBasicMaterial({ color: 0xff4f4f, depthTest: false });
  private readonly riverPlacementMaterial = new THREE.MeshBasicMaterial({
    color: 0x1677ff, depthTest: false, transparent: true, opacity: 0.72, side: THREE.DoubleSide,
  });
  private debugView: DebugViewOptions = { wireframe: false, boundaries: false, riverPlacement: false, biomeGuide: false };

  create(data: GeneratedChunkData): THREE.Group {
    const group = new THREE.Group();
    group.name = `chunk:${data.id}`;
    group.add(this.createTerrain(data));
    if (data.river) group.add(this.createRiver(data.river.spine));
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
    this.trunkMaterial.dispose();
    this.foliageMaterial.dispose();
    this.leafMaterial.dispose();
    this.bushMaterial.dispose();
    this.flowerStemMaterial.dispose();
    this.flowerHeadMaterial.dispose();
    this.boundaryMaterial.dispose();
    this.riverPlacementMaterial.dispose();
  }

  private createTerrain(data: GeneratedChunkData): THREE.Mesh {
    const side = data.terrainVerticesPerSide;
    const positions: number[] = [];
    const colors: number[] = [];
    const debugColors: number[] = [];
    const indices: number[] = [];
    const color = new THREE.Color();
    for (let z = 0; z < side; z += 1) for (let x = 0; x < side; x += 1) {
      const vertexIndex = z * side + x;
      positions.push(
        data.coordinate.x * data.size + x * data.size / (side - 1),
        data.terrainHeights[vertexIndex] ?? 0,
        data.coordinate.z * data.size + z * data.size / (side - 1),
      );
      blendBiomeColor(data.terrainBiomeWeights[vertexIndex], color);
      colors.push(color.r, color.g, color.b);
      const dominant = (Object.keys(data.terrainBiomeWeights[vertexIndex]) as BiomeId[])
        .reduce((best, id) => data.terrainBiomeWeights[vertexIndex][id] > data.terrainBiomeWeights[vertexIndex][best] ? id : best);
      const debugColor = DEBUG_TERRAIN_PALETTE[dominant];
      debugColors.push(debugColor.r, debugColor.g, debugColor.b);
    }
    for (let z = 0; z < side - 1; z += 1) for (let x = 0; x < side - 1; x += 1) {
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

  private createRiver(spine: readonly RiverPoint[]): THREE.Mesh {
    return new THREE.Mesh(createRiverRibbonGeometry(spine), this.riverMaterial);
  }

  private createTrees(data: GeneratedChunkData): THREE.Group {
    const group = new THREE.Group();
    group.name = "trees";
    if (data.trees.length === 0) return group;

    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.11, 0.16, 1.1, 5), this.trunkMaterial, data.trees.length,
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
      new THREE.CylinderGeometry(0.13, 0.2, 1.35, 6), this.trunkMaterial, placements.length,
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
    if (boundaries) boundaries.visible = this.debugView.boundaries;
    if (riverPlacement) riverPlacement.visible = this.debugView.riverPlacement;
    const terrain = group.getObjectByName("terrain") as THREE.Mesh | undefined;
    if (terrain) {
      const geometry = terrain.geometry as THREE.BufferGeometry;
      geometry.setAttribute("color", geometry.getAttribute(this.debugView.biomeGuide ? "debugColor" : "biomeColor"));
      terrain.material = this.debugView.biomeGuide ? this.debugTerrainMaterial : this.terrainMaterial;
    }
  }
}
