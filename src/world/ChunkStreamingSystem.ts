import type * as THREE from "three";

import type { RenderSystem } from "../ecs/System";
import { chunkId, type ChunkId } from "./chunkId";
import { CHUNK_SIZE, type ChunkCoordinate, worldToChunk } from "./chunkCoordinates";
import { ChunkMeshFactory } from "./chunkMeshes";
import { generateChunk, type GeneratedChunkData } from "./generateChunk";

type ChunkGenerator = (
  seed: number | string,
  coordinate: ChunkCoordinate,
) => GeneratedChunkData | Promise<GeneratedChunkData>;

export interface ChunkStreamingOptions {
  /** Maximum data-generation jobs started during one render frame. */
  readonly generationWorkPerFrame?: number;
  /** Maximum generated chunks converted to Three.js objects during one render frame. */
  readonly meshWorkPerFrame?: number;
  /** Number of recently departed generated-data entries retained for reversal. */
  readonly cacheSize?: number;
  /** Primarily useful for non-browser hosts and deterministic tests. */
  readonly generator?: ChunkGenerator;
}

interface ChunkWorkerRequest {
  readonly requestId: number;
  readonly seed: number | string;
  readonly coordinate: ChunkCoordinate;
}

/** Runs pure generation off-thread when the browser deployment supports module workers. */
function createWorkerGenerator(): { generate: ChunkGenerator; dispose: () => void } | undefined {
  if (typeof Worker === "undefined") return undefined;
  const worker = new Worker(new URL("./generateChunk.worker.ts", import.meta.url), { type: "module" });
  let nextRequestId = 0;
  const pending = new Map<number, { resolve: (data: GeneratedChunkData) => void; reject: (error: Error) => void }>();
  worker.onmessage = (event: MessageEvent<{ requestId: number; data: GeneratedChunkData }>) => {
    const request = pending.get(event.data.requestId);
    if (!request) return;
    pending.delete(event.data.requestId);
    request.resolve(event.data.data);
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Chunk generation worker failed");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  return {
    generate: (seed, coordinate) => new Promise((resolve, reject) => {
      const requestId = nextRequestId++;
      pending.set(requestId, { resolve, reject });
      worker.postMessage({ requestId, seed, coordinate } satisfies ChunkWorkerRequest);
    }),
    dispose: () => {
      worker.terminate();
      for (const request of pending.values()) request.reject(new Error("Chunk streaming disposed"));
      pending.clear();
    },
  };
}

export class ChunkStreamingSystem implements RenderSystem {
  /** The outer 3/4 chunk blends into the background; keep this below CHUNK_SIZE. */
  static readonly EDGE_FADE_WIDTH = CHUNK_SIZE * 0.75;
  private readonly active = new Map<ChunkId, THREE.Group>();
  private readonly activeData = new Map<ChunkId, GeneratedChunkData>();
  private readonly requestedAdditions = new Map<ChunkId, ChunkCoordinate>();
  private readonly requestedRemovals = new Map<ChunkId, THREE.Group>();
  private readonly generating = new Set<ChunkId>();
  private readonly ready = new Map<ChunkId, GeneratedChunkData>();
  private readonly cache = new Map<ChunkId, GeneratedChunkData>();
  private readonly meshes: ChunkMeshFactory;
  private readonly generator: ChunkGenerator;
  private readonly disposeGenerator: () => void;
  private readonly generationWorkPerFrame: number;
  private readonly meshWorkPerFrame: number;
  private readonly cacheSize: number;
  private wanted = new Set<ChunkId>();
  private center: ChunkCoordinate = { x: 0, z: 0 };
  private priorityDirection = { x: 0, z: 1 };
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly seed: number | string,
    private readonly radius = 1,
    options: ChunkStreamingOptions = {},
  ) {
    const center = this.getLoadedCenter();
    this.meshes = new ChunkMeshFactory({
      centerX: center.x,
      centerZ: center.z,
      halfExtent: this.getLoadedHalfExtent(),
      width: ChunkStreamingSystem.EDGE_FADE_WIDTH,
      color: 0xd9ead8,
    });
    const workerGenerator = options.generator ? undefined : createWorkerGenerator();
    this.generator = options.generator ?? workerGenerator?.generate ?? generateChunk;
    this.disposeGenerator = workerGenerator?.dispose ?? (() => undefined);
    this.generationWorkPerFrame = Math.max(0, options.generationWorkPerFrame ?? 1);
    this.meshWorkPerFrame = Math.max(0, options.meshWorkPerFrame ?? 1);
    this.cacheSize = Math.max(0, options.cacheSize ?? 16);
  }

  setDebugView(options: import("./chunkMeshes").DebugViewOptions): void {
    this.meshes.setDebugView(options);
  }

  prepareRender(
    world: Parameters<RenderSystem["prepareRender"]>[0],
    _interpolation?: number,
    _deltaSeconds?: number,
  ): void {
    const player = world.entities.find((entity) => entity.playerControl && entity.transform);
    if (!player?.transform || this.disposed) return;
    this.center = worldToChunk(player.transform.x, player.transform.z);
    const horizontalSpeed = Math.hypot(player.velocity?.x ?? 0, player.velocity?.z ?? 0);
    this.priorityDirection = horizontalSpeed > 0.001
      ? { x: (player.velocity?.x ?? 0) / horizontalSpeed, z: (player.velocity?.z ?? 0) / horizontalSpeed }
      : { x: Math.sin(player.transform.yaw), z: Math.cos(player.transform.yaw) };
    this.selectNeighborhood();
    const loadedCenter = this.getLoadedCenter();
    this.meshes.setLoadedNeighborhood(loadedCenter.x, loadedCenter.z, this.getLoadedHalfExtent());
    this.processGeneration();
    this.processMeshes();
    this.processSafeRemovals();
  }

  /** Only selects desired residents and updates queues; it performs no expensive work. */
  private selectNeighborhood(): void {
    const wanted = new Set<ChunkId>();
    for (let z = this.center.z - this.radius; z <= this.center.z + this.radius; z += 1) {
      for (let x = this.center.x - this.radius; x <= this.center.x + this.radius; x += 1) {
        const coordinate = { x, z };
        const id = chunkId(coordinate);
        wanted.add(id);
        this.requestedRemovals.delete(id);
        if (!this.active.has(id) && !this.ready.has(id) && !this.generating.has(id)) {
          this.requestedAdditions.set(id, coordinate);
        }
      }
    }
    for (const [id, group] of this.active) {
      if (!wanted.has(id)) this.requestedRemovals.set(id, group);
    }
    for (const [id] of this.requestedAdditions) {
      if (!wanted.has(id)) this.requestedAdditions.delete(id);
    }
    for (const [id, data] of this.ready) {
      if (!wanted.has(id)) {
        this.ready.delete(id);
        this.putInCache(id, data);
      }
    }
    this.wanted = wanted;
  }

  private ordered<T>(entries: Iterable<[ChunkId, T]>): [ChunkId, T][] {
    return [...entries].sort(([a], [b]) => this.priorityScore(a) - this.priorityScore(b));
  }

  private priorityScore(id: ChunkId): number {
    const [x, z] = id.split(",").map(Number);
    const dx = x - this.center.x;
    const dz = z - this.center.z;
    const distance = Math.hypot(dx, dz);
    const ahead = distance === 0 ? 1 : (dx * this.priorityDirection.x + dz * this.priorityDirection.z) / distance;
    return distance - ahead * 0.4;
  }

  private processGeneration(): void {
    for (const [id, coordinate] of this.ordered(this.requestedAdditions).slice(0, this.generationWorkPerFrame)) {
      this.requestedAdditions.delete(id);
      const cached = this.cache.get(id);
      if (cached) {
        this.cache.delete(id);
        this.ready.set(id, cached);
        continue;
      }
      this.generating.add(id);
      try {
        const result = this.generator(this.seed, coordinate);
        if (result instanceof Promise) {
          void result.then((data) => this.finishGeneration(id, data), () => this.retryGeneration(id, coordinate));
        } else {
          this.finishGeneration(id, result);
        }
      } catch {
        this.retryGeneration(id, coordinate);
      }
    }
  }

  private finishGeneration(id: ChunkId, data: GeneratedChunkData): void {
    this.generating.delete(id);
    if (this.disposed || !this.wanted.has(id)) this.putInCache(id, data);
    else this.ready.set(id, data);
  }

  private retryGeneration(id: ChunkId, coordinate: ChunkCoordinate): void {
    this.generating.delete(id);
    if (!this.disposed && this.wanted.has(id)) this.requestedAdditions.set(id, coordinate);
  }

  private processMeshes(): void {
    for (const [id, data] of this.ordered(this.ready).slice(0, this.meshWorkPerFrame)) {
      this.ready.delete(id);
      if (!this.wanted.has(id)) {
        this.putInCache(id, data);
        continue;
      }
      const group = this.meshes.create(data);
      this.meshes.registerGroup(group);
      this.active.set(id, group);
      this.activeData.set(id, data);
      this.scene.add(group);
    }
  }

  /** Departed chunks overlap the new neighborhood until every replacement is visible. */
  private processSafeRemovals(): void {
    if ([...this.wanted].some((id) => !this.active.has(id))) return;
    for (const [id, group] of this.requestedRemovals) {
      this.requestedRemovals.delete(id);
      this.active.delete(id);
      const data = this.activeData.get(id);
      this.activeData.delete(id);
      if (data) this.putInCache(id, data);
      this.meshes.unregisterGroup(group);
      this.meshes.disposeChunk(group);
    }
  }

  private putInCache(id: ChunkId, data: GeneratedChunkData): void {
    if (this.cacheSize === 0 || this.disposed) return;
    this.cache.delete(id);
    this.cache.set(id, data);
    while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value as ChunkId);
  }

  /** Center of the resident neighborhood, in world coordinates. */
  getLoadedCenter(): { x: number; z: number } {
    return { x: (this.center.x + 0.5) * CHUNK_SIZE, z: (this.center.z + 0.5) * CHUNK_SIZE };
  }

  /** Half-width of (2 * radius + 1) resident chunks in world units. */
  getLoadedHalfExtent(): number {
    return (this.radius + 0.5) * CHUNK_SIZE;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeGenerator();
    for (const group of this.active.values()) {
      this.meshes.unregisterGroup(group);
      this.meshes.disposeChunk(group);
    }
    this.active.clear();
    this.activeData.clear();
    this.requestedAdditions.clear();
    this.requestedRemovals.clear();
    this.ready.clear();
    this.cache.clear();
    this.meshes.dispose();
  }
}
