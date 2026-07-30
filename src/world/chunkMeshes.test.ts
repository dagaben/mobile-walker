import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  ChunkMeshFactory,
  createRiverRibbonGeometry,
  createRiverChannelGeometry,
  terrainColorWeights,
} from "./chunkMeshes";
import { generateChunk } from "./generateChunk";

describe("river ribbon geometry", () => {
  it("uses a bounded shared strip and leaves the water corridor out of base terrain", () => {
    const factory = new ChunkMeshFactory();
    const data = generateChunk("open-channel", { x: 0, z: 0 });
    const group = factory.create(data);
    const terrain = group.getObjectByName("terrain") as THREE.Mesh;
    const channel = group.getObjectByName("river-channel") as THREE.Mesh;

    expect(channel.geometry.getAttribute("position").count).toBe(data.river!.channelSections.length * 6);
    expect(channel.geometry.getAttribute("position").count).toBeLessThan(64);
    expect(terrain.geometry.getAttribute("position").count).toBe(data.irregularTerrain!.vertices.length);
    expect(data.irregularTerrain!.indices).toHaveLength((data.river!.channelSections.length - 1) * 12);

    // Every base-terrain triangle belongs entirely north or south of its
    // section shoulders; none bridges across the channel/water corridor.
    for (let index = 0; index < data.irregularTerrain!.indices.length; index += 3) {
      const triangle = data.irregularTerrain!.indices.slice(index, index + 3);
      const zs = triangle.map((vertex) => data.irregularTerrain!.vertices[vertex]!.z);
      const centers = triangle.map((vertex) => {
        const section = data.river!.channelSections[Math.floor(vertex / 4)]!;
        return section.centerZ;
      });
      expect(zs.every((z, vertex) => z <= centers[vertex]) || zs.every((z, vertex) => z >= centers[vertex])).toBe(true);
    }

    factory.disposeChunk(group);
    factory.dispose();
  });

  it("reuses each section boundary verbatim in adjacent channel triangles", () => {
    const sections = generateChunk("shared-strip", { x: 0, z: 0 }).river!.channelSections;
    const geometry = createRiverChannelGeometry(sections);
    const positions = geometry.getAttribute("position");
    for (let section = 1; section < sections.length - 1; section += 1) {
      for (let cross = 0; cross < 6; cross += 1) {
        const vertex = section * 6 + cross;
        expect(positions.getX(vertex)).toBeCloseTo(sections[section]!.x);
      }
    }
    geometry.dispose();
  });

  it("gives the shoreline a material that does not require absent vertex colors", () => {
    const factory = new ChunkMeshFactory();
    const group = factory.create(generateChunk("visible-shoreline", { x: 0, z: 0 }));
    const channel = group.getObjectByName("river-channel") as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;

    expect(channel.geometry.getAttribute("color")).toBeUndefined();
    expect(channel.material.vertexColors).toBe(false);
    expect(channel.material.color.getHex()).not.toBe(0x000000);

    factory.disposeChunk(group);
    factory.dispose();
  });

  it("winds its triangles counter-clockwise from above", () => {
    const geometry = createRiverRibbonGeometry([
      { x: 0, z: 0, width: 2, surfaceElevation: 0 },
      { x: 4, z: 1, width: 2, surfaceElevation: 0 },
    ]);
    const positions = geometry.getAttribute("position");
    const indices = geometry.getIndex();
    const triangle = new THREE.Triangle(
      new THREE.Vector3().fromBufferAttribute(positions, indices!.getX(0)),
      new THREE.Vector3().fromBufferAttribute(positions, indices!.getX(1)),
      new THREE.Vector3().fromBufferAttribute(positions, indices!.getX(2)),
    );

    expect(triangle.getNormal(new THREE.Vector3()).y).toBeGreaterThan(0);
    geometry.dispose();
  });

  it("uses a front-sided production material", () => {
    const factory = new ChunkMeshFactory();
    const group = factory.create(generateChunk("river-material", { x: 0, z: 0 }));
    const river = group.children[1] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

    expect(river.material.side).toBe(THREE.FrontSide);
    expect(river.material.side).not.toBe(THREE.DoubleSide);

    factory.disposeChunk(group);
    factory.dispose();
  });

  it("omits water and river debug geometry outside row zero", () => {
    const factory = new ChunkMeshFactory();
    const group = factory.create(generateChunk("dry-row", { x: 0, z: 1 }));

    expect(group.getObjectByName("wetland-pools")).toBeDefined();
    expect(group.getObjectByName("debug:walkable-boundaries")).toBeUndefined();
    expect(group.getObjectByName("debug:river-placement")).toBeUndefined();
    expect(() => factory.registerGroup(group)).not.toThrow();

    factory.disposeChunk(group);
    factory.dispose();
  });
});

describe("pine tree geometry", () => {
  it("renders each tree with an instanced trunk and layered crown", () => {
    const factory = new ChunkMeshFactory();
    const data = generateChunk("forest-biomes", { x: -4, z: -4 });
    const group = factory.create(data);
    const trees = group.getObjectByName("trees") as THREE.Group;

    expect(data.trees.length).toBeGreaterThan(0);
    expect(trees.children).toHaveLength(3);
    expect(trees.children.every((child) => child instanceof THREE.InstancedMesh)).toBe(true);
    expect((trees.children[0] as THREE.InstancedMesh).count).toBe(data.trees.length);

    factory.disposeChunk(group);
    factory.dispose();
  });
});

describe("biome vegetation geometry", () => {
  it("renders leaf trees, bushes, and flowers as low-poly instances", () => {
    const factory = new ChunkMeshFactory();
    const data = generateChunk("garden-geometry", { x: -2, z: 1 });
    const group = factory.create(data);
    const vegetation = group.getObjectByName("vegetation") as THREE.Group;
    const leafTrees = vegetation.getObjectByName("leaf-trees") as THREE.Group;
    const bushes = vegetation.getObjectByName("bushes") as THREE.Group;
    const flowers = vegetation.getObjectByName("flowers") as THREE.Group;
    const leafCrown = leafTrees.children[1] as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const bushMesh = bushes.children[0] as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const flowerHeads = flowers.children[1] as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

    expect(vegetation.children).toHaveLength(3);
    expect(leafTrees.children.every((child) => child instanceof THREE.InstancedMesh)).toBe(true);
    expect(bushes.children.every((child) => child instanceof THREE.InstancedMesh)).toBe(true);
    expect(flowers.children.every((child) => child instanceof THREE.InstancedMesh)).toBe(true);
    expect((flowers.children[0] as THREE.InstancedMesh).count).toBe(data.vegetation.flowers.length);

    const coloredMeshes = [
      [leafCrown, data.vegetation.leafTrees.length],
      [bushMesh, data.vegetation.bushes.length],
      [flowerHeads, data.vegetation.flowers.length],
    ] as const;
    for (const [mesh, placementCount] of coloredMeshes) {
      const representativeColor = new THREE.Color();
      mesh.getColorAt(0, representativeColor);

      expect(placementCount).toBeGreaterThan(0);
      expect(mesh.instanceColor).not.toBeNull();
      expect(mesh.instanceColor?.count).toBe(placementCount);
      expect(representativeColor.getHex()).not.toBe(0x000000);
      expect(mesh.material.vertexColors).toBe(false);
    }

    factory.disposeChunk(group);
    factory.dispose();
  });
});

describe("terrain biome colors", () => {
  const terrainOf = (factory: ChunkMeshFactory, seed: string, x: number, z: number) => {
    const data = generateChunk(seed, { x, z });
    const group = factory.create(data);
    return { data, group, terrain: group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> };
  };

  it("halves the Gaussian blend distance used for terrain colors", () => {
    const source = {
      plains: 0.5,
      forest: 0.25,
      wetland: 0.1,
      lake: 0.05,
      highlands: 0.06,
      mountain: 0.04,
    } as const;
    const weights = terrainColorWeights(source);

    expect(Object.values(weights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
    expect(weights.plains / weights.forest).toBeCloseTo((source.plains / source.forest) ** 4, 12);
  });

  it("provides one vertex color for every terrain vertex", () => {
    const factory = new ChunkMeshFactory();
    const { data, group, terrain } = terrainOf(factory, "colored-terrain", 0, 0);

    expect(terrain.geometry.getAttribute("color").count)
      .toBe(terrain.geometry.getAttribute("position").count);
    expect(terrain.geometry.getAttribute("color").count)
      .toBe(data.irregularTerrain?.vertices.length ?? data.terrainHeights.length);
    expect(terrain.material.vertexColors).toBe(true);

    factory.disposeChunk(group);
    factory.dispose();
  });

  it("gives adjacent chunks exactly matching boundary colors", () => {
    const factory = new ChunkMeshFactory();
    const left = terrainOf(factory, "color-continuity", -1, 2);
    const right = terrainOf(factory, "color-continuity", 0, 2);
    const leftColors = left.terrain.geometry.getAttribute("color");
    const rightColors = right.terrain.geometry.getAttribute("color");
    const side = left.data.terrainVerticesPerSide;

    for (let z = 0; z < side; z += 1) {
      const leftIndex = z * side + side - 1;
      const rightIndex = z * side;
      expect([leftColors.getX(leftIndex), leftColors.getY(leftIndex), leftColors.getZ(leftIndex)])
        .toEqual([rightColors.getX(rightIndex), rightColors.getY(rightIndex), rightColors.getZ(rightIndex)]);
    }

    factory.disposeChunk(left.group);
    factory.disposeChunk(right.group);
    factory.dispose();
  });

  it("blends biome variation into multiple terrain colors", () => {
    const factory = new ChunkMeshFactory();
    const { group, terrain } = terrainOf(factory, "biome-color-variation", -4, -4);
    const colors = terrain.geometry.getAttribute("color");
    const uniqueColors = new Set(Array.from({ length: colors.count }, (_, index) =>
      `${colors.getX(index)},${colors.getY(index)},${colors.getZ(index)}`));

    expect(uniqueColors.size).toBeGreaterThan(1);

    factory.disposeChunk(group);
    factory.dispose();
  });
});

describe("terrain wireframe debug view", () => {
  it("highlights each chunk perimeter while wireframe mode is enabled", () => {
    const factory = new ChunkMeshFactory();
    const data = generateChunk("chunk-boundary-highlight", { x: 2, z: -1 });
    const group = factory.create(data);
    factory.registerGroup(group);
    const boundary = group.getObjectByName("debug:chunk-boundary") as THREE.LineLoop;

    expect(boundary).toBeInstanceOf(THREE.LineLoop);
    expect(boundary.visible).toBe(false);

    factory.setDebugView({ wireframe: true, boundaries: false, riverPlacement: false, biomeGuide: false });

    expect(boundary.visible).toBe(true);
    expect((boundary.material as THREE.LineBasicMaterial).color.getHex()).toBe(0x8b0000);
    expect((boundary.material as THREE.LineBasicMaterial).depthTest).toBe(false);
    expect(boundary.geometry.getAttribute("position").count).toBe(data.terrainVerticesPerSide * 4 - 4);

    factory.setDebugView({ wireframe: false, boundaries: false, riverPlacement: false, biomeGuide: false });
    expect(boundary.visible).toBe(false);

    factory.unregisterGroup(group);
    factory.disposeChunk(group);
    factory.dispose();
  });
});
