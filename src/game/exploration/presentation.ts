import * as THREE from "three";

import type { Entity } from "../../ecs/Entity";
import type { RenderSystem } from "../../ecs/System";
import { worldToChunk, type ChunkCoordinate } from "../../world/chunkCoordinates";
import { chunkId } from "../../world/chunkId";
import { placeLandmarks } from "./placement";

export class ExplorationPresentationSystem implements RenderSystem {
  private readonly active = new Map<string, Entity[]>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly seed: number | string,
    private readonly status: HTMLElement,
    private readonly radius = 1,
  ) {}

  prepareRender(world: Parameters<RenderSystem["prepareRender"]>[0]): void {
    const player = world.entities.find((entity) => entity.playerControl && entity.transform);
    const collection = world.entities.find((entity) => entity.collectionState)?.collectionState;
    if (!player?.transform || !collection) return;
    const center = worldToChunk(player.transform.x, player.transform.z);
    const wanted = new Set<string>();
    for (let z = center.z - this.radius; z <= center.z + this.radius; z += 1) {
      for (let x = center.x - this.radius; x <= center.x + this.radius; x += 1) {
        const coordinate = { x, z };
        const id = chunkId(coordinate);
        wanted.add(id);
        if (!this.active.has(id)) this.loadChunk(world, coordinate, collection.collectedIds);
      }
    }
    for (const [id, entities] of this.active) {
      if (!wanted.has(id)) this.unloadChunk(world, id, entities);
    }
    for (const entities of this.active.values()) for (const entity of [...entities]) {
      if (entity.interactable && collection.collectedIds.has(entity.interactable.id)) this.disposeEntity(world, entity);
    }
    const nearby = world.entities.some((entity) => entity.interactable && entity.proximity?.withinRange);
    this.status.textContent = `${collection.collectedIds.size} discoveries collected${nearby ? " • Discovery nearby" : " • Keep exploring"}`;
  }

  dispose(): void {
    for (const entities of this.active.values()) for (const entity of entities) this.disposeRenderable(entity);
    this.active.clear();
  }

  private loadChunk(world: Parameters<RenderSystem["prepareRender"]>[0], coordinate: ChunkCoordinate, collected: Set<string>): void {
    const id = chunkId(coordinate);
    const entities = placeLandmarks(this.seed, coordinate).filter((placement) => !collected.has(placement.id)).map((placement) => {
      const geometry = placement.kind === "waystone" ? new THREE.ConeGeometry(0.42, 1.3, 5) : new THREE.OctahedronGeometry(0.42);
      const material = new THREE.MeshStandardMaterial({ color: placement.kind === "waystone" ? 0xffd166 : 0x9bdbff, flatShading: true });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(placement.x, placement.y, placement.z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      return world.add({
        transform: { x: placement.x, y: placement.y, z: placement.z, yaw: 0 },
        interactable: { id: placement.id, kind: placement.kind, collectionRadius: 1.25 },
        proximity: { withinRange: false }, chunkResident: { chunkId: id }, renderable: mesh,
      });
    });
    this.active.set(id, entities);
  }

  private unloadChunk(world: Parameters<RenderSystem["prepareRender"]>[0], id: string, entities: Entity[]): void {
    for (const entity of [...entities]) this.disposeEntity(world, entity);
    this.active.delete(id);
  }

  private disposeEntity(world: Parameters<RenderSystem["prepareRender"]>[0], entity: Entity): void {
    this.disposeRenderable(entity);
    world.remove(entity);
    const entities = entity.chunkResident ? this.active.get(entity.chunkResident.chunkId) : undefined;
    if (entities) entities.splice(entities.indexOf(entity), 1);
  }

  private disposeRenderable(entity: Entity): void {
    if (!(entity.renderable instanceof THREE.Mesh)) return;
    entity.renderable.removeFromParent();
    entity.renderable.geometry.dispose();
    const materials = Array.isArray(entity.renderable.material) ? entity.renderable.material : [entity.renderable.material];
    for (const material of materials) material.dispose();
  }
}
