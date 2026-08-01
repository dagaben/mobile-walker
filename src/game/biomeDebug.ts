import type { RenderSystem } from "../ecs/System";
import { BIOMES, BIOME_DEBUG_COLORS, BIOME_IDS, sampleBiome, type BiomeId } from "../world/biomes";
import { worldToChunk } from "../world/chunkCoordinates";
import { isRiverColumn } from "../world/river";
import { collapseDirectionIndicator, makeDirectionIndicatorExpandable } from "./directionIndicator";

export interface BiomeDirection {
  readonly id: BiomeId;
  readonly x: number;
  readonly z: number;
  readonly distance: number;
}

export type RiverIndicatorEdge = "left" | "right" | null;

/** Returns the screen edge pointing horizontally toward the river's chunk column. */
export function riverIndicatorEdge(playerX: number): RiverIndicatorEdge {
  const coordinate = worldToChunk(playerX, 0);
  if (isRiverColumn(coordinate)) return null;
  return coordinate.x < 0 ? "right" : "left";
}

/** Formats world-space distance for the compact biome direction markers. */
export function formatBiomeDistance(distance: number): string {
  return `${Math.round(distance)} m`;
}

/** Converts a world-space X/Z delta to its CSS overlay X/Y displacement. */
export function worldToOverlayDisplacement(
  originX: number,
  originZ: number,
  targetX: number,
  targetZ: number,
  cameraYaw = 0,
): { readonly x: number; readonly y: number } {
  const dx = targetX - originX;
  const dz = targetZ - originZ;
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  return {
    x: dx * cos + dz * sin,
    y: -dx * sin + dz * cos,
  };
}

/** Finds representative points in the nearest sampled region of every biome. */
export function findNearestBiomes(
  seed: number | string,
  playerX: number,
  playerZ: number,
  spacing = 8,
  maxRadius = 256,
): ReadonlyMap<BiomeId, BiomeDirection> {
  const nearest = new Map<BiomeId, BiomeDirection>();
  const cells = Math.ceil(maxRadius / spacing);
  for (let ring = 0; ring <= cells && nearest.size < BIOME_IDS.length; ring += 1) {
    for (let z = -ring; z <= ring; z += 1) for (let x = -ring; x <= ring; x += 1) {
      if (ring > 0 && Math.abs(x) !== ring && Math.abs(z) !== ring) continue;
      const worldX = playerX + x * spacing;
      const worldZ = playerZ + z * spacing;
      const id = sampleBiome(seed, worldX, worldZ).dominant;
      const distance = Math.hypot(x * spacing, z * spacing);
      const previous = nearest.get(id);
      if (!previous || distance < previous.distance) nearest.set(id, { id, x: worldX, z: worldZ, distance });
    }
  }
  return nearest;
}

export class BiomeDebugPresentationSystem implements RenderSystem {
  private enabled = false;
  private elapsed = Number.POSITIVE_INFINITY;
  private currentBiome?: BiomeId;
  private readonly indicators = new Map<BiomeId, HTMLElement>();
  private readonly removeIndicatorListeners: (() => void)[] = [];
  private readonly riverIndicator: HTMLElement;

  constructor(
    private readonly seed: number | string,
    private readonly overlay: HTMLElement,
    private readonly currentLabel: HTMLElement,
    private readonly getCameraYaw: () => number = () => 0,
  ) {
    this.riverIndicator = document.createElement("div");
    this.riverIndicator.className = "river-indicator";
    this.riverIndicator.setAttribute("aria-hidden", "true");
    this.riverIndicator.hidden = true;
    this.overlay.append(this.riverIndicator);

    for (const id of BIOME_IDS) {
      const indicator = document.createElement("button");
      indicator.className = "biome-indicator";
      indicator.setAttribute("type", "button");
      indicator.dataset.biome = id;
      indicator.style.setProperty("--biome-color", BIOME_DEBUG_COLORS[id]);
      indicator.title = BIOMES[id].label;
      indicator.setAttribute("aria-label", `Direction to nearest ${BIOMES[id].label}`);
      const marker = document.createElement("span");
      marker.className = "biome-indicator-marker";
      marker.setAttribute("aria-hidden", "true");
      const distance = document.createElement("span");
      distance.className = "biome-indicator-distance";
      const name = document.createElement("span");
      name.className = "biome-indicator-name";
      name.textContent = BIOMES[id].label;
      indicator.append(marker, distance, name);
      this.removeIndicatorListeners.push(makeDirectionIndicatorExpandable(indicator));
      this.overlay.append(indicator);
      this.indicators.set(id, indicator);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.overlay.hidden = !enabled;
    this.currentLabel.parentElement!.hidden = !enabled;
    this.elapsed = Number.POSITIVE_INFINITY;
    if (!enabled) for (const indicator of this.indicators.values()) collapseDirectionIndicator(indicator);
  }

  prepareRender(world: Parameters<RenderSystem["prepareRender"]>[0], _interpolation: number, deltaSeconds: number): void {
    if (!this.enabled) return;
    this.elapsed += deltaSeconds;
    if (this.elapsed < 0.2) return;
    this.elapsed = 0;
    const player = world.entities.find((entity) => entity.playerControl && entity.transform);
    if (!player?.transform) return;

    const { x, z } = player.transform;
    const riverEdge = riverIndicatorEdge(x);
    this.riverIndicator.hidden = riverEdge === null;
    this.riverIndicator.className = riverEdge === null
      ? "river-indicator"
      : `river-indicator river-indicator--${riverEdge}`;

    const current = sampleBiome(this.seed, x, z).dominant;
    if (current !== this.currentBiome) {
      this.currentBiome = current;
      this.currentLabel.textContent = BIOMES[current].label;
      this.currentLabel.style.setProperty("--biome-color", BIOME_DEBUG_COLORS[current]);
    }

    const nearest = findNearestBiomes(this.seed, x, z);
    const width = this.overlay.clientWidth;
    const height = this.overlay.clientHeight;
    const halfWidth = Math.max(1, width / 2 - 28);
    const halfHeight = Math.max(1, height / 2 - 28);
    for (const id of BIOME_IDS) {
      const indicator = this.indicators.get(id);
      const target = nearest.get(id);
      if (!indicator) continue;
      // The current biome is already identified by the badge and has no useful direction.
      if (!target || id === current || target.distance < 1) {
        collapseDirectionIndicator(indicator);
        indicator.hidden = true;
        continue;
      }
      indicator.hidden = false;
      const distanceLabel = formatBiomeDistance(target.distance);
      const label = `${BIOMES[id].label}: ${distanceLabel}`;
      const distance = indicator.querySelector<HTMLElement>(".biome-indicator-distance");
      if (distance) distance.textContent = distanceLabel;
      indicator.title = label;
      indicator.setAttribute("aria-label", `Direction to nearest ${label}`);
      const { x: dx, y: dy } = worldToOverlayDisplacement(x, z, target.x, target.z, this.getCameraYaw());
      const scale = Math.min(halfWidth / Math.max(Math.abs(dx), 0.001), halfHeight / Math.max(Math.abs(dy), 0.001));
      const screenX = width / 2 + dx * scale;
      const horizontalAlignment = screenX < width / 2 ? "0%" : "-100%";
      indicator.style.transform = `translate(${screenX}px, ${height / 2 + dy * scale}px) translate(${horizontalAlignment}, -50%)`;
    }
  }

  dispose(): void {
    this.riverIndicator.remove();
    for (const removeListener of this.removeIndicatorListeners) removeListener();
    for (const indicator of this.indicators.values()) indicator.remove();
    this.indicators.clear();
  }
}
