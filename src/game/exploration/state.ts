import type { CollectionStateComponent } from "../../ecs/Entity";
import type { ChunkCoordinate } from "../../world/chunkCoordinates";
import { chunkId } from "../../world/chunkId";
import { placeLandmarks, type LandmarkPlacement } from "./placement";

/** Simulation-only chunk lifecycle. It deliberately owns no Three.js resources. */
export class ExplorationState {
  readonly collection: CollectionStateComponent = { collectedIds: new Set() };
  private readonly loaded = new Map<string, readonly LandmarkPlacement[]>();

  constructor(private readonly seed: number | string) {}

  load(coordinate: ChunkCoordinate): readonly LandmarkPlacement[] {
    const id = chunkId(coordinate);
    const placements = placeLandmarks(this.seed, coordinate)
      .filter((placement) => !this.collection.collectedIds.has(placement.id));
    this.loaded.set(id, placements);
    return placements;
  }

  unload(coordinate: ChunkCoordinate): void { this.loaded.delete(chunkId(coordinate)); }

  collect(id: string): void {
    this.collection.collectedIds.add(id);
    for (const [chunk, placements] of this.loaded) {
      this.loaded.set(chunk, placements.filter((placement) => placement.id !== id));
    }
  }

  getLoaded(coordinate: ChunkCoordinate): readonly LandmarkPlacement[] | undefined {
    return this.loaded.get(chunkId(coordinate));
  }
}
