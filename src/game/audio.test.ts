import { describe, expect, it } from "vitest";

import { nextStingerDelaySeconds, shouldPlayWolfHowl } from "./audio";

describe("audio stinger timing", () => {
  it("day delays stay in a moderate bird range", () => {
    const samples = [0, 0.5, 0.99].map((r) => nextStingerDelaySeconds("day", () => r));
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(4);
      expect(s).toBeLessThanOrEqual(12);
    }
  });

  it("night delays are longer than day", () => {
    const day = nextStingerDelaySeconds("day", () => 0);
    const night = nextStingerDelaySeconds("night", () => 0);
    expect(night).toBeGreaterThan(day);
  });

  it("wolf howl is rare", () => {
    let hits = 0;
    const n = 1000;
    for (let i = 0; i < n; i += 1) {
      if (shouldPlayWolfHowl(() => i / n)) hits += 1;
    }
    // threshold 0.18 → about 180 hits; allow slack
    expect(hits).toBeGreaterThan(100);
    expect(hits).toBeLessThan(250);
  });
});
