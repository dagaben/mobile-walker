import { createEcsWorld } from "../ecs/createEcsWorld";
import { SystemScheduler } from "../ecs/SystemScheduler";
import { createGameplay } from "../game/createGameplay";
import { ThreeRenderer } from "../rendering/ThreeRenderer";
import { GameLoop } from "./GameLoop";
import type { DebugViewOptions } from "../world/chunkMeshes";
import type { ChunkStreamingSystem } from "../world/ChunkStreamingSystem";
import type { BiomeDebugPresentationSystem } from "../game/biomeDebug";
import type { CameraPresentationSystem } from "../game/presentationSystems";

export class Game {
  private readonly renderer: ThreeRenderer;
  private readonly systems: SystemScheduler;
  private readonly loop: GameLoop;
  private running = false;
  private readonly chunks: ChunkStreamingSystem;
  private readonly biomeDebug: BiomeDebugPresentationSystem;
  private readonly cameraPresentation: CameraPresentationSystem;
  private readonly cameraDetails: HTMLOutputElement;
  private readonly performanceView: HTMLOutputElement;
  private smoothedFrameSeconds = 1 / 60;

  constructor(canvas: HTMLCanvasElement) {
    const world = createEcsWorld();
    this.renderer = new ThreeRenderer(canvas);
    this.systems = new SystemScheduler(world);
    const gameplay = createGameplay(world, this.systems, this.renderer, canvas);
    this.chunks = gameplay.chunks;
    this.biomeDebug = gameplay.biomeDebug;
    this.cameraPresentation = gameplay.camera;
    const cameraDetails = document.querySelector<HTMLOutputElement>("#camera-details");
    const performanceView = document.querySelector<HTMLOutputElement>("#performance-view");
    if (!cameraDetails || !performanceView) throw new Error("Debug readouts could not be found.");
    this.cameraDetails = cameraDetails;
    this.performanceView = performanceView;
    this.loop = new GameLoop({
      fixedUpdate: (deltaSeconds) => this.systems.fixedUpdate(deltaSeconds),
      render: (interpolation, deltaSeconds) => {
        this.systems.prepareRender(interpolation, deltaSeconds);
        this.renderer.render(deltaSeconds);
        this.updateDebugReadouts(deltaSeconds);
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

  setCameraDetailsEnabled(enabled: boolean): void {
    this.cameraDetails.hidden = !enabled;
  }

  setPerformanceViewEnabled(enabled: boolean): void {
    this.performanceView.hidden = !enabled;
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

  private updateDebugReadouts(deltaSeconds: number): void {
    if (deltaSeconds > 0) this.smoothedFrameSeconds += (deltaSeconds - this.smoothedFrameSeconds) * 0.1;
    if (!this.cameraDetails.hidden) {
      const details = this.cameraPresentation.getDebugDetails();
      this.cameraDetails.textContent = `CAMERA\nAngle   ${details.angleDegrees.toFixed(1)}°\nZoom    ${Math.round(details.zoomLevel * 100)}%\nHeight  ${details.height.toFixed(2)} m`;
    }
    if (!this.performanceView.hidden) {
      const details = this.renderer.getPerformanceDetails();
      const frameMs = this.smoothedFrameSeconds * 1000;
      this.performanceView.textContent = `PERFORMANCE\nFPS       ${(1 / this.smoothedFrameSeconds).toFixed(0)}\nFrame     ${frameMs.toFixed(1)} ms\nDraws     ${details.drawCalls}\nTriangles ${details.triangles.toLocaleString()}`;
    }
  }
}
