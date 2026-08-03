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
  gameOver: boolean;
}

export function createCombatState(): GameCombatState {
  return { garlicCount: 0, lives: 5, invulnTimer: 0, score: 0, gameOver: false };
}

export const VD_GAME_OVER_EVENT = "vd-game-over";

function createDuckMesh(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffdd44, roughness: 0.7, flatShading: true }),
  );
  body.position.y = 0.45;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffdd44, roughness: 0.7, flatShading: true }),
  );
  head.position.set(0, 0.85, 0.25);
  head.castShadow = true;
  group.add(head);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.28, 6),
    new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.8, flatShading: true }),
  );
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.82, 0.52);
  group.add(beak);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2222, roughness: 0.4 });
  for (const x of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeMat);
    eye.position.set(x, 0.92, 0.48);
    group.add(eye);
  }
  const wingGeo = new THREE.BoxGeometry(0.08, 0.35, 0.5);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xe8c020, roughness: 0.75, flatShading: true });
  for (const x of [-0.42, 0.42]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(x, 0.5, 0);
    wing.rotation.z = x > 0 ? -0.4 : 0.4;
    group.add(wing);
  }
  return group;
}

export class DuckSpawnSystem implements FixedSystem {
  private timer = 0;
  constructor(
    private readonly scene: THREE.Scene,
    private readonly worldSeed: string | number,
    private readonly prepareWorldObject: (object: THREE.Object3D) => void = () => undefined,
  ) {}

  fixedUpdate(world: EcsWorld, deltaSeconds: number): void {
    const dayNight = world.entities.find((e) => e.dayNight)?.dayNight;
    if (!dayNight || dayNight.isDay) {
      this.timer = 0;
      for (const entity of [...world.entities]) {
        if (entity.duck && entity.duck.state !== "petrified") {
          if (entity.renderable) {
            entity.renderable.removeFromParent();
          }
          world.remove(entity);
        }
      }
      return;
    }
    const live = world.entities.filter((e) => e.duck && e.duck.state !== "petrified").length;
    if (live >= MAX_DUCKS) return;
    this.timer += deltaSeconds;
    if (this.timer < DUCK_SPAWN_INTERVAL) return;
    this.timer = 0;
    const player = world.entities.find((e) => e.playerControl && e.transform);
    if (!player?.transform) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = 12 + Math.random() * 8;
    const x = player.transform.x + Math.cos(angle) * dist;
    const z = player.transform.z + Math.sin(angle) * dist;
    const y = sampleTerrainHeight(this.worldSeed, x, z) + 0.45;
    const mesh = createDuckMesh();
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.prepareWorldObject(mesh);
    world.add({
      transform: { x, y, z, yaw: 0 },
      previousTransform: { x, y, z, yaw: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      duck: { state: "alive", petrifyTimer: 0 },
      renderable: mesh,
    });
  }
}

export class DuckAISystem implements FixedSystem {
  private readonly worldSeed: string | number;
  constructor(
    worldSeed: string | number,
    private readonly garlicLabel?: HTMLElement | null,
    private readonly livesLabel?: HTMLElement | null,
    private readonly scoreLabel?: HTMLElement | null,
  ) {
    this.worldSeed = worldSeed;
  }

  fixedUpdate(world: EcsWorld, deltaSeconds: number): void {
    const combat = world.entities.find((e) => e.combat)?.combat;
    const player = world.entities.find((e) => e.playerControl && e.transform);
    if (!combat || !player?.transform || combat.gameOver) return;

    combat.score += deltaSeconds * 2;
    this.syncHud(combat);

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
      entity.transform.y = sampleTerrainHeight(this.worldSeed, entity.transform.x, entity.transform.z) + 0.45;
      entity.transform.yaw = Math.atan2(dx, dz);
      if (entity.renderable) {
        entity.renderable.position.set(entity.transform.x, entity.transform.y, entity.transform.z);
        entity.renderable.rotation.y = entity.transform.yaw;
      }
      if (combat.invulnTimer > 0) continue;
      if (dist < DUCK_HIT_RADIUS) {
        if (combat.garlicCount >= GARLIC_PETRIFY_COST) {
          combat.garlicCount -= GARLIC_PETRIFY_COST;
          combat.score += 50;
          entity.duck.state = "petrified";
          entity.duck.petrifyTimer = 8;
          if (entity.renderable) {
            entity.renderable.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                if (mesh.material && !Array.isArray(mesh.material)) {
                  (mesh.material as THREE.MeshStandardMaterial).color?.set(0x6688cc);
                }
              }
            });
          }
          this.syncHud(combat);
        } else {
          combat.lives -= 1;
          combat.invulnTimer = INVULN_SECONDS;
          this.syncHud(combat);
          if (combat.lives <= 0) {
            combat.lives = 0;
            combat.gameOver = true;
            this.syncHud(combat);
            window.dispatchEvent(
              new CustomEvent(VD_GAME_OVER_EVENT, {
                detail: { score: Math.floor(combat.score) },
              }),
            );
          }
        }
      }
    }
  }

  private syncHud(combat: GameCombatState): void {
    const garlicText = String(combat.garlicCount);
    if (this.garlicLabel) this.garlicLabel.textContent = garlicText;
    const garlicHud = document.getElementById("garlic-count");
    if (garlicHud) garlicHud.textContent = garlicText;
    const mushroomHud = document.getElementById("mushroom-count");
    if (mushroomHud && mushroomHud !== this.garlicLabel) mushroomHud.textContent = garlicText;
    if (this.livesLabel) this.livesLabel.textContent = String(combat.lives);
    if (this.scoreLabel) this.scoreLabel.textContent = String(Math.floor(combat.score));
  }
}

export class GarlicScoreSystem implements FixedSystem {
  private lastDiscovered = 0;
  constructor(
    private readonly garlicLabel?: HTMLElement | null,
    private readonly onCollect?: (gained: number, isSuper: boolean) => void,
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
