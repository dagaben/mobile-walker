import { describe, expect, it } from "vitest";

import type { GeneratedChunkData } from "./generateChunk";
import { GeneratedChunkRepository } from "./GeneratedChunkRepository";

describe("GeneratedChunkRepository.values", () => {
  it("provides a read-only data iterator without exposing the internal map", () => {
    const repository = new GeneratedChunkRepository();
    const data = { pois: [] } as unknown as GeneratedChunkData;
    repository.set("0,0", data);

    const values = repository.values();
    expect([...values]).toEqual([data]);
    expect("set" in (values as object)).toBe(false);
    expect(repository.get("0,0")).toBe(data);
  });
});
