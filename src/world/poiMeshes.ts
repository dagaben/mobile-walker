import * as THREE from "three";
import type { GeneratedPoi, PoiDebugCandidate, PoiFootprint } from "./poi";

export interface PoiDebugOptions { readonly level: "off" | "accepted" | "candidates" }

/** Presentation registry kept entirely separate from deterministic generation. */
export class PoiMeshFactory {
  private readonly renderers = new Map<string, (poi: GeneratedPoi) => THREE.Object3D>();
  private readonly stoneGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x89877d, roughness: 1, flatShading: true });
  private readonly debugMaterial = new THREE.LineBasicMaterial({ color: 0xffcc44, depthTest: false });
  constructor() {
    this.markShared(this.stoneGeometry);
    this.register("waystone", poi => {
      const mesh = new THREE.Mesh(this.stoneGeometry, this.stoneMaterial);
      const height = Number(poi.parameters?.height ?? 2.5);
      mesh.scale.set(1.1, height, .65); mesh.position.y = height / 2; mesh.castShadow = true;
      return mesh;
    });
  }
  register(typeId: string, renderer: (poi: GeneratedPoi) => THREE.Object3D): void { this.renderers.set(typeId, renderer); }
  create(poi: GeneratedPoi): THREE.Group {
    const root = new THREE.Group(); root.name = `poi:${poi.typeId}:${poi.id}`;
    root.position.set(poi.position.x, poi.position.y, poi.position.z); root.rotation.y = poi.rotation;
    const renderer = this.renderers.get(poi.typeId); if (renderer) root.add(renderer(poi)); return root;
  }
  createDebug(pois: readonly GeneratedPoi[], candidates: readonly PoiDebugCandidate[]): THREE.Group {
    const root=new THREE.Group(); root.name="debug:pois";
    for(const poi of pois){root.add(this.outline(poi.footprint,poi.position.y+.08));const direction=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(poi.position.x,poi.position.y+.12,poi.position.z),new THREE.Vector3(poi.entrance?.position.x??poi.position.x,poi.position.y+.12,poi.entrance?.position.z??poi.position.z)]);root.add(new THREE.Line(direction,this.debugMaterial));}
    for(const candidate of candidates){const marker=new THREE.Mesh(new THREE.SphereGeometry(.12,5,3),new THREE.MeshBasicMaterial({color:candidate.accepted?0x55ff77:0xff4455}));marker.position.set(candidate.x,.2,candidate.z);marker.userData={poiId:candidate.id,rejectionReason:candidate.reason};root.add(marker);}
    return root;
  }
  private outline(shape:PoiFootprint,y:number):THREE.LineLoop {const points=shape.kind==="circle"?Array.from({length:24},(_,i)=>new THREE.Vector3(shape.x+Math.cos(i*Math.PI/12)*shape.radius,y,shape.z+Math.sin(i*Math.PI/12)*shape.radius)):Array.from({length:4},(_,i)=>{const u=i===0||i===3?-1:1,v=i<2?-1:1,c=Math.cos(shape.rotation),s=Math.sin(shape.rotation);return new THREE.Vector3(shape.x+c*shape.halfWidth*u-s*shape.halfDepth*v,y,shape.z+s*shape.halfWidth*u+c*shape.halfDepth*v);});return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),this.debugMaterial);}
  private markShared(geometry:THREE.BufferGeometry):void { geometry.userData.poiShared=true; }
  dispose():void { this.stoneGeometry.dispose();this.stoneMaterial.dispose();this.debugMaterial.dispose(); }
}
