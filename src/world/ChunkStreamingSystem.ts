import type * as THREE from "three";

import type { RenderSystem } from "../ecs/System";
import { chunkId, type ChunkId } from "./chunkId";
import {
  resolveNeighborhoodOffsets,
  selectChunkCenter,
  type ChunkCoordinate,
  type ChunkNeighborhoodOffsets,
} from "./chunkCoordinates";
import { ChunkMeshFactory } from "./chunkMeshes";
import { generateChunk, type GeneratedChunkData } from "./generateChunk";
import type { SunlightDirection } from "../rendering/sunlightDirection";

type ChunkGenerator = (
  seed: number | string,
  coordinate: ChunkCoordinate,
) => GeneratedChunkData | Promise<GeneratedChunkData>;

export interface ChunkStreamingOptions {
  /** Per-direction distances from the center; omitted directions use the radius. */
  readonly offsets?: Partial<ChunkNeighborhoodOffsets>;
  /** Maximum data-generation jobs started during one render frame. */
  readonly generationWorkPerFrame?: number;
  /** Maximum generated chunks converted to Three.js objects during one render frame. */
  readonly meshWorkPerFrame?: number;
  /** Number of recently departed data-and-mesh residents retained for reversal. */
  readonly cacheSize?: number;
  /** Primarily useful for non-browser hosts and deterministic tests. */
  readonly generator?: ChunkGenerator;
  /** Primarily useful for observing mesh lifetimes in tests. */
  readonly meshFactory?: ChunkMeshFactory;
  readonly sunlightDirection?: SunlightDirection;
}

interface CachedChunk {
  readonly data: GeneratedChunkData;
  readonly group?: THREE.Group;
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
  private readonly active = new Map<ChunkId, THREE.Group>();
  private readonly activeData = new Map<ChunkId, GeneratedChunkData>();
  private readonly requestedAdditions = new Map<ChunkId, ChunkCoordinate>();
  private readonly requestedRemovals = new Map<ChunkId, THREE.Group>();
  private readonly generating = new Set<ChunkId>();
  private readonly ready = new Map<ChunkId, CachedChunk>();
  private readonly cache = new Map<ChunkId, CachedChunk>();
  private readonly meshes: ChunkMeshFactory;
  private readonly generator: ChunkGenerator;
  private readonly disposeGenerator: () => void;
  private readonly generationWorkPerFrame: number;
  private readonly meshWorkPerFrame: number;
  private readonly cacheSize: number;
  private offsets: ChunkNeighborhoodOffsets;
  private wanted = new Set<ChunkId>();
  private center?: ChunkCoordinate;
  private priorityDirection = { x: 0, z: -1 };
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly seed: number | string,
    private readonly radius = 1,
    options: ChunkStreamingOptions = {},
  ) {
    this.meshes = options.meshFactory ?? new ChunkMeshFactory(options.sunlightDirection);
    const workerGenerator = options.generator ? undefined : createWorkerGenerator();
    this.generator = options.generator ?? workerGenerator?.generate ?? generateChunk;
    this.disposeGenerator = workerGenerator?.dispose ?? (() => undefined);
    this.generationWorkPerFrame = Math.max(0, options.generationWorkPerFrame ?? 1);
    this.meshWorkPerFrame = Math.max(0, options.meshWorkPerFrame ?? 1);
    this.cacheSize = Math.max(0, options.cacheSize ?? 16);
    this.offsets = resolveNeighborhoodOffsets(this.radius, options.offsets);
  }

  setDebugView(options: import("./chunkMeshes").DebugViewOptions): void {
    this.meshes.setDebugView(options);
  }

  setShadowsEnabled(enabled: boolean): void {
    this.meshes.setShadowsEnabled(enabled);
  }

  /** Changes the resident neighborhood without rebuilding the game. */
  setNeighborhoodOffsets(offsets: Partial<ChunkNeighborhoodOffsets>): void {
    this.offsets = resolveNeighborhoodOffsets(this.radius, offsets);
  }

  prepareRender(
    world: Parameters<RenderSystem["prepareRender"]>[0],
    _interpolation?: number,
    _deltaSeconds?: number,
  ): void {
    const player = world.entities.find((entity) => entity.playerControl && entity.transform);
    if (!player?.transform || this.disposed) return;
    this.center = selectChunkCenter(player.transform.x, player.transform.z, this.center);
    const horizontalSpeed = Math.hypot(player.velocity?.x ?? 0, player.velocity?.z ?? 0);
    this.priorityDirection = horizontalSpeed > 0.001
      ? { x: (player.velocity?.x ?? 0) / horizontalSpeed, z: (player.velocity?.z ?? 0) / horizontalSpeed }
      // When stationary, fill the fixed camera's northern view first.
      : { x: 0, z: -1 };
    this.selectNeighborhood();
    this.processGeneration();
    this.processMeshes();
    this.processSafeRemovals();
  }

  /** Only selects desired residents and updates queues; it performs no expensive work. */
  private selectNeighborhood(): void {
    if (!this.center) return;
    const wanted = new Set<ChunkId>();
    for (let z = this.center.z - this.offsets.north; z <= this.center.z + this.offsets.south; z += 1) {
      for (let x = this.center.x - this.offsets.west; x <= this.center.x + this.offsets.east; x += 1) {
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
    for (const [id, resident] of this.ready) {
      if (!wanted.has(id)) {
        this.ready.delete(id);
        this.putInCache(id, resident);
      }
    }
    this.wanted = wanted;
  }

  private ordered<T>(entries: Iterable<[ChunkId, T]>): [ChunkId, T][] {
    return [...entries].sort(([a], [b]) => this.priorityScore(a) - this.priorityScore(b));
  }

  private priorityScore(id: ChunkId): number {
    if (!this.center) return 0;
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
    if (this.disposed) return;
    const resident = { data };
    if (!this.wanted.has(id)) this.putInCache(id, resident);
    else this.ready.set(id, resident);
  }

  private retryGeneration(id: ChunkId, coordinate: ChunkCoordinate): void {
    this.generating.delete(id);
    if (!this.disposed && this.wanted.has(id)) this.requestedAdditions.set(id, coordinate);
  }

  private processMeshes(): void {
    for (const [id, resident] of this.ordered(this.ready).slice(0, this.meshWorkPerFrame)) {
      this.ready.delete(id);
      if (!this.wanted.has(id)) {
        this.putInCache(id, resident);
        continue;
      }
      const group = resident.group ?? this.meshes.create(resident.data);
      this.meshes.registerGroup(group);
      this.active.set(id, group);
      this.activeData.set(id, resident.data);
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
      this.meshes.unregisterGroup(group);
      group.removeFromParent();
      if (data) this.putInCache(id, { data, group });
      else this.meshes.disposeChunk(group);
    }
  }

  private putInCache(id: ChunkId, resident: CachedChunk): void {
    if (this.cacheSize === 0 || this.disposed) {
      if (resident.group) this.meshes.disposeChunk(resident.group);
      return;
    }
    const replaced = this.cache.get(id);
    if (replaced?.group && replaced.group !== resident.group) {
      this.meshes.unregisterGroup(replaced.group);
      this.meshes.disposeChunk(replaced.group);
    }
    this.cache.delete(id);
    this.cache.set(id, resident);
    while (this.cache.size > this.cacheSize) {
      const evictedId = this.cache.keys().next().value as ChunkId;
      const evicted = this.cache.get(evictedId);
      this.cache.delete(evictedId);
      if (evicted?.group) {
        this.meshes.unregisterGroup(evicted.group);
        this.meshes.disposeChunk(evicted.group);
      }
    }
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
    for (const resident of this.ready.values()) {
      if (!resident.group) continue;
      this.meshes.unregisterGroup(resident.group);
      this.meshes.disposeChunk(resident.group);
    }
    this.ready.clear();
    for (const resident of this.cache.values()) {
      if (!resident.group) continue;
      this.meshes.unregisterGroup(resident.group);
      this.meshes.disposeChunk(resident.group);
    }
    this.cache.clear();
    this.meshes.dispose();
  }
}
