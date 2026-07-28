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
}

export interface CameraTargetComponent {
  height: number;
  distance: number;
}

export interface TerrainFollowerComponent { heightOffset: number }

export interface InteractableComponent {
  /** Stable simulation identity, independent of its streamed presentation. */
  id: string;
  kind: "waystone" | "memory";
  collectionRadius: number;
}

export interface ProximityComponent { withinRange: boolean }
export interface ChunkResidentComponent { chunkId: string }

export interface CollectionStateComponent {
  /** This state lives on a non-streamed entity, so unloading a chunk cannot erase it. */
  collectedIds: Set<string>;
}

export interface Entity {
  transform?: TransformComponent;
  previousTransform?: PreviousTransformComponent;
  velocity?: VelocityComponent;
  playerControl?: PlayerControlComponent;
  cameraTarget?: CameraTargetComponent;
  terrainFollower?: TerrainFollowerComponent;
  interactable?: InteractableComponent;
  proximity?: ProximityComponent;
  chunkResident?: ChunkResidentComponent;
  collectionState?: CollectionStateComponent;
  /** Presentation-only bridge; gameplay systems must not read this object. */
  renderable?: Object3D;
}
