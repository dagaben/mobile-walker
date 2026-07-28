import * as THREE from "three";

import type { GeneratedChunkData } from "./generateChunk";

export interface DebugViewOptions {
  readonly wireframe: boolean;
  readonly boundaries: boolean;
  readonly riverPlacement: boolean;
}

const DEBUG_BOUNDARIES_NAME = "debug:walkable-boundaries";
const DEBUG_RIVER_NAME = "debug:river-placement";

/** Presentation-only conversion of plain generated data into disposable Three.js objects. */
export class ChunkMeshFactory {
  private readonly groups = new Set<THREE.Group>();
  private readonly terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fc98e, flatShading: true, roughness: 1,
  });
  private readonly riverMaterial = new THREE.MeshStandardMaterial({
    color: 0x5da9c9, flatShading: true, roughness: 0.65,
  });
  private readonly boundaryMaterial = new THREE.LineBasicMaterial({ color: 0xff4f4f, depthTest: false });
  private readonly riverPlacementMaterial = new THREE.MeshBasicMaterial({
    color: 0x1677ff, depthTest: false, transparent: true, opacity: 0.72, side: THREE.DoubleSide,
  });
  private debugView: DebugViewOptions = { wireframe: false, boundaries: false, riverPlacement: false };

  create(data: GeneratedChunkData): THREE.Group {
    const group = new THREE.Group();
    group.name = `chunk:${data.id}`;
    group.add(this.createTerrain(data), this.createRiver(data), this.createBoundaries(data), this.createRiverPlacement(data));
    return group;
  }

  setDebugView(options: DebugViewOptions): void {
    this.debugView = { ...options };
    this.terrainMaterial.wireframe = options.wireframe;
    this.terrainMaterial.needsUpdate = true;
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
    this.riverMaterial.dispose();
    this.boundaryMaterial.dispose();
    this.riverPlacementMaterial.dispose();
  }

  private createTerrain(data: GeneratedChunkData): THREE.Mesh {
    const side = data.terrainVerticesPerSide;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let z = 0; z < side; z += 1) for (let x = 0; x < side; x += 1) {
      positions.push(
        data.coordinate.x * data.size + x * data.size / (side - 1),
        data.terrainHeights[z * side + x] ?? 0,
        data.coordinate.z * data.size + z * data.size / (side - 1),
      );
    }
    for (let z = 0; z < side - 1; z += 1) for (let x = 0; x < side - 1; x += 1) {
      const topLeft = z * side + x;
      indices.push(topLeft, topLeft + side, topLeft + 1, topLeft + 1, topLeft + side, topLeft + side + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.terrainMaterial);
    mesh.receiveShadow = true;
    return mesh;
  }

  private createRiver(data: GeneratedChunkData): THREE.Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const point of data.river.spine) {
      positions.push(
        point.x, point.surfaceElevation, point.z - point.width / 2,
        point.x, point.surfaceElevation, point.z + point.width / 2,
      );
    }
    for (let index = 0; index < data.river.spine.length - 1; index += 1) {
      const left = index * 2;
      indices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, this.riverMaterial);
  }

  private createBoundaries(data: GeneratedChunkData): THREE.Group {
    const group = new THREE.Group();
    group.name = DEBUG_BOUNDARIES_NAME;
    const makeBank = (direction: -1 | 1): THREE.Line => {
      const points = data.river.spine.map((point) => new THREE.Vector3(
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

  private createRiverPlacement(data: GeneratedChunkData): THREE.Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const point of data.river.spine) {
      const elevation = point.surfaceElevation + 0.04;
      positions.push(point.x, elevation, point.z - point.width / 2, point.x, elevation, point.z + point.width / 2);
    }
    for (let index = 0; index < data.river.spine.length - 1; index += 1) {
      const left = index * 2;
      indices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
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
    group.getObjectByName(DEBUG_BOUNDARIES_NAME)!.visible = this.debugView.boundaries;
    group.getObjectByName(DEBUG_RIVER_NAME)!.visible = this.debugView.riverPlacement;
  }
}
