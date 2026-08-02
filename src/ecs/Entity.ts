import type { Object3D } from "three";

/** Plain simulation vector. Deliberately not a THREE.Vector3. */
export interface Vector3Component { x: number; y: number; z: number }

export interface TransformComponent extends Vector3Component { yaw: number }
export type PreviousTransformComponent = TransformComponent;
export type VelocityComponent = Vector3Component;

export interface PlayerControlComponent {
  moveX: number;
  moveZ: number;
  active: boolean;
  jump: boolean;
}

export interface JumpComponent { grounded: boolean }

export interface CameraTargetComponent {
  height: number;
  distance: number;
}

export interface TerrainFollowerComponent { heightOffset: number }
export interface StructureSupportComponent { surfaceId?: string }

/** Seeded identity and interaction data. Kept independent of its Three.js view. */
export interface InteractableComponent {
  id: string;
  kind: "waypoint";
  collectionRadius: number;
  chunkId: string;
}

export interface ProximityComponent { inRange: boolean }

/** Long-lived exploration state. The owning entity is never streamed out. */
export interface CollectionStateComponent {
  collectedIds: Set<string>;
  discovered: number;
}

export interface Entity {
  transform?: TransformComponent;
  previousTransform?: PreviousTransformComponent;
  velocity?: VelocityComponent;
  playerControl?: PlayerControlComponent;
  jump?: JumpComponent;
  cameraTarget?: CameraTargetComponent;
  terrainFollower?: TerrainFollowerComponent;
  structureSupport?: StructureSupportComponent;
  interactable?: InteractableComponent;
  proximity?: ProximityComponent;
  collectionState?: CollectionStateComponent;
  /** Presentation-only bridge; gameplay systems must not read this object. */
  renderable?: Object3D;
}
