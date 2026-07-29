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
    expect(controller.sample()).toEqual({ x: 1, z: 0, jump: false });

    mockWindow.dispatchEvent(new Event("blur"));

    expect(controller.sample()).toEqual({ x: 0, z: 0, jump: false });
    controller.dispose();
  });

  it("returns neutral input when the document becomes hidden", () => {
    const controller = new InputController(element as unknown as HTMLElement);
    mockWindow.dispatchEvent(Object.assign(new Event("keydown"), { code: "KeyW" }));
    expect(controller.sample()).toEqual({ x: 0, z: -1, jump: false });

    mockDocument.hidden = true;
    mockDocument.dispatchEvent(new Event("visibilitychange"));

    expect(controller.sample()).toEqual({ x: 0, z: 0, jump: false });
    controller.dispose();
  });

  it("keeps input active when the document remains visible", () => {
    const controller = new InputController(element as unknown as HTMLElement);
    mockWindow.dispatchEvent(Object.assign(new Event("keydown"), { code: "ArrowDown" }));

    mockDocument.dispatchEvent(new Event("visibilitychange"));

    expect(controller.sample()).toEqual({ x: 0, z: 1, jump: false });
    controller.dispose();
  });

  it("queues a jump on down-up-down and keeps the second press available for movement", () => {
    const controller = new InputController(element as unknown as HTMLElement);
    const pointer = (type: string, x: number, y: number) => Object.assign(new Event(type), {
      pointerId: 7, clientX: x, clientY: y,
    });

    element.dispatchEvent(pointer("pointerdown", 100, 100));
    element.dispatchEvent(pointer("pointerup", 100, 100));
    element.dispatchEvent(pointer("pointerdown", 100, 100));
    element.dispatchEvent(pointer("pointermove", 180, 100));

    expect(controller.sample()).toEqual({ x: 1, z: 0, jump: true });
    expect(controller.sample()).toEqual({ x: 1, z: 0, jump: false });
    controller.dispose();
  });

  it("queues Space only once while the key is held", () => {
    const controller = new InputController(element as unknown as HTMLElement);
    mockWindow.dispatchEvent(Object.assign(new Event("keydown"), { code: "Space", repeat: false }));

    expect(controller.sample().jump).toBe(true);
    expect(controller.sample().jump).toBe(false);
    controller.dispose();
  });
});
