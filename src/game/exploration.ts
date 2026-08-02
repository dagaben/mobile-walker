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
      entity.proximity.inRange = dx * dx + dz * dz <= entity.interactable.collectionRadius ** 2;
    }
  }
}

export class CollectionSystem implements FixedSystem {
  fixedUpdate(world: EcsWorld): void {
    const state = world.entities.find((entity) => entity.collectionState)?.collectionState;
    if (!state) return;
    for (const entity of world.entities) {
      if (!entity.interactable || !entity.proximity?.inRange) continue;
      state.collectedIds.add(entity.interactable.id);
    }
    state.discovered = state.collectedIds.size;
  }
}

function disposeObject(object: THREE.Object3D): void { object.removeFromParent(); }

/** Streams only ECS/presentation shells; collection truth lives on the persistent state entity. */
export class ExplorationPresentationSystem implements RenderSystem {
  private readonly active = new Map<string, Entity[]>();
  private offsets: ChunkNeighborhoodOffsets;
  private center?: ChunkCoordinate;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly seed: number | string,
    radius = 1,
    offsets: Partial<ChunkNeighborhoodOffsets> = {},
    private readonly collectedCount?: HTMLElement,
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
    mushroomStemGeometry.dispose(); mushroomCapGeometry.dispose(); mushroomStemMaterial.dispose(); mushroomCapMaterial.dispose();
  }
}

function createMushroom(): THREE.Group {
  const mushroom = new THREE.Group();
  const stem = new THREE.Mesh(
    mushroomStemGeometry, mushroomStemMaterial,
  );
  stem.position.y = 0.275;
  stem.castShadow = true;
  const cap = new THREE.Mesh(
    mushroomCapGeometry, mushroomCapMaterial,
  );
  cap.scale.y = 0.65;
  cap.position.y = 0.55;
  cap.castShadow = true;
  mushroom.add(stem, cap);
  return mushroom;
}

const mushroomStemGeometry = new THREE.CylinderGeometry(0.16, 0.22, 0.55, 8);
const mushroomCapGeometry = new THREE.SphereGeometry(0.48, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const mushroomStemMaterial = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.9, flatShading: true });
const mushroomCapMaterial = new THREE.MeshStandardMaterial({ color: 0xd94b45, roughness: 0.82, flatShading: true });
