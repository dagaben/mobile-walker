import type { EcsWorld } from "./createEcsWorld";
import type { FixedSystem, RenderSystem } from "./System";

export class SystemScheduler {
  private readonly fixedSystems: FixedSystem[] = [];
  private readonly renderSystems: RenderSystem[] = [];

  constructor(private readonly world: EcsWorld) {}

  fixedUpdate(deltaSeconds: number): void {
    for (const system of this.fixedSystems) system.fixedUpdate(this.world, deltaSeconds);
  }

  prepareRender(interpolation: number, deltaSeconds: number): void {
    for (const system of this.renderSystems) {
      system.prepareRender(this.world, interpolation, deltaSeconds);
    }
  }

  addFixedSystem(system: FixedSystem): void { this.fixedSystems.push(system); }
  addRenderSystem(system: RenderSystem): void { this.renderSystems.push(system); }

  dispose(): void {
    for (const system of new Set([...this.fixedSystems, ...this.renderSystems])) system.dispose?.();
    this.world.clear();
  }
}
