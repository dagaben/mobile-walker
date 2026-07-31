import * as THREE from "three";

export const BLOB_SHADOW_NAME = "blob-shadow";
export const BLOB_SHADOW_SEGMENTS = 12;
export const BLOB_SHADOW_TRIANGLES = BLOB_SHADOW_SEGMENTS;

/** A deliberately small, unlit contact shadow that does not rely on shadow maps. */
export function createBlobShadowMaterial(opacity = 0.14): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x405044,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** CircleGeometry is authored in XY; lay it just above the terrain in XZ. */
export function createBlobShadowGeometry(): THREE.CircleGeometry {
  const geometry = new THREE.CircleGeometry(1, BLOB_SHADOW_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function markBlobShadow<T extends THREE.Mesh>(shadow: T): T {
  shadow.name = BLOB_SHADOW_NAME;
  shadow.userData.isBlobShadow = true;
  shadow.renderOrder = 2;
  return shadow;
}

export function getBlobShadowStats(scene: THREE.Scene): { drawCalls: number; triangles: number } {
  let drawCalls = 0;
  let triangles = 0;
  scene.traverseVisible((object) => {
    if (!object.userData.isBlobShadow || !(object instanceof THREE.Mesh)) return;
    drawCalls += 1;
    const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
    const indexCount = object.geometry.index?.count
      ?? object.geometry.getAttribute("position")?.count
      ?? 0;
    triangles += Math.floor(indexCount / 3) * instances;
  });
  return { drawCalls, triangles };
}
