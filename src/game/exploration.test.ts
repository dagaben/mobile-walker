import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createEcsWorld } from "../ecs/createEcsWorld";
import { CHUNK_SIZE } from "../world/chunkCoordinates";
import { createCollectionState, ExplorationPresentationSystem, placeCollectibles } from "./exploration";

function presentationFixture() {
  const scene = new THREE.Scene();
  const world = createEcsWorld();
  const player = world.add({
    transform: { x: CHUNK_SIZE - 1, y: 0, z: CHUNK_SIZE - 1, yaw: 0 },
    playerControl: { moveX: 0, moveZ: 0, active: false, jump: false },
  });
  world.add({ collectionState: createCollectionState() });
  const system = new ExplorationPresentationSystem(scene, "stable-collectibles", 1);
  const collectibles = () => world.entities.filter((entity) => entity.interactable);
  return { collectibles, player, scene, system, world };
}

describe("exploration placement", () => {
  it("is deterministic and random-access by seed and chunk", () => {
    const coordinate = { x: -3, z: 7 };
    expect(placeCollectibles("trail", coordinate)).toEqual(placeCollectibles("trail", coordinate));
    expect(placeCollectibles("another-trail", coordinate)).not.toEqual(placeCollectibles("trail", coordinate));
    expect(placeCollectibles("trail", { x: -2, z: 7 })).not.toEqual(placeCollectibles("trail", coordinate));
  });

  it("keeps collection state while placements are unloaded and regenerated", () => {
    const coordinate = { x: 4, z: -2 };
    const loaded = placeCollectibles("persistent-world", coordinate);
    const state = createCollectionState();
    state.collectedIds.add(loaded[0]!.id);
    state.discovered = state.collectedIds.size;

    // Dropping the streamed array represents unloading; generation has no mutable cache.
    const reloaded = placeCollectibles("persistent-world", coordinate);
    expect(reloaded).toEqual(loaded);
    expect(state.collectedIds.has(reloaded[0]!.id)).toBe(true);
    expect(state.discovered).toBe(1);
  });
});

describe("exploration presentation neighborhood", () => {
  it("retains collectible entities while moving within 0.5 units of a seam", () => {
    const { collectibles, player, scene, system, world } = presentationFixture();
    system.prepareRender(world);
    const initial = collectibles();

    for (const x of [CHUNK_SIZE + 0.1, CHUNK_SIZE - 0.1, CHUNK_SIZE + 0.49]) {
      player.transform!.x = x;
      system.prepareRender(world);
      expect(collectibles()).toEqual(initial);
      expect(scene.children).toHaveLength(initial.length);
    }

    system.dispose();
  });

  it("stabilizes a four-chunk intersection and updates the neighborhood only once past the threshold", () => {
    const { collectibles, player, system, world } = presentationFixture();
    system.prepareRender(world);
    const initial = collectibles();

    for (const offset of [0.1, -0.1, 0.49]) {
      player.transform!.x = CHUNK_SIZE + offset;
      player.transform!.z = CHUNK_SIZE - offset;
      system.prepareRender(world);
      expect(collectibles()).toEqual(initial);
    }

    player.transform!.x = CHUNK_SIZE + 0.51;
    player.transform!.z = CHUNK_SIZE + 0.51;
    system.prepareRender(world);
    const transitioned = collectibles();
    expect(transitioned).toHaveLength(initial.length);
    expect(transitioned.filter((entity) => initial.includes(entity))).toHaveLength(8);

    system.prepareRender(world);
    expect(collectibles()).toEqual(transitioned);

    system.dispose();
  });
});
