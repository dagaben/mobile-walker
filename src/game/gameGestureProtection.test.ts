import { describe, expect, it, vi } from "vitest";

import { installGameGestureProtection } from "./gameGestureProtection";

describe("game gesture protection", () => {
  it.each(["contextmenu", "selectstart", "dragstart"])("prevents %s only on the gameplay surface", (type) => {
    const canvas = new EventTarget();
    const unrelatedControl = new EventTarget();
    const dispose = installGameGestureProtection(canvas, () => null);
    const gameEvent = new Event(type, { cancelable: true });
    const controlEvent = new Event(type, { cancelable: true });

    canvas.dispatchEvent(gameEvent);
    unrelatedControl.dispatchEvent(controlEvent);

    expect(gameEvent.defaultPrevented).toBe(true);
    expect(controlEvent.defaultPrevented).toBe(false);
    dispose();
  });

  it("removes every gameplay listener during disposal", () => {
    const canvas = new EventTarget();
    const dispose = installGameGestureProtection(canvas, () => null);
    dispose();

    for (const type of ["contextmenu", "selectstart", "dragstart"]) {
      const event = new Event(type, { cancelable: true });
      canvas.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it("clears a stale selection at startup and on gameplay pointerdown only", () => {
    const canvas = new EventTarget();
    const unrelatedControl = new EventTarget();
    const removeAllRanges = vi.fn();
    const dispose = installGameGestureProtection(canvas, () => ({ isCollapsed: false, removeAllRanges }));

    expect(removeAllRanges).toHaveBeenCalledTimes(1);
    unrelatedControl.dispatchEvent(new Event("pointerdown"));
    expect(removeAllRanges).toHaveBeenCalledTimes(1);
    canvas.dispatchEvent(new Event("pointerdown"));
    expect(removeAllRanges).toHaveBeenCalledTimes(2);
    dispose();
    canvas.dispatchEvent(new Event("pointerdown"));
    expect(removeAllRanges).toHaveBeenCalledTimes(2);
  });

  it("leaves an already collapsed selection untouched", () => {
    const removeAllRanges = vi.fn();
    const dispose = installGameGestureProtection(new EventTarget(), () => ({ isCollapsed: true, removeAllRanges }));
    expect(removeAllRanges).not.toHaveBeenCalled();
    dispose();
  });
});
