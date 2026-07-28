import type { FixedSystem } from "../../ecs/System";

export class ProximityDetectionSystem implements FixedSystem {
  fixedUpdate(world: Parameters<FixedSystem["fixedUpdate"]>[0]): void {
    const player = world.entities.find((entity) => entity.playerControl && entity.transform);
    if (!player?.transform) return;
    for (const entity of world.entities) {
      if (!entity.interactable || !entity.transform || !entity.proximity) continue;
      const dx = player.transform.x - entity.transform.x;
      const dz = player.transform.z - entity.transform.z;
      entity.proximity.withinRange = dx * dx + dz * dz <= entity.interactable.collectionRadius ** 2;
    }
  }
}

export class CollectionSystem implements FixedSystem {
  fixedUpdate(world: Parameters<FixedSystem["fixedUpdate"]>[0]): void {
    const state = world.entities.find((entity) => entity.collectionState)?.collectionState;
    if (!state) return;
    for (const entity of world.entities) {
      if (!entity.interactable || !entity.proximity?.withinRange) continue;
      state.collectedIds.add(entity.interactable.id);
    }
  }
}
