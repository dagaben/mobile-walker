import { describe, expect, it } from "vitest";

import { sampleHydrology, isFloodedAt, isOpenWaterAt } from "./hydrology";
import { getWorldRiverOwner } from "./worldRiverOwner";
import { isLakeAt, isRiverAt, LAKE_RIVER_ATTACHMENT_MARGIN } from "./terrainSampling";
import { WORLD_RIVER_CARVING } from "./worldRiverCarving";

describe("sampleHydrology", () => {
  it("classifies spine centreline as river with positive depth", () => {
    const seed = "hydro-core";
    const frame = getWorldRiverOwner(seed).spine.sampleFrame(0.42);
    const sample = sampleHydrology(seed, frame.position.x, frame.position.z);
    expect(sample.kind).toBe("river");
    expect(sample.zone).toBe("water");
    expect(sample.depth).toBeGreaterThan(0.2);
    expect(sample.bedY).toBeLessThan(sample.surfaceY);
    expect(isFloodedAt(seed, frame.position.x, frame.position.z)).toBe(true);
    expect(isRiverAt(seed, frame.position.x, frame.position.z)).toBe(true);
  });

  it("agrees with isRiverAt / isLakeAt for dry far points", () => {
    const seed = "hydro-dry";
    const x = 180, z = 180;
    const sample = sampleHydrology(seed, x, z);
    expect(sample.kind).toBe("dry");
    expect(isRiverAt(seed, x, z)).toBe(false);
    expect(isLakeAt(seed, x, z)).toBe(false);
    expect(isOpenWaterAt(seed, x, z)).toBe(false);
  });

  it("exposes lake-river connection margin constant used by terrain attachment", () => {
    expect(LAKE_RIVER_ATTACHMENT_MARGIN).toBeGreaterThan(1);
    expect(WORLD_RIVER_CARVING.surfaceElevation).toBeLessThan(0);
  });
});
