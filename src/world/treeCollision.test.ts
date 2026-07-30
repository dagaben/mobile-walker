import { beforeEach, describe, expect, it } from "vitest";

import type { TransformComponent } from "../ecs/Entity";
import { generateTrees, TREE_TRUNK_RADIUS } from "./forest";
import {
  clearTreeCollisionCache,
  PLAYER_COLLISION_RADIUS,
  resolveTreeTrunkMovement,
  treeCollisionCacheDiagnostics,
} from "./treeCollision";
import { generateLeafTrees, LEAF_TREE_TRUNK_RADIUS } from "./vegetation";

describe("resolveTreeTrunkMovement", () => {
  const seed = "tree-collision-test";
  const tree = generateTrees(seed, { x: 0, z: 0 })[0]!;

  beforeEach(clearTreeCollisionCache);

  it("blocks movement into a generated tree trunk", () => {
    expect(tree).toBeDefined();
    const radius = PLAYER_COLLISION_RADIUS + TREE_TRUNK_RADIUS * tree.scale;
    const from: TransformComponent = { x: tree.x - radius - 0.1, y: tree.y + 0.76, z: tree.z, yaw: 1 };
    const to: TransformComponent = { ...from, x: tree.x - radius + 0.05 };

    expect(resolveTreeTrunkMovement(seed, from, to)).toEqual({ ...to, x: from.x });
  });

  it("blocks movement into a generated leaf tree trunk", () => {
    const leafTree = generateLeafTrees(seed, { x: 0, z: 0 })[0]!;
    expect(leafTree).toBeDefined();
    const radius = PLAYER_COLLISION_RADIUS + LEAF_TREE_TRUNK_RADIUS * leafTree.scale;
    const from: TransformComponent = {
      x: leafTree.x - radius - 0.1,
      y: leafTree.y + 0.76,
      z: leafTree.z,
      yaw: 1,
    };
    const to: TransformComponent = { ...from, x: leafTree.x - radius + 0.05 };

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

  it("reuses collision placements for repeated movement through the same chunks", () => {
    const from: TransformComponent = { x: 8, y: 0, z: 8, yaw: 0 };
    const to = { ...from, x: 8.2 };

    resolveTreeTrunkMovement(seed, from, to);
    const first = treeCollisionCacheDiagnostics();
    resolveTreeTrunkMovement(seed, to, from);

    expect(first.generatedChunkCount).toBe(1);
    expect(treeCollisionCacheDiagnostics()).toMatchObject({ size: 1, generatedChunkCount: 1 });
  });

  it("generates both chunks at an edge only once", () => {
    const from: TransformComponent = { x: 0, y: 0, z: 8, yaw: 0 };
    resolveTreeTrunkMovement(seed, from, { ...from, z: 8.1 });
    resolveTreeTrunkMovement(seed, from, { ...from, z: 7.9 });

    const diagnostics = treeCollisionCacheDiagnostics();
    expect(diagnostics.generatedChunkCount).toBe(2);
    expect(new Set(diagnostics.keys).size).toBe(2);
  });

  it("generates all four chunks at a corner only once", () => {
    const from: TransformComponent = { x: 0, y: 0, z: 0, yaw: 0 };
    resolveTreeTrunkMovement(seed, from, { ...from, x: 0.1, z: 0.1 });
    resolveTreeTrunkMovement(seed, from, { ...from, x: -0.1, z: -0.1 });

    const diagnostics = treeCollisionCacheDiagnostics();
    expect(diagnostics.generatedChunkCount).toBe(4);
    expect(new Set(diagnostics.keys).size).toBe(4);
  });
});
