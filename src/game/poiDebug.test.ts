import { describe, expect, it } from "vitest";

import type { GeneratedChunkData } from "../world/generateChunk";
import { GeneratedChunkRepository } from "../world/GeneratedChunkRepository";
import type { GeneratedPoi } from "../world/poi";
import { findNearestPoiTypes, formatPoiDistance } from "./poiDebug";

function poi(typeId: string, x: number, z: number): GeneratedPoi {
  return { typeId, position: { x, y: 0, z } } as GeneratedPoi;
}

function chunk(pois: readonly GeneratedPoi[]): GeneratedChunkData {
  return { pois } as GeneratedChunkData;
}

describe("findNearestPoiTypes", () => {
  it("returns the closest generated POI for every type", () => {
    const repository = new GeneratedChunkRepository();
    repository.set("0,0", chunk([
      poi("forest-cabin", 12, 0),
      poi("forest-cabin", 3, 4),
      poi("lake-house", -6, 8),
    ]));

    expect([...findNearestPoiTypes(repository, 0, 0)]).toEqual([
      ["forest-cabin", { typeId: "forest-cabin", x: 3, z: 4, distance: 5 }],
      ["lake-house", { typeId: "lake-house", x: -6, z: 8, distance: 10 }],
    ]);
  });

  it("ignores generated chunks outside the requested search radius", () => {
    const repository = new GeneratedChunkRepository();
    repository.set("3,0", chunk([poi("forest-cabin", 100, 0)]));

    expect(findNearestPoiTypes(repository, 0, 0, 2).size).toBe(0);
    expect(findNearestPoiTypes(repository, 0, 0, 3).get("forest-cabin")?.distance).toBe(100);
  });
});

describe("formatPoiDistance", () => {
  it("rounds the distance and labels it in metres", () => {
    expect(formatPoiDistance(42.49)).toBe("42 m");
    expect(formatPoiDistance(42.5)).toBe("43 m");
  });
});
