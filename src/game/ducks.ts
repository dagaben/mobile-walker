import * as THREE from "three";

import type { EcsWorld } from "../ecs/createEcsWorld";
import type { FixedSystem } from "../ecs/System";
import { sampleTerrainHeight } from "../world/terrainSampling";

const DUCK_SPAWN_INTERVAL = 6.5;
const DUCK_SPEED = 5.2;
const DUCK_HIT_RADIUS = 1.15;
const MAX_DUCKS = 8;
const GARLIC_PETRIFY_COST = 10;
const INVULN_SECONDS = 1.6;

export interface GameCombatState {
  garlicCount: number;
  lives: number;
  invulnTimer: number;
  score: number;
}

export function createCombatState(): GameCombatState {
  return { garlicCount: 0, lives: 5, invulnTimer: 0, score: 0 };
}

function createDuckMesh(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffdd44, roughness: 0.7, flatShading: true }),
  );
  body.scale.set(1.15, 0.85, 1.25);
  body.position.y = 0.35;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.7, flatShading: true }),
  );
  head.position.set(0, 0.72, 0.28);
  head.castShadow = true;
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.28, 6),
    new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.8, flatShading: true }),
  );
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.68, 0.52);
  const cape = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.7, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b0f1a, roughness: 0.85, flatShading: true }),
  );
  cape.position.set(0, 0.35, -0.2);
  cape.rotation.x = 0.4;
  group.add(body, head, beak, cape);
  return group;
}

/** Spawns ducks near the player only at night; clears them at dawn. */
export class DuckSpawnSystem implements FixedSystem {
  private spawnTimer = 2;
  private readonly worldSeed: string | number;

  constructor(
    private readonly scene: THREE.Scene,
    worldSeed: string | number,
    private readonly prepareWorldObject: (o: THREE.Object3D) => void = () => undefined,
  ) {
    this.worldSeed = worldSeed;
  }

  fixedUpdate(world: EcsWorld, deltaSeconds: number): void {
    const dayNight = world.entities.find((e) => e.dayNight)?.dayNight;
    const combat = world.entities.find((e) => e.combat)?.combat;
    if (!dayNight || !combat) return;

    if (dayNight.isDay) {
      for (const entity of [...world.entities]) {
        if (entity.duck && entity.renderable) {
          entity.renderable.removeFromParent();
          world.remove(entity);
        }
      }
      this.spawnTimer = 2;
      return;
    }

    const duckCount = world.entities.filter((e) => e.duck && e.duck.state === "alive").length;
    this.spawnTimer -= deltaSeconds;
    if (this.spawnTimer > 0 || duckCount >= MAX_DUCKS) return;
    this.spawnTimer = DUCK_SPAWN_INTERVAL;

    const player = world.entities.find((e) => e.playerControl && e.transform);
    if (!player?.transform) return;

    const angle = Math.random() * Math.PI * 2;
    const dist = 18 + Math.random() * 12;
    const x = player.transform.x + Math.cos(angle) * dist;
    const z = player.transform.z + Math.sin(angle) * dist;
    const y = sampleTerrainHeight(this.worldSeed, x, z) + 0.35;

    const mesh = createDuckMesh();
    mesh.position.set(x, y, z);
    this.prepareWorldObject(mesh);
    this.scene.add(mesh);

    world.add({
      transform: { x, y, z, yaw: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      duck: { state: "alive", petrifyTimer: 0 },
      renderable: mesh,
    });
  }
}

/** Chase player; petrify with garlic or cost a life on contact. */
export class DuckAISystem implements FixedSystem {
  private readonly worldSeed: string | number;

  constructor(
    worldSeed: string | number,
    private readonly garlicLabel?: HTMLElement | null,
    private readonly livesLabel?: HTMLElement | null,
  ) {
    this.worldSeed = worldSeed;
  }

  fixedUpdate(world: EcsWorld, deltaSeconds: number): void {
    const player = world.entities.find((e) => e.playerControl && e.transform);
    const combat = world.entities.find((e) => e.combat)?.combat;
    if (!player?.transform || !combat) return;

    if (combat.invulnTimer > 0) {
      combat.invulnTimer = Math.max(0, combat.invulnTimer - deltaSeconds);
      if (player.renderable) {
        player.renderable.visible = Math.floor(combat.invulnTimer * 10) % 2 === 0;
      }
    } else if (player.renderable) {
      player.renderable.visible = true;
    }

    for (const entity of world.entities) {
      if (!entity.duck || !entity.transform || !entity.velocity) continue;

      if (entity.duck.state === "petrified") {
        entity.duck.petrifyTimer -= deltaSeconds;
        if (entity.duck.petrifyTimer <= 0) {
          if (entity.renderable) entity.renderable.removeFromParent();
          world.remove(entity);
        }
        continue;
      }

      const dx = player.transform.x - entity.transform.x;
      const dz = player.transform.z - entity.transform.z;
      const dist = Math.hypot(dx, dz) || 1;
      entity.velocity.x = (dx / dist) * DUCK_SPEED;
      entity.velocity.z = (dz / dist) * DUCK_SPEED;
      entity.transform.x += entity.velocity.x * deltaSeconds;
      entity.transform.z += entity.velocity.z * deltaSeconds;
      entity.transform.y = sampleTerrainHeight(this.worldSeed, entity.transform.x, entity.transform.z) + 0.35;
      entity.transform.yaw = Math.atan2(dx, dz);

      if (entity.renderable) {
        entity.renderable.position.set(entity.transform.x, entity.transform.y, entity.transform.z);
        entity.renderable.rotation.y = entity.transform.yaw;
      }

      if (dist < DUCK_HIT_RADIUS && combat.invulnTimer <= 0) {
        if (combat.garlicCount >= GARLIC_PETRIFY_COST) {
          combat.garlicCount -= GARLIC_PETRIFY_COST;
          combat.score += 50;
          entity.duck.state = "petrified";
          entity.duck.petrifyTimer = 8;
          if (entity.renderable) {
            entity.renderable.traverse((child) => {
              if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                child.material = child.material.clone();
                child.material.color.setHex(0x88aacc);
                child.material.transparent = true;
                child.material.opacity = 0.55;
              }
            });
          }
          this.syncHud(combat);
        } else {
          combat.lives -= 1;
          combat.invulnTimer = INVULN_SECONDS;
          this.syncHud(combat);
          if (combat.lives <= 0) {
            combat.lives = 5;
            combat.garlicCount = Math.max(0, combat.garlicCount);
            this.syncHud(combat);
          }
        }
      }
    }
  }

  private syncHud(combat: GameCombatState): void {
    if (this.garlicLabel) this.garlicLabel.textContent = String(combat.garlicCount);
    if (this.livesLabel) this.livesLabel.textContent = String(combat.lives);
  }
}

/** Optional helper: sync garlic from collection discovered count. */
export class GarlicScoreSystem implements FixedSystem {
  private lastDiscovered = 0;

  constructor(
    private readonly garlicLabel?: HTMLElement | null,
    private readonly onCollect?: (value: number, isSuper: boolean) => void,
  ) {}

  fixedUpdate(world: EcsWorld): void {
    const state = world.entities.find((e) => e.collectionState)?.collectionState;
    const combat = world.entities.find((e) => e.combat)?.combat;
    if (!state || !combat) return;
    if (state.discovered > this.lastDiscovered) {
      const gained = state.discovered - this.lastDiscovered;
      this.lastDiscovered = state.discovered;
      if (this.garlicLabel) this.garlicLabel.textContent = String(combat.garlicCount);
      this.onCollect?.(gained, false);
    }
  }
}
