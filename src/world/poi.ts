import { sampleBiome, type BiomeId, type BiomeWeights } from "./biomes";
import { CHUNK_SIZE, worldToChunk, type ChunkCoordinate } from "./chunkCoordinates";
import { hashFloat, normalizeSeed } from "./random";
import { isLakeAt, isRiverAt, sampleTerrainHeight } from "./terrainSampling";

export type PoiFootprint =
  | Readonly<{ kind: "circle"; x: number; z: number; radius: number }>
  | Readonly<{ kind: "rectangle"; x: number; z: number; halfWidth: number; halfDepth: number; rotation: number }>;

export type PoiZonePurpose = "solid" | "vegetation-exclusion" | "decoration";
export interface PoiZone { readonly purpose: PoiZonePurpose; readonly footprint: PoiFootprint }
export interface TerrainFootprintAnalysis {
  readonly averageHeight: number; readonly minimumHeight: number; readonly maximumHeight: number;
  readonly heightVariation: number; readonly approximateSlope: number; readonly suggestedPlacementHeight: number;
}
export interface GeneratedPoi {
  readonly id: string; readonly typeId: string;
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly rotation: number; readonly scale?: number;
  readonly footprint: PoiFootprint; readonly zones: readonly PoiZone[]; readonly clearanceRadius: number;
  readonly entrance?: Readonly<{ position: Readonly<{ x: number; y: number; z: number }>; facing: number }>;
  readonly ownerChunk: ChunkCoordinate;
  readonly metadata: Readonly<{ biome: BiomeId; biomeWeights: BiomeWeights; candidateCell: Readonly<{ x: number; z: number; index: number }>; suitability: number; terrain: TerrainFootprintAnalysis; distanceToRiver: number; distanceToLake: number; vegetationDensity: number }>;
  readonly parameters?: Readonly<Record<string, string | number | boolean>>;
}
export type PoiRejectionReason = "wrong biome" | "slope too high" | "uneven terrain" | "underwater" | "river intersection" | "lake requirement not met" | "too close to another POI" | "candidate lost to a higher-scoring candidate" | "rarity";
export interface PoiDebugCandidate { readonly id: string; readonly typeId: string; readonly x: number; readonly z: number; readonly score: number; readonly accepted: boolean; readonly reason?: PoiRejectionReason; readonly footprint: PoiFootprint }

export interface PoiSuitabilityContext {
  readonly seed: number; readonly x: number; readonly z: number; readonly rotation: number;
  readonly biome: ReturnType<typeof sampleBiome>; readonly terrain: TerrainFootprintAnalysis;
  readonly footprint: PoiFootprint; readonly distanceToRiver: number; readonly distanceToLake: number;
  readonly underwater: boolean; readonly intersectsRiver: boolean; readonly vegetationDensity: number;
}
export interface PoiSuitability { readonly score: number; readonly reason?: PoiRejectionReason }
export interface PoiDefinition {
  readonly id: string; readonly label: string; readonly biomes: Readonly<{ allowed?: readonly BiomeId[]; preferred?: readonly BiomeId[] }>;
  readonly rarity: number; readonly weight: number; readonly minimumSpacing: number; readonly clearanceRadius: number;
  readonly footprint: Readonly<{ kind: "circle"; radius: number } | { kind: "rectangle"; width: number; depth: number }>;
  readonly hydrology?: Readonly<{ requireLakeWithin?: number; rejectRiverIntersection?: boolean }>;
  readonly terrain: Readonly<{ maximumSlope: number; maximumVariation: number }>;
  readonly renderer: string; readonly debugColor: number;
  suitability?(context: PoiSuitabilityContext): PoiSuitability;
  parameters?(seed: number, cellX: number, cellZ: number): Readonly<Record<string, string | number | boolean>>;
}

const definitions = new Map<string, PoiDefinition>();
export function registerPoiDefinition(definition: PoiDefinition): void {
  if (definitions.has(definition.id)) throw new Error(`Duplicate POI type: ${definition.id}`);
  definitions.set(definition.id, Object.freeze(definition));
}
export function getPoiDefinitions(): readonly PoiDefinition[] { return [...definitions.values()]; }

registerPoiDefinition({
  id: "waystone", label: "Waystone", biomes: { allowed: ["plains", "forest", "highlands"], preferred: ["plains", "highlands"] },
  rarity: 0.42, weight: 1, minimumSpacing: 70, clearanceRadius: 5,
  footprint: { kind: "rectangle", width: 2.2, depth: 1.3 }, terrain: { maximumSlope: 0.32, maximumVariation: 1.2 },
  hydrology: { rejectRiverIntersection: true }, renderer: "waystone", debugColor: 0xe8b95c,
  parameters: (seed, x, z) => ({ height: 2.2 + hashFloat(seed, x, z, 918) * 1.2 }),
});

function axes(shape: Extract<PoiFootprint, { kind: "rectangle" }>): readonly [number, number][] {
  const c = Math.cos(shape.rotation), s = Math.sin(shape.rotation); return [[c, s], [-s, c]];
}
function rectangleCorners(shape: Extract<PoiFootprint, { kind: "rectangle" }>): readonly [number, number][] {
  const [a, b] = axes(shape); return [[-1,-1],[-1,1],[1,-1],[1,1]].map(([u,v]) => [shape.x + a[0]*shape.halfWidth*u + b[0]*shape.halfDepth*v, shape.z + a[1]*shape.halfWidth*u + b[1]*shape.halfDepth*v]);
}
export function pointInFootprint(x: number, z: number, shape: PoiFootprint): boolean {
  if (shape.kind === "circle") return Math.hypot(x - shape.x, z - shape.z) <= shape.radius;
  const dx=x-shape.x,dz=z-shape.z,c=Math.cos(shape.rotation),s=Math.sin(shape.rotation);
  return Math.abs(dx*c+dz*s)<=shape.halfWidth && Math.abs(-dx*s+dz*c)<=shape.halfDepth;
}
export function footprintsOverlap(a: PoiFootprint, b: PoiFootprint): boolean {
  if (a.kind === "circle" && b.kind === "circle") return Math.hypot(a.x-b.x,a.z-b.z) <= a.radius+b.radius;
  if (a.kind === "circle" || b.kind === "circle") {
    const circle = (a.kind === "circle" ? a : b) as Extract<PoiFootprint,{kind:"circle"}>, rect = (a.kind === "rectangle" ? a : b) as Extract<PoiFootprint,{kind:"rectangle"}>;
    const dx=circle.x-rect.x,dz=circle.z-rect.z,c=Math.cos(rect.rotation),s=Math.sin(rect.rotation);
    const lx=dx*c+dz*s,lz=-dx*s+dz*c, qx=Math.max(-rect.halfWidth,Math.min(rect.halfWidth,lx)),qz=Math.max(-rect.halfDepth,Math.min(rect.halfDepth,lz));
    return (lx-qx)**2+(lz-qz)**2 <= circle.radius**2;
  }
  const cornersA=rectangleCorners(a), cornersB=rectangleCorners(b);
  for (const axis of [...axes(a),...axes(b)]) { const pa=cornersA.map(p=>p[0]*axis[0]+p[1]*axis[1]),pb=cornersB.map(p=>p[0]*axis[0]+p[1]*axis[1]); if(Math.max(...pa)<Math.min(...pb)||Math.max(...pb)<Math.min(...pa)) return false; }
  return true;
}
export function isVegetationExcluded(x: number, z: number, zones: readonly PoiZone[]): boolean { return zones.some(zone => (zone.purpose === "solid" || zone.purpose === "vegetation-exclusion") && pointInFootprint(x,z,zone.footprint)); }

function perimeterSamples(shape: PoiFootprint): readonly [number,number][] {
  if(shape.kind==="rectangle") {
    const c=Math.cos(shape.rotation),s=Math.sin(shape.rotation),points:[number,number][]=[];
    for(let u=-1;u<=1;u+=.5)for(let v=-1;v<=1;v+=.5)points.push([shape.x+c*shape.halfWidth*u-s*shape.halfDepth*v,shape.z+s*shape.halfWidth*u+c*shape.halfDepth*v]);
    return points;
  }
  return [[shape.x,shape.z],...Array.from({length:48},(_,i)=>{const angle=(i%12)*Math.PI/6,radius=shape.radius*(Math.floor(i/12)+1)/4;return [shape.x+Math.cos(angle)*radius,shape.z+Math.sin(angle)*radius] as [number,number];})];
}
export function analyzeTerrainFootprint(seedInput:number|string, shape:PoiFootprint):TerrainFootprintAnalysis {
  const seed=normalizeSeed(seedInput), samples=perimeterSamples(shape).map(([x,z])=>sampleTerrainHeight(seed,x,z));
  const minimumHeight=Math.min(...samples), maximumHeight=Math.max(...samples), averageHeight=samples.reduce((a,b)=>a+b,0)/samples.length;
  const extent=shape.kind==="circle"?shape.radius*2:Math.min(shape.halfWidth,shape.halfDepth)*2;
  return {averageHeight,minimumHeight,maximumHeight,heightVariation:maximumHeight-minimumHeight,approximateSlope:(maximumHeight-minimumHeight)/Math.max(.01,extent),suggestedPlacementHeight:averageHeight};
}
export function footprintIntersectsRiver(seedInput:number|string, shape:PoiFootprint):boolean { const seed=normalizeSeed(seedInput); return perimeterSamples(shape).some(([x,z])=>isRiverAt(seed,x,z)); }

const CELL_SIZE=48;
const generationCache = new Map<string, Readonly<{ pois: readonly GeneratedPoi[]; candidates: readonly PoiDebugCandidate[] }>>();
interface Evaluated { definition:PoiDefinition; id:string; cellX:number;cellZ:number;index:number;x:number;z:number;rotation:number;footprint:PoiFootprint; context:PoiSuitabilityContext; score:number; reason?:PoiRejectionReason }
function distanceToFeature(seed:number,x:number,z:number,predicate:(seed:number,x:number,z:number)=>boolean,max=32):number { if(predicate(seed,x,z))return 0; for(let r=2;r<=max;r+=2) for(let i=0;i<16;i++){const a=i*Math.PI/8;if(predicate(seed,x+Math.cos(a)*r,z+Math.sin(a)*r))return r;} return Infinity; }
function evaluate(seed:number,definition:PoiDefinition,cellX:number,cellZ:number,index=0):Evaluated {
  const x=(cellX+.12+hashFloat(seed,cellX,cellZ,801+index)*.76)*CELL_SIZE,z=(cellZ+.12+hashFloat(seed,cellX,cellZ,811+index)*.76)*CELL_SIZE,rotation=hashFloat(seed,cellX,cellZ,821+index)*Math.PI*2;
  const footprint:PoiFootprint=definition.footprint.kind==="circle"?{kind:"circle",x,z,radius:definition.footprint.radius}:{kind:"rectangle",x,z,halfWidth:definition.footprint.width/2,halfDepth:definition.footprint.depth/2,rotation};
  const biome=sampleBiome(seed,x,z),terrain=analyzeTerrainFootprint(seed,footprint),distanceToRiver=distanceToFeature(seed,x,z,isRiverAt),distanceToLake=distanceToFeature(seed,x,z,isLakeAt),intersectsRiver=footprintIntersectsRiver(seed,footprint),underwater=isLakeAt(seed,x,z);
  const vegetationDensity=hashFloat(seed,Math.floor(x/32),Math.floor(z/32),401);
  const context={seed,x,z,rotation,biome,terrain,footprint,distanceToRiver,distanceToLake,intersectsRiver,underwater,vegetationDensity};
  let reason:PoiRejectionReason|undefined;
  if(hashFloat(seed,cellX,cellZ,831+index)>=definition.rarity)reason="rarity"; else if(definition.biomes.allowed&&!definition.biomes.allowed.includes(biome.dominant))reason="wrong biome"; else if(underwater)reason="underwater"; else if(definition.hydrology?.rejectRiverIntersection&&intersectsRiver)reason="river intersection"; else if(definition.hydrology?.requireLakeWithin!==undefined&&distanceToLake>definition.hydrology.requireLakeWithin)reason="lake requirement not met"; else if(terrain.approximateSlope>definition.terrain.maximumSlope)reason="slope too high"; else if(terrain.heightVariation>definition.terrain.maximumVariation)reason="uneven terrain";
  let score=(definition.biomes.preferred?.includes(biome.dominant)?0.2:0)+definition.weight*.1+hashFloat(seed,cellX,cellZ,841+index)*.7; const custom=definition.suitability?.(context); if(custom){score=Math.max(0,Math.min(1,custom.score));reason=reason??custom.reason;}
  return {definition,id:`poi:${seed.toString(16)}:${definition.id}:${cellX}:${cellZ}:${index}`,cellX,cellZ,index,x,z,rotation,footprint,context,score,reason};
}
function rank(a:Evaluated,b:Evaluated):number { return b.score-a.score || a.id.localeCompare(b.id); }
export function generatePois(seedInput:number|string,coordinate:ChunkCoordinate):Readonly<{pois:readonly GeneratedPoi[];candidates:readonly PoiDebugCandidate[]}> {
  const seed=normalizeSeed(seedInput), cacheKey=`${seed}:${definitions.size}:${coordinate.x}:${coordinate.z}`, cached=generationCache.get(cacheKey);
  if(cached)return cached;
  const minX=Math.floor(coordinate.x*CHUNK_SIZE/CELL_SIZE)-2,maxX=Math.floor((coordinate.x+1)*CHUNK_SIZE/CELL_SIZE)+2,minZ=Math.floor(coordinate.z*CHUNK_SIZE/CELL_SIZE)-2,maxZ=Math.floor((coordinate.z+1)*CHUNK_SIZE/CELL_SIZE)+2;
  const all:Evaluated[]=[]; for(let cz=minZ;cz<=maxZ;cz++)for(let cx=minX;cx<=maxX;cx++)for(const d of definitions.values())all.push(evaluate(seed,d,cx,cz));
  const viable=all.filter(c=>!c.reason); const accepted=new Set<string>();
  for(const candidate of [...viable].sort(rank)){const conflict=viable.filter(other=>other.id!==candidate.id&&Math.hypot(other.x-candidate.x,other.z-candidate.z)<Math.max(candidate.definition.minimumSpacing,other.definition.minimumSpacing)).sort(rank)[0]; if(!conflict||rank(candidate,conflict)<0)accepted.add(candidate.id);}
  const owned=all.filter(c=>{const owner=worldToChunk(c.x,c.z);return owner.x===coordinate.x&&owner.z===coordinate.z;});
  const pois=owned.filter(c=>accepted.has(c.id)).map(c=>{const clearing:PoiFootprint={kind:"circle",x:c.x,z:c.z,radius:c.definition.clearanceRadius};const y=c.context.terrain.suggestedPlacementHeight;return {id:c.id,typeId:c.definition.id,position:{x:c.x,y,z:c.z},rotation:c.rotation,footprint:c.footprint,zones:[{purpose:"solid" as const,footprint:c.footprint},{purpose:"vegetation-exclusion" as const,footprint:clearing}],clearanceRadius:c.definition.clearanceRadius,ownerChunk:{...coordinate},entrance:{position:{x:c.x+Math.sin(c.rotation)*c.definition.clearanceRadius,y,z:c.z+Math.cos(c.rotation)*c.definition.clearanceRadius},facing:c.rotation},metadata:{biome:c.context.biome.dominant,biomeWeights:c.context.biome.weights,candidateCell:{x:c.cellX,z:c.cellZ,index:c.index},suitability:c.score,terrain:c.context.terrain,distanceToRiver:c.context.distanceToRiver,distanceToLake:c.context.distanceToLake,vegetationDensity:c.context.vegetationDensity},parameters:c.definition.parameters?.(seed,c.cellX,c.cellZ)};});
  const result={pois,candidates:owned.map(c=>({id:c.id,typeId:c.definition.id,x:c.x,z:c.z,score:c.score,accepted:accepted.has(c.id),reason:c.reason??(!accepted.has(c.id)?"candidate lost to a higher-scoring candidate" as const:undefined),footprint:c.footprint}))};
  generationCache.set(cacheKey,result); if(generationCache.size>256)generationCache.delete(generationCache.keys().next().value!);
  return result;
}
