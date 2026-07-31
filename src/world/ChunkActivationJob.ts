import * as THREE from "three";
import { ChunkMeshFactory, type ChunkActivationStage } from "./chunkMeshes";
import type { GeneratedChunkData } from "./generateChunk";

const STAGES: readonly ChunkActivationStage[] = ["terrain", "hydrology", "trees", "vegetation", "pois", "details"];

/** Resumable conversion of immutable generated data into presentation objects. */
export class ChunkActivationJob {
  readonly group = new THREE.Group();
  private nextStage = 0;
  private cancelled = false;

  constructor(readonly data: GeneratedChunkData, private readonly factory: ChunkMeshFactory) {
    this.group.name = `chunk:${data.id}`;
  }

  get stage(): ChunkActivationStage | "complete" { return STAGES[this.nextStage] ?? "complete"; }
  get terrainReady(): boolean { return this.nextStage >= 2; }
  get complete(): boolean { return this.nextStage === STAGES.length; }

  /** Executes exactly one atomic stage; callers enforce the frame budget between stages. */
  step(): { stage: ChunkActivationStage; milliseconds: number } | undefined {
    if (this.cancelled || this.complete) return undefined;
    const stage = STAGES[this.nextStage]!;
    const start = performance.now();
    this.factory.addActivationStage(this.group, this.data, stage);
    this.nextStage += 1;
    return { stage, milliseconds: performance.now() - start };
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.factory.disposeChunk(this.group);
  }
}
