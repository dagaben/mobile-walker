import * as THREE from "three";

const MAX_PIXEL_RATIO = 2;

export class ThreeRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  private readonly horizon: THREE.Mesh;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
    this.scene.background = new THREE.Color(0xd9ead8);
    this.scene.fog = new THREE.Fog(0xd9ead8, 9, 24);

    this.camera.position.set(6, 5, 8);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff8e8, 0x9ebba5, 2.4));
    const sunlight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sunlight.position.set(-4, 8, 5);
    this.scene.add(sunlight);

    const geometry = new THREE.IcosahedronGeometry(3.6, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xa8c8ad, flatShading: true, roughness: 1 });
    this.horizon = new THREE.Mesh(geometry, material);
    this.horizon.scale.set(1.8, 0.3, 1.2);
    this.horizon.position.set(1, -2.2, -1);
    this.scene.add(this.horizon);

    window.addEventListener("resize", this.resize);
    this.resize();
  }

  render(deltaSeconds: number): void {
    this.horizon.rotation.y += deltaSeconds * 0.015;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener("resize", this.resize);
    this.horizon.geometry.dispose();
    (this.horizon.material as THREE.Material).dispose();
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
