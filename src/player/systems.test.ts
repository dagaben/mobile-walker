import { describe, expect, it } from "vitest";

import { createEcsWorld } from "../ecs/createEcsWorld";
import { sampleTerrain } from "../world/terrainSampling";
import { InputSnapshotSystem, rotateInputByCameraYaw, TerrainSamplingSystem } from "./systems";

describe("camera-relative input", () => {
  it("rotates screen directions into the camera's world-space frame", () => {
    expect(rotateInputByCameraYaw(0, -1, Math.PI / 2).x).toBeCloseTo(1);
    expect(rotateInputByCameraYaw(0, -1, Math.PI / 2).z).toBeCloseTo(0);
    expect(rotateInputByCameraYaw(1, 0, Math.PI / 2).x).toBeCloseTo(0);
    expect(rotateInputByCameraYaw(1, 0, Math.PI / 2).z).toBeCloseTo(1);
  });

  it("samples the latest camera yaw on every fixed update", () => {
    const world = createEcsWorld();
    const player = world.add({
      playerControl: { moveX: 0, moveZ: 0, active: false, jump: false },
    });
    const input = {
      sample: () => ({ x: 0, z: -1, jump: false }),
      dispose: () => undefined,
    };
    let yaw = 0;
    const system = new InputSnapshotSystem(input, () => yaw);

    system.fixedUpdate(world);
    expect(player.playerControl).toMatchObject({ moveX: 0, moveZ: -1, active: true });
    yaw = Math.PI / 2;
    system.fixedUpdate(world);
    expect(player.playerControl.moveX).toBeCloseTo(1);
    expect(player.playerControl.moveZ).toBeCloseTo(0);
  });
});

describe("TerrainSamplingSystem", () => {
  it("allows a terrain follower to move through a river", () => {
    const seed = "walkable-river";
    const world = createEcsWorld();
    const riverX = Array.from({ length: 161 }, (_, index) => -8 + index * 0.1)
      .find((x) => sampleTerrain(seed, x, 0).surface === "river");
    expect(riverX).toBeDefined();

    const entity = world.add({
      transform: { x: riverX!, y: -10, z: 0, yaw: 0 },
      previousTransform: { x: riverX! - 2, y: 2, z: 0, yaw: 0 },
      velocity: { x: 4, y: -1, z: 0 },
      jump: { grounded: false },
      terrainFollower: { heightOffset: 0.76 },
    });

    new TerrainSamplingSystem(seed).fixedUpdate(world);

    const river = sampleTerrain(seed, entity.transform.x, entity.transform.z);
    expect(river.surface).toBe("river");
    expect(entity.transform.x).toBe(riverX);
    expect(entity.transform.y).toBeCloseTo(river.height + 0.76);
    expect(entity.velocity).toEqual({ x: 4, y: 0, z: 0 });
    expect(entity.jump.grounded).toBe(true);
  });
});
