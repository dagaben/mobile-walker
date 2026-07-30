import * as THREE from "three";

const MAX_PIXEL_RATIO = 2;

export class ThreeRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
    this.scene.background = new THREE.Color(0xd9ead8);
    // Fog is atmospheric only; streamed neighborhood edges may remain visible.
    this.scene.fog = new THREE.Fog(0xd9ead8, 108, 180);

    this.camera.position.set(6, 5, 8);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff8e8, 0x9ebba5, 2.4));
    const sunlight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sunlight.position.set(-4, 8, 5);
    this.scene.add(sunlight);

    window.addEventListener("resize", this.resize);
    this.resize();
  }

  render(_deltaSeconds: number): void {
    this.renderer.render(this.scene, this.camera);
  }

  getPerformanceDetails(): { drawCalls: number; triangles: number } {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  dispose(): void {
    window.removeEventListener("resize", this.resize);
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.renderer.dispose();
  }

  private readonly resize = (): void => {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  };
}
