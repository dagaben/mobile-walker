import { describe, expect, it } from "vitest";

import { placeLandmarks } from "./placement";
import { ExplorationState } from "./state";

describe("exploration placement", () => {
  it("is deterministic for a world seed and chunk coordinate", () => {
    const coordinate = { x: -3, z: 7 };
    expect(placeLandmarks("trail-seed", coordinate)).toEqual(placeLandmarks("trail-seed", coordinate));
    expect(placeLandmarks("another-seed", coordinate)).not.toEqual(placeLandmarks("trail-seed", coordinate));
    expect(placeLandmarks("trail-seed", { x: -2, z: 7 })).not.toEqual(placeLandmarks("trail-seed", coordinate));
  });

  it("keeps collection state across unload and reload", () => {
    const coordinate = { x: 4, z: -2 };
    const exploration = new ExplorationState("persistent-world");
    const firstVisit = exploration.load(coordinate);
    const collected = firstVisit[0];
    expect(collected).toBeDefined();
    exploration.collect(collected!.id);
    exploration.unload(coordinate);

    const revisit = exploration.load(coordinate);
    expect(revisit).toHaveLength(firstVisit.length - 1);
    expect(revisit.some((placement) => placement.id === collected!.id)).toBe(false);
    expect(exploration.collection.collectedIds.has(collected!.id)).toBe(true);
  });
});
