export interface RawInput { x: number; z: number }

/** Collects asynchronous browser events. Fixed systems read it through sample(). */
export class InputController {
  private readonly keys = new Set<string>();
  private pointerId: number | undefined;
  private pointerOrigin = { x: 0, y: 0 };
  private pointer = { x: 0, y: 0 };

  constructor(private readonly element: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    element.addEventListener("pointerdown", this.onPointerDown);
    element.addEventListener("pointermove", this.onPointerMove);
    element.addEventListener("pointerup", this.onPointerUp);
    element.addEventListener("pointercancel", this.onPointerUp);
  }

  sample(): RawInput {
    const keyboardX = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    const keyboardZ = Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) - Number(this.keys.has("KeyW") || this.keys.has("ArrowUp"));
    if (keyboardX || keyboardZ) return { x: keyboardX, z: keyboardZ };
    if (this.pointerId === undefined) return { x: 0, z: 0 };
    const radius = Math.min(this.element.clientWidth, this.element.clientHeight) * 0.16;
    return {
      x: (this.pointer.x - this.pointerOrigin.x) / Math.max(radius, 1),
      z: (this.pointer.y - this.pointerOrigin.y) / Math.max(radius, 1),
    };
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerUp);
  }

  private readonly onKeyDown = (event: KeyboardEvent) => { this.keys.add(event.code); };
  private readonly onKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.pointerId !== undefined) return;
    this.pointerId = event.pointerId;
    this.pointerOrigin = this.pointer = { x: event.clientX, y: event.clientY };
    this.element.setPointerCapture(event.pointerId);
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerId === this.pointerId) this.pointer = { x: event.clientX, y: event.clientY };
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    if (event.pointerId === this.pointerId) this.pointerId = undefined;
  };
}
