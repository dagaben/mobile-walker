export interface RawInput { x: number; z: number; jump: boolean }

const TAP_SEQUENCE_MS = 400;
const TAP_SLOP_PX = 32;

/** Collects asynchronous browser events. Fixed systems read it through sample(). */
export class InputController {
  private readonly keys = new Set<string>();
  private pointerId: number | undefined;
  private pointerOrigin = { x: 0, y: 0 };
  private pointer = { x: 0, y: 0 };
  private tapRelease: { x: number; y: number; time: number } | undefined;
  private jumpQueued = false;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    element.addEventListener("pointerdown", this.onPointerDown);
    element.addEventListener("pointermove", this.onPointerMove);
    element.addEventListener("pointerup", this.onPointerUp);
    element.addEventListener("pointercancel", this.onPointerCancel);
  }

  sample(): RawInput {
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    const keyboardX = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    const keyboardZ = Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) - Number(this.keys.has("KeyW") || this.keys.has("ArrowUp"));
    if (keyboardX || keyboardZ) return { x: keyboardX, z: keyboardZ, jump };
    if (this.pointerId === undefined) return { x: 0, z: 0, jump };
    const radius = Math.min(this.element.clientWidth, this.element.clientHeight) * 0.16;
    return {
      x: (this.pointer.x - this.pointerOrigin.x) / Math.max(radius, 1),
      z: (this.pointer.y - this.pointerOrigin.y) / Math.max(radius, 1),
      jump,
    };
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerCancel);
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);
    if (event.code === "Space" && !event.repeat) this.jumpQueued = true;
  };
  private readonly onKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private readonly onBlur = () => { this.reset(); };
  private readonly onVisibilityChange = () => {
    if (document.hidden) this.reset();
  };
  private readonly onPointerDown = (event: PointerEvent) => {
    if (this.pointerId !== undefined) return;
    this.pointerId = event.pointerId;
    this.pointerOrigin = this.pointer = { x: event.clientX, y: event.clientY };
    if (this.tapRelease
      && event.timeStamp - this.tapRelease.time <= TAP_SEQUENCE_MS
      && Math.hypot(event.clientX - this.tapRelease.x, event.clientY - this.tapRelease.y) <= TAP_SLOP_PX) {
      this.jumpQueued = true;
      this.tapRelease = undefined;
    }
    this.element.setPointerCapture(event.pointerId);
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    if (event.pointerId === this.pointerId) this.pointer = { x: event.clientX, y: event.clientY };
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
    if (Math.hypot(this.pointer.x - this.pointerOrigin.x, this.pointer.y - this.pointerOrigin.y) <= TAP_SLOP_PX) {
      this.tapRelease = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    } else {
      this.tapRelease = undefined;
    }
    this.pointerId = undefined;
  };
  private readonly onPointerCancel = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = undefined;
    this.tapRelease = undefined;
  };

  private reset(): void {
    this.keys.clear();
    this.pointerId = undefined;
    this.pointerOrigin = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0 };
    this.tapRelease = undefined;
    this.jumpQueued = false;
  }
}
