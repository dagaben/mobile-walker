import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createEcsWorld } from "../ecs/createEcsWorld";
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
  }, { getLoadedCenter: () => ({ x: 8, z: 8 }) });
  return { camera, world, system, setInput: (zoomDelta: number, tiltDelta: number) => { input = { zoomDelta, tiltDelta }; } };
}

describe("CameraPresentationSystem", () => {
  it("keeps the existing default pose and smooths subsequent changes", () => {
    const { camera, world, system, setInput } = fixture();
    system.prepareRender(world, 0, 0);
    expect(camera.position.toArray()).toEqual([2, 7.5, 10.5]);
    setInput(1, 0);
    system.prepareRender(world, 0, 1 / 60);
    expect(camera.position.x).toBeGreaterThan(2);
    expect(camera.position.x).toBeLessThan(8);
  });

  it.each([16 / 9, 9 / 16])("frames the complete footprint at maximum zoom for aspect %s", (aspect) => {
    const { camera, world, system, setInput } = fixture(aspect);
    setInput(100, 0);
    system.prepareRender(world, 0, 0);
    const distance = camera.position.distanceTo(new THREE.Vector3(8, 3.7, 8));
    const limitingHalfFov = Math.min(THREE.MathUtils.degToRad(30), Math.atan(Math.tan(THREE.MathUtils.degToRad(30)) * aspect));
    expect(distance * Math.sin(limitingHalfFov)).toBeGreaterThanOrEqual(Math.SQRT2 * 24 - 1e-8);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
  });

  it("clamps zoom and tilt and reaches a finite 90-degree overhead endpoint", () => {
    const { camera, world, system, setInput } = fixture();
    setInput(100, 100);
    system.prepareRender(world, 0, 0);
    expect(camera.position.x).toBeCloseTo(8);
    expect(camera.position.z).toBeCloseTo(8);
    expect(camera.position.y).toBeGreaterThan(3.7);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);

    setInput(-200, -200);
    system.prepareRender(world, 0, 0);
    expect(camera.position.toArray()).toEqual([2, 7.5, 10.5]);
  });
});
