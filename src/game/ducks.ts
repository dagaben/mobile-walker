import * as THREE from "three";
import type { EcsWorld } from "../ecs/createEcsWorld";
import type { FixedSystem } from "../ecs/System";
import { sampleBiome } from "../world/biomes";
import { isOpenWaterAt } from "../world/hydrology";
import { sampleTerrainHeight } from "../world/terrainSampling";
import { getDifficulty } from "./difficulty";

const INVULN_SECONDS = 1.6;

/** Low hover for regular + boss ducks (just above small vegetation). */
const HOVER_BASE = 1.85;
/** Clear of pine/leaf tops (~3–4 world units). Flyers cruise here while far away. */
const CRUISE_HEIGHT = 5.2;
/** Dive target near player / character height. */
const ATTACK_HEIGHT = 1.4;
/** Start descending when this far from the player (flyers only). */
const DIVE_START_DIST = 18;
/** Fully at attack height by this distance (flyers only). */
const DIVE_END_DIST = 5.5;
/** How quickly hover height lerps toward the target (units/sec at scale 1). */
const HOVER_LERP_SPEED = 3.2;
const HOVER_BOB = 0.32;
/** Reject spawn points this deep into river water. */

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

type DuckKind = "regular" | "boss" | "flyer";

/** Vampire duck mesh: regular (gold), boss (red), flyer (purple/cyan canopy threat). */
function createDuckMesh(scale = 1, kind: DuckKind = "regular"): THREE.Group {
  const s = scale;
  const group = new THREE.Group();
  const isBoss = kind === "boss";
  const isFlyer = kind === "flyer";

  const bodyColor = isBoss ? 0xff3333 : isFlyer ? 0x7b5cff : 0xffdd44;
  const headColor = isBoss ? 0xff5555 : isFlyer ? 0x9b7cff : 0xffe066;
  const wingColor = isBoss ? 0xcc1111 : isFlyer ? 0x4ad4ff : 0xe8c020;
  const capeColor = isBoss ? 0x4a0a0a : isFlyer ? 0x1a0a3a : 0x2a0a2a;
  const eyeColor = isBoss ? 0xaa00ff : isFlyer ? 0x00ffcc : 0xff2222;

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
    color: eyeColor, roughness: 0.25, emissive: eyeColor, emissiveIntensity: isBoss ? 0.55 : isFlyer ? 0.5 : 0.35,
  });
  for (const x of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 6), eyeMat);
    eye.position.set(x * s, 1.0 * s, 0.4 * s);
    group.add(eye);
  }

  const wingGeo = new THREE.BoxGeometry(0.55 * s, 0.08 * s, 0.32 * s);
  const wingMat = new THREE.MeshStandardMaterial({ color: wingColor, roughness: 0.7, flatShading: true });
  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(-0.55 * s, 0.5 * s, 0);
  wingL.castShadow = true;
  group.add(wingL);
  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(0.55 * s, 0.5 * s, 0);
  wingR.castShadow = true;
  group.add(wingR);

  const cape = new THREE.Mesh(
    new THREE.BoxGeometry(0.7 * s, 0.55 * s, 0.08 * s),
    new THREE.MeshStandardMaterial({ color: capeColor, roughness: 0.85, flatShading: true, side: THREE.DoubleSide }),
  );
  cape.position.set(0, 0.35 * s, -0.35 * s);
  cape.rotation.x = 0.25;
  group.add(cape);

  if (isBoss) {
    const crest = new THREE.Mesh(
      new THREE.ConeGeometry(0.12 * s, 0.28 * s, 5),
      new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.4, flatShading: true }),
    );
    crest.position.set(0, 1.28 * s, 0.1 * s);
    group.add(crest);
  }

  if (isFlyer) {
    // Subtle cyan under-glow so canopy flyers read against dark foliage.
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.22 * s, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0x4ad4ff, emissive: 0x4ad4ff, emissiveIntensity: 0.35, transparent: true, opacity: 0.45, roughness: 0.2,
      }),
    );
    glow.position.set(0, 0.2 * s, 0);
    group.add(glow);
  }

  (group as THREE.Group & { userData: Record<string, unknown> }).userData = {
    wingL, wingR, cape, flapPhase: Math.random() * Math.PI * 2, kind,
  };
  return group;
}

function animateDuckMesh(mesh: THREE.Object3D, deltaSeconds: number, speed: number, diving: number): void {
  const ud = (mesh as THREE.Group & { userData: Record<string, any> }).userData;
  if (!ud?.wingL || !ud?.wingR) return;
  const flapRate = 6.5 + speed * 1.8 + diving * 4.5;
  ud.flapPhase = (ud.flapPhase ?? 0) + deltaSeconds * flapRate;
  const flapAmp = 0.55 + diving * 0.25;
  const flap = Math.sin(ud.flapPhase) * flapAmp;
  ud.wingL.rotation.z = 0.35 + flap;
  ud.wingR.rotation.z = -0.35 - flap;
  if (ud.cape) ud.cape.rotation.x = 0.25 + Math.sin(ud.flapPhase * 0.6) * 0.08 + diving * 0.12;
}

/** Biome-aware cruise offset: slightly higher over forest / mountain canopies. */
function cruiseHeightForPosition(seed: number | string, x: number, z: number): number {
  const biome = sampleBiome(seed, x, z);
  const forestBoost = (biome.weights.forest ?? 0) * 0.55;
  const mountainBoost = (biome.weights.mountain ?? 0) * 0.7 + (biome.weights.highlands ?? 0) * 0.35;
  return CRUISE_HEIGHT + forestBoost + mountainBoost;
}

/** Find a spawn point that is not deep inside the river channel. */
function pickSpawnXZ(
  seed: number | string,
  px: number,
  pz: number,
  baseDist: number,
  extra: number,
  attempts = 8,
): { x: number; z: number } {
  for (let i = 0; i < attempts; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = baseDist + Math.random() * extra;
    const x = px + Math.cos(angle) * dist;
    const z = pz + Math.sin(angle) * dist;
    if (!isOpenWaterAt(seed, x, z)) return { x, z };
    // Soft reject: still accept after last attempts so spawns never stall.
    if (i >= attempts - 2) return { x, z };
  }
  const angle = Math.random() * Math.PI * 2;
  const dist = baseDist + Math.random() * extra;
  return { x: px + Math.cos(angle) * dist, z: pz + Math.sin(angle) * dist };
}

export class DuckSpawnSystem implements FixedSystem {
  private timer = 0;
  private bossTimer = 0;
  private flyerTimer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly worldSeed: string,
    private readonly prepareWorldObject: (object: THREE.Object3D) => void,
  ) {}

  private spawnOne(
    world: EcsWorld,
    px: number,
    pz: number,
    opts: {
      kind: DuckKind;
      scale: number;
      petrifyCost: number;
      hitRadius: number;
      speedScale: number;
    },
  ): void {
    const isFlyer = opts.kind === "flyer";
    const isBoss = opts.kind === "boss";
    const baseDist = isFlyer ? 22 : isBoss ? 18 : 12;
    const extra = isFlyer ? 14 : isBoss ? 10 : 8;
    const { x, z } = pickSpawnXZ(this.worldSeed, px, pz, baseDist, extra);

    const hoverHeight = isFlyer
      ? cruiseHeightForPosition(this.worldSeed, x, z) * opts.scale
      : HOVER_BASE * opts.scale;
    const y = sampleTerrainHeight(this.worldSeed, x, z) + hoverHeight;
    const mesh = createDuckMesh(opts.scale, opts.kind);
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
        isBoss,
        isFlyer,
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
      this.flyerTimer = 0;
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
      (e) => e.duck && e.duck.state !== "petrified" && !e.duck.isBoss && !e.duck.isFlyer,
    ).length;
    const liveBosses = world.entities.filter(
      (e) => e.duck && e.duck.state !== "petrified" && e.duck.isBoss,
    ).length;
    const liveFlyers = world.entities.filter(
      (e) => e.duck && e.duck.state !== "petrified" && e.duck.isFlyer,
    ).length;

    if (liveRegular < difficulty.maxDucks) {
      this.timer += deltaSeconds;
      if (this.timer >= difficulty.spawnInterval) {
        this.timer = 0;
        this.spawnOne(world, player.transform.x, player.transform.z, {
          kind: "regular", scale: 1, petrifyCost: difficulty.petrifyCost,
          hitRadius: difficulty.regularHitRadius, speedScale: 1,
        });
        if (
          difficulty.doubleSpawnChance > 0
          && Math.random() < difficulty.doubleSpawnChance
          && world.entities.filter((e) => e.duck && e.duck.state !== "petrified" && !e.duck.isBoss && !e.duck.isFlyer).length
            < difficulty.maxDucks
        ) {
          this.spawnOne(world, player.transform.x, player.transform.z, {
            kind: "regular", scale: 1, petrifyCost: difficulty.petrifyCost,
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
          kind: "boss", scale: difficulty.bossScale, petrifyCost: difficulty.bossPetrifyCost,
          hitRadius: difficulty.bossHitRadius, speedScale: 0.85,
        });
      }
    }

    if (liveFlyers < difficulty.maxFlyers) {
      this.flyerTimer += deltaSeconds;
      if (this.flyerTimer >= difficulty.flyerSpawnInterval) {
        this.flyerTimer = 0;
        this.spawnOne(world, player.transform.x, player.transform.z, {
          kind: "flyer", scale: 1.05, petrifyCost: difficulty.flyerPetrifyCost,
          hitRadius: difficulty.flyerHitRadius, speedScale: 1.15,
        });
      }
    }
  }
}

export class DuckAISystem implements FixedSystem {
  constructor(
    private readonly worldSeed: string,
    private readonly garlicEl: HTMLElement | null,
    private readonly livesEl: HTMLElement | null,
    private readonly scoreEl: HTMLElement | null,
  ) {}

  private syncHud(combat: GameCombatState): void {
    if (this.garlicEl) this.garlicEl.textContent = String(combat.garlicCount);
    if (this.livesEl) this.livesEl.textContent = String(combat.lives);
    if (this.scoreEl) this.scoreEl.textContent = String(combat.score);
  }

  fixedUpdate(world: EcsWorld, deltaSeconds: number): void {
    const dayNight = world.entities.find((e) => e.dayNight)?.dayNight;
    const difficulty = getDifficulty(dayNight?.nightCount || 1);
    const player = world.entities.find((e) => e.playerControl && e.transform);
    const combatEntity = world.entities.find((e) => e.combat);
    if (!player?.transform || !combatEntity?.combat) return;
    const combat = combatEntity.combat;

    if (combat.invulnTimer > 0) {
      combat.invulnTimer = Math.max(0, combat.invulnTimer - deltaSeconds);
    }

    for (const entity of world.entities) {
      if (!entity.duck || !entity.transform || !entity.velocity) continue;
      const duck = entity.duck;

      if (duck.state === "petrified") {
        duck.petrifyTimer -= deltaSeconds;
        if (duck.petrifyTimer <= 0) {
          if (entity.renderable) entity.renderable.removeFromParent();
          world.remove(entity);
        }
        continue;
      }

      const scale = duck.isBoss ? difficulty.bossScale : duck.isFlyer ? 1.05 : 1;
      const dx = player.transform.x - entity.transform.x;
      const dz = player.transform.z - entity.transform.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const speed = difficulty.duckSpeed * (duck.speedScale ?? 1);

      // Horizontal chase
      entity.velocity.x = (dx / dist) * speed;
      entity.velocity.z = (dz / dist) * speed;
      entity.transform.x += entity.velocity.x * deltaSeconds;
      entity.transform.z += entity.velocity.z * deltaSeconds;
      entity.transform.yaw = Math.atan2(dx, dz);

      const terrainY = sampleTerrainHeight(this.worldSeed, entity.transform.x, entity.transform.z);

      if (duck.isFlyer) {
        // Visible canopy cruise while far, then smooth dive toward the character.
        const diveT = smoothstep((DIVE_START_DIST - dist) / (DIVE_START_DIST - DIVE_END_DIST));
        const cruise = cruiseHeightForPosition(this.worldSeed, entity.transform.x, entity.transform.z);
        const targetHover = (cruise + (ATTACK_HEIGHT - cruise) * diveT) * scale;
        const current = duck.hoverHeight ?? cruise * scale;
        const maxStep = HOVER_LERP_SPEED * deltaSeconds * scale;
        const next = current + Math.max(-maxStep, Math.min(maxStep, targetHover - current));
        duck.hoverHeight = next;
        const bobAmp = HOVER_BOB * (1.15 - diveT * 0.55);
        const bob = Math.sin((entity.transform.x + entity.transform.z) * 0.35 + performance.now() * 0.002) * bobAmp * scale;
        entity.transform.y = terrainY + next + bob;
        if (entity.renderable) {
          animateDuckMesh(entity.renderable, deltaSeconds, speed, diveT);
        }
      } else {
        // Regular + boss: steady low hover with light bob.
        const targetHover = HOVER_BASE * scale;
        const current = duck.hoverHeight ?? targetHover;
        const maxStep = HOVER_LERP_SPEED * deltaSeconds * scale;
        const next = current + Math.max(-maxStep, Math.min(maxStep, targetHover - current));
        duck.hoverHeight = next;
        const bob = Math.sin((entity.transform.x + entity.transform.z) * 0.4 + performance.now() * 0.0025) * HOVER_BOB * 0.7 * scale;
        entity.transform.y = terrainY + next + bob;
        if (entity.renderable) {
          animateDuckMesh(entity.renderable, deltaSeconds, speed, 0.15);
        }
      }

      // Contact combat
      const hitR = duck.hitRadius ?? (duck.isBoss ? difficulty.bossHitRadius : difficulty.regularHitRadius);
      const playerY = player.transform.y;
      const vertOk = Math.abs(entity.transform.y - playerY) < 2.4 * scale;
      if (vertOk && dist < hitR + 0.55 && combat.invulnTimer <= 0 && !combat.gameOver) {
        const cost = duck.petrifyCost
          ?? (duck.isBoss ? difficulty.bossPetrifyCost
            : duck.isFlyer ? difficulty.flyerPetrifyCost
            : difficulty.petrifyCost);
        if (combat.garlicCount >= cost) {
          combat.garlicCount -= cost;
          combat.score += duck.isBoss ? 250 : duck.isFlyer ? 80 : 50;
          duck.state = "petrified";
          duck.petrifyTimer = duck.isBoss ? 12 : 8;
          if (entity.renderable) {
            entity.renderable.traverse((c) => {
              if ((c as THREE.Mesh).isMesh) {
                const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
                if (m?.color) m.color.setHex(0x88aacc);
                if (m) { m.emissive?.setHex(0x000000); m.needsUpdate = true; }
              }
            });
          }
          this.syncHud(combat);
        } else {
          combat.lives -= duck.isBoss ? 2 : 1;
          combat.invulnTimer = INVULN_SECONDS;
          this.syncHud(combat);
          if (combat.lives <= 0) {
            combat.gameOver = true;
            window.dispatchEvent(new CustomEvent(VD_GAME_OVER_EVENT, {
              detail: { score: combat.score, night: dayNight?.nightCount ?? 1 },
            }));
          }
        }
      }
    }

    // Keep HUD in sync with shared combat (garlic collected elsewhere).
    this.syncHud(combat);
  }
}
