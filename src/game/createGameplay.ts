import * as THREE from "three";

import type { EcsWorld } from "../ecs/createEcsWorld";
import type { SystemScheduler } from "../ecs/SystemScheduler";
import { InputController } from "../player/InputController";
import { InputSnapshotSystem, PlayerMovementSystem, TerrainSamplingSystem, TreeCollisionSystem } from "../player/systems";
import type { ThreeRenderer } from "../rendering/ThreeRenderer";
import { ChunkStreamingSystem } from "../world/ChunkStreamingSystem";
import { CameraPresentationSystem, TransformInterpolationSystem } from "./presentationSystems";
import { CollectionSystem, createCollectionState, ExplorationPresentationSystem, ProximityDetectionSystem } from "./exploration";
import { BiomeDebugPresentationSystem } from "./biomeDebug";

export interface GameplayControllers {
  readonly chunks: ChunkStreamingSystem;
  readonly biomeDebug: BiomeDebugPresentationSystem;
  readonly camera: CameraPresentationSystem;
}

export function createGameplay(
  world: EcsWorld,
  systems: SystemScheduler,
  renderer: ThreeRenderer,
  inputElement: HTMLElement,
  dragIndicator?: HTMLElement,
): GameplayControllers {
  const worldSeed = "mobile-walker-v2";
  const player = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.38, 0.75, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xf28f8f, flatShading: true, roughness: 0.9 }),
  );
  body.castShadow = true;
  player.add(body);

  const eyeGeometry = new THREE.SphereGeometry(0.105, 12, 8);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xfffbf2, roughness: 0.65 });
  const pupilGeometry = new THREE.SphereGeometry(0.048, 10, 8);
  const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x31473a, roughness: 0.75 });
  for (const x of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(x, 0.42, 0.32);
    const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    pupil.position.set(0, 0, 0.09);
    eye.add(pupil);
    player.add(eye);
  }
  renderer.scene.add(player);

  world.add({
    transform: { x: 0, y: 0.76, z: 0, yaw: 0 },
    previousTransform: { x: 0, y: 0.76, z: 0, yaw: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    playerControl: { moveX: 0, moveZ: 0, active: false, jump: false },
    jump: { grounded: true },
    terrainFollower: { heightOffset: 0.76 },
    cameraTarget: { height: 4.5, distance: 6.5 },
    renderable: player,
  });
  world.add({ collectionState: createCollectionState() });
  // Fixed order: snapshot event state, then integrate.
  const input = new InputController(inputElement, dragIndicator);
  systems.addFixedSystem(new InputSnapshotSystem(input));
  systems.addFixedSystem(new PlayerMovementSystem(worldSeed));
  systems.addFixedSystem(new TreeCollisionSystem(worldSeed));
  systems.addFixedSystem(new TerrainSamplingSystem(worldSeed));
  systems.addFixedSystem(new ProximityDetectionSystem());
  systems.addFixedSystem(new CollectionSystem());
  // Generate data before constructing meshes; then interpolate visuals and derive the camera pose.
  // The camera remains south of the player and looks north (negative world Z),
  // so spend the additional streaming row where it expands the visible view.
  const streamingOffsets = { west: 1, east: 1, south: 1, north: 3 } as const;
  const chunks = new ChunkStreamingSystem(renderer.scene, worldSeed, 1, { offsets: streamingOffsets });
  systems.addRenderSystem(chunks);
  systems.addRenderSystem(new ExplorationPresentationSystem(renderer.scene, worldSeed, 1, streamingOffsets));
  systems.addRenderSystem(new TransformInterpolationSystem());
  const camera = new CameraPresentationSystem(renderer.camera, input);
  systems.addRenderSystem(camera);
  const biomeOverlay = document.querySelector<HTMLElement>("#biome-guide");
  const biomeLabel = document.querySelector<HTMLElement>("#current-biome-name");
  if (!biomeOverlay || !biomeLabel) throw new Error("Biome guide elements could not be found.");
  const biomeDebug = new BiomeDebugPresentationSystem(worldSeed, biomeOverlay, biomeLabel);
  systems.addRenderSystem(biomeDebug);
  return { chunks, biomeDebug, camera };
}
