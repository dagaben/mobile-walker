import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  BLOB_SHADOW_SEGMENTS,
  BLOB_SHADOW_TRIANGLES,
  conformBlobShadowToTerrain,
  createBlobShadowGeometry,
  createBlobShadowMaterial,
  createPlayerShadowGeometry,
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
    expect(material.opacity).toBeGreaterThanOrEqual(0.28);
    expect(material.color.getHex()).toBe(0x17221b);
  });

  it("creates a detailed player silhouette that can follow uneven terrain", () => {
    const geometry = createPlayerShadowGeometry();
    const shadow = new THREE.Mesh(geometry, createBlobShadowMaterial());
    shadow.position.set(4, 0, -2);
    shadow.scale.set(0.58, 1, 0.43);

    conformBlobShadowToTerrain(shadow, (x, z) => x * 0.2 + z * 0.1);

    const positions = geometry.getAttribute("position");
    expect(positions.count).toBeGreaterThan(60);
    expect(new Set(Array.from({ length: positions.count }, (_, index) =>
      positions.getY(index).toFixed(4),
    )).size).toBeGreaterThan(4);
    for (let index = 0; index < positions.count; index += 1) {
      const worldX = shadow.position.x + positions.getX(index) * shadow.scale.x;
      const worldZ = shadow.position.z + positions.getZ(index) * shadow.scale.z;
      expect(positions.getY(index)).toBeCloseTo(worldX * 0.2 + worldZ * 0.1 + 0.035, 4);
    }
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
