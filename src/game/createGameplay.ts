import * as THREE from "three";

import type { EcsWorld } from "../ecs/createEcsWorld";
import type { SystemScheduler } from "../ecs/SystemScheduler";
import { InputController } from "../player/InputController";
import { InputSnapshotSystem, PlayerMovementSystem, StructureCollisionSystem, TerrainSamplingSystem, TreeCollisionSystem } from "../player/systems";
import type { ThreeRenderer } from "../rendering/ThreeRenderer";
import { ChunkStreamingSystem } from "../world/ChunkStreamingSystem";
import { CameraPresentationSystem, PlayerFogPresentationSystem, PlayerShadowPresentationSystem, TransformInterpolationSystem } from "./presentationSystems";
import { createBlobShadowMaterial, createPlayerShadowGeometry, markBlobShadow } from "../rendering/blobShadows";
import { CollectionSystem, createCollectionState, ExplorationPresentationSystem, ProximityDetectionSystem } from "./exploration";
import { BiomeDebugPresentationSystem } from "./biomeDebug";
import { createDayNightState, DayNightSystem } from "./dayNight";
import { createCombatState, DuckAISystem, DuckSpawnSystem } from "./ducks";
import { getBrowserStorage, loadGameState, PersistenceSystem } from "./persistence";
import { findSafeRestoredTransform } from "../world/safePlayerPosition";
import { PLAYER_COLLISION_RADIUS } from "../world/treeCollision";
import { PoiDebugPresentationSystem } from "./poiDebug";
import { createCatDogMesh } from "../player/catDog";
import { installGameOverUi } from "./gameOverUi";

export interface GameplayControllers {
  readonly chunks: ChunkStreamingSystem;
  readonly biomeDebug: BiomeDebugPresentationSystem;
  readonly poiDebug: PoiDebugPresentationSystem;
  readonly camera: CameraPresentationSystem;
  readonly persistence: PersistenceSystem;
  readonly exploration: ExplorationPresentationSystem;
  readonly playerShadow: THREE.Mesh;
}

export function createGameplay(
  world: EcsWorld,
  systems: SystemScheduler,
  renderer: ThreeRenderer,
  inputElement: HTMLElement,
  dragIndicator?: HTMLElement,
): GameplayControllers {
  const worldSeed = "vampire-ducks-v2";
  const storage = getBrowserStorage();
  const savedState = loadGameState(storage, worldSeed);
  const initialTransform = findSafeRestoredTransform(
    worldSeed,
    savedState?.player ?? { x: 0, y: 0.76, z: 0, yaw: 0 },
    0.76,
    PLAYER_COLLISION_RADIUS,
    0.5,
    5,
  );
  const player = createCatDogMesh(0.95);
  renderer.scene.add(player);
  renderer.prepareWorldObject(player);
  const playerShadow = markBlobShadow(new THREE.Mesh(
    createPlayerShadowGeometry(), createBlobShadowMaterial(0.36),
  ));
  playerShadow.scale.set(0.58, 1, 0.43);
  renderer.scene.add(playerShadow);
  renderer.prepareWorldObject(playerShadow);

  world.add({
    transform: { ...initialTransform },
    previousTransform: { ...initialTransform },
    velocity: { x: 0, y: 0, z: 0 },
    playerControl: { moveX: 0, moveZ: 0, active: false, jump: false },
    jump: { grounded: true },
    terrainFollower: { heightOffset: 0.76 },
    structureSupport: {},
    cameraTarget: { height: 4.5, distance: 6.5 },
    renderable: player,
  });
  world.add({ collectionState: createCollectionState(savedState?.collectedIds) });
  world.add({ dayNight: createDayNightState(true) });
  world.add({ combat: createCombatState() });
  const input = new InputController(inputElement, dragIndicator);
  const camera = new CameraPresentationSystem(renderer.camera, input);
  systems.addFixedSystem(new InputSnapshotSystem(input, () => camera.getMovementReferenceYaw()));
  systems.addFixedSystem(new PlayerMovementSystem(worldSeed));
  const persistence = new PersistenceSystem(storage, worldSeed);
  const streamingOffsets = { west: 1, east: 1, south: 1, north: 4 } as const;
  const chunks = new ChunkStreamingSystem(renderer.scene, worldSeed, 1, {
    offsets: streamingOffsets,
    sunlightDirection: renderer.sunlightDirection,
    prepareWorldObject: (object) => renderer.prepareWorldObject(object),
  });
  systems.addFixedSystem(new TreeCollisionSystem(worldSeed, chunks.repository));
  systems.addFixedSystem(new StructureCollisionSystem(chunks.repository));
  systems.addFixedSystem(new TerrainSamplingSystem(worldSeed));
  systems.addFixedSystem(new ProximityDetectionSystem());
  systems.addFixedSystem(new CollectionSystem());
  const mushroomCount = document.querySelector<HTMLElement>("#mushroom-count");
  if (!mushroomCount) throw new Error("The garlic counter could not be found.");
  // Top-right visible counter is #mushroom-count; keep #garlic-count in sync if present.
  const garlicCount = mushroomCount;
  const livesCount = document.querySelector<HTMLElement>("#lives-count");
  const scoreCount = document.querySelector<HTMLElement>("#score-count");
  systems.addFixedSystem(new DayNightSystem(renderer, null, (isDay) => {
    void isDay;
  }));
  systems.addFixedSystem(
    new DuckSpawnSystem(renderer.scene, worldSeed, (object) => renderer.prepareWorldObject(object)),
  );
  systems.addFixedSystem(new DuckAISystem(worldSeed, garlicCount, livesCount, scoreCount));
  systems.addFixedSystem(persistence);
  systems.addRenderSystem(chunks);
  const exploration = new ExplorationPresentationSystem(renderer.scene, worldSeed, 1, streamingOffsets, garlicCount, chunks.repository, (object) => renderer.prepareWorldObject(object));
  systems.addRenderSystem(exploration);
  systems.addRenderSystem(new TransformInterpolationSystem());
  systems.addRenderSystem(new PlayerFogPresentationSystem((x, z) => renderer.playerCentredFog.update(x, z)));
  systems.addRenderSystem(new PlayerShadowPresentationSystem(worldSeed, playerShadow, renderer.sunlightDirection));
  systems.addRenderSystem(camera);
  const biomeOverlay = document.querySelector<HTMLElement>("#biome-guide");
  const biomeLabel = document.querySelector<HTMLElement>("#current-biome-name");
  if (!biomeOverlay || !biomeLabel) throw new Error("Biome guide elements could not be found.");
  const biomeDebug = new BiomeDebugPresentationSystem(worldSeed, biomeOverlay, biomeLabel, () => camera.getFacingYaw());
  systems.addRenderSystem(biomeDebug);
  const poiOverlay = document.querySelector<HTMLElement>("#poi-guide");
  if (!poiOverlay) throw new Error("The POI guide element could not be found.");
  const poiDebug = new PoiDebugPresentationSystem(chunks.repository, poiOverlay, () => camera.getFacingYaw());
  systems.addRenderSystem(poiDebug);
  installGameOverUi();
  return { chunks, biomeDebug, poiDebug, camera, persistence, exploration, playerShadow };
}
