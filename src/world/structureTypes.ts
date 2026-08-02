import type { ChunkCoordinate } from "./chunkCoordinates";

export type StructureComponentCategory = "wall"|"foundation"|"stilt"|"support"|"railing"|"fence"|"dock"|"porch"|"platform"|"abutment";
export interface StructurePoint { readonly x:number;readonly y:number;readonly z:number }
export interface StructureBounds { readonly minX:number;readonly maxX:number;readonly minZ:number;readonly maxZ:number }
export interface StructureBoxCollider { readonly id:string;readonly kind:StructureComponentCategory;readonly centre:StructurePoint;readonly length:number;readonly width:number;readonly height:number;readonly direction:Readonly<{x:number;z:number}> }
export interface StructureCircularCollider { readonly id:string;readonly kind:StructureComponentCategory;readonly centre:StructurePoint;readonly radius:number;readonly height:number }
export interface StructureSegmentCollider { readonly id:string;readonly kind:"railing"|"fence";readonly start:StructurePoint;readonly end:StructurePoint;readonly height:number;readonly thickness:number }
export interface StructureSurfaceRecord { readonly id:string;readonly kind:"deck"|"approach"|"dock"|"porch"|"platform";readonly centre:StructurePoint;readonly length:number;readonly width:number;readonly direction:Readonly<{x:number;z:number}>;readonly startHeight:number;readonly endHeight:number;readonly crownHeight:number;readonly thickness:number;readonly overhead:boolean }
/** Presentation-neutral runtime input shared by bridges, POIs, and future structures. */
export interface StructureCollisionDefinition { readonly structureId:string;readonly ownerChunk:ChunkCoordinate;readonly source:"bridge"|"poi"|"generic";readonly surfaces:readonly StructureSurfaceRecord[];readonly segments:readonly StructureSegmentCollider[];readonly boxes:readonly StructureBoxCollider[];readonly circles:readonly StructureCircularCollider[];readonly bounds:StructureBounds }
