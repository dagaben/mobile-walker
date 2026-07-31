import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const webgl = vi.hoisted(() => ({
  instances: [] as Array<{ setSize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
}));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();

  class WebGLRenderer {
    readonly setSize = vi.fn((width: number, height: number) => {
      canvas.width = width;
      canvas.height = height;
    });
    readonly dispose = vi.fn();
    readonly info = { render: { calls: 0, triangles: 0 } };
    outputColorSpace = "";

    constructor(parameters: { canvas: HTMLCanvasElement }) {
      canvas = parameters.canvas;
      webgl.instances.push(this);
    }

    setPixelRatio(): void {}
    render(): void {}
  }

  let canvas: HTMLCanvasElement;
  return { ...actual, WebGLRenderer };
});

import { ThreeRenderer } from "./ThreeRenderer";

class ResizeObserverStub {
  static instances: ResizeObserverStub[] = [];
  readonly disconnect = vi.fn();
  readonly observe = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverStub.instances.push(this);
  }

  notify(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe("ThreeRenderer resize synchronization", () => {
  let animationFrames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    webgl.instances.length = 0;
    ResizeObserverStub.instances.length = 0;
    animationFrames = new Map();
    let nextAnimationFrame = 1;

    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("devicePixelRatio", 1);
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      const id = nextAnimationFrame++;
      animationFrames.set(id, callback);
      return id;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => animationFrames.delete(id)));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("updates the WebGL buffer and camera when only the canvas changes size", () => {
    const canvas = { clientWidth: 320, clientHeight: 180, width: 0, height: 0 } as HTMLCanvasElement;
    const renderer = new ThreeRenderer(canvas);
    const webglRenderer = webgl.instances[0];

    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(180);
    expect(renderer.camera.aspect).toBe(320 / 180);

    Object.assign(canvas, { clientWidth: 480, clientHeight: 320 });
    ResizeObserverStub.instances[0].notify();

    expect(canvas.width).toBe(480);
    expect(canvas.height).toBe(320);
    expect(renderer.camera.aspect).toBe(1.5);
    expect(webglRenderer.setSize).toHaveBeenCalledTimes(2);

    ResizeObserverStub.instances[0].notify();
    expect(webglRenderer.setSize).toHaveBeenCalledTimes(2);

    renderer.dispose();
    expect(ResizeObserverStub.instances[0].disconnect).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("fades the final 20 units of the camera draw distance", () => {
    const canvas = { clientWidth: 320, clientHeight: 180, width: 0, height: 0 } as HTMLCanvasElement;
    const renderer = new ThreeRenderer(canvas);
    const fog = renderer.scene.fog;

    expect(fog).toMatchObject({ near: renderer.camera.far - 20, far: renderer.camera.far });

    renderer.dispose();
  });
});
