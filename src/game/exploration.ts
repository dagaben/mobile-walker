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
  return { collectedIds: ids, discovered: ids.size, garlicValue: 0 };
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
    const combat = world.entities.find((entity) => entity.combat)?.combat;
    if (!state) return;
    if (state.garlicValue === undefined) state.garlicValue = 0;
    for (const entity of world.entities) {
      if (!entity.interactable || !entity.proximity?.inRange) continue;
      if (state.collectedIds.has(entity.interactable.id)) continue;
      state.collectedIds.add(entity.interactable.id);
      const value = entity.interactable.value ?? 1;
      state.garlicValue += value;
      if (combat) {
        combat.garlicCount += value;
        combat.score += value * 10;
      }
      if (entity.renderable) entity.renderable.visible = false;
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
    const combat = world.entities.find((entity) => entity.combat)?.combat;
    const display = combat ? combat.garlicCount : (state.garlicValue ?? state.discovered);
    if (this.collectedCount && this.collectedCount.textContent !== String(display)) {
      this.collectedCount.textContent = String(display);
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
          const isSuper = "isSuper" in placement ? Boolean((placement as { isSuper?: boolean }).isSuper) : false;
          const value = "value" in placement ? Number((placement as { value?: number }).value) || 1 : 1;
          const mesh = createMushroom(isSuper);
          mesh.position.set(placement.x, placement.y, placement.z);
          this.prepareWorldObject(mesh);
          mesh.visible = !state.collectedIds.has(placement.id);
          this.scene.add(mesh);
          return world.add({
            transform: { x: placement.x, y: placement.y, z: placement.z, yaw: 0 },
            interactable: { id: placement.id, kind: "garlic", collectionRadius: 1.35, chunkId: placement.chunkId, value, isSuper },
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
    garlicBulbGeometry.dispose(); garlicCloveGeometry.dispose(); garlicTipGeometry.dispose();
    garlicBulbMaterial.dispose(); garlicTipMaterial.dispose();
    garlicSuperBulbMaterial.dispose(); garlicSuperTipMaterial.dispose();
  }
}

/** Solid garlic bulb (Vampire Ducks 2.0). isSuper uses a golden tint. */
function createMushroom(isSuper = false): THREE.Group {
  const garlic = new THREE.Group();
  const bulbMat = isSuper ? garlicSuperBulbMaterial : garlicBulbMaterial;
  const tipMat = isSuper ? garlicSuperTipMaterial : garlicTipMaterial;
  const bulb = new THREE.Mesh(garlicBulbGeometry, bulbMat);
  bulb.position.y = 0.32;
  bulb.scale.set(1.05, 0.95, 1.05);
  bulb.castShadow = true;
  const cloveL = new THREE.Mesh(garlicCloveGeometry, bulbMat);
  cloveL.position.set(-0.18, 0.28, 0.05);
  cloveL.scale.set(0.55, 0.7, 0.55);
  cloveL.castShadow = true;
  const cloveR = new THREE.Mesh(garlicCloveGeometry, bulbMat);
  cloveR.position.set(0.18, 0.28, 0.05);
  cloveR.scale.set(0.55, 0.7, 0.55);
  cloveR.castShadow = true;
  const tip = new THREE.Mesh(garlicTipGeometry, tipMat);
  tip.position.y = 0.62;
  tip.castShadow = true;
  garlic.add(bulb, cloveL, cloveR, tip);
  if (isSuper) {
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffe566, transparent: true, opacity: 0.22, flatShading: true }),
    );
    glow.position.y = 0.35;
    garlic.add(glow);
  }
  return garlic;
}

const garlicBulbGeometry = new THREE.SphereGeometry(0.34, 12, 10);
const garlicCloveGeometry = new THREE.SphereGeometry(0.28, 8, 6);
const garlicTipGeometry = new THREE.ConeGeometry(0.11, 0.3, 8);
const garlicBulbMaterial = new THREE.MeshStandardMaterial({ color: 0xf7f2e4, roughness: 0.82, flatShading: true });
const garlicTipMaterial = new THREE.MeshStandardMaterial({ color: 0xb8d080, roughness: 0.72, flatShading: true });
const garlicSuperBulbMaterial = new THREE.MeshStandardMaterial({ color: 0xfff3b0, roughness: 0.55, flatShading: true, emissive: 0x665500, emissiveIntensity: 0.25 });
const garlicSuperTipMaterial = new THREE.MeshStandardMaterial({ color: 0xe8c547, roughness: 0.55, flatShading: true, emissive: 0x886600, emissiveIntensity: 0.2 });
