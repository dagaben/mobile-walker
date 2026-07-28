export interface GameLoopCallbacks {
  fixedUpdate(deltaSeconds: number): void;
  render(interpolation: number, deltaSeconds: number): void;
}

export interface GameLoopOptions {
  fixedStepSeconds?: number;
  maxFrameSeconds?: number;
}

export class GameLoop {
  private readonly fixedStepSeconds: number;
  private readonly maxFrameSeconds: number;
  private animationFrameId: number | undefined;
  private previousTimeMs: number | undefined;
  private accumulatorSeconds = 0;

  constructor(private readonly callbacks: GameLoopCallbacks, options: GameLoopOptions = {}) {
    this.fixedStepSeconds = options.fixedStepSeconds ?? 1 / 60;
    this.maxFrameSeconds = options.maxFrameSeconds ?? 0.25;
  }

  start(): void {
    if (this.animationFrameId !== undefined) return;
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.animationFrameId !== undefined) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = undefined;
    this.previousTimeMs = undefined;
    this.accumulatorSeconds = 0;
  }

  private readonly tick = (timeMs: number): void => {
    this.animationFrameId = requestAnimationFrame(this.tick);

    if (this.previousTimeMs === undefined) {
      this.previousTimeMs = timeMs;
      this.callbacks.render(0, 0);
      return;
    }

    const frameSeconds = Math.min((timeMs - this.previousTimeMs) / 1000, this.maxFrameSeconds);
    this.previousTimeMs = timeMs;
    this.accumulatorSeconds += frameSeconds;

    while (this.accumulatorSeconds >= this.fixedStepSeconds) {
      this.callbacks.fixedUpdate(this.fixedStepSeconds);
      this.accumulatorSeconds -= this.fixedStepSeconds;
    }

    this.callbacks.render(this.accumulatorSeconds / this.fixedStepSeconds, frameSeconds);
  };
}
