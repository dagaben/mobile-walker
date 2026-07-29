import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  BOUNDARY_FADE_SHADER_KEY,
  ChunkMeshFactory,
  applyLoadedNeighborhoodFade,
  createRiverRibbonGeometry,
} from "./chunkMeshes";
import { generateChunk } from "./generateChunk";

describe("resident neighborhood material fade", () => {
  it("injects world-space edge fading and exposes mutable neighborhood uniforms", () => {
    const material = new THREE.MeshStandardMaterial();
    applyLoadedNeighborhoodFade(material, {
      centerX: 8, centerZ: 24, halfExtent: 24, width: 12, color: 0xd9ead8,
    });
    const shader = {
      uniforms: {},
      vertexShader: "void main() {\n#include <project_vertex>\n}",
      fragmentShader: "void main() {\n#include <opaque_fragment>\n}",
    } as unknown as THREE.WebGLProgramParametersWithUniforms;

    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(material.customProgramCacheKey()).toBe(BOUNDARY_FADE_SHADER_KEY);
    expect(shader.vertexShader).toContain("instanceMatrix * loadedPosition");
    expect(shader.fragmentShader).toContain("smoothstep(loadedHalfExtent - loadedFadeWidth");
    expect(shader.fragmentShader).toContain("mix(outgoingLight, loadedBackground");
    expect(shader.uniforms).toMatchObject({
      loadedCenter: { value: new THREE.Vector2(8, 24) },
      loadedHalfExtent: { value: 24 },
      loadedFadeWidth: { value: 12 },
    });
    material.dispose();
  });

  it("shares the same fade configuration across terrain and vegetation", () => {
    const factory = new ChunkMeshFactory({
      centerX: 8, centerZ: 8, halfExtent: 24, width: 12, color: 0xd9ead8,
    });
    const group = factory.create(generateChunk("compatible-edge-fade", { x: 0, z: 0 }));
    const terrain = group.getObjectByName("terrain") as THREE.Mesh;
    const trees = group.getObjectByName("trees") as THREE.Group;
    const materials = [terrain, ...trees.children].map((object) =>
      (object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material);

    expect(materials.every((material) => material.customProgramCacheKey() === BOUNDARY_FADE_SHADER_KEY)).toBe(true);
    factory.setLoadedNeighborhood(24, -8, 40);
    for (const material of materials) {
      expect(material.userData.loadedNeighborhoodFade.center.value).toEqual(new THREE.Vector2(24, -8));
      expect(material.userData.loadedNeighborhoodFade.halfExtent.value).toBe(40);
    }

    factory.disposeChunk(group);
    factory.dispose();
  });
});

describe("river ribbon geometry", () => {
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

  it("provides one vertex color for every terrain vertex", () => {
    const factory = new ChunkMeshFactory();
    const { data, group, terrain } = terrainOf(factory, "colored-terrain", 0, 0);

    expect(terrain.geometry.getAttribute("color").count)
      .toBe(terrain.geometry.getAttribute("position").count);
    expect(terrain.geometry.getAttribute("color").count).toBe(data.terrainHeights.length);
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
