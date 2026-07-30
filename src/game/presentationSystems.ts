import * as THREE from "three";

import type { RenderSystem } from "../ecs/System";
import type { InputController } from "../player/InputController";
import { CHUNK_SIZE } from "../world/chunkCoordinates";
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
  private static readonly minimumElevation = THREE.MathUtils.degToRad(5);
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly debugDirection = new THREE.Vector3();
  private zoom = 0;
  private tilt = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input?: Pick<InputController, "sampleCamera">,
  ) {}

  getDebugDetails(): { angleDegrees: number; zoomLevel: number; height: number } {
    const direction = this.camera.getWorldDirection(this.debugDirection);
    return {
      angleDegrees: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(-direction.y, -1, 1))),
      zoomLevel: this.zoom,
      height: this.camera.position.y,
    };
  }

  prepareRender(world: Parameters<RenderSystem["prepareRender"]>[0], _interpolation: number, deltaSeconds: number): void {
    const target = world.entities.find((entity) => entity.cameraTarget && entity.renderable);
    if (!target?.cameraTarget || !target.renderable) return;
    const cameraInput = this.input?.sampleCamera() ?? { zoomDelta: 0, tiltDelta: 0 };
    this.zoom = THREE.MathUtils.clamp(this.zoom + cameraInput.zoomDelta, 0, 1);
    this.tilt = THREE.MathUtils.clamp(this.tilt + cameraInput.tiltDelta, -1, 1);
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
    const elevation = this.tilt < 0
      ? THREE.MathUtils.lerp(baseElevation, CameraPresentationSystem.minimumElevation, -this.tilt)
      : THREE.MathUtils.lerp(baseElevation, Math.PI / 2, this.tilt);
    // The interpolated render position is continuous across chunk boundaries. In
    // particular, do not use the streaming neighborhood's quantized midpoint as
    // a look target: switching resident neighborhoods would make the view snap.
    this.lookAt.set(position.x, baseLookY, position.z);
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
