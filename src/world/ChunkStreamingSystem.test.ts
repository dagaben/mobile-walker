import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createEcsWorld } from "../ecs/createEcsWorld";
import { CHUNK_SIZE } from "./chunkCoordinates";
import { ChunkStreamingSystem } from "./ChunkStreamingSystem";
import { generateChunk } from "./generateChunk";

function createPlayerWorld() {
  const world = createEcsWorld();
  const player = {
    transform: { x: 1, y: 0, z: 1, yaw: 0 },
    velocity: { x: 0, y: 0, z: 1 },
    playerControl: { moveX: 0, moveZ: 0, active: false, jump: false },
  };
  world.add(player);
  return { world, player };
}

describe("loaded neighborhood boundary", () => {
  it("derives its world extent and fade width from the chunk radius and size", () => {
    const chunks = new ChunkStreamingSystem(new THREE.Scene(), "extent", 2);

    expect(chunks.getLoadedCenter()).toEqual({ x: CHUNK_SIZE / 2, z: CHUNK_SIZE / 2 });
    expect(chunks.getLoadedHalfExtent()).toBe(2.5 * CHUNK_SIZE);
    expect(ChunkStreamingSystem.EDGE_FADE_WIDTH).toBe(0.75 * CHUNK_SIZE);

    chunks.dispose();
  });

  it("queues activation and obeys generation and mesh limits per frame", () => {
    const scene = new THREE.Scene();
    const { world } = createPlayerWorld();
    const generator = vi.fn(generateChunk);
    const chunks = new ChunkStreamingSystem(scene, "limits", 1, {
      generator, generationWorkPerFrame: 2, meshWorkPerFrame: 1,
    });

    chunks.prepareRender(world, 0, 0);
    expect(generator).toHaveBeenCalledTimes(2);
    expect(scene.children).toHaveLength(1);
    chunks.prepareRender(world, 0, 0);
    expect(generator).toHaveBeenCalledTimes(4);
    expect(scene.children).toHaveLength(2);

    chunks.dispose();
  });

  it("retains the departed chunk until its replacement is ready", () => {
    const scene = new THREE.Scene();
    const { world, player } = createPlayerWorld();
    const chunks = new ChunkStreamingSystem(scene, "retain", 0, {
      generator: generateChunk, generationWorkPerFrame: 1, meshWorkPerFrame: 1,
    });
    chunks.prepareRender(world, 0, 0);
    const original = scene.children[0];

    player.transform.x = CHUNK_SIZE + 1;
    chunks.prepareRender(world, 0, 0);
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0]).not.toBe(original);
    // Replacement activation and safe retirement happen in the same frame; no empty edge is exposed.
    expect(original.parent).toBeNull();

    chunks.dispose();
  });

  it("keeps an old resident while asynchronous replacement generation is pending", async () => {
    const scene = new THREE.Scene();
    const { world, player } = createPlayerWorld();
    let resolveReplacement: ((data: ReturnType<typeof generateChunk>) => void) | undefined;
    const generator = vi.fn((seed: number | string, coordinate: { x: number; z: number }) => {
      if (coordinate.x === 0) return generateChunk(seed, coordinate);
      return new Promise<ReturnType<typeof generateChunk>>((resolve) => { resolveReplacement = resolve; });
    });
    const chunks = new ChunkStreamingSystem(scene, "async", 0, { generator });
    chunks.prepareRender(world, 0, 0);
    const original = scene.children[0];
    player.transform.x = CHUNK_SIZE + 1;
    chunks.prepareRender(world, 0, 0);
    expect(scene.children).toEqual([original]);

    resolveReplacement?.(generateChunk("async", { x: 1, z: 0 }));
    await Promise.resolve();
    chunks.prepareRender(world, 0, 0);
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0]).not.toBe(original);
    chunks.dispose();
  });

  it("reuses cached generated data when reversing across a boundary", () => {
    const scene = new THREE.Scene();
    const { world, player } = createPlayerWorld();
    const generator = vi.fn(generateChunk);
    const chunks = new ChunkStreamingSystem(scene, "cache", 0, { generator, cacheSize: 2 });
    chunks.prepareRender(world, 0, 0);
    player.transform.x = CHUNK_SIZE + 1;
    chunks.prepareRender(world, 0, 0);
    player.transform.x = 1;
    chunks.prepareRender(world, 0, 0);

    expect(generator).toHaveBeenCalledTimes(2);
    expect(scene.children[0]?.name).toBe("chunk:0,0");
    chunks.dispose();
  });

  it("disposes every resident geometry exactly once, including after cache reuse", () => {
    const scene = new THREE.Scene();
    const { world, player } = createPlayerWorld();
    const chunks = new ChunkStreamingSystem(scene, "dispose", 0, { generator: generateChunk, cacheSize: 2 });
    const disposals: ReturnType<typeof vi.spyOn>[] = [];
    const trackCurrent = () => scene.children[0]?.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) disposals.push(vi.spyOn(object.geometry, "dispose"));
    });
    chunks.prepareRender(world, 0, 0);
    trackCurrent();
    player.transform.x = CHUNK_SIZE + 1;
    chunks.prepareRender(world, 0, 0);
    trackCurrent();
    chunks.dispose();
    chunks.dispose();

    expect(disposals.length).toBeGreaterThan(0);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });
});
