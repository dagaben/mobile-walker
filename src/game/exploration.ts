import * as THREE from "three";

import type { Entity } from "../ecs/Entity";
import type { EcsWorld } from "../ecs/createEcsWorld";
import type { FixedSystem, RenderSystem } from "../ecs/System";
import {
  resolveNeighborhoodOffsets,
  selectChunkCenter,
  type ChunkCoordinate,
  type ChunkNeighborhoodOffsets,
} from "../world/chunkCoordinates";
import { chunkId } from "../world/chunkId";
import type { GeneratedChunkRepository } from "../world/GeneratedChunkRepository";
import { placeCollectibles } from "../world/collectibles";
export { placeCollectibles } from "../world/collectibles";

export function createCollectionState(collectedIds: Iterable<string> = []): NonNullable<Entity["collectionState"]> {
  const ids = new Set(collectedIds);
  return { collectedIds: ids, discovered: ids.size };
}

export class ProximityDetectionSystem implements FixedSystem {
  fixedUpdate(world: EcsWorld): void {
    const player = world.entities.find((entity) => entity.playerControl && entity.transform);
    if (!player?.transform) return;
    for (const entity of world.entities) {
      if (!entity.interactable || !entity.transform || !entity.proximity) continue;
      const dx = player.transform.x - entity.transform.x;
      const dz = player.transform.z - entity.transform.z;
      const radius = entity.interactable.collectionRadius;
      entity.proximity.inRange = dx * dx + dz * dz <= radius * radius;
    }
  }
}

export class CollectionSystem implements FixedSystem {
  fixedUpdate(world: EcsWorld): void {
    const state = world.entities.find((entity) => entity.collectionState)?.collectionState;
    if (!state) return;
    for (const entity of world.entities) {
      if (!entity.interactable || !entity.proximity?.inRange) continue;
      if (state.collectedIds.has(entity.interactable.id)) continue;
      state.collectedIds.add(entity.interactable.id);
      state.discovered = state.collectedIds.size;
      if (entity.renderable) entity.renderable.visible = false;
    }
  }
}

export class ExplorationPresentationSystem implements RenderSystem {
  private active = new Map<string, Entity[]>();
  private center: ChunkCoordinate = { x: 0, z: 0 };
  private offsets: ChunkNeighborhoodOffsets;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly seed: number | string,
    radius = 1,
    offsets: Partial<ChunkNeighborhoodOffsets> = {},
    private readonly collectedCount?: HTMLElement | null,
    private readonly chunks?: GeneratedChunkRepository,
    private readonly prepareWorldObject: (object: THREE.Object3D) => void = () => undefined,
  ) {
    this.offsets = resolveNeighborhoodOffsets(radius, offsets);
  }

  setNeighborhoodOffsets(offsets: Partial<ChunkNeighborhoodOffsets>): void {
    this.offsets = resolveNeighborhoodOffsets(1, offsets);
  }

  prepareRender(world: EcsWorld): void {
    const player = world.entities.find((entity) => entity.playerControl && entity.transform);
    const state = world.entities.find((entity) => entity.collectionState)?.collectionState;
    if (!player?.transform || !state) return;
    if (this.collectedCount && this.collectedCount.textContent !== String(state.discovered)) {
      this.collectedCount.textContent = String(state.discovered);
    }
    this.center = selectChunkCenter(player.transform.x, player.transform.z, this.center);
    const wanted = new Set<string>();
    for (let z = this.center.z - this.offsets.north; z <= this.center.z + this.offsets.south; z += 1) {
      for (let x = this.center.x - this.offsets.west; x <= this.center.x + this.offsets.east; x += 1) {
        const coordinate = { x, z };
        const id = chunkId(coordinate);
        wanted.add(id);
        if (this.active.has(id)) continue;
        const data = this.chunks?.get(id);
        if (this.chunks && !data) continue;
        const entities = (data?.collectibles ?? placeCollectibles(this.seed, coordinate)).map((placement) => {
          const mesh = createMushroom();
          mesh.position.set(placement.x, placement.y, placement.z);
          this.prepareWorldObject(mesh);
          mesh.visible = !state.collectedIds.has(placement.id);
          this.scene.add(mesh);
          return world.add({
            transform: { x: placement.x, y: placement.y, z: placement.z, yaw: 0 },
            interactable: { id: placement.id, kind: "waypoint", collectionRadius: 1.25, chunkId: placement.chunkId },
            proximity: { inRange: false },
            renderable: mesh,
          });
        });
        this.active.set(id, entities);
      }
    }
    for (const [id, entities] of this.active) {
      if (wanted.has(id)) continue;
      for (const entity of entities) {
        if (entity.renderable) disposeObject(entity.renderable);
        world.remove(entity);
      }
      this.active.delete(id);
    }
    for (const entities of this.active.values()) {
      for (const entity of entities) if (entity.renderable && entity.interactable) {
        entity.renderable.visible = !state.collectedIds.has(entity.interactable.id);
      }
    }
  }

  dispose(): void {
    for (const entities of this.active.values()) for (const entity of entities) {
      if (entity.renderable) disposeObject(entity.renderable);
    }
    this.active.clear();
    garlicBulbGeometry.dispose(); garlicTipGeometry.dispose(); garlicBulbMaterial.dispose(); garlicTipMaterial.dispose();
  }
}

/** Garlic bulb collectible for Vampire Ducks 2.0 (replaces mushrooms). */
function createMushroom(): THREE.Group {
  // Keep function name for minimal API churn; mesh is garlic-themed.
  const garlic = new THREE.Group();
  const bulb = new THREE.Mesh(garlicBulbGeometry, garlicBulbMaterial);
  bulb.position.y = 0.28;
  bulb.castShadow = true;
  const tip = new THREE.Mesh(garlicTipGeometry, garlicTipMaterial);
  tip.position.y = 0.58;
  tip.castShadow = true;
  garlic.add(bulb, tip);
  return garlic;
}

const garlicBulbGeometry = new THREE.SphereGeometry(0.32, 10, 8);
const garlicTipGeometry = new THREE.ConeGeometry(0.12, 0.28, 8);
const garlicBulbMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f0e1, roughness: 0.85, flatShading: true });
const garlicTipMaterial = new THREE.MeshStandardMaterial({ color: 0xc8d89a, roughness: 0.75, flatShading: true });

function disposeObject(object: THREE.Object3D): void {
  object.removeFromParent();
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      // Shared geometries/materials are disposed in ExplorationPresentationSystem.dispose
    }
  });
}
