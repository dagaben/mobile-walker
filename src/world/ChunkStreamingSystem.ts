import type * as THREE from "three";

import type { RenderSystem } from "../ecs/System";
import { chunkId } from "./chunkId";
import { CHUNK_SIZE, type ChunkCoordinate, worldToChunk } from "./chunkCoordinates";
import { ChunkMeshFactory } from "./chunkMeshes";
import { generateChunk } from "./generateChunk";

export class ChunkStreamingSystem implements RenderSystem {
  private readonly active = new Map<string, THREE.Group>();
  private readonly meshes = new ChunkMeshFactory();
  private center: ChunkCoordinate = { x: 0, z: 0 };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly seed: number | string,
    private readonly radius = 1,
  ) {}

  setDebugView(options: import("./chunkMeshes").DebugViewOptions): void {
    this.meshes.setDebugView(options);
  }

  prepareRender(world: Parameters<RenderSystem["prepareRender"]>[0]): void {
    const player = world.entities.find((entity) => entity.playerControl && entity.transform);
    if (!player?.transform) return;
    const center = worldToChunk(player.transform.x, player.transform.z);
    this.center = center;
    const wanted = new Set<string>();

    for (let z = center.z - this.radius; z <= center.z + this.radius; z += 1) {
      for (let x = center.x - this.radius; x <= center.x + this.radius; x += 1) {
        const coordinate = { x, z };
        const id = chunkId(coordinate);
        wanted.add(id);
        if (this.active.has(id)) continue;
        const group = this.meshes.create(generateChunk(this.seed, coordinate));
        this.meshes.registerGroup(group);
        this.active.set(id, group);
        this.scene.add(group);
      }
    }

    for (const [id, group] of this.active) {
      if (wanted.has(id)) continue;
      this.meshes.unregisterGroup(group);
      this.meshes.disposeChunk(group);
      this.active.delete(id);
    }
  }

  /** Center of the resident neighborhood, in world coordinates. */
  getLoadedCenter(): { x: number; z: number } {
    return { x: (this.center.x + 0.5) * CHUNK_SIZE, z: (this.center.z + 0.5) * CHUNK_SIZE };
  }

  dispose(): void {
    for (const group of this.active.values()) {
      this.meshes.unregisterGroup(group);
      this.meshes.disposeChunk(group);
    }
    this.active.clear();
    this.meshes.dispose();
  }
}
