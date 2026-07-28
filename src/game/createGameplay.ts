import * as THREE from "three";

import type { EcsWorld } from "../ecs/createEcsWorld";
import type { SystemScheduler } from "../ecs/SystemScheduler";
import { InputController } from "../player/InputController";
import { BoundsCollisionSystem, InputSnapshotSystem, PlayerMovementSystem } from "../player/systems";
import type { ThreeRenderer } from "../rendering/ThreeRenderer";
import { CameraPresentationSystem, TransformInterpolationSystem } from "./presentationSystems";

const GROUND_SIZE = 18;

export function createGameplay(world: EcsWorld, systems: SystemScheduler, renderer: ThreeRenderer, inputElement: HTMLElement): void {
  const playerMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.38, 0.75, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xf28f8f, flatShading: true, roughness: 0.9 }),
  );
  playerMesh.castShadow = true;
  renderer.scene.add(playerMesh);

  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ color: 0xb9d8ad, flatShading: true, roughness: 1 }),
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  renderer.scene.add(groundMesh);

  world.add({
    transform: { x: 0, y: 0.76, z: 0, yaw: Math.PI },
    previousTransform: { x: 0, y: 0.76, z: 0, yaw: Math.PI },
    velocity: { x: 0, y: 0, z: 0 },
    playerControl: { moveX: 0, moveZ: 0, active: false },
    cameraTarget: { height: 4.5, distance: 6.5 },
    renderable: playerMesh,
  });
  world.add({
    transform: { x: 0, y: 0, z: 0, yaw: 0 },
    bounds: { halfWidth: GROUND_SIZE / 2 - 0.4, halfDepth: GROUND_SIZE / 2 - 0.4 },
    renderable: groundMesh,
  });

  // Fixed order: snapshot event state, integrate, then constrain the result.
  systems.addFixedSystem(new InputSnapshotSystem(new InputController(inputElement)));
  systems.addFixedSystem(new PlayerMovementSystem());
  systems.addFixedSystem(new BoundsCollisionSystem());
  // Render order: interpolate all visuals before deriving the camera pose.
  systems.addRenderSystem(new TransformInterpolationSystem());
  systems.addRenderSystem(new CameraPresentationSystem(renderer.camera));
}
