import { describe, expect, it } from "vitest";

import { BIOME_IDS, sampleBiome } from "../world/biomes";
import { findNearestBiomes, formatBiomeDistance, riverIndicatorEdge, worldToOverlayDisplacement } from "./biomeDebug";

describe("riverIndicatorEdge", () => {
  it("glows on the edge facing the river column", () => {
    expect(riverIndicatorEdge(-0.01)).toBe("right");
    expect(riverIndicatorEdge(-16)).toBe("right");
    expect(riverIndicatorEdge(16)).toBe("left");
  });

  it("does not glow while the player is inside the river chunk column", () => {
    expect(riverIndicatorEdge(0)).toBeNull();
    expect(riverIndicatorEdge(15.999)).toBeNull();
  });
});

describe("formatBiomeDistance", () => {
  it("reports rounded distances in metres", () => {
    expect(formatBiomeDistance(47.6)).toBe("48 m");
  });
});

describe("worldToOverlayDisplacement", () => {
  const overlayCenter = { x: 160, y: 120 };

  it("places negative Z above and positive Z below the overlay center", () => {
    const negativeZ = worldToOverlayDisplacement(10, 20, 10, 15);
    const positiveZ = worldToOverlayDisplacement(10, 20, 10, 25);

    expect(overlayCenter.y + negativeZ.y).toBeLessThan(overlayCenter.y);
    expect(overlayCenter.y + positiveZ.y).toBeGreaterThan(overlayCenter.y);
  });

  it("places positive X right and negative X left of the overlay center", () => {
    const positiveX = worldToOverlayDisplacement(10, 20, 15, 20);
    const negativeX = worldToOverlayDisplacement(10, 20, 5, 20);

    expect(overlayCenter.x + positiveX.x).toBeGreaterThan(overlayCenter.x);
    expect(overlayCenter.x + negativeX.x).toBeLessThan(overlayCenter.x);
  });

  it("rotates world directions relative to the camera facing angle", () => {
    const cameraFacingEast = Math.PI / 2;
    const east = worldToOverlayDisplacement(0, 0, 10, 0, cameraFacingEast);
    const north = worldToOverlayDisplacement(0, 0, 0, -10, cameraFacingEast);

    expect(east.x).toBeCloseTo(0);
    expect(east.y).toBeCloseTo(-10);
    expect(north.x).toBeCloseTo(-10);
    expect(north.y).toBeCloseTo(0);
  });
});

describe("findNearestBiomes", () => {
  it("finds a matching nearby region for every generated biome", () => {
    const result = findNearestBiomes("mobile-walker-v1", 0, 0);

    expect([...result.keys()].sort()).toEqual([...BIOME_IDS].sort());
    for (const [id, direction] of result) {
      expect(sampleBiome("mobile-walker-v1", direction.x, direction.z).dominant).toBe(id);
      expect(direction.distance).toBeLessThanOrEqual(256);
    }
  });

  it("reports the player's biome at zero distance", () => {
    const result = findNearestBiomes(42, 12, -7);
    const current = sampleBiome(42, 12, -7).dominant;

    expect(result.get(current)).toMatchObject({ x: 12, z: -7, distance: 0 });
  });
});
