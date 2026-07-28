import * as THREE from "three";

import type { RenderSystem } from "../ecs/System";
import { interpolateTransform } from "./interpolation";

export class TransformInterpolationSystem implements RenderSystem {
  prepareRender(world: Parameters<RenderSystem["prepareRender"]>[0], interpolation: number): void {
    for (const entity of world.entities) {
      if (!entity.transform || !entity.previousTransform || !entity.renderable) continue;
      const pose = interpolateTransform(entity.previousTransform, entity.transform, interpolation);
      entity.renderable.position.set(pose.x, pose.y, pose.z);
      entity.renderable.rotation.y = pose.yaw;
    }
  }
}

export class CameraPresentationSystem implements RenderSystem {
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  prepareRender(world: Parameters<RenderSystem["prepareRender"]>[0], _interpolation: number, deltaSeconds: number): void {
    const target = world.entities.find((entity) => entity.cameraTarget && entity.renderable);
    if (!target?.cameraTarget || !target.renderable) return;
    const position = target.renderable.position;
    this.desired.set(position.x, position.y + target.cameraTarget.height, position.z + target.cameraTarget.distance);
    const smoothing = 1 - Math.exp(-8 * deltaSeconds);
    this.camera.position.lerp(this.desired, deltaSeconds === 0 ? 1 : smoothing);
    this.lookAt.set(position.x, position.y + 0.7, position.z);
    this.camera.lookAt(this.lookAt);
  }
}
