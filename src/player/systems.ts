import type { FixedSystem } from "../ecs/System";
import { sampleTerrain } from "../world/terrainSampling";
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
      entity.playerControl.jump = raw.jump;
    }
  }
  dispose(): void { this.input.dispose(); }
}

export class PlayerMovementSystem implements FixedSystem {
  fixedUpdate(world: Parameters<FixedSystem["fixedUpdate"]>[0], deltaSeconds: number): void {
    for (const entity of world.entities) {
      if (!entity.transform || !entity.previousTransform || !entity.playerControl || !entity.velocity) continue;
      Object.assign(entity.previousTransform, entity.transform);
      Object.assign(entity.transform, integrateMovement(
        entity.transform, entity.playerControl, entity.velocity, deltaSeconds, undefined, entity.jump?.grounded,
      ));
      if (entity.playerControl.jump && entity.jump?.grounded) entity.jump.grounded = false;
    }
  }
}

/** Grounds moving entities and treats generated rivers as impassable hazards. */
export class TerrainSamplingSystem implements FixedSystem {
  constructor(private readonly seed: number | string) {}

  fixedUpdate(world: Parameters<FixedSystem["fixedUpdate"]>[0]): void {
    for (const entity of world.entities) {
      if (!entity.transform || !entity.previousTransform || !entity.terrainFollower) continue;
      let sample = sampleTerrain(this.seed, entity.transform.x, entity.transform.z);
      if (sample.surface === "river") {
        entity.transform.x = entity.previousTransform.x;
        entity.transform.z = entity.previousTransform.z;
        if (entity.velocity) {
          entity.velocity.x = 0;
          entity.velocity.z = 0;
        }
        sample = sampleTerrain(this.seed, entity.transform.x, entity.transform.z);
      }
      const groundY = sample.height + entity.terrainFollower.heightOffset;
      if (entity.transform.y <= groundY && (!entity.velocity || entity.velocity.y <= 0)) {
        entity.transform.y = groundY;
        if (entity.velocity) entity.velocity.y = 0;
        if (entity.jump) entity.jump.grounded = true;
      } else if (entity.jump) {
        entity.jump.grounded = false;
      }
    }
  }
}
