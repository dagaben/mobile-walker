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

export class ExplorationPresentationSystem implements RenderSystem {
  private readonly active = new Map<string, Entity[]>();
  private _offsets: ChunkNeighborhoodOffsets;
  private center?: ChunkCoordinate;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly seed: number | string,
    radius = 1,
    offsets: Partial<ChunkNeighborhoodOffsets> = {},
    private readonly collectedCount?: HTMLElement | null,
    private readonly _chunks?: GeneratedChunkRepository,
    private readonly prepareWorldObject: (object: THREE.Object3D) => void = () => undefined,
  ) {
    this._offsets = resolveNeighborhoodOffsets(radius, offsets);
  }

  setNeighborhoodOffsets(offsets: Partial<ChunkNeighborhoodOffsets>): void {
    this._offsets = resolveNeighborhoodOffsets(1, offsets);
  }

  prepareRender(world: EcsWorld, _interpolation?: number, _deltaSeconds?: number): void {
    void this._offsets;
    void this._chunks;
    const state = world.entities.find((entity) => entity.collectionState)?.collectionState;
    if (!state) return;
    const combat = world.entities.find((entity) => entity.combat)?.combat;
    const display = combat ? combat.garlicCount : (state.garlicValue ?? state.discovered);
    const text = String(display);
    if (this.collectedCount && this.collectedCount.textContent !== text) {
      this.collectedCount.textContent = text;
    }
    const garlicHud = document.getElementById("garlic-count");
    if (garlicHud && garlicHud.textContent !== text) garlicHud.textContent = text;

    const player = world.entities.find((e) => e.playerControl && e.transform);
    if (!player?.transform) return;
    const center = selectChunkCenter(player.transform.x, player.transform.z);
    const centerKey = chunkId(center);
    if (this.center && chunkId(this.center) === centerKey) return;
    this.center = center;

    try {
      const nightCount = world.entities.find((e) => e.dayNight)?.dayNight?.nightCount || 1;
      const placements = placeCollectibles(this.seed, center, [], nightCount);
      for (const placement of placements) {
        if (state.collectedIds.has(placement.id)) continue;
        if (this.active.has(placement.id)) continue;
        const isSuper = placement.value >= 10;
        const mesh = createGarlicMesh(isSuper);
        const y = placement.y ?? 0.4;
        mesh.position.set(placement.x, y, placement.z);
        this.scene.add(mesh);
        this.prepareWorldObject(mesh);
        const entity: Entity = {
          transform: { x: placement.x, y, z: placement.z, yaw: 0 },
          interactable: {
            id: placement.id,
            kind: "garlic",
            collectionRadius: 1.35,
            chunkId: placement.chunkId,
            value: placement.value ?? 1,
            isSuper,
          },
          proximity: { inRange: false },
          renderable: mesh,
        };
        world.add(entity);
        this.active.set(placement.id, [entity]);
      }
    } catch {
      // Placement helper may be unavailable during partial deploys; HUD still works.
    }
  }

  dispose(): void {
    for (const entities of this.active.values()) {
      for (const entity of entities) {
        if (entity.renderable) disposeObject(entity.renderable);
      }
    }
    this.active.clear();
  }
}

export function createGarlicMesh(isSuper = false): THREE.Group {
  const garlic = new THREE.Group();
  const bulbMat = isSuper ? garlicSuperBulbMaterial : garlicBulbMaterial;
  const tipMat = isSuper ? garlicSuperTipMaterial : garlicTipMaterial;
  const bulb = new THREE.Mesh(garlicBulbGeometry, bulbMat);
  bulb.castShadow = true;
  garlic.add(bulb);
  const cloveL = new THREE.Mesh(garlicCloveGeometry, bulbMat);
  cloveL.position.set(-0.22, -0.05, 0.1);
  garlic.add(cloveL);
  const cloveR = new THREE.Mesh(garlicCloveGeometry, bulbMat);
  cloveR.position.set(0.22, -0.05, 0.1);
  garlic.add(cloveR);
  const tip = new THREE.Mesh(garlicTipGeometry, tipMat);
  tip.position.y = 0.38;
  garlic.add(tip);
  if (isSuper) {
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.22 }),
    );
    garlic.add(glow);
  }
  return garlic;
}

const garlicBulbGeometry = new THREE.SphereGeometry(0.34, 12, 10);
const garlicCloveGeometry = new THREE.SphereGeometry(0.28, 8, 6);
const garlicTipGeometry = new THREE.ConeGeometry(0.11, 0.3, 8);
const garlicBulbMaterial = new THREE.MeshStandardMaterial({ color: 0xf7f2e4, roughness: 0.82, flatShading: true });
const garlicTipMaterial = new THREE.MeshStandardMaterial({ color: 0xd8c89a, roughness: 0.85, flatShading: true });
const garlicSuperBulbMaterial = new THREE.MeshStandardMaterial({ color: 0xffe566, roughness: 0.55, flatShading: true });
const garlicSuperTipMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc33, roughness: 0.55, flatShading: true });
