import type { ChunkCoordinate } from "./chunkCoordinates";

export type StructureComponentCategory = "wall"|"foundation"|"stilt"|"support"|"railing"|"fence"|"deck"|"approach"|"dock"|"porch"|"platform"|"abutment"|"prop"|"roof"|"overlay";
export interface StructurePoint { readonly x:number;readonly y:number;readonly z:number }
export interface StructureBounds { readonly minX:number;readonly maxX:number;readonly minZ:number;readonly maxZ:number }
export interface StructureBoxCollider { readonly id:string;readonly kind:StructureComponentCategory;readonly centre:StructurePoint;readonly length:number;readonly width:number;readonly height:number;readonly direction:Readonly<{x:number;z:number}> }
export interface StructureCircularCollider { readonly id:string;readonly kind:StructureComponentCategory;readonly centre:StructurePoint;readonly radius:number;readonly height:number }
export interface StructureSegmentCollider { readonly id:string;readonly kind:"railing"|"fence";readonly start:StructurePoint;readonly end:StructurePoint;readonly height:number;readonly thickness:number }
/** A finite structural slab. Its top profile, sides, and underside are all derived
 * from this one record; it is never merely an infinitely thin support plane. */
export interface StructureSurfaceRecord { readonly id:string;readonly kind:"deck"|"approach"|"dock"|"porch"|"platform";readonly centre:StructurePoint;readonly length:number;readonly width:number;readonly direction:Readonly<{x:number;z:number}>;readonly startHeight:number;readonly endHeight:number;readonly crownHeight:number;readonly thickness:number;readonly solid:boolean;readonly walkable:boolean;readonly overhead:boolean }
/** Presentation-neutral runtime input shared by bridges, POIs, and future structures. */
export type StructureMaterialKey="wall"|"lakeWall"|"roof"|"wood"|"darkWood"|"door"|"window"|"chimney"|"stone"|"stoneDark"|"rope";
interface StructureComponentBase {readonly id:string;readonly structureId:string;readonly kind:StructureComponentCategory;readonly centre:StructurePoint;readonly rotation:number;readonly material:StructureMaterialKey;readonly rendered:true;readonly walkable:boolean;readonly overhead:boolean;readonly response:"rigid";readonly solid?:true;readonly decorative?:false}
interface DecorativeComponentBase extends Omit<StructureComponentBase,"solid"|"decorative"|"walkable"|"overhead"> {readonly solid:false;readonly decorative:true;readonly walkable:false;readonly overhead:false}
export type StructureComponent=
 | (StructureComponentBase&{readonly primitive:"box";readonly length:number;readonly height:number;readonly width:number;readonly geometry?:"box"})
 | (StructureComponentBase&{readonly primitive:"slab";readonly length:number;readonly height:number;readonly width:number;readonly startHeight:number;readonly endHeight:number;readonly crownHeight:number})
 | (StructureComponentBase&{readonly primitive:"cylinder";readonly radius:number;readonly height:number})
 | (StructureComponentBase&{readonly primitive:"segment";readonly start:StructurePoint;readonly end:StructurePoint;readonly height:number;readonly thickness:number})
 | (DecorativeComponentBase&{readonly primitive:"visual-box"|"roof";readonly length:number;readonly height:number;readonly width:number});
export interface StructureCollisionDefinition { readonly structureId:string;readonly ownerChunk:ChunkCoordinate;readonly source:"bridge"|"poi"|"generic";readonly components?:readonly StructureComponent[];readonly surfaces:readonly StructureSurfaceRecord[];readonly segments:readonly StructureSegmentCollider[];readonly boxes:readonly StructureBoxCollider[];readonly circles:readonly StructureCircularCollider[];readonly bounds:StructureBounds }

/** Generation-time validation, deliberately kept out of the per-frame query. */
export function validateStructureDefinition(definition:StructureCollisionDefinition):void {
 const ids=new Set<string>(),fail=(message:string):never=>{throw new Error(`Invalid rigid structure ${definition.structureId}: ${message}`);};
 const register=(id:string,values:readonly number[])=>{if(ids.has(id))fail(`duplicate component id ${id}`);ids.add(id);if(values.some(value=>!Number.isFinite(value)||value<=0))fail(`invalid dimensions for ${id}`);};
 for(const box of definition.boxes)register(box.id,[box.length,box.width,box.height]);
 for(const circle of definition.circles)register(circle.id,[circle.radius,circle.height]);
 for(const segment of definition.segments)register(segment.id,[segment.thickness,segment.height,Math.hypot(segment.end.x-segment.start.x,segment.end.z-segment.start.z)]);
 for(const slab of definition.surfaces){register(slab.id,[slab.length,slab.width,slab.thickness]);if(slab.walkable&&!slab.solid)fail(`walkable slab ${slab.id} is not solid`);}
 if(definition.components){const componentIds=new Set<string>(),colliderIds=new Set([...definition.boxes,...definition.circles,...definition.segments,...definition.surfaces].map(c=>c.id));for(const component of definition.components){if(componentIds.has(component.id))fail(`duplicate structural component id ${component.id}`);componentIds.add(component.id);if(component.structureId!==definition.structureId)fail(`component ${component.id} has wrong structure id`);if(component.walkable&&(component as {solid?:boolean}).solid===false)fail(`walkable component ${component.id} is not solid`);const solid=(component as {solid?:boolean}).solid!==false;if(solid&&!colliderIds.has(component.id))fail(`solid rendered component ${component.id} lacks collision`);if(!solid&&colliderIds.has(component.id))fail(`decorative component ${component.id} has orphan collision`);}for(const id of colliderIds)if(!componentIds.has(id))fail(`orphan collider ${id} has no structural component`);}
 if(!Number.isFinite(definition.bounds.minX)||!Number.isFinite(definition.bounds.maxX)||!Number.isFinite(definition.bounds.minZ)||!Number.isFinite(definition.bounds.maxZ)||definition.bounds.minX>definition.bounds.maxX||definition.bounds.minZ>definition.bounds.maxZ)fail("invalid bounds");
}
