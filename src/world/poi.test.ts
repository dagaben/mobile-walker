import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import { generateVegetation } from "./vegetation";
import {
  footprintIntersectsRiver,
  footprintsOverlap,
  generatePois,
  isVegetationExcluded,
  pointInFootprint,
  type PoiFootprint,
} from "./poi";

describe("deterministic POI generation", () => {
  it("returns identical plain data for the same seed and coordinate", () => {
    expect(generatePois("poi-world", { x: -3, z: 7 })).toEqual(generatePois("poi-world", { x: -3, z: 7 }));
  });

  it("is unaffected by chunk generation order", () => {
    const first = generatePois(9182, { x: 1, z: -2 });
    generatePois(9182, { x: 50, z: 50 });
    generatePois(9182, { x: 0, z: -2 });
    expect(generatePois(9182, { x: 1, z: -2 })).toEqual(first);
  });

  it("assigns every accepted origin to exactly one owning chunk", () => {
    const generated = Array.from({ length: 12 }, (_, x) => generatePois(77, { x: x - 6, z: 0 }).pois).flat();
    expect(new Set(generated.map((poi) => poi.id)).size).toBe(generated.length);
    for (const poi of generated) {
      expect(Math.floor(poi.position.x / 16)).toBe(poi.ownerChunk.x);
      expect(Math.floor(poi.position.z / 16)).toBe(poi.ownerChunk.z);
    }
  });

  it("enforces stable minimum spacing between accepted waystones", () => {
    const pois = Array.from({ length: 30 }, (_, x) => generatePois(991, { x: x - 15, z: 0 }).pois).flat();
    for (let a = 0; a < pois.length; a += 1) for (let b = a + 1; b < pois.length; b += 1) {
      expect(Math.hypot(pois[a]!.position.x - pois[b]!.position.x, pois[a]!.position.z - pois[b]!.position.z)).toBeGreaterThanOrEqual(70);
    }
  });

  it("keeps generated records independent from Three.js", () => {
    const visit = (value: unknown): boolean => value instanceof Object3D || (typeof value === "object" && value !== null && Object.values(value).some(visit));
    expect(visit(generatePois(42, { x: 0, z: 0 }))).toBe(false);
  });
});

describe("POI footprints and exclusions", () => {
  const circle: PoiFootprint = { kind: "circle", x: 0, z: 0, radius: 2 };
  const rectangle: PoiFootprint = { kind: "rectangle", x: 2.5, z: 0, halfWidth: 1, halfDepth: 2, rotation: Math.PI / 4 };

  it("tests circles and oriented rectangles", () => {
    expect(pointInFootprint(1, 0, circle)).toBe(true);
    expect(pointInFootprint(2.5, 0, rectangle)).toBe(true);
    expect(footprintsOverlap(circle, rectangle)).toBe(true);
    expect(footprintsOverlap(circle, { ...rectangle, x: 20 })).toBe(false);
    expect(footprintsOverlap(rectangle, { ...rectangle, x: 3 })).toBe(true);
  });

  it("recognizes river intersections from global samplers", () => {
    expect(footprintIntersectsRiver(123, { kind: "circle", x: 8, z: 8, radius: 12 })).toBe(true);
    expect(footprintIntersectsRiver(123, { kind: "circle", x: 80, z: 8, radius: 1 })).toBe(false);
  });

  it("excludes vegetation in solid footprints and clearings", () => {
    expect(isVegetationExcluded(1, 0, [{ purpose: "solid", footprint: circle }])).toBe(true);
    expect(isVegetationExcluded(4, 0, [{ purpose: "vegetation-exclusion", footprint: { ...circle, radius: 5 } }])).toBe(true);
    expect(isVegetationExcluded(1, 0, [{ purpose: "decoration", footprint: circle }])).toBe(false);
  });

  it("removes all generated vegetation from POI exclusion zones", () => {
    const zone = { purpose: "vegetation-exclusion" as const, footprint: { kind: "circle" as const, x: 8, z: 8, radius: 20 } };
    const vegetation = generateVegetation(281, { x: 0, z: 0 }, [zone]);
    expect(vegetation.leafTrees).toHaveLength(0);
    expect(vegetation.bushes).toHaveLength(0);
    expect(vegetation.flowers).toHaveLength(0);
  });

});
