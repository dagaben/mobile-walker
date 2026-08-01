import * as THREE from "three";
import { blobShadowProjectionForCaster } from "./sunlightDirection";
import type { GeneratedPoi } from "../world/poi";

export const BLOB_SHADOW_NAME = "blob-shadow";
export const BLOB_SHADOW_SEGMENTS = 12;
export const BLOB_SHADOW_TRIANGLES = BLOB_SHADOW_SEGMENTS;

/** A dark, unlit contact-shadow material that does not rely on shadow maps. */
export function createBlobShadowMaterial(opacity = 0.28): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x17221b,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

const PLAYER_SHADOW_RINGS = 4;
const PLAYER_SHADOW_SEGMENTS = 20;

/**
 * A denser, subtly asymmetric footprint for the player. Its concentric rings
 * give the presentation system enough vertices to drape it over uneven ground
 * instead of intersecting the terrain as one rigid floating disc.
 */
export function createPlayerShadowGeometry(): THREE.BufferGeometry {
  const positions: number[] = [0, 0, 0];
  const indices: number[] = [];
  for (let ring = 1; ring <= PLAYER_SHADOW_RINGS; ring += 1) {
    const radius = ring / PLAYER_SHADOW_RINGS;
    for (let segment = 0; segment < PLAYER_SHADOW_SEGMENTS; segment += 1) {
      const angle = segment / PLAYER_SHADOW_SEGMENTS * Math.PI * 2;
      // Broaden the shoulders and taper the trailing edge, avoiding a perfect
      // geometric circle even when viewed directly from above.
      const silhouette = 1 + 0.07 * Math.cos(angle) - 0.05 * Math.cos(angle * 2);
      positions.push(
        Math.cos(angle) * radius * silhouette,
        0,
        Math.sin(angle) * radius * (1 - 0.04 * Math.cos(angle)),
      );
    }
  }
  for (let segment = 0; segment < PLAYER_SHADOW_SEGMENTS; segment += 1) {
    indices.push(0, 1 + segment, 1 + (segment + 1) % PLAYER_SHADOW_SEGMENTS);
  }
  for (let ring = 1; ring < PLAYER_SHADOW_RINGS; ring += 1) {
    const inner = 1 + (ring - 1) * PLAYER_SHADOW_SEGMENTS;
    const outer = inner + PLAYER_SHADOW_SEGMENTS;
    for (let segment = 0; segment < PLAYER_SHADOW_SEGMENTS; segment += 1) {
      const next = (segment + 1) % PLAYER_SHADOW_SEGMENTS;
      indices.push(inner + segment, outer + segment, outer + next);
      indices.push(inner + segment, outer + next, inner + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Drape every player-shadow vertex over the generated terrain. */
export function conformBlobShadowToTerrain(
  shadow: THREE.Mesh,
  sampleHeight: (x: number, z: number) => number,
  clearance = 0.035,
): void {
  const positions = shadow.geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const localX = positions.getX(index) * shadow.scale.x;
    const localZ = positions.getZ(index) * shadow.scale.z;
    const cosine = Math.cos(shadow.rotation.y);
    const sine = Math.sin(shadow.rotation.y);
    const worldX = shadow.position.x + localX * cosine + localZ * sine;
    const worldZ = shadow.position.z - localX * sine + localZ * cosine;
    // Divide out the mesh scale because Three.js applies it again at render time.
    positions.setY(index, (sampleHeight(worldX, worldZ) + clearance) / shadow.scale.y);
  }
  positions.needsUpdate = true;
  shadow.geometry.computeVertexNormals();
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

export const BUILDING_SHADOW_SUBDIVISIONS = 6;
export const BUILDING_SHADOW_CLEARANCE = 0.035;
export type BuildingShadowCaster = NonNullable<GeneratedPoi["shadowCaster"]>;

/** One combined, subdivided geometry; immutable caster data remains in userData. */
export function createBuildingShadowGeometry(casters:readonly BuildingShadowCaster[]):THREE.BufferGeometry {
  const positions:number[]=[],indices:number[]=[];
  const side=BUILDING_SHADOW_SUBDIVISIONS+1;
  for(const caster of casters){
    const base=positions.length/3,c=Math.cos(caster.rotation),s=Math.sin(caster.rotation);
    for(let z=0;z<side;z++)for(let x=0;x<side;x++){
      const lx=(x/BUILDING_SHADOW_SUBDIVISIONS-.5)*caster.width;
      const lz=(z/BUILDING_SHADOW_SUBDIVISIONS-.5)*caster.depth;
      positions.push(caster.x+lx*c-lz*s,0,caster.z+lx*s+lz*c);
    }
    for(let z=0;z<BUILDING_SHADOW_SUBDIVISIONS;z++)for(let x=0;x<BUILDING_SHADOW_SUBDIVISIONS;x++){
      const a=base+z*side+x,b=a+side;indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  geometry.userData.shadowCasters=casters.map(c=>({...c}));
  return geometry;
}

/** Rebuilds from immutable oriented footprints, then samples terrain at final X/Z. */
export function updateBuildingShadowGeometry(geometry:THREE.BufferGeometry,sunlight:THREE.Vector3,sampleHeight:(x:number,z:number)=>number):void {
  const casters=geometry.userData.shadowCasters as readonly BuildingShadowCaster[];
  const positions=geometry.getAttribute("position");let index=0;
  for(const caster of casters){
    const projection=blobShadowProjectionForCaster(sunlight,caster.height,{minimumStretch:1,maximumStretch:2.2,maximumOffset:12});
    const c=Math.cos(caster.rotation),s=Math.sin(caster.rotation);
    for(let z=0;z<=BUILDING_SHADOW_SUBDIVISIONS;z++)for(let x=0;x<=BUILDING_SHADOW_SUBDIVISIONS;x++){
      const lx=(x/BUILDING_SHADOW_SUBDIVISIONS-.5)*caster.width;
      const lz=(z/BUILDING_SHADOW_SUBDIVISIONS-.5)*caster.depth;
      const baseX=caster.x+lx*c-lz*s,baseZ=caster.z+lx*s+lz*c;
      const along=lx*c*projection.directionX+lx*s*projection.directionZ-lz*s*projection.directionX+lz*c*projection.directionZ;
      const extent=Math.max(caster.width,caster.depth)/2;
      const contribution=.5+.5*Math.max(-1,Math.min(1,along/Math.max(.01,extent)));
      const distance=projection.offsetDistance*contribution;
      const worldX=baseX+projection.directionX*distance,worldZ=baseZ+projection.directionZ*distance;
      positions.setXYZ(index++,worldX,sampleHeight(worldX,worldZ)+BUILDING_SHADOW_CLEARANCE,worldZ);
    }
  }
  positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
}
