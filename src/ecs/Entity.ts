import type { Object3D } from "three";

export interface TransformComponent {
  x: number;
  y: number;
  z: number;
}

export interface Entity {
  transform?: TransformComponent;
  renderable?: Object3D;
}
