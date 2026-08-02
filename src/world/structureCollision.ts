import type { TransformComponent } from "../ecs/Entity";
import type { BridgeBoxCollider, BridgeCollisionDefinition, BridgeSurfaceRecord } from "./bridges";
import { CHUNK_SIZE, worldToChunk } from "./chunkCoordinates";
import { chunkId } from "./chunkId";
import type { GeneratedChunkRepository } from "./GeneratedChunkRepository";

export const PLAYER_STRUCTURE_COLLISION_HEIGHT = 1.5;
export const STRUCTURE_STEP_UP_HEIGHT = 0.42;
export const BRIDGE_RAILING_TANGENTIAL_RETENTION = 0.98;
export const STRUCTURE_COLLISION_MAX_ITERATIONS = 6;

export interface StructureSupport { readonly id:string;readonly kind:"deck"|"approach";readonly height:number }
export interface StructureCollisionResult {readonly transform:TransformComponent;readonly support?:StructureSupport;readonly ceilingHeight?:number;readonly contactNormal?:Readonly<{x:number;z:number}>;readonly slide?:Readonly<{x:number;z:number}>}

/** Bounded owner-chunk lookup; cross-chunk structures are returned once by ID. */
export function queryBridgeCollisions(repository:GeneratedChunkRepository,from:Pick<TransformComponent,"x"|"z">,to:Pick<TransformComponent,"x"|"z">,margin=1):readonly BridgeCollisionDefinition[]{
 const min=worldToChunk(Math.min(from.x,to.x)-margin-CHUNK_SIZE,Math.min(from.z,to.z)-margin-CHUNK_SIZE),max=worldToChunk(Math.max(from.x,to.x)+margin+CHUNK_SIZE,Math.max(from.z,to.z)+margin+CHUNK_SIZE),found:BridgeCollisionDefinition[]=[],ids=new Set<string>();
 for(let z=min.z;z<=max.z;z++)for(let x=min.x;x<=max.x;x++){const data=repository.get(chunkId({x,z}));if(!data)continue;for(const bridge of data.bridges){const c=bridge.collision;if(ids.has(c.bridgeId)||c.bounds.maxX<Math.min(from.x,to.x)-margin||c.bounds.minX>Math.max(from.x,to.x)+margin||c.bounds.maxZ<Math.min(from.z,to.z)-margin||c.bounds.minZ>Math.max(from.z,to.z)+margin)continue;ids.add(c.bridgeId);found.push(c);}}
 return found;
}

function surfaceHeight(surface:BridgeSurfaceRecord,x:number,z:number,radius=0):number|undefined{const dx=x-surface.centre.x,dz=z-surface.centre.z,u=dx*surface.direction.x+dz*surface.direction.z,v=-dx*surface.direction.z+dz*surface.direction.x;if(Math.abs(u)>surface.length/2+radius||Math.abs(v)>surface.width/2+radius)return;const t=Math.max(0,Math.min(1,u/surface.length+.5));return surface.startHeight+(surface.endHeight-surface.startHeight)*t+surface.crownHeight*4*t*(1-t);}

export function selectStructureSupport(collisions:readonly BridgeCollisionDefinition[],x:number,z:number,feetY:number,verticalVelocity:number,previousSupportId:string|undefined,radius=.38):StructureSupport|undefined{
 let best:StructureSupport|undefined;
 for(const bridge of collisions)for(const surface of bridge.surfaces){const height=surfaceHeight(surface,x,z,radius*.2);if(height===undefined)continue;const retained=verticalVelocity<=0&&previousSupportId===surface.id&&Math.abs(feetY-height)<=STRUCTURE_STEP_UP_HEIGHT+.18;const reachable=verticalVelocity<=0&&height<=feetY+STRUCTURE_STEP_UP_HEIGHT&&height>=feetY-.32;if(!retained&&!reachable)continue;if(!best||Math.abs(height-feetY)<Math.abs(best.height-feetY))best={id:surface.id,kind:surface.kind,height};}
 return best;
}

function circleSegment(x:number,z:number,ax:number,az:number,bx:number,bz:number,radius:number){const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz,t=l2?Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)):0,qx=ax+dx*t,qz=az+dz*t,ox=x-qx,oz=z-qz,d=Math.hypot(ox,oz);return d<radius?{x:d?ox/d:-dz/Math.sqrt(l2),z:d?oz/d:dx/Math.sqrt(l2),depth:radius-d}:undefined;}
function circleBox(x:number,z:number,box:BridgeBoxCollider,radius:number){const dx=x-box.centre.x,dz=z-box.centre.z,u=dx*box.direction.x+dz*box.direction.z,v=-dx*box.direction.z+dz*box.direction.x,cu=Math.max(-box.length/2,Math.min(box.length/2,u)),cv=Math.max(-box.width/2,Math.min(box.width/2,v)),du=u-cu,dv=v-cv,dist=Math.hypot(du,dv);if(dist>=radius)return;let nu:number,nv:number,depth:number;if(dist){nu=du/dist;nv=dv/dist;depth=radius-dist;}else{const eu=box.length/2+radius-Math.abs(u),ev=box.width/2+radius-Math.abs(v);if(eu<ev){nu=Math.sign(u)||1;nv=0;depth=eu;}else{nu=0;nv=Math.sign(v)||1;depth=ev;}}return{x:nu*box.direction.x-nv*box.direction.z,z:nu*box.direction.z+nv*box.direction.x,depth};}

/** Swept, iterative horizontal resolution followed by vertically contextual support/ceiling selection. */
export function resolveStructureMovement(from:TransformComponent,to:TransformComponent,collisions:readonly BridgeCollisionDefinition[],heightOffset:number,previousSupportId?:string,radius=.38,playerHeight=PLAYER_STRUCTURE_COLLISION_HEIGHT):StructureCollisionResult{
 const feet=from.y-heightOffset,dx=to.x-from.x,dz=to.z-from.z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/(radius*.65))),p={x:from.x,z:from.z};let normal:{x:number;z:number}|undefined,slide:{x:number;z:number}|undefined;
 for(let step=0;step<steps;step++){let mx=dx/steps,mz=dz/steps;for(let iteration=0;iteration<STRUCTURE_COLLISION_MAX_ITERATIONS;iteration++){const nx=p.x+mx,nz=p.z+mz;let hit:{x:number;z:number;depth:number}|undefined,retention=1;for(const bridge of collisions){for(const rail of bridge.railings){if(feet+playerHeight<Math.min(rail.start.y,rail.end.y)||feet>Math.max(rail.start.y,rail.end.y)+rail.height)continue;const h=circleSegment(nx,nz,rail.start.x,rail.start.z,rail.end.x,rail.end.z,radius+rail.thickness/2);if(h&&(!hit||h.depth>hit.depth)){hit=h;retention=BRIDGE_RAILING_TANGENTIAL_RETENTION;}}for(const solid of bridge.solids){if(feet+playerHeight<solid.centre.y-solid.height/2||feet>solid.centre.y+solid.height/2)continue;const h=circleBox(nx,nz,solid,radius);if(h&&(!hit||h.depth>hit.depth)){hit=h;retention=1;}}}if(!hit){p.x=nx;p.z=nz;break;}const into=Math.min(0,mx*hit.x+mz*hit.z);mx=(mx-hit.x*into)*retention;mz=(mz-hit.z*into)*retention;normal={x:hit.x,z:hit.z};slide={x:mx,z:mz};if(Math.hypot(mx,mz)<1e-7)break;}}
 const candidateY=to.y-heightOffset,support=selectStructureSupport(collisions,p.x,p.z,candidateY,to.y-from.y,previousSupportId,radius);let y=to.y,ceilingHeight:number|undefined;
 if(support&&to.y-from.y<=0)y=support.height+heightOffset;
 for(const bridge of collisions)for(const deck of bridge.surfaces){if(deck.kind!=="deck")continue;const top=surfaceHeight(deck,p.x,p.z);if(top===undefined)continue;const underside=top-deck.thickness;if(candidateY<underside&&candidateY+playerHeight>underside){ceilingHeight=underside;y=Math.min(y,underside-playerHeight+heightOffset);}}
 return{transform:{...to,x:p.x,z:p.z,y},support,ceilingHeight,contactNormal:normal,slide};
}
