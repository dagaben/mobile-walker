/// <reference lib="webworker" />

import type { ChunkCoordinate } from "./chunkCoordinates";
import { generateChunk } from "./generateChunk";

interface ChunkWorkerRequest {
  readonly requestId: number;
  readonly seed: number | string;
  readonly coordinate: ChunkCoordinate;
}

self.onmessage = (event: MessageEvent<ChunkWorkerRequest>) => {
  const { requestId, seed, coordinate } = event.data;
  self.postMessage({ requestId, data: generateChunk(seed, coordinate) });
};

export {};
