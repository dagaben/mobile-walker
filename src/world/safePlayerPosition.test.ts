import { describe, expect, it } from "vitest";

import { generateTrees } from "./forest";
import { findSafeRestoredTransform } from "./safePlayerPosition";
import { sampleTerrain } from "./terrainSampling";
import { overlapsGeneratedTreeTrunk, PLAYER_COLLISION_RADIUS } from "./treeCollision";

describe("findSafeRestoredTransform", () => {
  const seed = "tree-collision-test";
  const offset = 0.76;
  const safe = { x: 1000, y: 123, z: 1000, yaw: 1.25 };
  const tree = generateTrees(seed, { x: 0, z: 0 })[0]!;

  it("leaves the horizontal position of a safe save unchanged", () => {
    const result = findSafeRestoredTransform(seed, safe, offset, PLAYER_COLLISION_RADIUS, 0.5, 5);
    expect(result).toMatchObject({ x: safe.x, z: safe.z });
  });

  it("corrects a restored position to terrain height", () => {
    const result = findSafeRestoredTransform(seed, safe, offset, PLAYER_COLLISION_RADIUS, 0.5, 5);
    expect(result.y).toBeCloseTo(sampleTerrain(seed, safe.x, safe.z).height + offset);
  });

  it("relocates a save from inside a generated trunk", () => {
    const result = findSafeRestoredTransform(seed, { ...tree, yaw: 0 }, offset, PLAYER_COLLISION_RADIUS, 0.5, 5);
    expect(overlapsGeneratedTreeTrunk(seed, result.x, result.z, PLAYER_COLLISION_RADIUS)).toBe(false);
    expect([result.x, result.z]).not.toEqual([tree.x, tree.z]);
  });

  it("selects a candidate on the nearest ring containing a safe point", () => {
    const result = findSafeRestoredTransform(seed, { ...tree, yaw: 0 }, offset, PLAYER_COLLISION_RADIUS, 0.5, 5);
    const radius = Math.hypot(result.x - tree.x, result.z - tree.z);
    for (let prior = 0.5; prior < radius - 1e-8; prior += 0.5) {
      const count = Math.ceil(2 * Math.PI * prior / 0.5);
      expect(Array.from({ length: count }, (_, index) => {
        const angle = index * 2 * Math.PI / count;
        return overlapsGeneratedTreeTrunk(
          seed, tree.x + Math.cos(angle) * prior, tree.z + Math.sin(angle) * prior, PLAYER_COLLISION_RADIUS,
        );
      }).every(Boolean)).toBe(true);
    }
  });

  it("returns deterministic repeat results", () => {
    const saved = { ...tree, yaw: 2 };
    expect(findSafeRestoredTransform(seed, saved, offset, PLAYER_COLLISION_RADIUS, 0.5, 5))
      .toEqual(findSafeRestoredTransform(seed, saved, offset, PLAYER_COLLISION_RADIUS, 0.5, 5));
  });

  it("preserves saved yaw after relocation", () => {
    expect(findSafeRestoredTransform(seed, { ...tree, yaw: 2.7 }, offset, PLAYER_COLLISION_RADIUS, 0.5, 5).yaw)
      .toBe(2.7);
  });

  it("uses the bounded grounded fallback when the area is entirely blocked", () => {
    const result = findSafeRestoredTransform(seed, { ...tree, yaw: 0.8 }, offset, 10_000, 0.5, 1);
    expect(result).toEqual({
      x: 0,
      y: sampleTerrain(seed, 0, 0).height + offset,
      z: 0,
      yaw: 0.8,
    });
  });
});
