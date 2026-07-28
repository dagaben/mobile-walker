import * as THREE from "three";

import type { EcsWorld } from "../ecs/createEcsWorld";
import type { SystemScheduler } from "../ecs/SystemScheduler";
import { InputController } from "../player/InputController";
import { InputSnapshotSystem, PlayerMovementSystem, TerrainSamplingSystem } from "../player/systems";
import type { ThreeRenderer } from "../rendering/ThreeRenderer";
import { ChunkStreamingSystem } from "../world/ChunkStreamingSystem";
import { ExplorationPresentationSystem } from "./exploration/presentation";
import { CollectionSystem, ProximityDetectionSystem } from "./exploration/systems";
import { CameraPresentationSystem, TransformInterpolationSystem } from "./presentationSystems";

export function createGameplay(world: EcsWorld, systems: SystemScheduler, renderer: ThreeRenderer, inputElement: HTMLElement): void {
  const worldSeed = "mobile-walker-v1";
  const playerMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.38, 0.75, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xf28f8f, flatShading: true, roughness: 0.9 }),
  );
  playerMesh.castShadow = true;
  renderer.scene.add(playerMesh);

  world.add({
    transform: { x: 0, y: 0.76, z: 0, yaw: Math.PI },
    previousTransform: { x: 0, y: 0.76, z: 0, yaw: Math.PI },
    velocity: { x: 0, y: 0, z: 0 },
    playerControl: { moveX: 0, moveZ: 0, active: false },
    terrainFollower: { heightOffset: 0.76 },
    cameraTarget: { height: 4.5, distance: 6.5 },
    renderable: playerMesh,
  });
  world.add({ collectionState: { collectedIds: new Set() } });
  // Fixed order: snapshot event state, then integrate.
  systems.addFixedSystem(new InputSnapshotSystem(new InputController(inputElement)));
  systems.addFixedSystem(new PlayerMovementSystem());
  systems.addFixedSystem(new TerrainSamplingSystem(worldSeed));
  systems.addFixedSystem(new ProximityDetectionSystem());
  systems.addFixedSystem(new CollectionSystem());
  // Generate data before constructing meshes; then interpolate visuals and derive the camera pose.
  systems.addRenderSystem(new ChunkStreamingSystem(renderer.scene, worldSeed, 1));
  const status = document.querySelector<HTMLElement>(".status");
  if (!status) throw new Error("The exploration status element could not be found.");
  systems.addRenderSystem(new ExplorationPresentationSystem(renderer.scene, worldSeed, status, 1));
  systems.addRenderSystem(new TransformInterpolationSystem());
  systems.addRenderSystem(new CameraPresentationSystem(renderer.camera));
}
