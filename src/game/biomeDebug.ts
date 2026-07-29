import type { RenderSystem } from "../ecs/System";
import { BIOMES, BIOME_DEBUG_COLORS, BIOME_IDS, sampleBiome, type BiomeId } from "../world/biomes";

export interface BiomeDirection {
  readonly id: BiomeId;
  readonly x: number;
  readonly z: number;
  readonly distance: number;
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

  constructor(
    private readonly seed: number | string,
    private readonly overlay: HTMLElement,
    private readonly currentLabel: HTMLElement,
  ) {
    for (const id of BIOME_IDS) {
      const indicator = document.createElement("div");
      indicator.className = "biome-indicator";
      indicator.dataset.biome = id;
      indicator.style.setProperty("--biome-color", BIOME_DEBUG_COLORS[id]);
      indicator.title = BIOMES[id].label;
      indicator.setAttribute("aria-label", `Direction to nearest ${BIOMES[id].label}`);
      this.overlay.append(indicator);
      this.indicators.set(id, indicator);
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
        indicator.hidden = true;
        continue;
      }
      indicator.hidden = false;
      const dx = target.x - x;
      const dy = -(target.z - z);
      const scale = Math.min(halfWidth / Math.max(Math.abs(dx), 0.001), halfHeight / Math.max(Math.abs(dy), 0.001));
      indicator.style.transform = `translate(${width / 2 + dx * scale}px, ${height / 2 + dy * scale}px) translate(-50%, -50%)`;
    }
  }

  dispose(): void {
    for (const indicator of this.indicators.values()) indicator.remove();
    this.indicators.clear();
  }
}
