import { describe, expect, it } from "vitest";

import { createEcsWorld } from "../ecs/createEcsWorld";
import { sampleTerrain } from "../world/terrainSampling";
import { TerrainSamplingSystem } from "./systems";

describe("TerrainSamplingSystem", () => {
  it("allows a terrain follower to move through a river", () => {
    const seed = "walkable-river";
    const world = createEcsWorld();
    const riverZ = Array.from({ length: 161 }, (_, index) => -8 + index * 0.1)
      .find((z) => sampleTerrain(seed, 0, z).surface === "river");
    expect(riverZ).toBeDefined();

    const entity = world.add({
      transform: { x: 0, y: -10, z: riverZ!, yaw: 0 },
      previousTransform: { x: 0, y: 2, z: riverZ! - 2, yaw: 0 },
      velocity: { x: 0, y: -1, z: 4 },
      jump: { grounded: false },
      terrainFollower: { heightOffset: 0.76 },
    });

    new TerrainSamplingSystem(seed).fixedUpdate(world);

    const river = sampleTerrain(seed, entity.transform.x, entity.transform.z);
    expect(river.surface).toBe("river");
    expect(entity.transform.z).toBe(riverZ);
    expect(entity.transform.y).toBeCloseTo(river.height + 0.76);
    expect(entity.velocity).toEqual({ x: 0, y: 0, z: 4 });
    expect(entity.jump.grounded).toBe(true);
  });
});
