import * as THREE from "three";

import type { EcsWorld } from "../ecs/createEcsWorld";
import type { SystemScheduler } from "../ecs/SystemScheduler";
import { InputController } from "../player/InputController";
import { InputSnapshotSystem, PlayerMovementSystem } from "../player/systems";
import type { ThreeRenderer } from "../rendering/ThreeRenderer";
import { ChunkStreamingSystem } from "../world/ChunkStreamingSystem";
import { CameraPresentationSystem, TransformInterpolationSystem } from "./presentationSystems";

export function createGameplay(world: EcsWorld, systems: SystemScheduler, renderer: ThreeRenderer, inputElement: HTMLElement): void {
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
    cameraTarget: { height: 4.5, distance: 6.5 },
    renderable: playerMesh,
  });
  // Fixed order: snapshot event state, then integrate.
  systems.addFixedSystem(new InputSnapshotSystem(new InputController(inputElement)));
  systems.addFixedSystem(new PlayerMovementSystem());
  // Generate data before constructing meshes; then interpolate visuals and derive the camera pose.
  systems.addRenderSystem(new ChunkStreamingSystem(renderer.scene, "mobile-walker-v1", 1));
  systems.addRenderSystem(new TransformInterpolationSystem());
  systems.addRenderSystem(new CameraPresentationSystem(renderer.camera));
}
