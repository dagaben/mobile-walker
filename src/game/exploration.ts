import * as THREE from "three";

import type { Entity } from "../ecs/Entity";
import type { EcsWorld } from "../ecs/createEcsWorld";
import type { FixedSystem, RenderSystem } from "../ecs/System";
import { CHUNK_SIZE, chunkOrigin, selectChunkCenter, type ChunkCoordinate } from "../world/chunkCoordinates";
import { chunkId } from "../world/chunkId";
import { hashFloat, normalizeSeed } from "../world/random";
import { sampleTerrainHeight } from "../world/terrainSampling";

export interface CollectiblePlacement {
  readonly id: string;
  readonly chunkId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const COLLECTIBLES_PER_CHUNK = 2;

/** Pure, random-access placement. A chunk always produces exactly the same objects. */
export function placeCollectibles(seedInput: number | string, coordinate: ChunkCoordinate): readonly CollectiblePlacement[] {
  const seed = normalizeSeed(seedInput);
  const origin = chunkOrigin(coordinate);
  const owner = chunkId(coordinate);
  return Array.from({ length: COLLECTIBLES_PER_CHUNK }, (_, index) => {
    // The inset keeps objects away from seams where presentation chunks churn.
    const x = origin.x + 2 + hashFloat(seed, coordinate.x, coordinate.z, index, 101) * (CHUNK_SIZE - 4);
    const z = origin.z + 2 + hashFloat(seed, coordinate.x, coordinate.z, index, 211) * (CHUNK_SIZE - 4);
    return { id: `${owner}:waypoint:${index}`, chunkId: owner, x, y: sampleTerrainHeight(seed, x, z) + 0.72, z };
  });
}

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

function disposeObject(object: THREE.Object3D): void {
  object.removeFromParent();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
}

/** Streams only ECS/presentation shells; collection truth lives on the persistent state entity. */
export class ExplorationPresentationSystem implements RenderSystem {
  private readonly active = new Map<string, Entity[]>();
  private center?: ChunkCoordinate;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly seed: number | string,
    private readonly radius = 1,
  ) {}

  prepareRender(world: EcsWorld): void {
    const player = world.entities.find((entity) => entity.playerControl && entity.transform);
    const state = world.entities.find((entity) => entity.collectionState)?.collectionState;
    if (!player?.transform || !state) return;
    this.center = selectChunkCenter(player.transform.x, player.transform.z, this.center);
    const wanted = new Set<string>();
    for (let z = this.center.z - this.radius; z <= this.center.z + this.radius; z += 1) {
      for (let x = this.center.x - this.radius; x <= this.center.x + this.radius; x += 1) {
        const coordinate = { x, z };
        const id = chunkId(coordinate);
        wanted.add(id);
        if (this.active.has(id)) continue;
        const entities = placeCollectibles(this.seed, coordinate).map((placement) => {
          const mesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.45, 0),
            new THREE.MeshStandardMaterial({ color: 0xf4c95d, emissive: 0x604510, flatShading: true }),
          );
          mesh.position.set(placement.x, placement.y, placement.z);
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
  }
}
