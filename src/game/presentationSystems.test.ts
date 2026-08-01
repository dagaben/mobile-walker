import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createEcsWorld } from "../ecs/createEcsWorld";
import { CHUNK_SIZE } from "../world/chunkCoordinates";
import { CameraPresentationSystem } from "./presentationSystems";
import { dampAngle, normalizeAngle, shortestAngleDifference } from "./cameraOrientation";

function fixture(aspect = 16 / 9) {
  const camera = new THREE.PerspectiveCamera(60, aspect);
  const world = createEcsWorld();
  const renderable = new THREE.Group();
  renderable.position.set(2, 3, 4);
  world.add({ renderable, cameraTarget: { height: 4.5, distance: 6.5 }, playerControl: { moveX: 0, moveZ: 0, active: false, jump: false } });
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
    expect(system.getDebugDetails().angleDegrees).toBeCloseTo(22);
    expect(system.getDebugDetails().zoomLevel).toBeCloseTo(0.05);
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

  it("yaws toward sideways movement by the configured strength", () => {
    const { camera, world, system } = fixture();
    const target = world.entities.find((entity) => entity.cameraTarget)!;
    target.playerControl = { moveX: 1, moveZ: 0, active: true, jump: false };
    system.setMovementYawStrength(90);
    system.prepareRender(world, 0, 0);

    const direction = camera.getWorldDirection(new THREE.Vector3());
    expect(new THREE.Vector2(direction.x, direction.z).normalize().x).toBeCloseTo(1);
    expect(direction.z).toBeCloseTo(0);

    system.setMovementYawStrength(0);
    system.prepareRender(world, 0, 0);
    expect(camera.getWorldDirection(direction).x).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(-Math.cos(THREE.MathUtils.degToRad(22)));
  });

  it("returns smoothly to north after north-locked lateral movement stops", () => {
    const { world, system } = fixture();
    const target = world.entities.find((entity) => entity.cameraTarget)!;
    target.playerControl = { moveX: 1, moveZ: 0, active: true, jump: false };
    system.prepareRender(world, 0, 0);
    const turned = system.getEffectiveYaw();
    target.playerControl.active = false;
    system.prepareRender(world, 0, 1 / 60);
    expect(system.getEffectiveYaw()).toBeGreaterThan(0);
    expect(system.getEffectiveYaw()).toBeLessThan(turned);
  });

  it("follows sustained world-space movement but ignores short, weak, and stopped input", () => {
    const { world, system } = fixture();
    const target = world.entities.find((entity) => entity.cameraTarget)!;
    system.setCameraOrientationMode("follow-movement");
    system.prepareRender(world, 0, 1 / 60);
    target.playerControl = { moveX: 0.2, moveZ: 0, active: true, jump: false };
    for (let i = 0; i < 20; i++) system.prepareRender(world, 0, 1 / 60);
    expect(system.getEffectiveYaw()).toBeCloseTo(0);
    target.playerControl.moveX = 1;
    for (let i = 0; i < 7; i++) system.prepareRender(world, 0, 1 / 60);
    expect(Math.abs(system.getEffectiveYaw())).toBeLessThan(0.05);
    for (let i = 0; i < 40; i++) system.prepareRender(world, 0, 1 / 60);
    expect(system.getEffectiveYaw()).toBeGreaterThan(0.8);
    const stopped = system.getEffectiveYaw();
    target.playerControl.active = false;
    target.playerControl.moveX = target.playerControl.moveZ = 0;
    for (let i = 0; i < 30; i++) system.prepareRender(world, 0, 1 / 60);
    expect(system.getEffectiveYaw()).toBeCloseTo(stopped);
  });

  it("preserves heading on mode changes, then smoothly returns north", () => {
    const { world, system } = fixture();
    const target = world.entities.find((entity) => entity.cameraTarget)!;
    target.playerControl = { moveX: 1, moveZ: 0, active: true, jump: false };
    system.prepareRender(world, 0, 0);
    const before = system.getEffectiveYaw();
    system.setCameraOrientationMode("follow-movement");
    system.prepareRender(world, 0, 1 / 60);
    expect(system.getEffectiveYaw()).toBeCloseTo(before);
    system.setCameraOrientationMode("north-locked");
    target.playerControl.active = false;
    system.prepareRender(world, 0, 1 / 60);
    expect(system.getEffectiveYaw()).toBeCloseTo(before);
    system.prepareRender(world, 0, 1 / 60);
    expect(Math.abs(system.getEffectiveYaw())).toBeLessThan(Math.abs(before));
  });

  it("exposes camera-relative input yaw only in movement mode", () => {
    const { world, system } = fixture();
    const target = world.entities.find((entity) => entity.cameraTarget)!;
    target.playerControl = { moveX: 1, moveZ: 0, active: true, jump: false };
    expect(system.getMovementReferenceYaw()).toBe(0);
    system.setCameraOrientationMode("follow-movement");
    for (let i = 0; i < 60; i++) system.prepareRender(world, 0, 1 / 60);
    expect(system.getMovementReferenceYaw()).toBeGreaterThan(0.8);
  });

  it("handles zero vectors and chunk crossings in follow mode without discontinuity or NaN", () => {
    const { camera, world, system } = fixture();
    const target = world.entities.find((entity) => entity.cameraTarget && entity.renderable)!;
    system.setCameraOrientationMode("follow-movement");
    target.playerControl = { moveX: Number.EPSILON, moveZ: 0, active: true, jump: false };
    target.renderable!.position.x = CHUNK_SIZE - 0.001;
    system.prepareRender(world, 0, 0);
    const before = camera.position.clone();
    target.renderable!.position.x = CHUNK_SIZE + 0.001;
    system.prepareRender(world, 0, 1 / 60);
    expect(camera.position.distanceTo(before)).toBeLessThan(1);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
  });
});

describe("camera angle helpers", () => {
  it("interpolates across the angle boundary on the shortest path", () => {
    const from = Math.PI - 0.1, to = -Math.PI + 0.1;
    expect(shortestAngleDifference(from, to)).toBeCloseTo(0.2);
    expect(Math.abs(shortestAngleDifference(dampAngle(from, to, 5, 0.1), to))).toBeLessThan(0.2);
    expect(normalizeAngle(Number.NaN)).toBe(0);
  });
});
