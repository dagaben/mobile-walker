import type { TransformComponent } from "../ecs/Entity";
import { resolveSweptCircularMovement } from "./circularCollision";
import { CHUNK_SIZE, worldToChunk } from "./chunkCoordinates";
import { chunkId } from "./chunkId";
import type { GeneratedChunkRepository } from "./GeneratedChunkRepository";
import type { StructureBoxCollider, StructureCollisionDefinition, StructureSurfaceRecord } from "./structureTypes";

export const PLAYER_STRUCTURE_COLLISION_HEIGHT=1.5;
export const STRUCTURE_STEP_UP_HEIGHT=.42;
export const STRUCTURE_TANGENTIAL_RETENTION=.98;
/** @deprecated Shared by every structure obstacle, not only bridge railings. */
export const BRIDGE_RAILING_TANGENTIAL_RETENTION=STRUCTURE_TANGENTIAL_RETENTION;
export const STRUCTURE_COLLISION_MAX_ITERATIONS=6;
export interface StructureSupport{readonly id:string;readonly kind:StructureSurfaceRecord["kind"];readonly height:number}
export interface StructureCollisionResult{readonly transform:TransformComponent;readonly support?:StructureSupport;readonly ceilingHeight?:number;readonly contactNormal?:Readonly<{x:number;z:number}>;readonly slide?:Readonly<{x:number;z:number}>}

/** Bounded active owner-chunk lookup returning bridges and POIs once by structure ID. */
export function queryStructureCollisions(repository:GeneratedChunkRepository,from:Pick<TransformComponent,"x"|"z">,to:Pick<TransformComponent,"x"|"z">,margin=1):readonly StructureCollisionDefinition[]{
 const query={minX:Math.min(from.x,to.x)-margin,maxX:Math.max(from.x,to.x)+margin,minZ:Math.min(from.z,to.z)-margin,maxZ:Math.max(from.z,to.z)+margin},min=worldToChunk(query.minX-CHUNK_SIZE,query.minZ-CHUNK_SIZE),max=worldToChunk(query.maxX+CHUNK_SIZE,query.maxZ+CHUNK_SIZE),found:StructureCollisionDefinition[]=[],ids=new Set<string>();
 for(let z=min.z;z<=max.z;z++)for(let x=min.x;x<=max.x;x++){const data=repository.get(chunkId({x,z}));if(!data)continue;const definitions=[...(data.bridges??[]).map(b=>b.collision),...(data.pois??[]).map(p=>p.structure)];for(const definition of definitions){if(ids.has(definition.structureId)||definition.bounds.maxX<query.minX||definition.bounds.minX>query.maxX||definition.bounds.maxZ<query.minZ||definition.bounds.minZ>query.maxZ)continue;ids.add(definition.structureId);found.push(definition);}}
 return found.sort((a,b)=>a.structureId.localeCompare(b.structureId));
}
/** @deprecated Use the unified structure query. */
export const queryBridgeCollisions=queryStructureCollisions;

function surfaceHeight(surface:StructureSurfaceRecord,x:number,z:number,radius=0):number|undefined{const dx=x-surface.centre.x,dz=z-surface.centre.z,u=dx*surface.direction.x+dz*surface.direction.z,v=-dx*surface.direction.z+dz*surface.direction.x;if(Math.abs(u)>surface.length/2+radius||Math.abs(v)>surface.width/2+radius)return;const t=Math.max(0,Math.min(1,u/surface.length+.5));return surface.startHeight+(surface.endHeight-surface.startHeight)*t+surface.crownHeight*4*t*(1-t);}
export function selectStructureSupport(collisions:readonly StructureCollisionDefinition[],x:number,z:number,feetY:number,verticalVelocity:number,previousSupportId:string|undefined,radius=.38):StructureSupport|undefined{let best:StructureSupport|undefined;for(const structure of collisions)for(const surface of structure.surfaces){const height=surfaceHeight(surface,x,z,radius*.2);if(height===undefined)continue;const retained=verticalVelocity<=0&&previousSupportId===surface.id&&Math.abs(feetY-height)<=STRUCTURE_STEP_UP_HEIGHT+.18,reachable=verticalVelocity<=0&&height<=feetY+STRUCTURE_STEP_UP_HEIGHT&&height>=feetY-.32;if(!retained&&!reachable)continue;if(!best||Math.abs(height-feetY)<Math.abs(best.height-feetY))best={id:surface.id,kind:surface.kind,height};}return best;}
function circleSegment(x:number,z:number,ax:number,az:number,bx:number,bz:number,radius:number){const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz,t=l2?Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)):0,qx=ax+dx*t,qz=az+dz*t,ox=x-qx,oz=z-qz,d=Math.hypot(ox,oz),length=Math.sqrt(l2);return d<radius?{x:d?ox/d:length?-dz/length:1,z:d?oz/d:length?dx/length:0,depth:radius-d}:undefined;}
function circleBox(x:number,z:number,box:StructureBoxCollider,radius:number){const dx=x-box.centre.x,dz=z-box.centre.z,u=dx*box.direction.x+dz*box.direction.z,v=-dx*box.direction.z+dz*box.direction.x,cu=Math.max(-box.length/2,Math.min(box.length/2,u)),cv=Math.max(-box.width/2,Math.min(box.width/2,v)),du=u-cu,dv=v-cv,dist=Math.hypot(du,dv);if(dist>=radius)return;let nu:number,nv:number,depth:number;if(dist){nu=du/dist;nv=dv/dist;depth=radius-dist;}else{const eu=box.length/2+radius-Math.abs(u),ev=box.width/2+radius-Math.abs(v);if(eu<ev){nu=Math.sign(u)||1;nv=0;depth=eu;}else{nu=0;nv=Math.sign(v)||1;depth=ev;}}return{x:nu*box.direction.x-nv*box.direction.z,z:nu*box.direction.z+nv*box.direction.x,depth};}

/** Shared swept/iterative horizontal contacts plus layered floors and undersides. */
export function resolveStructureMovement(from:TransformComponent,to:TransformComponent,collisions:readonly StructureCollisionDefinition[],heightOffset:number,previousSupportId?:string,radius=.38,playerHeight=PLAYER_STRUCTURE_COLLISION_HEIGHT):StructureCollisionResult{
 if(![from.x,from.y,from.z,to.x,to.y,to.z].every(Number.isFinite))return{transform:{...from}};const feet=from.y-heightOffset;
 const circles=collisions.flatMap(s=>s.circles.filter(c=>feet+playerHeight>=c.centre.y-c.height/2&&feet<=c.centre.y+c.height/2).map(c=>({id:c.id,x:c.centre.x,z:c.centre.z,radius:radius+c.radius})));
 const circleResult=resolveSweptCircularMovement(from.x,from.z,to.x-from.x,to.z-from.z,circles,STRUCTURE_TANGENTIAL_RETENTION,STRUCTURE_COLLISION_MAX_ITERATIONS),dx=circleResult.x-from.x,dz=circleResult.z-from.z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/(radius*.5))),p={x:from.x,z:from.z};let normal=circleResult.contactNormal,slide=circleResult.slide;
 for(let step=0;step<steps;step++){let mx=dx/steps,mz=dz/steps;for(let iteration=0;iteration<STRUCTURE_COLLISION_MAX_ITERATIONS;iteration++){const nx=p.x+mx,nz=p.z+mz;let hit:{x:number;z:number;depth:number}|undefined;for(const structure of collisions){for(const segment of structure.segments){if(feet+playerHeight<Math.min(segment.start.y,segment.end.y)-segment.height/2||feet>Math.max(segment.start.y,segment.end.y)+segment.height/2)continue;const h=circleSegment(nx,nz,segment.start.x,segment.start.z,segment.end.x,segment.end.z,radius+segment.thickness/2);if(h&&(!hit||h.depth>hit.depth))hit=h;}for(const box of structure.boxes){if(feet+playerHeight<box.centre.y-box.height/2||feet>box.centre.y+box.height/2)continue;const h=circleBox(nx,nz,box,radius);if(h&&(!hit||h.depth>hit.depth))hit=h;}}if(!hit){p.x=nx;p.z=nz;break;}p.x=nx+hit.x*(hit.depth+1e-5);p.z=nz+hit.z*(hit.depth+1e-5);const inward=Math.min(0,mx*hit.x+mz*hit.z);mx=(mx-hit.x*inward)*STRUCTURE_TANGENTIAL_RETENTION;mz=(mz-hit.z*inward)*STRUCTURE_TANGENTIAL_RETENTION;normal={x:hit.x,z:hit.z};slide={x:mx,z:mz};if(Math.hypot(mx,mz)<1e-7)break;}}
 const candidateY=to.y-heightOffset,support=selectStructureSupport(collisions,p.x,p.z,candidateY,to.y-from.y,previousSupportId,radius);let y=to.y,ceilingHeight:number|undefined;if(support&&to.y-from.y<=0)y=support.height+heightOffset;
 for(const structure of collisions)for(const surface of structure.surfaces){if(!surface.overhead)continue;const top=surfaceHeight(surface,p.x,p.z);if(top===undefined)continue;const underside=top-surface.thickness;if(candidateY<underside&&candidateY+playerHeight>underside){ceilingHeight=ceilingHeight===undefined?underside:Math.min(ceilingHeight,underside);y=Math.min(y,underside-playerHeight+heightOffset);}}
 return{transform:{...to,x:p.x,z:p.z,y},support,ceilingHeight,contactNormal:normal,slide};
}
