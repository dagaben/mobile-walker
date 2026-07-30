import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createEcsWorld } from "../ecs/createEcsWorld";
import { CHUNK_SIZE } from "../world/chunkCoordinates";
import { CameraPresentationSystem } from "./presentationSystems";

function fixture(aspect = 16 / 9) {
  const camera = new THREE.PerspectiveCamera(60, aspect);
  const world = createEcsWorld();
  const renderable = new THREE.Group();
  renderable.position.set(2, 3, 4);
  world.add({ renderable, cameraTarget: { height: 4.5, distance: 6.5 } });
  let input = { zoomDelta: 0, tiltDelta: 0 };
  const system = new CameraPresentationSystem(camera, {
    sampleCamera: () => { const value = input; input = { zoomDelta: 0, tiltDelta: 0 }; return value; },
  });
  return { camera, world, system, setInput: (zoomDelta: number, tiltDelta: number) => { input = { zoomDelta, tiltDelta }; } };
}

describe("CameraPresentationSystem", () => {
  it("starts at the configured default angle and zoom and smooths subsequent changes", () => {
    const { camera, world, system, setInput } = fixture();
    system.prepareRender(world, 0, 0);
    expect(system.getDebugDetails().angleDegrees).toBeCloseTo(26.3);
    expect(system.getDebugDetails().zoomLevel).toBeCloseTo(0.03);
    const initialHeight = camera.position.y;
    setInput(1, 0);
    system.prepareRender(world, 0, 1 / 60);
    expect(camera.position.y).toBeGreaterThan(initialHeight);
    expect(camera.position.y).toBeLessThan(70);
  });

  it.each([16 / 9, 9 / 16])("frames the complete footprint at maximum zoom for aspect %s", (aspect) => {
    const { camera, world, system, setInput } = fixture(aspect);
    setInput(100, 0);
    system.prepareRender(world, 0, 0);
    const distance = camera.position.distanceTo(new THREE.Vector3(2, 3.7, 4));
    const limitingHalfFov = Math.min(THREE.MathUtils.degToRad(30), Math.atan(Math.tan(THREE.MathUtils.degToRad(30)) * aspect));
    expect(distance * Math.sin(limitingHalfFov)).toBeGreaterThanOrEqual(Math.SQRT2 * 24 - 1e-8);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
  });

  it("clamps tilt between a near-eye-level view and a finite 90-degree overhead endpoint", () => {
    const { camera, world, system, setInput } = fixture();
    setInput(100, 100);
    system.prepareRender(world, 0, 0);
    expect(camera.position.x).toBeCloseTo(2);
    expect(camera.position.z).toBeCloseTo(4);
    expect(camera.position.y).toBeGreaterThan(3.7);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);

    setInput(-200, -200);
    system.prepareRender(world, 0, 0);
    const lookAt = new THREE.Vector3(2, 3.7, 4);
    const direction = camera.position.clone().sub(lookAt);
    expect(THREE.MathUtils.radToDeg(Math.atan2(direction.y, direction.z))).toBeCloseTo(5);
    expect(camera.position.y).toBeGreaterThan(lookAt.y);
    expect(camera.position.y).toBeLessThan(4.5);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
  });

  it("does not snap when the resident neighborhood crosses a chunk boundary", () => {
    const { camera, world, system, setInput } = fixture();
    const target = world.entities.find((entity) => entity.cameraTarget && entity.renderable)!;
    const loadedCenter = () => ({
      x: (Math.floor(target.renderable!.position.x / CHUNK_SIZE) + 0.5) * CHUNK_SIZE,
      z: CHUNK_SIZE / 2,
    });

    setInput(1, 0);
    target.renderable!.position.x = CHUNK_SIZE - 0.01;
    system.prepareRender(world, 0, 0);
    const centerBefore = loadedCenter();
    const positionBefore = camera.position.clone();
    const directionBefore = camera.getWorldDirection(new THREE.Vector3());

    target.renderable!.position.x = CHUNK_SIZE + 0.01;
    const centerAfter = loadedCenter();
    system.prepareRender(world, 0, 1 / 60);
    const positionChange = camera.position.distanceTo(positionBefore);
    const directionChange = camera.getWorldDirection(new THREE.Vector3()).angleTo(directionBefore);

    expect(centerAfter.x - centerBefore.x).toBe(CHUNK_SIZE);
    expect(positionChange).toBeLessThan(CHUNK_SIZE / 4);
    expect(directionChange).toBeLessThan(0.1);
  });
});
