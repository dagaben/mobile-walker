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
}

export const BLOB_SHADOW_MIN_STRETCH = 1;
export const BLOB_SHADOW_MAX_STRETCH = 2.4;
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
  return { directionX, directionZ, rotationY, stretch };
}
