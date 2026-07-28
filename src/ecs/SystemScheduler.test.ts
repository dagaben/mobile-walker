import { describe, expect, it, vi } from "vitest";

import { createEcsWorld } from "./createEcsWorld";
import { SystemScheduler } from "./SystemScheduler";

describe("SystemScheduler", () => {
  it("runs fixed and render systems in registration order", () => {
    const calls: string[] = [];
    const scheduler = new SystemScheduler(createEcsWorld());
    scheduler.addFixedSystem({ fixedUpdate: () => calls.push("fixed-one") });
    scheduler.addFixedSystem({ fixedUpdate: () => calls.push("fixed-two") });
    scheduler.addRenderSystem({ prepareRender: () => calls.push("render-one") });
    scheduler.addRenderSystem({ prepareRender: () => calls.push("render-two") });

    scheduler.fixedUpdate(1 / 60);
    scheduler.prepareRender(0.5, 1 / 120);

    expect(calls).toEqual(["fixed-one", "fixed-two", "render-one", "render-two"]);
  });

  it("disposes a system registered for both phases only once", () => {
    const dispose = vi.fn();
    const sharedSystem = {
      fixedUpdate: vi.fn(),
      prepareRender: vi.fn(),
      dispose,
    };
    const scheduler = new SystemScheduler(createEcsWorld());
    scheduler.addFixedSystem(sharedSystem);
    scheduler.addRenderSystem(sharedSystem);

    scheduler.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
