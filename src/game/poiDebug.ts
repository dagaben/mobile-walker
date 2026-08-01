import type { RenderSystem } from "../ecs/System";
import { chunkId } from "../world/chunkId";
import { worldToChunk } from "../world/chunkCoordinates";
import type { GeneratedChunkRepository } from "../world/GeneratedChunkRepository";
import { getPoiDefinitions, type GeneratedPoi } from "../world/poi";
import { formatBiomeDistance, worldToOverlayDisplacement } from "./biomeDebug";

export interface PoiDirection {
  readonly typeId: string;
  readonly x: number;
  readonly z: number;
  readonly distance: number;
}

/** Finds the closest POI of each type in the currently generated neighborhood. */
export function findNearestPoiTypes(
  repository: GeneratedChunkRepository,
  playerX: number,
  playerZ: number,
  chunkRadius = 4,
): ReadonlyMap<string, PoiDirection> {
  const nearest = new Map<string, PoiDirection>();
  const center = worldToChunk(playerX, playerZ);
  for (let z = center.z - chunkRadius; z <= center.z + chunkRadius; z += 1) {
    for (let x = center.x - chunkRadius; x <= center.x + chunkRadius; x += 1) {
      const data = repository.get(chunkId({ x, z }));
      if (!data) continue;
      for (const poi of data.pois as readonly GeneratedPoi[]) {
        const distance = Math.hypot(poi.position.x - playerX, poi.position.z - playerZ);
        const previous = nearest.get(poi.typeId);
        if (!previous || distance < previous.distance) {
          nearest.set(poi.typeId, { typeId: poi.typeId, x: poi.position.x, z: poi.position.z, distance });
        }
      }
    }
  }
  return nearest;
}

export class PoiDebugPresentationSystem implements RenderSystem {
  private enabled = false;
  private elapsed = Number.POSITIVE_INFINITY;
  private readonly indicators = new Map<string, HTMLElement>();

  constructor(
    private readonly repository: GeneratedChunkRepository,
    private readonly overlay: HTMLElement,
  ) {
    for (const definition of getPoiDefinitions()) {
      const indicator = document.createElement("div");
      indicator.className = "biome-indicator poi-indicator";
      indicator.dataset.poi = definition.id;
      indicator.style.setProperty("--biome-color", `#${definition.debugColor.toString(16).padStart(6, "0")}`);
      indicator.setAttribute("aria-label", `Direction to nearest ${definition.label}`);
      const marker = document.createElement("span");
      marker.className = "biome-indicator-marker";
      marker.setAttribute("aria-hidden", "true");
      const distance = document.createElement("span");
      distance.className = "biome-indicator-distance";
      indicator.append(marker, distance);
      this.overlay.append(indicator);
      this.indicators.set(definition.id, indicator);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.overlay.hidden = !enabled;
    this.elapsed = Number.POSITIVE_INFINITY;
  }

  prepareRender(world: Parameters<RenderSystem["prepareRender"]>[0], _interpolation: number, deltaSeconds: number): void {
    if (!this.enabled) return;
    this.elapsed += deltaSeconds;
    if (this.elapsed < 0.2) return;
    this.elapsed = 0;
    const player = world.entities.find((entity) => entity.playerControl && entity.transform);
    if (!player?.transform) return;

    const { x, z } = player.transform;
    const nearest = findNearestPoiTypes(this.repository, x, z);
    const width = this.overlay.clientWidth;
    const height = this.overlay.clientHeight;
    const halfWidth = Math.max(1, width / 2 - 28);
    const halfHeight = Math.max(1, height / 2 - 28);
    for (const definition of getPoiDefinitions()) {
      const indicator = this.indicators.get(definition.id);
      const target = nearest.get(definition.id);
      if (!indicator) continue;
      if (!target || target.distance < 1) {
        indicator.hidden = true;
        continue;
      }
      indicator.hidden = false;
      const distanceLabel = formatBiomeDistance(target.distance);
      const label = `${definition.label}: ${distanceLabel}`;
      indicator.querySelector<HTMLElement>(".biome-indicator-distance")!.textContent = distanceLabel;
      indicator.title = label;
      indicator.setAttribute("aria-label", `Direction to nearest ${label}`);
      const { x: dx, y: dy } = worldToOverlayDisplacement(x, z, target.x, target.z);
      const scale = Math.min(halfWidth / Math.max(Math.abs(dx), 0.001), halfHeight / Math.max(Math.abs(dy), 0.001));
      indicator.style.transform = `translate(${width / 2 + dx * scale}px, ${height / 2 + dy * scale}px) translate(-50%, -50%)`;
    }
  }

  dispose(): void {
    for (const indicator of this.indicators.values()) indicator.remove();
    this.indicators.clear();
  }
}
