import { describe, expect, it } from "vitest";

import type { TransformComponent } from "../ecs/Entity";
import { generateTrees, TREE_TRUNK_RADIUS } from "./forest";
import { PLAYER_COLLISION_RADIUS, resolveTreeTrunkMovement } from "./treeCollision";

describe("resolveTreeTrunkMovement", () => {
  const seed = "tree-collision-test";
  const tree = generateTrees(seed, { x: 0, z: 0 })[0]!;

  it("blocks movement into a generated tree trunk", () => {
    expect(tree).toBeDefined();
    const radius = PLAYER_COLLISION_RADIUS + TREE_TRUNK_RADIUS * tree.scale;
    const from: TransformComponent = { x: tree.x - radius - 0.1, y: tree.y + 0.76, z: tree.z, yaw: 1 };
    const to: TransformComponent = { ...from, x: tree.x - radius + 0.05 };

    expect(resolveTreeTrunkMovement(seed, from, to)).toEqual({ ...to, x: from.x });
  });

  it("allows movement beneath foliage when clear of the trunk", () => {
    const radius = PLAYER_COLLISION_RADIUS + TREE_TRUNK_RADIUS * tree.scale;
    const z = tree.z + radius + 0.05;
    const from: TransformComponent = { x: tree.x - 0.1, y: tree.y + 0.76, z, yaw: 0 };
    const to: TransformComponent = { ...from, x: tree.x + 0.1 };

    expect(resolveTreeTrunkMovement(seed, from, to)).toEqual(to);
  });

  it("slides along a trunk when only one movement axis is blocked", () => {
    const radius = PLAYER_COLLISION_RADIUS + TREE_TRUNK_RADIUS * tree.scale;
    const from: TransformComponent = {
      x: tree.x - radius - 0.1,
      y: tree.y + 0.76,
      z: tree.z - 0.2,
      yaw: 0,
    };
    const to: TransformComponent = { ...from, x: tree.x - radius + 0.05, z: tree.z - 0.3 };

    expect(resolveTreeTrunkMovement(seed, from, to)).toEqual({ ...to, x: from.x });
  });
});
