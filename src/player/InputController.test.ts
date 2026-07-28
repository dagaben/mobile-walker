import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InputController } from "./InputController";

class MockInputElement extends EventTarget {
  readonly clientWidth = 500;
  readonly clientHeight = 500;

  setPointerCapture(): void {}
}

describe("InputController focus loss", () => {
  let mockWindow: EventTarget;
  let mockDocument: EventTarget & { hidden: boolean };
  let element: MockInputElement;

  beforeEach(() => {
    mockWindow = new EventTarget();
    mockDocument = Object.assign(new EventTarget(), { hidden: false });
    element = new MockInputElement();
    vi.stubGlobal("window", mockWindow);
    vi.stubGlobal("document", mockDocument);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns neutral keyboard input after the window blurs", () => {
    const controller = new InputController(element as unknown as HTMLElement);
    mockWindow.dispatchEvent(Object.assign(new Event("keydown"), { code: "KeyD" }));
    expect(controller.sample()).toEqual({ x: 1, z: 0 });

    mockWindow.dispatchEvent(new Event("blur"));

    expect(controller.sample()).toEqual({ x: 0, z: 0 });
    controller.dispose();
  });

  it("returns neutral input when the document becomes hidden", () => {
    const controller = new InputController(element as unknown as HTMLElement);
    mockWindow.dispatchEvent(Object.assign(new Event("keydown"), { code: "KeyW" }));
    expect(controller.sample()).toEqual({ x: 0, z: -1 });

    mockDocument.hidden = true;
    mockDocument.dispatchEvent(new Event("visibilitychange"));

    expect(controller.sample()).toEqual({ x: 0, z: 0 });
    controller.dispose();
  });

  it("keeps input active when the document remains visible", () => {
    const controller = new InputController(element as unknown as HTMLElement);
    mockWindow.dispatchEvent(Object.assign(new Event("keydown"), { code: "ArrowDown" }));

    mockDocument.dispatchEvent(new Event("visibilitychange"));

    expect(controller.sample()).toEqual({ x: 0, z: 1 });
    controller.dispose();
  });
});
