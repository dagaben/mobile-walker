import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ChunkActivationJob } from "./ChunkActivationJob";
import { ChunkMeshFactory } from "./chunkMeshes";
import { generateChunk } from "./generateChunk";

describe("ChunkActivationJob", () => {
  it("resumes stage-by-stage and presents terrain and major water before decoration", () => {
    const factory = new ChunkMeshFactory();
    const job = new ChunkActivationJob(generateChunk("staged", { x: 0, z: 0 }), factory);
    expect(job.step()?.stage).toBe("terrain");
    expect(job.terrainReady).toBe(false);
    expect(job.group.getObjectByName("terrain")).toBeDefined();
    expect(job.group.getObjectByName("trees")).toBeUndefined();
    expect(job.step()?.stage).toBe("hydrology");
    expect(job.terrainReady).toBe(true);
    expect(job.group.getObjectByName("lake")).toBeDefined();
    expect(job.step()?.stage).toBe("trees");
    expect(job.group.getObjectByName("trees")).toBeDefined();
    expect(job.complete).toBe(false);
    job.cancel();
    expect(job.group.parent).toBeNull();
    factory.dispose();
  });

  it("produces the same named presentation layers as complete creation", () => {
    const factory = new ChunkMeshFactory();
    const data = generateChunk("equivalent", { x: 2, z: -1 });
    const complete = factory.create(data);
    const job = new ChunkActivationJob(data, factory);
    while (!job.complete) job.step();
    expect(job.group.children.map(child => child.name)).toEqual(complete.children.map(child => child.name));
    factory.disposeChunk(complete); factory.disposeChunk(job.group); factory.dispose();
  });

  it("does not construct POI candidate debug geometry while debug presentation is off", () => {
    const factory = new ChunkMeshFactory();
    const debug = vi.spyOn((factory as unknown as { poiMeshes: { createDebug(): THREE.Group } }).poiMeshes, "createDebug");
    const job = new ChunkActivationJob(generateChunk("debug-off", { x: 0, z: 0 }), factory);
    while (!job.complete) job.step();
    expect(debug).not.toHaveBeenCalled();
    factory.disposeChunk(job.group); factory.dispose();
  });
});
