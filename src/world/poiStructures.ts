import type { GeneratedPoi } from "./poi";
import type { StructureBoxCollider, StructureCircularCollider, StructureCollisionDefinition, StructureComponentCategory, StructureSegmentCollider, StructureSurfaceRecord } from "./structureTypes";

export const FOUNDATION_GROUND_EMBED=.12;
export const POI_DIMENSIONS=Object.freeze({
 house:{foundation:[6.2,5.2] as const,foundationTop:.375,walls:[5.7,2.8,4.7] as const,wallsY:1.72},
 porch:{size:[4,.22,1.25] as const,centre:[0,.55,2.85] as const},
 cabin:{base:[4.8,.3,4] as const,walls:[4.5,2.35,3.7] as const,legs:[-1.8,1.8] as const,legZ:[-1.45,1.45] as const,legWidth:.28,legTop:1.15},
 tower:{legs:[-1.55,1.55] as const,legWidth:.38,legTop:6.8,platform:[4.2,.3,4.2] as const,platformY:6.55,mass:[3.55,2.25,3.55] as const,massY:7.75},
 fence:{railHeight:.18,railY:.72,postWidth:.2,postHeight:1.2,segments:[[-4.7,-3.8,5.5,.16],[4.7,-3.8,5.5,.16],[-6.9,0,.16,7.7],[6.9,0,.16,7.7],[-4.7,3.8,4.1,.16],[4.7,3.8,4.1,.16]] as const},
 dock:{width:2.1,thickness:.16,postWidth:.18,postHeight:1.25},
});

export function foundationDepth(poi:GeneratedPoi,minimumDepth=.12):number{const minimum=poi.metadata?.terrain?.minimumHeight;return Number.isFinite(minimum)?Math.max(minimumDepth,poi.position.y-minimum+FOUNDATION_GROUND_EMBED):minimumDepth;}
function world(poi:GeneratedPoi,x:number,y:number,z:number){const c=Math.cos(poi.rotation),s=Math.sin(poi.rotation);return{x:poi.position.x+c*x+s*z,y:poi.position.y+y,z:poi.position.z-s*x+c*z};}
function direction(poi:GeneratedPoi){return{x:Math.cos(poi.rotation),z:-Math.sin(poi.rotation)}}

/** One deterministic component description is consumed directly by rendering and collision. */
export function createPoiStructure(poi:GeneratedPoi):StructureCollisionDefinition{
 const boxes:StructureBoxCollider[]=[],circles:StructureCircularCollider[]=[],segments:StructureSegmentCollider[]=[],surfaces:StructureSurfaceRecord[]=[],d=direction(poi),depth=foundationDepth(poi);
 const box=(id:string,kind:StructureComponentCategory,size:readonly[number,number,number],position:readonly[number,number,number])=>boxes.push({id:`${poi.id}:${id}`,kind,centre:world(poi,...position),length:size[0],height:size[1],width:size[2],direction:d});
 const circle=(id:string,kind:StructureComponentCategory,x:number,z:number,top:number,width:number)=>circles.push({id:`${poi.id}:${id}`,kind,centre:world(poi,x,(top-depth)/2,z),radius:width/2,height:top+depth});
 const surface=(id:string,kind:StructureSurfaceRecord["kind"],size:readonly[number,number,number],position:readonly[number,number,number])=>surfaces.push({id:`${poi.id}:${id}`,kind,centre:world(poi,...position),length:size[0],width:size[2],direction:d,startHeight:poi.position.y+position[1]+size[1]/2,endHeight:poi.position.y+position[1]+size[1]/2,crownHeight:0,thickness:size[1],solid:true,walkable:true,overhead:true});
 if(poi.typeId==="plains-farmhouse"||poi.typeId==="lake-house"){
  const h=POI_DIMENSIONS.house;box("foundation","foundation",[h.foundation[0],h.foundationTop+depth,h.foundation[1]],[0,(h.foundationTop-depth)/2,0]);box("walls","wall",h.walls,[0,h.wallsY,0]);
  if(poi.typeId==="lake-house"){surface("porch","porch",POI_DIMENSIONS.porch.size,POI_DIMENSIONS.porch.centre);if(poi.dock&&poi.dock.footprint.kind==="rectangle"){const fp=poi.dock.footprint,top=poi.dock.surfaceElevation+.2,centre={x:fp.x,y:top-POI_DIMENSIONS.dock.thickness/2,z:fp.z};surfaces.push({id:`${poi.id}:dock`,kind:"dock",centre,length:fp.halfDepth*2,width:fp.halfWidth*2,direction:{x:Math.sin(fp.rotation),z:Math.cos(fp.rotation)},startHeight:top,endHeight:top,crownHeight:0,thickness:POI_DIMENSIONS.dock.thickness,solid:true,walkable:true,overhead:true});const local=worldToLocal(poi,fp.x,fp.z),length=fp.halfDepth*2;for(const x of[-1,1])for(const z of[-length/2+.3,length/2-.3])circles.push({id:`${poi.id}:dock-post:${x}:${z}`,kind:"support",centre:world(poi,local.x+x,(top-poi.position.y)-.42,local.z+z),radius:POI_DIMENSIONS.dock.postWidth/2,height:POI_DIMENSIONS.dock.postHeight});}}
  else for(const [index,[x,z,sx,sz]] of POI_DIMENSIONS.fence.segments.entries()){const horizontal=sx>sz,half=(horizontal?sx:sz)/2,a=world(poi,x-(horizontal?half:0),POI_DIMENSIONS.fence.railY,z-(horizontal?0:half)),b=world(poi,x+(horizontal?half:0),POI_DIMENSIONS.fence.railY,z+(horizontal?0:half));segments.push({id:`${poi.id}:fence-rail:${index}`,kind:"fence",start:a,end:b,height:POI_DIMENSIONS.fence.railHeight,thickness:horizontal?sz:sx});for(const side of[-1,1])circle(`fence-post:${index}:${side}`,"fence",x+(horizontal?side*half:0),z+(horizontal?0:side*half),POI_DIMENSIONS.fence.postHeight,POI_DIMENSIONS.fence.postWidth);}
 }else if(poi.typeId==="forest-cabin"){
  const c=POI_DIMENSIONS.cabin,raised=poi.metadata.biome==="wetland",base=raised?1.05:.25;if(raised){for(const x of c.legs)for(const z of c.legZ)circle(`stilt:${x}:${z}`,"stilt",x,z,c.legTop,c.legWidth);surface("raised-base","platform",c.base,[0,base,0]);}else box("low-foundation","foundation",[c.base[0],.4+depth,c.base[2]],[0,(.4-depth)/2,0]);box("cabin-walls","wall",c.walls,[0,base+1.28,0]);
 }else if(poi.typeId==="highland-watchtower"){
  const t=POI_DIMENSIONS.tower;for(const x of t.legs)for(const z of t.legs)circle(`tower-leg:${x}:${z}`,"stilt",x,z,t.legTop,t.legWidth);box("tower-platform","platform",t.platform,[0,t.platformY,0]);box("tower-mass","wall",t.mass,[0,t.massY,0]);
 }
 const points=[...boxes.flatMap(b=>[{x:b.centre.x-Math.hypot(b.length,b.width)/2,z:b.centre.z-Math.hypot(b.length,b.width)/2},{x:b.centre.x+Math.hypot(b.length,b.width)/2,z:b.centre.z+Math.hypot(b.length,b.width)/2}]),...circles.flatMap(c=>[{x:c.centre.x-c.radius,z:c.centre.z-c.radius},{x:c.centre.x+c.radius,z:c.centre.z+c.radius}]),...segments.flatMap(s=>[s.start,s.end]),...surfaces.flatMap(s=>[{x:s.centre.x-Math.hypot(s.length,s.width)/2,z:s.centre.z-Math.hypot(s.length,s.width)/2},{x:s.centre.x+Math.hypot(s.length,s.width)/2,z:s.centre.z+Math.hypot(s.length,s.width)/2}])];
 return{structureId:poi.id,ownerChunk:{...poi.ownerChunk},source:"poi",boxes,circles,segments,surfaces,bounds:{minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))}};
}
function worldToLocal(poi:GeneratedPoi,x:number,z:number){const dx=x-poi.position.x,dz=z-poi.position.z,c=Math.cos(poi.rotation),s=Math.sin(poi.rotation);return{x:dx*c-dz*s,z:dx*s+dz*c};}
