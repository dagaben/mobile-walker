import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createRoofGeometry } from "./poiMeshes";

describe("building roof geometry", () => {
  it("winds both gable ends outward so front-sided materials render a complete roof", () => {
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
    geometry.dispose();
  });
});
