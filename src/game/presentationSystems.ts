import * as THREE from "three";

import type { RenderSystem } from "../ecs/System";
import type { InputController } from "../player/InputController";
import { CHUNK_SIZE } from "../world/chunkCoordinates";
import type { ChunkStreamingSystem } from "../world/ChunkStreamingSystem";
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
  private zoom = 0;
  private tilt = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input?: Pick<InputController, "sampleCamera">,
    private readonly chunks?: Pick<ChunkStreamingSystem, "getLoadedCenter">,
  ) {}

  prepareRender(world: Parameters<RenderSystem["prepareRender"]>[0], _interpolation: number, deltaSeconds: number): void {
    const target = world.entities.find((entity) => entity.cameraTarget && entity.renderable);
    if (!target?.cameraTarget || !target.renderable) return;
    const cameraInput = this.input?.sampleCamera() ?? { zoomDelta: 0, tiltDelta: 0 };
    this.zoom = THREE.MathUtils.clamp(this.zoom + cameraInput.zoomDelta, 0, 1);
    this.tilt = THREE.MathUtils.clamp(this.tilt + cameraInput.tiltDelta, 0, 1);
    const position = target.renderable.position;
    const baseLookY = position.y + 0.7;
    const baseRise = target.cameraTarget.height - 0.7;
    const baseDistance = Math.hypot(baseRise, target.cameraTarget.distance);
    const halfFootprint = CHUNK_SIZE * 1.5;
    const verticalHalfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * this.camera.aspect);
    const framingDistance = Math.SQRT2 * halfFootprint
      / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov));
    const distance = THREE.MathUtils.lerp(baseDistance, framingDistance, this.zoom);
    const baseElevation = Math.atan2(baseRise, target.cameraTarget.distance);
    const elevation = THREE.MathUtils.lerp(baseElevation, Math.PI / 2, this.tilt);
    const loadedCenter = this.chunks?.getLoadedCenter() ?? { x: position.x, z: position.z };
    this.lookAt.set(
      THREE.MathUtils.lerp(position.x, loadedCenter.x, this.zoom),
      baseLookY,
      THREE.MathUtils.lerp(position.z, loadedCenter.z, this.zoom),
    );
    this.desired.set(
      this.lookAt.x,
      this.lookAt.y + Math.sin(elevation) * distance,
      this.lookAt.z + Math.cos(elevation) * distance,
    );
    const smoothing = 1 - Math.exp(-8 * deltaSeconds);
    this.camera.position.lerp(this.desired, deltaSeconds === 0 ? 1 : smoothing);
    this.camera.lookAt(this.lookAt);
  }
}
