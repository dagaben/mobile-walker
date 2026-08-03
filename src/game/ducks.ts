import * as THREE from "three";

import type { EcsWorld } from "../ecs/createEcsWorld";
import type { FixedSystem } from "../ecs/System";
import { sampleTerrainHeight } from "../world/terrainSampling";
import { getDifficulty } from "./difficulty";

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

function createDuckMesh(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.45 * scale, 10, 8),
    new THREE.MeshStandardMaterial({
      color: scale > 1.5 ? 0xff4444 : 0xffdd44,
      roughness: 0.7,
      flatShading: true,
    }),
  );
  body.position.y = 0.45 * scale;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32 * scale, 10, 8),
    new THREE.MeshStandardMaterial({
      color: scale > 1.5 ? 0xff6666 : 0xffdd44,
      roughness: 0.7,
      flatShading: true,
    }),
  );
  head.position.set(0, 0.85 * scale, 0.25 * scale);
  head.castShadow = true;
  group.add(head);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.12 * scale, 0.28 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.8, flatShading: true }),
  );
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.82 * scale, 0.52 * scale);
  group.add(beak);
  const eyeMat = new THREE.MeshStandardMaterial({ color: scale > 1.5 ? 0xaa00ff : 0xff2222, roughness: 0.4 });
  for (const x of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07 * scale, 6, 6), eyeMat);
    eye.position.set(x * scale, 0.92 * scale, 0.48 * scale);
    group.add(eye);
  }
  const wingGeo = new THREE.BoxGeometry(0.08 * scale, 0.35 * scale, 0.5 * scale);
  const wingMat = new THREE.MeshStandardMaterial({
    color: scale > 1.5 ? 0xcc2020 : 0xe8c020,
    roughness: 0.75,
    flatShading: true,
  });
  for (const x of [-0.42, 0.42]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(x * scale, 0.5 * scale, 0);
    wing.rotation.z = x > 0 ? -0.4 : 0.4;
    group.add(wing);
  }
  if (scale > 1.5) {
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.2 * scale, 0.35 * scale, 5),
      new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.4, roughness: 0.35, flatShading: true }),
    );
    crown.position.set(0, 1.15 * scale, 0);
    group.add(crown);
  }
  return group;
}

export class DuckSpawnSystem implements FixedSystem {
  private timer = 0;
  private bossTimer = 0;
  constructor(
    private readonly scene: THREE.Scene,
    private readonly worldSeed: string | number,
    private readonly prepareWorldObject: (object: THREE.Object3D) => void = () => undefined,
  ) {}

  private spawnOne(
    world: EcsWorld,
    px: number,
    pz: number,
    opts: { isBoss: boolean; scale: number; petrifyCost: number; hitRadius: number; speedScale: number },
  ): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = (opts.isBoss ? 18 : 12) + Math.random() * (opts.isBoss ? 10 : 8);
    const x = px + Math.cos(angle) * dist;
    const z = pz + Math.sin(angle) * dist;
    const y = sampleTerrainHeight(this.worldSeed, x, z) + 0.45 * opts.scale;
    const mesh = createDuckMesh(opts.scale);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.prepareWorldObject(mesh);
    world.add({
      transform: { x, y, z, yaw: 0 },
      previousTransform: { x, y, z, yaw: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      duck: {
        state: "alive",
        petrifyTimer: 0,
        isBoss: opts.isBoss,
        petrifyCost: opts.petrifyCost,
        hitRadius: opts.hitRadius,
        speedScale: opts.speedScale,
      },
      renderable: mesh,
    });
  }

  fixedUpdate(world: EcsWorld, deltaSeconds: number): void {
    const dayNight = world.entities.find((e) => e.dayNight)?.dayNight;
    if (!dayNight || dayNight.isDay) {
      this.timer = 0;
      this.bossTimer = 0;
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
    const difficulty = getDifficulty(dayNight.nightCount || 1);
    const player = world.entities.find((e) => e.playerControl && e.transform);
    if (!player?.transform) return;

    const liveRegular = world.entities.filter(
      (e) => e.duck && e.duck.state !== "petrified" && !e.duck.isBoss,
    ).length;
    const liveBosses = world.entities.filter(
      (e) => e.duck && e.duck.state !== "petrified" && e.duck.isBoss,
    ).length;

    if (liveRegular < difficulty.maxDucks) {
      this.timer += deltaSeconds;
      if (this.timer >= difficulty.spawnInterval) {
        this.timer = 0;
        this.spawnOne(world, player.transform.x, player.transform.z, {
          isBoss: false,
          scale: 1,
          petrifyCost: difficulty.petrifyCost,
          hitRadius: difficulty.regularHitRadius,
          speedScale: 1,
        });
        if (
          difficulty.doubleSpawnChance > 0
          && Math.random() < difficulty.doubleSpawnChance
          && world.entities.filter((e) => e.duck && e.duck.state !== "petrified" && !e.duck.isBoss).length
            < difficulty.maxDucks
        ) {
          this.spawnOne(world, player.transform.x, player.transform.z, {
            isBoss: false,
            scale: 1,
            petrifyCost: difficulty.petrifyCost,
            hitRadius: difficulty.regularHitRadius,
            speedScale: 1,
          });
        }
      }
    }

    if (liveBosses < difficulty.maxBosses) {
      this.bossTimer += deltaSeconds;
      const bossInterval = Math.max(8, difficulty.spawnInterval * 2.2);
      if (this.bossTimer >= bossInterval) {
        this.bossTimer = 0;
        this.spawnOne(world, player.transform.x, player.transform.z, {
          isBoss: true,
          scale: difficulty.bossScale,
          petrifyCost: difficulty.bossPetrifyCost,
          hitRadius: difficulty.bossHitRadius,
          speedScale: 0.78,
        });
      }
    }
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

    const dayNight = world.entities.find((e) => e.dayNight)?.dayNight;
    const difficulty = getDifficulty(dayNight?.nightCount || 1);

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
      if (entity.previousTransform) {
        Object.assign(entity.previousTransform, entity.transform);
      }
      const dx = player.transform.x - entity.transform.x;
      const dz = player.transform.z - entity.transform.z;
      const dist = Math.hypot(dx, dz) || 1;
      const speed = difficulty.duckSpeed * (entity.duck.speedScale ?? 1);
      entity.velocity.x = (dx / dist) * speed;
      entity.velocity.z = (dz / dist) * speed;
      entity.transform.x += entity.velocity.x * deltaSeconds;
      entity.transform.z += entity.velocity.z * deltaSeconds;
      const scale = entity.duck.isBoss ? difficulty.bossScale : 1;
      entity.transform.y =
        sampleTerrainHeight(this.worldSeed, entity.transform.x, entity.transform.z) + 0.45 * scale;
      entity.transform.yaw = Math.atan2(dx, dz);

      if (combat.invulnTimer > 0) continue;
      const hitRadius = entity.duck.hitRadius ?? difficulty.regularHitRadius;
      if (dist < hitRadius) {
        const cost = entity.duck.petrifyCost
          ?? (entity.duck.isBoss ? difficulty.bossPetrifyCost : difficulty.petrifyCost);
        if (combat.garlicCount >= cost) {
          combat.garlicCount -= cost;
          combat.score += entity.duck.isBoss ? 250 : 50;
          entity.duck.state = "petrified";
          entity.duck.petrifyTimer = entity.duck.isBoss ? 12 : 8;
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
          combat.lives -= entity.duck.isBoss ? 2 : 1;
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
