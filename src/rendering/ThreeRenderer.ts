import * as THREE from "three";
import { getBlobShadowStats } from "./blobShadows";
import { SunlightDirection, type SunlightAngles } from "./sunlightDirection";
import { createPlayerCentredFogController } from "./playerCentredFog";

const MAX_PIXEL_RATIO = 2;
export const MAX_DRAW_DISTANCE = 150;
export const FOG_DEPTH = 20;
export const FOG_COLOR = 0xd9ead8;
const SUNLIGHT_DISTANCE = 10;

export type { SunlightAngles } from "./sunlightDirection";

export function sunlightPosition({ vertical, horizontal }: SunlightAngles): THREE.Vector3 {
  const elevation = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(vertical, 10, 90));
  const azimuth = THREE.MathUtils.degToRad(THREE.MathUtils.euclideanModulo(horizontal, 360));
  const horizontalDistance = Math.cos(elevation) * SUNLIGHT_DISTANCE;
  return new THREE.Vector3(
    -Math.cos(azimuth) * horizontalDistance,
    Math.sin(elevation) * SUNLIGHT_DISTANCE,
    Math.sin(azimuth) * horizontalDistance,
  );
}

export class ThreeRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly resizeObserver: ResizeObserver | undefined;
  private readonly resizeAnimationFrames = new Set<number>();
  private appliedWidth = -1;
  private appliedHeight = -1;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, MAX_DRAW_DISTANCE);
  private readonly sunlight = new THREE.DirectionalLight(0xfff1d6, 2.2);
  private hemiLight!: THREE.HemisphereLight;
  private dayNightBlend = 1;
  readonly sunlightDirection = new SunlightDirection();
  readonly playerCentredFog;
  private submission = { currentMs: 0, maximumMs: 0, rollingMaximumMs: 0, samples: [] as { at: number; ms: number }[] };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.Fog(FOG_COLOR, MAX_DRAW_DISTANCE - FOG_DEPTH, MAX_DRAW_DISTANCE);
    this.playerCentredFog = createPlayerCentredFogController(this.scene.fog);

    this.camera.position.set(6, 5, 8);
    this.camera.lookAt(0, 0, 0);

    this.hemiLight = new THREE.HemisphereLight(0xfff8e8, 0x9ebba5, 2.4);
    this.scene.add(this.hemiLight);
    this.setSunlightAngles({ vertical: 51, horizontal: 51 });
    this.scene.add(this.sunlight);
    this.dayNightBlend = 1;

    this.resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(this.resize);
    this.resizeObserver?.observe(canvas);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.scheduleInitialResize(2);
  }

  render(_deltaSeconds: number): void {
    const started = performance.now();
    this.renderer.render(this.scene, this.camera);
    const ended = performance.now(), ms = ended - started;
    this.submission.currentMs = ms; this.submission.maximumMs = Math.max(this.submission.maximumMs, ms);
    this.submission.samples.push({ at: ended, ms });
    while (this.submission.samples[0] && this.submission.samples[0].at < ended - 1000) this.submission.samples.shift();
    this.submission.rollingMaximumMs = Math.max(0, ...this.submission.samples.map(sample => sample.ms));
  }

  prepareWorldObject(object: THREE.Object3D): void { this.playerCentredFog.applyObject(object); }

  setSunlightAngles(angles: SunlightAngles): void {
    this.sunlight.position.copy(sunlightPosition(angles));
    this.sunlightDirection.set(this.sunlight.position);
  }

  getDayNightBlend(): number { return this.dayNightBlend; }

  setDayNightBlend(blend: number): void {
    const t = Math.min(1, Math.max(0, blend));
    this.dayNightBlend = t;
    const dayBg = 0xd9ead8;
    const nightBg = 0x0a1628;
    const dayFog = 0xd9ead8;
    const nightFog = 0x0a1628;
    const lerpColor = (a: number, b: number) => {
      const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
      const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
      const r = Math.round(ar + (br - ar) * (1 - t));
      const g = Math.round(ag + (bg - ag) * (1 - t));
      const bl = Math.round(ab + (bb - ab) * (1 - t));
      return (r << 16) | (g << 8) | bl;
    };
    const bg = lerpColor(dayBg, nightBg);
    const fog = lerpColor(dayFog, nightFog);
    this.scene.background = new THREE.Color(bg);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.setHex(fog);
    this.sunlight.intensity = 0.35 + 1.85 * t;
    this.sunlight.color.setHex(t > 0.5 ? 0xfff1d6 : 0x8899cc);
    this.hemiLight.intensity = 0.55 + 1.85 * t;
    if (t < 0.45) {
      this.setSunlightAngles({ vertical: 12 + 20 * t, horizontal: 220 });
    } else {
      this.setSunlightAngles({ vertical: 40 + 25 * (t - 0.45) / 0.55, horizontal: 51 });
    }
  }

  getPerformanceDetails(): { drawCalls: number; triangles: number; shadowDrawCalls: number; shadowTriangles: number } {
    const shadows = getBlobShadowStats(this.scene);
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      shadowDrawCalls: shadows.drawCalls,
      shadowTriangles: shadows.triangles,
    };
  }

  getSubmissionTiming(): Readonly<{ currentMs: number; maximumMs: number; rollingMaximumMs: number }> { return this.submission; }

  dispose(): void {
    this.playerCentredFog.dispose();
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.resize);
    for (const animationFrame of this.resizeAnimationFrames) cancelAnimationFrame(animationFrame);
    this.resizeAnimationFrames.clear();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.renderer.dispose();
  }

  /** Force next resize even if client size looks unchanged (device tilt). */
  invalidateSize(): void {
    this.appliedWidth = -1;
    this.appliedHeight = -1;
  }

  private readonly resize = (): void => {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;

    if (width <= 0 || height <= 0 || (width === this.appliedWidth && height === this.appliedHeight)) return;

    this.appliedWidth = width;
    this.appliedHeight = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private scheduleInitialResize(remainingFrames: number): void {
    const animationFrame = requestAnimationFrame(() => {
      this.resizeAnimationFrames.delete(animationFrame);
      this.resize();
      if (remainingFrames > 1) this.scheduleInitialResize(remainingFrames - 1);
    });
    this.resizeAnimationFrames.add(animationFrame);
  }
}
