import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  BLOB_SHADOW_SEGMENTS,
  BLOB_SHADOW_TRIANGLES,
  createBlobShadowGeometry,
  createBlobShadowMaterial,
  getBlobShadowStats,
  markBlobShadow,
} from "./blobShadows";

describe("blob shadows", () => {
  it("uses low-cost transparent geometry without writing depth", () => {
    const geometry = createBlobShadowGeometry();
    const material = createBlobShadowMaterial();

    expect(BLOB_SHADOW_SEGMENTS).toBeLessThanOrEqual(12);
    expect(geometry.getIndex()!.count / 3).toBe(BLOB_SHADOW_TRIANGLES);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it("reports one draw for a whole instanced tree batch", () => {
    const scene = new THREE.Scene();
    const shadows = markBlobShadow(new THREE.InstancedMesh(
      createBlobShadowGeometry(), createBlobShadowMaterial(), 7,
    ));
    scene.add(shadows);

    expect(getBlobShadowStats(scene)).toEqual({
      drawCalls: 1,
      triangles: BLOB_SHADOW_TRIANGLES * 7,
    });
    shadows.visible = false;
    expect(getBlobShadowStats(scene)).toEqual({ drawCalls: 0, triangles: 0 });
  });
});
