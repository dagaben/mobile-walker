import * as THREE from "three";
import type { EcsWorld } from "../ecs/createEcsWorld";
import type { FixedSystem } from "../ecs/System";
import { sampleTerrainHeight } from "../world/terrainSampling";
import { getDifficulty } from "./difficulty";

const INVULN_SECONDS = 1.6;

/** Clear of pine tops (~3–4 world units). Ducks cruise here while far away. */
const CRUISE_HEIGHT = 5.2;
/** Dive target near player / character height. */
const ATTACK_HEIGHT = 1.4;
/** Start descending when this far from the player. */
const DIVE_START_DIST = 18;
/** Fully at attack height by this distance. */
const DIVE_END_DIST = 5.5;
/** How quickly hover height lerps toward the target (units/sec at scale 1). */
const HOVER_LERP_SPEED = 3.2;
const HOVER_BOB = 0.32;

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

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Vampire Flying Duck: rubber body, cape, fangs, flapping wings, hover. */
function createDuckMesh(scale = 1, isBoss = false): THREE.Group {
  const s = scale;
  const group = new THREE.Group();
  const bodyColor = isBoss ? 0xff3333 : 0xffdd44;
  const headColor = isBoss ? 0xff5555 : 0xffe066;
  const wingColor = isBoss ? 0xcc1111 : 0xe8c020;
  const capeColor = isBoss ? 0x4a0a0a : 0x2a0a2a;
  const eyeColor = isBoss ? 0xaa00ff : 0xff2222;

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.48 * s, 12, 10),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.65, flatShading: true }),
  );
  body.scale.set(1.15, 0.9, 1.05);
  body.position.y = 0.42 * s;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.34 * s, 12, 10),
    new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.65, flatShading: true }),
  );
  head.position.set(0, 0.92 * s, 0.22 * s);
  head.castShadow = true;
  group.add(head);

  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.13 * s, 0.3 * s, 7),
    new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.75, flatShading: true }),
  );
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.88 * s, 0.55 * s);
  group.add(beak);

  const fangMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.35, flatShading: true });
  for (const x of [-0.06, 0.06]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s, 0.14 * s, 5), fangMat);
    fang.position.set(x * s, 0.78 * s, 0.52 * s);
    fang.rotation.x = Math.PI;
    group.add(fang);
  }

  const eyeMat = new THREE.MeshStandardMaterial({
    color: eyeColor, roughness: 0.25, emissive: eyeColor, emissiveIntensity: isBoss ? 0.55 : 0.35,
  });
  for (const x of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075 * s, 8, 6), eyeMat);
    eye.position.set(x * s, 0.98 * s, 0.48 * s);
    group.add(eye);
  }

  const wingMat = new THREE.MeshStandardMaterial({
    color: wingColor, roughness: 0.7, flatShading: true, side: THREE.DoubleSide,
  });
  const wingGeo = new THREE.BoxGeometry(0.55 * s, 0.08 * s, 0.32 * s);

  const wingL = new THREE.Group();
  const wingLMesh = new THREE.Mesh(wingGeo, wingMat);
  wingLMesh.position.x = -0.25 * s;
  wingLMesh.castShadow = true;
  wingL.add(wingLMesh);
  wingL.position.set(-0.42 * s, 0.55 * s, 0);
  wingL.rotation.z = 0.35;
  group.add(wingL);

  const wingR = new THREE.Group();
  const wingRMesh = new THREE.Mesh(wingGeo, wingMat);
  wingRMesh.position.x = 0.25 * s;
  wingRMesh.castShadow = true;
  wingR.add(wingRMesh);
  wingR.position.set(0.42 * s, 0.55 * s, 0);
  wingR.rotation.z = -0.35;
  group.add(wingR);

  const capeMat = new THREE.MeshStandardMaterial({
    color: capeColor, roughness: 0.8, flatShading: true, side: THREE.DoubleSide,
  });
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.9 * s, 0.85 * s), capeMat);
  cape.position.set(0, 0.35 * s, -0.4 * s);
  cape.rotation.x = 0.25;
  cape.castShadow = true;
  group.add(cape);

  if (isBoss) {
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.22 * s, 0.38 * s, 5),
      new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.55, roughness: 0.3, flatShading: true }),
    );
    crown.position.set(0, 1.28 * s, 0.1 * s);
    crown.castShadow = true;
    group.add(crown);
    const jewel = new THREE.Mesh(
      new THREE.SphereGeometry(0.06 * s, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xff0044, emissive: 0xaa0022, emissiveIntensity: 0.4 }),
    );
    jewel.position.set(0, 1.42 * s, 0.18 * s);
    group.add(jewel);
  }

  group.userData.wingL = wingL;
  group.userData.wingR = wingR;
  group.userData.cape = cape;
  group.userData.flapPhase = Math.random() * Math.PI * 2;
  return group;
}

function animateDuckMesh(mesh: THREE.Object3D, deltaSeconds: number, speed: number, diving: number): void {
  const ud = mesh.userData;
  if (!ud.wingL || !ud.wingR) return;
  // Flap harder while diving toward the player.
  const flapRate = 6.5 + speed * 1.8 + diving * 4.5;
  ud.flapPhase = (ud.flapPhase ?? 0) + deltaSeconds * flapRate;
  const flapAmp = 0.55 + diving * 0.25;
  const flap = Math.sin(ud.flapPhase) * flapAmp;
  ud.wingL.rotation.z = 0.35 + flap;
  ud.wingR.rotation.z = -0.35 - flap;
  if (ud.cape) ud.cape.rotation.x = 0.25 + Math.sin(ud.flapPhase * 0.6) * 0.08 + diving * 0.12;
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
    // Spawn already above the canopy so they appear flying over trees.
    const hoverHeight = CRUISE_HEIGHT * opts.scale;
    const y = sampleTerrainHeight(this.worldSeed, x, z) + hoverHeight;
    const mesh = createDuckMesh(opts.scale, opts.isBoss);
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
        hoverHeight,
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
          if (entity.renderable) entity.renderable.removeFromParent();
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
          isBoss: false, scale: 1, petrifyCost: difficulty.petrifyCost,
          hitRadius: difficulty.regularHitRadius, speedScale: 1,
        });
        if (
          difficulty.doubleSpawnChance > 0
          && Math.random() < difficulty.doubleSpawnChance
          && world.entities.filter((e) => e.duck && e.duck.state !== "petrified" && !e.duck.isBoss).length
            < difficulty.maxDucks
        ) {
          this.spawnOne(world, player.transform.x, player.transform.z, {
            isBoss: false, scale: 1, petrifyCost: difficulty.petrifyCost,
            hitRadius: difficulty.regularHitRadius, speedScale: 1,
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
          isBoss: true, scale: difficulty.bossScale, petrifyCost: difficulty.bossPetrifyCost,
          hitRadius: difficulty.bossHitRadius, speedScale: 0.78,
        });
      }
    }
  }
}

export class DuckAISystem implements FixedSystem {
  private readonly worldSeed: string | number;
  private animTime = 0;
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

    this.animTime += deltaSeconds;
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
      if (entity.previousTransform) Object.assign(entity.previousTransform, entity.transform);

      const dx = player.transform.x - entity.transform.x;
      const dz = player.transform.z - entity.transform.z;
      const dist = Math.hypot(dx, dz) || 1;

      // 0 while high/far, 1 when fully diving on the player.
      const diveT = smoothstep(
        (DIVE_START_DIST - dist) / (DIVE_START_DIST - DIVE_END_DIST),
      );

      // Drift slowly while cruising above the canopy; speed up as they dive.
      const approachFactor = 0.42 + 0.58 * diveT;
      const speed = difficulty.duckSpeed * (entity.duck.speedScale ?? 1) * approachFactor;
      entity.velocity.x = (dx / dist) * speed;
      entity.velocity.z = (dz / dist) * speed;
      entity.transform.x += entity.velocity.x * deltaSeconds;
      entity.transform.z += entity.velocity.z * deltaSeconds;

      const scale = entity.duck.isBoss ? difficulty.bossScale : 1;
      const terrainY = sampleTerrainHeight(this.worldSeed, entity.transform.x, entity.transform.z);

      // Target height: high over trees when far, low near the character when attacking.
      const targetHover = (CRUISE_HEIGHT + (ATTACK_HEIGHT - CRUISE_HEIGHT) * diveT) * scale;
      let currentHover = entity.duck.hoverHeight ?? targetHover;
      const maxStep = HOVER_LERP_SPEED * deltaSeconds * scale;
      if (Math.abs(targetHover - currentHover) <= maxStep) {
        currentHover = targetHover;
      } else {
        currentHover += Math.sign(targetHover - currentHover) * maxStep;
      }
      entity.duck.hoverHeight = currentHover;

      // Stronger bob while circling high above the canopy.
      const bobAmp = HOVER_BOB * (1.15 - diveT * 0.55);
      const bob = Math.sin(this.animTime * 2.6 + entity.transform.x * 0.28) * bobAmp * scale;
      entity.transform.y = terrainY + currentHover + bob;
      entity.transform.yaw = Math.atan2(dx, dz);

      if (entity.renderable) {
        animateDuckMesh(entity.renderable, deltaSeconds, speed, diveT);
      }

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
                  (mesh.material as THREE.MeshStandardMaterial).emissive?.set(0x000000);
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
              new CustomEvent(VD_GAME_OVER_EVENT, { detail: { score: Math.floor(combat.score) } }),
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
