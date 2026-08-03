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
  kind: "waypoint" | "garlic";
  collectionRadius: number;
  chunkId: string;
  /** Garlic value (1 normal, 10 super). */
  value?: number;
  isSuper?: boolean;
}

export interface ProximityComponent { inRange: boolean }

/** Long-lived exploration state. The owning entity is never streamed out. */
export interface CollectionStateComponent {
  collectedIds: Set<string>;
  discovered: number;
  /** Running total of garlic value collected this session. */
  garlicValue?: number;
}

export interface DuckComponent {
  state: "alive" | "petrified";
  petrifyTimer: number;
  /** Super Boss rubber duck (3× size, high petrify cost). */
  isBoss?: boolean;
  /** Override petrify garlic cost (bosses use 30). */
  petrifyCost?: number;
  /** Hit radius override (bosses are larger). */
  hitRadius?: number;
  /** Chase speed multiplier vs base difficulty duck speed. */
  speedScale?: number;
}

export interface DayNightComponent {
  isDay: boolean;
  phaseTime: number;
  lightBlend: number;
  /** Nights started this run (0 before first dusk). */
  nightCount: number;
}

export interface CombatComponent {
  garlicCount: number;
  lives: number;
  invulnTimer: number;
  score: number;
  gameOver: boolean;
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
  duck?: DuckComponent;
  dayNight?: DayNightComponent;
  combat?: CombatComponent;
  /** Presentation-only bridge; gameplay systems must not read this object. */
  renderable?: Object3D;
}
