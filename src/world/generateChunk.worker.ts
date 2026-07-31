/// <reference lib="webworker" />
import type { ChunkCoordinate } from "./chunkCoordinates";
import { generateChunk } from "./generateChunk";
interface ChunkWorkerRequest { readonly requestId: number; readonly seed: number | string; readonly coordinate: ChunkCoordinate; }
self.onmessage = (event: MessageEvent<ChunkWorkerRequest>) => {
  const { requestId, seed, coordinate } = event.data;
  const started = performance.now();
  const data = generateChunk(seed, coordinate);
  const transfer = [data.terrainMesh.positions.buffer,
    data.terrainMesh.indices.buffer, data.terrainMesh.normals.buffer];
  self.postMessage({ requestId, data, generationMs: performance.now() - started, finishedAt: performance.now() }, { transfer });
};
export {};
