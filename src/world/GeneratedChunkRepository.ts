import type { ChunkId } from "./chunkId";
import type { GeneratedChunkData } from "./generateChunk";

/** Shared, read-only view of generated chunks used by gameplay and presentation. */
export class GeneratedChunkRepository {
  private readonly chunks = new Map<ChunkId, GeneratedChunkData>();
  private readonly listeners = new Set<(id: ChunkId, data: GeneratedChunkData | undefined) => void>();

  get(id: ChunkId): GeneratedChunkData | undefined { return this.chunks.get(id); }
  set(id: ChunkId, data: GeneratedChunkData): void {
    this.chunks.set(id, data);
    for (const listener of this.listeners) listener(id, data);
  }
  delete(id: ChunkId): void {
    if (!this.chunks.delete(id)) return;
    for (const listener of this.listeners) listener(id, undefined);
  }
  subscribe(listener: (id: ChunkId, data: GeneratedChunkData | undefined) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  clear(): void { for (const id of [...this.chunks.keys()]) this.delete(id); }
}
