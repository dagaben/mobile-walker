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

  it("shows the drag origin for a movement pointer and hides it on release", () => {
    const indicator = { hidden: true, style: { left: "", top: "" } };
    const controller = new InputController(
      element as unknown as HTMLElement,
      indicator as unknown as HTMLElement,
    );
    const pointer = (type: string, x: number, y: number) => Object.assign(new Event(type), {
      pointerId: 4, clientX: x, clientY: y,
    });

    element.dispatchEvent(pointer("pointerdown", 125, 275));
    expect(indicator).toMatchObject({ hidden: false, style: { left: "125px", top: "275px" } });

    element.dispatchEvent(pointer("pointermove", 180, 300));
    expect(indicator.style).toEqual({ left: "125px", top: "275px" });

    element.dispatchEvent(pointer("pointerup", 180, 300));
    expect(indicator.hidden).toBe(true);
    controller.dispose();
  });

  it("queues Space only once while the key is held", () => {
    const controller = new InputController(element as unknown as HTMLElement);
    mockWindow.dispatchEvent(Object.assign(new Event("keydown"), { code: "Space", repeat: false }));

    expect(controller.sample().jump).toBe(true);
    expect(controller.sample().jump).toBe(false);
    controller.dispose();
  });

  it("reports pinch and centroid gestures independently of pointer order", () => {
    const controller = new InputController(element as unknown as HTMLElement);
    const pointer = (type: string, id: number, x: number, y: number) => Object.assign(new Event(type), {
      pointerId: id, clientX: x, clientY: y,
    });
    element.dispatchEvent(pointer("pointerdown", 9, 200, 200));
    element.dispatchEvent(pointer("pointerdown", 3, 300, 200));
    element.dispatchEvent(pointer("pointermove", 3, 350, 150));
    element.dispatchEvent(pointer("pointermove", 9, 150, 150));

    const outwardAndUp = controller.sampleCamera();
    expect(outwardAndUp.zoomDelta).toBeCloseTo(-0.2);
    expect(outwardAndUp.tiltDelta).toBeCloseTo(0.1);

    element.dispatchEvent(pointer("pointermove", 9, 225, 250));
    element.dispatchEvent(pointer("pointermove", 3, 275, 250));
    const inwardAndDown = controller.sampleCamera();
    expect(inwardAndDown.zoomDelta).toBeGreaterThan(0);
    expect(inwardAndDown.tiltDelta).toBeLessThan(0);
    controller.dispose();
  });

  it("suppresses movement and jumps during multi-touch, then rebases the remaining pointer", () => {
    const controller = new InputController(element as unknown as HTMLElement);
    const pointer = (type: string, id: number, x: number, y: number) => Object.assign(new Event(type), {
      pointerId: id, clientX: x, clientY: y,
    });
    element.dispatchEvent(pointer("pointerdown", 1, 100, 100));
    element.dispatchEvent(pointer("pointermove", 1, 180, 100));
    element.dispatchEvent(pointer("pointerdown", 2, 300, 100));
    mockWindow.dispatchEvent(Object.assign(new Event("keydown"), { code: "Space", repeat: false }));
    expect(controller.sample()).toEqual({ x: 0, z: 0, jump: false });

    element.dispatchEvent(pointer("pointerup", 2, 300, 100));
    expect(controller.sample()).toEqual({ x: 0, z: 0, jump: false });
    element.dispatchEvent(pointer("pointermove", 1, 260, 100));
    expect(controller.sample().x).toBe(1);
    element.dispatchEvent(pointer("pointerup", 1, 260, 100));
    element.dispatchEvent(pointer("pointerdown", 1, 260, 100));
    expect(controller.sample().jump).toBe(false);
    controller.dispose();
  });

  it.each(["pointercancel", "blur", "visibilitychange"])("resets an active gesture on %s", (kind) => {
    const controller = new InputController(element as unknown as HTMLElement);
    const pointer = (type: string, id: number, x: number) => Object.assign(new Event(type), {
      pointerId: id, clientX: x, clientY: 100,
    });
    element.dispatchEvent(pointer("pointerdown", 1, 100));
    element.dispatchEvent(pointer("pointerdown", 2, 200));
    if (kind === "pointercancel") element.dispatchEvent(pointer(kind, 1, 100));
    else if (kind === "blur") mockWindow.dispatchEvent(new Event(kind));
    else {
      mockDocument.hidden = true;
      mockDocument.dispatchEvent(new Event(kind));
    }
    expect(controller.sample()).toEqual({ x: 0, z: 0, jump: false });
    controller.dispose();
  });
});
