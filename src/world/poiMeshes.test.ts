import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { GeneratedPoi } from "./poi";
import { createRoofGeometry, foundationDepth, PoiMeshFactory } from "./poiMeshes";

function poiOnSlope(typeId:string,biome="forest"):GeneratedPoi{return {
  id:"slope-test",typeId,position:{x:0,y:4.92,z:0},rotation:0,
  metadata:{biome,terrain:{minimumHeight:4.35,maximumHeight:5,averageHeight:4.7,heightVariation:.65,approximateSlope:.1,suggestedPlacementHeight:4.92}},
} as unknown as GeneratedPoi;}

describe("building roof geometry", () => {
  it("winds every visible face outward and leaves the underside open", () => {
    const geometry = createRoofGeometry();
    const positions = geometry.getAttribute("position");
    const indices = geometry.getIndex()!;
    const triangleNormal = (triangle: number): THREE.Vector3 => new THREE.Triangle(
      new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangle * 3)),
      new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangle * 3 + 1)),
      new THREE.Vector3().fromBufferAttribute(positions, indices.getX(triangle * 3 + 2)),
    ).getNormal(new THREE.Vector3());

    expect(triangleNormal(0).z).toBeLessThan(0);
    expect(triangleNormal(1).z).toBeGreaterThan(0);
    expect(triangleNormal(2).x).toBeGreaterThan(0);
    expect(triangleNormal(3).x).toBeGreaterThan(0);
    expect(triangleNormal(4).x).toBeLessThan(0);
    expect(triangleNormal(5).x).toBeLessThan(0);
    expect(indices.count).toBe(18);
    for (let triangle = 0; triangle < indices.count / 3; triangle++) {
      expect(triangleNormal(triangle).y).toBeGreaterThanOrEqual(0);
    }
    geometry.dispose();
  });

  it("places the entire roof above the walls instead of letting the wall top cut through it", () => {
    const factory = new PoiMeshFactory();
    const house = factory.create({
      id: "roof-test",
      typeId: "plains-farmhouse",
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
    } as unknown as GeneratedPoi);
    const walls = house.getObjectByName("walls")!;
    const roof = house.getObjectByName("pitched-roof")!;
    const wallBounds = new THREE.Box3().setFromObject(walls);
    const roofBounds = new THREE.Box3().setFromObject(roof);

    expect(roofBounds.min.y).toBeGreaterThanOrEqual(wallBounds.max.y);
    factory.dispose();
  });

  it("renders cabin and watchtower silhouettes without fences or POI-owned trees", () => {
    const factory = new PoiMeshFactory();
    const base = { id: "new-poi", position: { x: 0, y: 0, z: 0 }, rotation: 0, metadata: { biome: "forest" } } as unknown as GeneratedPoi;
    const cabin = factory.create({ ...base, typeId: "forest-cabin" });
    const tower = factory.create({ ...base, typeId: "highland-watchtower" });

    expect(cabin.getObjectByName("low-foundation")).toBeDefined();
    expect(cabin.getObjectByName("fence-rail")).toBeUndefined();
    expect(tower.getObjectByName("enclosed-tower-mass")).toBeDefined();
    expect(tower.getObjectByName("fence-rail")).toBeUndefined();
    expect([...cabin.children, ...tower.children].some(object => object.name === "poi-owned-tree")).toBe(false);
    factory.dispose();
  });

  it("derives foundation reach from the terrain analysis already stored on a POI", () => {
    expect(foundationDepth(poiOnSlope("plains-farmhouse"))).toBeCloseTo(.69);
  });

  it.each([
    ["plains-farmhouse","foundation","forest"],
    ["forest-cabin","low-foundation","forest"],
    ["forest-cabin","short-stilt","wetland"],
    ["highland-watchtower","tower-leg","highlands"],
  ])("extends %s supports below the lowest sampled ground",(typeId,supportName,biome)=>{
    const factory=new PoiMeshFactory();
    const poi=poiOnSlope(typeId,biome);
    const building=factory.create(poi);
    const support=building.getObjectByName(supportName)!;
    const bounds=new THREE.Box3().setFromObject(support);

    expect(bounds.min.y).toBeLessThan(poi.metadata.terrain.minimumHeight);
    factory.dispose();
  });
});
