import { describe, expect, it } from "vitest";

import { createEcsWorld } from "../ecs/createEcsWorld";
import { sampleTerrain } from "../world/terrainSampling";
import { TerrainSamplingSystem } from "./systems";

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
