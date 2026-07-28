import type { EcsWorld } from "./createEcsWorld";

export interface FixedSystem {
  fixedUpdate(world: EcsWorld, deltaSeconds: number): void;
  dispose?(): void;
}

export interface RenderSystem {
  prepareRender(world: EcsWorld, interpolation: number, deltaSeconds: number): void;
  dispose?(): void;
}
