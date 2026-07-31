import type { EcsWorld } from "./createEcsWorld";
import type { FixedSystem, RenderSystem } from "./System";

export class SystemScheduler {
  private readonly fixedSystems: FixedSystem[] = [];
  private readonly renderSystems: RenderSystem[] = [];
  private readonly timings = new Map<string, { currentMs: number; maximumMs: number; rollingMaximumMs: number; samples: { at: number; ms: number }[] }>();

  constructor(private readonly world: EcsWorld) {}

  fixedUpdate(deltaSeconds: number): void {
    for (const system of this.fixedSystems) this.measure(system, "fixed", () => system.fixedUpdate(this.world, deltaSeconds));
  }

  prepareRender(interpolation: number, deltaSeconds: number): void {
    for (const system of this.renderSystems) {
      this.measure(system, "render", () => system.prepareRender(this.world, interpolation, deltaSeconds));
    }
  }

  addFixedSystem(system: FixedSystem): void { this.fixedSystems.push(system); }
  addRenderSystem(system: RenderSystem): void { this.renderSystems.push(system); }

  getDiagnostics(): ReadonlyMap<string, Readonly<{ currentMs: number; maximumMs: number; rollingMaximumMs: number }>> { return this.timings; }

  private measure(system: object, phase: string, work: () => void): void {
    const started = performance.now(); work(); const ended = performance.now();
    const ms = ended - started;
    const name = `${system.constructor.name || "AnonymousSystem"}.${phase}`;
    const timing = this.timings.get(name) ?? { currentMs: 0, maximumMs: 0, rollingMaximumMs: 0, samples: [] };
    timing.currentMs = ms; timing.maximumMs = Math.max(timing.maximumMs, ms);
    timing.samples.push({ at: ended, ms });
    while (timing.samples[0] && timing.samples[0].at < ended - 1000) timing.samples.shift();
    timing.rollingMaximumMs = Math.max(0, ...timing.samples.map(sample => sample.ms));
    this.timings.set(name, timing);
  }

  dispose(): void {
    for (const system of new Set([...this.fixedSystems, ...this.renderSystems])) system.dispose?.();
    this.world.clear();
  }
}
