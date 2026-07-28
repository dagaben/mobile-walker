import { World } from "miniplex";

import type { Entity } from "./Entity";

export type EcsWorld = World<Entity>;

export function createEcsWorld(): EcsWorld {
  return new World<Entity>();
}
