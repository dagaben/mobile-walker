import type { FixedSystem } from "../ecs/System";
import type { InputController } from "./InputController";
import { integrateMovement, normalizeInput } from "./movement";

export class InputSnapshotSystem implements FixedSystem {
  constructor(private readonly input: InputController) {}
  fixedUpdate(world: Parameters<FixedSystem["fixedUpdate"]>[0]): void {
    const raw = this.input.sample();
    const movement = normalizeInput(raw.x, raw.z);
    for (const entity of world.entities) if (entity.playerControl) {
      entity.playerControl.moveX = movement.x;
      entity.playerControl.moveZ = movement.z;
      entity.playerControl.active = Math.hypot(movement.x, movement.z) > 0.01;
    }
  }
  dispose(): void { this.input.dispose(); }
}

export class PlayerMovementSystem implements FixedSystem {
  fixedUpdate(world: Parameters<FixedSystem["fixedUpdate"]>[0], deltaSeconds: number): void {
    for (const entity of world.entities) {
      if (!entity.transform || !entity.previousTransform || !entity.playerControl || !entity.velocity) continue;
      Object.assign(entity.previousTransform, entity.transform);
      Object.assign(entity.transform, integrateMovement(entity.transform, entity.playerControl, entity.velocity, deltaSeconds));
    }
  }
}

export class BoundsCollisionSystem implements FixedSystem {
  fixedUpdate(world: Parameters<FixedSystem["fixedUpdate"]>[0]): void {
    const ground = world.entities.find((entity) => entity.bounds);
    if (!ground?.bounds || !ground.transform) return;
    for (const entity of world.entities) if (entity.playerControl && entity.transform) {
      entity.transform.x = Math.max(ground.transform.x - ground.bounds.halfWidth, Math.min(ground.transform.x + ground.bounds.halfWidth, entity.transform.x));
      entity.transform.z = Math.max(ground.transform.z - ground.bounds.halfDepth, Math.min(ground.transform.z + ground.bounds.halfDepth, entity.transform.z));
    }
  }
}
