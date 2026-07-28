import { describe, expect, it } from "vitest";

import { createCollectionState, placeCollectibles } from "./exploration";

describe("exploration placement", () => {
  it("is deterministic and random-access by seed and chunk", () => {
    const coordinate = { x: -3, z: 7 };
    expect(placeCollectibles("trail", coordinate)).toEqual(placeCollectibles("trail", coordinate));
    expect(placeCollectibles("another-trail", coordinate)).not.toEqual(placeCollectibles("trail", coordinate));
    expect(placeCollectibles("trail", { x: -2, z: 7 })).not.toEqual(placeCollectibles("trail", coordinate));
  });

  it("keeps collection state while placements are unloaded and regenerated", () => {
    const coordinate = { x: 4, z: -2 };
    const loaded = placeCollectibles("persistent-world", coordinate);
    const state = createCollectionState();
    state.collectedIds.add(loaded[0]!.id);
    state.discovered = state.collectedIds.size;

    // Dropping the streamed array represents unloading; generation has no mutable cache.
    const reloaded = placeCollectibles("persistent-world", coordinate);
    expect(reloaded).toEqual(loaded);
    expect(state.collectedIds.has(reloaded[0]!.id)).toBe(true);
    expect(state.discovered).toBe(1);
  });
});
