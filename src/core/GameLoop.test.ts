import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameLoop } from "./GameLoop";

describe("GameLoop", () => {
  let nextId: number;
  let frames: Map<number, FrameRequestCallback>;
  let requestFrame: ReturnType<typeof vi.fn>;
  let cancelFrame: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nextId = 1;
    frames = new Map();
    requestFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    });
    cancelFrame = vi.fn((id: number) => frames.delete(id));
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
  });

  afterEach(() => vi.unstubAllGlobals());

  function runFrame(timeMs: number): void {
    const entry = frames.entries().next().value as [number, FrameRequestCallback] | undefined;
    if (!entry) throw new Error("No animation frame was scheduled");
    frames.delete(entry[0]);
    entry[1](timeMs);
  }

  it("accumulates elapsed time into fixed updates and a render alpha", () => {
    const fixedUpdate = vi.fn();
    const render = vi.fn();
    const loop = new GameLoop({ fixedUpdate, render }, { fixedStepSeconds: 0.1 });

    loop.start();
    runFrame(1_000);
    runFrame(1_250);

    expect(fixedUpdate).toHaveBeenCalledTimes(2);
    expect(fixedUpdate).toHaveBeenCalledWith(0.1);
    const [alpha, frameSeconds] = render.mock.lastCall as [number, number];
    expect(alpha).toBeCloseTo(0.5);
    expect(frameSeconds).toBe(0.25);
  });

  it("clamps long frames before accumulating them", () => {
    const fixedUpdate = vi.fn();
    const render = vi.fn();
    const loop = new GameLoop({ fixedUpdate, render }, { fixedStepSeconds: 0.1, maxFrameSeconds: 0.25 });

    loop.start();
    runFrame(0);
    runFrame(2_000);

    expect(fixedUpdate).toHaveBeenCalledTimes(2);
    const [alpha, frameSeconds] = render.mock.lastCall as [number, number];
    expect(alpha).toBeCloseTo(0.5);
    expect(frameSeconds).toBe(0.25);
  });

  it("stops the pending frame and resets timing before restart", () => {
    const fixedUpdate = vi.fn();
    const render = vi.fn();
    const loop = new GameLoop({ fixedUpdate, render }, { fixedStepSeconds: 0.1 });

    loop.start();
    runFrame(100);
    runFrame(250);
    loop.stop();
    expect(cancelFrame).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);

    loop.start();
    runFrame(10_000);
    expect(fixedUpdate).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenLastCalledWith(0, 0);
  });

  it("does not schedule another frame when start is called twice", () => {
    const loop = new GameLoop({ fixedUpdate: vi.fn(), render: vi.fn() });

    loop.start();
    loop.start();

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(1);
  });
});
