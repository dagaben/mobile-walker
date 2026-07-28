import type * as THREE from "three";

import type { RenderSystem } from "../ecs/System";
import { chunkId } from "./chunkId";
import { worldToChunk } from "./chunkCoordinates";
import { ChunkMeshFactory } from "./chunkMeshes";
import { generateChunk } from "./generateChunk";

export class ChunkStreamingSystem implements RenderSystem {
  private readonly active = new Map<string, THREE.Group>();
  private readonly meshes = new ChunkMeshFactory();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly seed: number | string,
    private readonly radius = 1,
  ) {}

  prepareRender(world: Parameters<RenderSystem["prepareRender"]>[0]): void {
    const player = world.entities.find((entity) => entity.playerControl && entity.transform);
    if (!player?.transform) return;
    const center = worldToChunk(player.transform.x, player.transform.z);
    const wanted = new Set<string>();

    for (let z = center.z - this.radius; z <= center.z + this.radius; z += 1) {
      for (let x = center.x - this.radius; x <= center.x + this.radius; x += 1) {
        const coordinate = { x, z };
        const id = chunkId(coordinate);
        wanted.add(id);
        if (this.active.has(id)) continue;
        const group = this.meshes.create(generateChunk(this.seed, coordinate));
        this.active.set(id, group);
        this.scene.add(group);
      }
    }

    for (const [id, group] of this.active) {
      if (wanted.has(id)) continue;
      this.meshes.disposeChunk(group);
      this.active.delete(id);
    }
  }

  dispose(): void {
    for (const group of this.active.values()) this.meshes.disposeChunk(group);
    this.active.clear();
    this.meshes.dispose();
  }
}
