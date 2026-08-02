import * as THREE from "three";

export const PLAYER_CENTRED_FOG_CACHE_KEY = "player-centred-cylindrical-fog-v1";

export function horizontalFogDistance(worldX: number, worldZ: number, centreX: number, centreZ: number): number {
  if (![worldX, worldZ, centreX, centreZ].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  return Math.hypot(worldX - centreX, worldZ - centreZ);
}

export function linearFogFactor(distance: number, near: number, far: number): number {
  if (![distance, near, far].every(Number.isFinite) || far <= near) return distance >= far ? 1 : 0;
  const x = THREE.MathUtils.clamp((distance - near) / (far - near), 0, 1);
  return x * x * (3 - 2 * x);
}

export interface PlayerCentredFogController {
  readonly playerFogCenter: { value: THREE.Vector2 };
  apply(material: THREE.Material): boolean;
  applyObject(object: THREE.Object3D): void;
  update(x: number, z: number): void;
  dispose(): void;
}

interface PatchRecord {
  material: THREE.Material;
  onBeforeCompile: THREE.Material["onBeforeCompile"];
  customProgramCacheKey: THREE.Material["customProgramCacheKey"];
}

const VERTEX_PARS = `#include <fog_pars_vertex>\n#ifdef USE_FOG\n\tvarying vec2 playerFogWorldXZ;\n#endif`;
const VERTEX_POSITION = `#include <fog_vertex>\n#ifdef USE_FOG\n\tvec4 playerFogWorldPosition = vec4( transformed, 1.0 );\n\t#ifdef USE_BATCHING\n\t\tplayerFogWorldPosition = batchingMatrix * playerFogWorldPosition;\n\t#endif\n\t#ifdef USE_INSTANCING\n\t\tplayerFogWorldPosition = instanceMatrix * playerFogWorldPosition;\n\t#endif\n\tplayerFogWorldPosition = modelMatrix * playerFogWorldPosition;\n\tplayerFogWorldXZ = playerFogWorldPosition.xz;\n#endif`;
const FRAGMENT_PARS = `#include <fog_pars_fragment>\n#ifdef USE_FOG\n\tuniform vec2 playerFogCenter;\n\tvarying vec2 playerFogWorldXZ;\n#endif`;
const FRAGMENT_FOG = `#ifdef USE_FOG\n\tfloat playerFogDepth = length( playerFogWorldXZ - playerFogCenter );\n\t#ifdef FOG_EXP2\n\t\tfloat fogFactor = 1.0 - exp( - fogDensity * fogDensity * playerFogDepth * playerFogDepth );\n\t#else\n\t\tfloat fogFactor = smoothstep( fogNear, fogFar, playerFogDepth );\n\t#endif\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif`;

function replaceRequired(source: string, search: string, replacement: string, stage: string): string {
  if (!source.includes(search)) throw new Error(`Player-centred fog could not find ${stage} shader chunk: ${search}`);
  return source.replace(search, replacement);
}

export function createPlayerCentredFogController(sceneFog: THREE.Fog): PlayerCentredFogController {
  // The Fog is intentionally retained: Three.js still owns fogColor/fogNear/fogFar
  // and its standard final mix. Only the distance source is patched.
  if (!(sceneFog instanceof THREE.Fog) || sceneFog instanceof THREE.FogExp2) {
    throw new Error("Player-centred fog requires the scene's linear THREE.Fog.");
  }
  const playerFogCenter = { value: new THREE.Vector2() };
  const records = new Map<THREE.Material, PatchRecord>();
  let disposed = false;

  const apply = (material: THREE.Material): boolean => {
    if (disposed || records.has(material) || (material as THREE.Material & { fog?: boolean }).fog === false) return false;
    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      shader.uniforms.playerFogCenter = playerFogCenter;
      shader.vertexShader = replaceRequired(shader.vertexShader, "#include <fog_pars_vertex>", VERTEX_PARS, "vertex fog parameters");
      shader.vertexShader = replaceRequired(shader.vertexShader, "#include <fog_vertex>", VERTEX_POSITION, "vertex fog position");
      shader.fragmentShader = replaceRequired(shader.fragmentShader, "#include <fog_pars_fragment>", FRAGMENT_PARS, "fragment fog parameters");
      shader.fragmentShader = replaceRequired(shader.fragmentShader, "#include <fog_fragment>", FRAGMENT_FOG, "fragment fog blend");
    };
    material.customProgramCacheKey = () => `${previousKey.call(material)}|${PLAYER_CENTRED_FOG_CACHE_KEY}`;
    records.set(material, { material, onBeforeCompile: previousCompile, customProgramCacheKey: previousKey });
    material.needsUpdate = true;
    return true;
  };

  return {
    playerFogCenter,
    apply,
    applyObject(object) {
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Line) && !(child instanceof THREE.Points) && !(child instanceof THREE.Sprite)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) apply(material);
      });
    },
    update(x, z) { if (!disposed && Number.isFinite(x) && Number.isFinite(z)) playerFogCenter.value.set(x, z); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const record of records.values()) {
        record.material.onBeforeCompile = record.onBeforeCompile;
        record.material.customProgramCacheKey = record.customProgramCacheKey;
        record.material.needsUpdate = true;
      }
      records.clear();
    },
  };
}
