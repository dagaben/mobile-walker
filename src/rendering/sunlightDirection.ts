import * as THREE from "three";

export interface SunlightAngles {
  readonly vertical: number;
  readonly horizontal: number;
}

export interface BlobShadowProjection {
  readonly directionX: number;
  readonly directionZ: number;
  readonly rotationY: number;
  readonly stretch: number;
  /** Horizontal displacement per unit of the shadow caster's visual height. */
  readonly offsetScale: number;
}

export const BLOB_SHADOW_MIN_STRETCH = 1;
export const BLOB_SHADOW_MAX_STRETCH = 2.4;
export const BLOB_SHADOW_MAX_OFFSET_SCALE = 2.4;
const CHANGE_THRESHOLD = 1e-5;
const HORIZONTAL_EPSILON = 1e-6;

/** Shared, observable sunlight direction for lighting and inexpensive projected shadows. */
export class SunlightDirection {
  private readonly value = new THREE.Vector3(-4, 8, 5).normalize();
  private readonly listeners = new Set<() => void>();

  get direction(): THREE.Vector3 { return this.value; }

  set(direction: THREE.Vector3): boolean {
    const normalized = direction.clone().normalize();
    if (!Number.isFinite(normalized.x) || normalized.distanceToSquared(this.value) <= CHANGE_THRESHOLD ** 2) return false;
    this.value.copy(normalized);
    for (const listener of this.listeners) listener();
    return true;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Projects away from the light source, retaining a stable azimuth at the zenith. */
export function blobShadowProjection(
  sunlight: THREE.Vector3,
  fallbackAzimuth = 0,
  minimumStretch = BLOB_SHADOW_MIN_STRETCH,
  maximumStretch = BLOB_SHADOW_MAX_STRETCH,
): BlobShadowProjection {
  const length = sunlight.length();
  const elevation = length > HORIZONTAL_EPSILON
    ? THREE.MathUtils.clamp(sunlight.y / length, 0, 1)
    : 1;
  const horizontalLength = Math.hypot(sunlight.x, sunlight.z);
  const directionX = horizontalLength > HORIZONTAL_EPSILON ? -sunlight.x / horizontalLength : Math.cos(fallbackAzimuth);
  const directionZ = horizontalLength > HORIZONTAL_EPSILON ? -sunlight.z / horizontalLength : -Math.sin(fallbackAzimuth);
  const rotationY = Math.atan2(-directionZ, directionX);
  const stretch = THREE.MathUtils.lerp(maximumStretch, minimumStretch, elevation);
  // A projected point moves horizontally by height / tan(elevation). Keep that
  // relationship separate from the artistic footprint stretch so the whole
  // blob actually travels away from its caster as the sun approaches the
  // horizon, and returns to the caster when the sun is overhead.
  const offsetScale = THREE.MathUtils.clamp(
    horizontalLength / Math.max(sunlight.y, HORIZONTAL_EPSILON),
    0,
    BLOB_SHADOW_MAX_OFFSET_SCALE,
  );
  return { directionX, directionZ, rotationY, stretch, offsetScale };
}
