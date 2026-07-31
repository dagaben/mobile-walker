import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { GeneratedPoi } from "./poi";
import { createRoofGeometry, PoiMeshFactory } from "./poiMeshes";

describe("building roof geometry", () => {
  it("winds every visible face outward and leaves the underside open", () => {
    const geometry = createRoofGeometry();
    const positions = geometry.getAttribute("position");
    const indices = geometry.getIndex()!;
    const triangleNormal = (triangle: number): THREE.Vector3 => new THREE.Triangle(
      new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangle * 3)),
      new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangle * 3 + 1)),
      new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangle * 3 + 2)),
    ).getNormal(new THREE.Vector3());

    expect(triangleNormal(0).z).toBeLessThan(0);
    expect(triangleNormal(1).z).toBeGreaterThan(0);
    expect(triangleNormal(2).x).toBeGreaterThan(0);
    expect(triangleNormal(3).x).toBeGreaterThan(0);
    expect(triangleNormal(4).x).toBeLessThan(0);
    expect(triangleNormal(5).x).toBeLessThan(0);
    expect(indices.count).toBe(18);
    for (let triangle = 0; triangle < indices.count / 3; triangle++) {
      expect(triangleNormal(triangle).y).toBeGreaterThanOrEqual(0);
    }
    geometry.dispose();
  });

  it("places the entire roof above the walls instead of letting the wall top cut through it", () => {
    const factory = new PoiMeshFactory();
    const house = factory.create({
      id: "roof-test",
      typeId: "plains-farmhouse",
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      decorativeTrees: [],
    } as unknown as GeneratedPoi);
    const walls = house.getObjectByName("walls")!;
    const roof = house.getObjectByName("pitched-roof")!;
    const wallBounds = new THREE.Box3().setFromObject(walls);
    const roofBounds = new THREE.Box3().setFromObject(roof);

    expect(roofBounds.min.y).toBeGreaterThanOrEqual(wallBounds.max.y);
    factory.dispose();
  });
});
