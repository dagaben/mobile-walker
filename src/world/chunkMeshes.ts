import * as THREE from "three";

import type { GeneratedChunkData } from "./generateChunk";

/** Presentation-only conversion of plain generated data into disposable Three.js objects. */
export class ChunkMeshFactory {
  private readonly terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fc98e, flatShading: true, roughness: 1,
  });
  private readonly riverMaterial = new THREE.MeshStandardMaterial({
    color: 0x5da9c9, flatShading: true, roughness: 0.65,
  });

  create(data: GeneratedChunkData): THREE.Group {
    const group = new THREE.Group();
    group.name = `chunk:${data.id}`;
    group.add(this.createTerrain(data), this.createRiver(data));
    return group;
  }

  disposeChunk(group: THREE.Group): void {
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    group.removeFromParent();
  }

  dispose(): void {
    this.terrainMaterial.dispose();
    this.riverMaterial.dispose();
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
      positions.push(point.x, 0.12, point.z - point.width / 2, point.x, 0.12, point.z + point.width / 2);
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
}
