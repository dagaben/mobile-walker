import { createEcsWorld } from "../ecs/createEcsWorld";
import { SystemScheduler } from "../ecs/SystemScheduler";
import { createGameplay } from "../game/createGameplay";
import { ThreeRenderer } from "../rendering/ThreeRenderer";
import { GameLoop } from "./GameLoop";
import type { DebugViewOptions } from "../world/chunkMeshes";
import type { ChunkStreamingSystem } from "../world/ChunkStreamingSystem";
import type { BiomeDebugPresentationSystem } from "../game/biomeDebug";

export class Game {
  private readonly renderer: ThreeRenderer;
  private readonly systems: SystemScheduler;
  private readonly loop: GameLoop;
  private running = false;
  private readonly chunks: ChunkStreamingSystem;
  private readonly biomeDebug: BiomeDebugPresentationSystem;

  constructor(canvas: HTMLCanvasElement) {
    const world = createEcsWorld();
    this.renderer = new ThreeRenderer(canvas);
    this.systems = new SystemScheduler(world);
    const gameplay = createGameplay(world, this.systems, this.renderer, canvas);
    this.chunks = gameplay.chunks;
    this.biomeDebug = gameplay.biomeDebug;
    this.loop = new GameLoop({
      fixedUpdate: (deltaSeconds) => this.systems.fixedUpdate(deltaSeconds),
      render: (interpolation, deltaSeconds) => {
        this.systems.prepareRender(interpolation, deltaSeconds);
        this.renderer.render(deltaSeconds);
      },
    });

    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  start(): void {
    this.running = true;
    this.loop.start();
  }

  setDebugView(options: DebugViewOptions): void {
    this.chunks.setDebugView(options);
    this.biomeDebug.setEnabled(options.biomeGuide);
  }

  dispose(): void {
    this.running = false;
    this.loop.stop();
    this.systems.dispose();
    this.renderer.dispose();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) this.loop.stop();
    else if (this.running) this.loop.start();
  };
}
