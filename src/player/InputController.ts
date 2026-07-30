export interface RawInput { x: number; z: number; jump: boolean }
export interface CameraInputSnapshot { zoomDelta: number; tiltDelta: number }

interface PointerPosition { x: number; y: number }

const TAP_SEQUENCE_MS = 400;
const TAP_SLOP_PX = 32;

/** Collects asynchronous browser events. Fixed systems read it through sample(). */
export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, PointerPosition>();
  private primaryPointerId: number | undefined;
  private pointerOrigin = { x: 0, y: 0 };
  private multiTouchSequence = false;
  private gestureDistance = 0;
  private gestureCentroidY = 0;
  private cameraDelta: CameraInputSnapshot = { zoomDelta: 0, tiltDelta: 0 };
  private tapRelease: { x: number; y: number; time: number } | undefined;
  private jumpQueued = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly dragIndicator?: HTMLElement,
  ) {
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
    if (this.pointers.size >= 2) return { x: 0, z: 0, jump: false };
    if (keyboardX || keyboardZ) return { x: keyboardX, z: keyboardZ, jump };
    const pointer = this.primaryPointerId === undefined ? undefined : this.pointers.get(this.primaryPointerId);
    if (!pointer) return { x: 0, z: 0, jump };
    const radius = Math.min(this.element.clientWidth, this.element.clientHeight) * 0.16;
    return {
      x: (pointer.x - this.pointerOrigin.x) / Math.max(radius, 1),
      z: (pointer.y - this.pointerOrigin.y) / Math.max(radius, 1),
      jump,
    };
  }

  /** Consumes camera input independently from the fixed-step movement snapshot. */
  sampleCamera(): CameraInputSnapshot {
    const snapshot = this.cameraDelta;
    this.cameraDelta = { zoomDelta: 0, tiltDelta: 0 };
    return snapshot;
  }

  dispose(): void {
    this.hideDragOrigin();
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
    if (this.pointers.has(event.pointerId)) return;
    const point = { x: event.clientX, y: event.clientY };
    this.pointers.set(event.pointerId, point);
    if (this.primaryPointerId === undefined) {
      this.primaryPointerId = event.pointerId;
      this.pointerOrigin = point;
      this.showDragOrigin(point);
    }
    if (this.pointers.size >= 2) {
      this.hideDragOrigin();
      this.multiTouchSequence = true;
      this.tapRelease = undefined;
      this.jumpQueued = false;
      this.rebaseGesture();
    } else if (this.tapRelease
      && event.timeStamp - this.tapRelease.time <= TAP_SEQUENCE_MS
      && Math.hypot(event.clientX - this.tapRelease.x, event.clientY - this.tapRelease.y) <= TAP_SLOP_PX) {
      this.jumpQueued = true;
      this.tapRelease = undefined;
    }
    this.element.setPointerCapture(event.pointerId);
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      const { distance, centroidY } = this.gestureMetrics();
      const scale = Math.max(Math.min(this.element.clientWidth, this.element.clientHeight), 1);
      this.cameraDelta.zoomDelta += (this.gestureDistance - distance) / scale;
      this.cameraDelta.tiltDelta += (this.gestureCentroidY - centroidY) / scale;
      this.gestureDistance = distance;
      this.gestureCentroidY = centroidY;
    }
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    if (!this.multiTouchSequence && event.pointerId === this.primaryPointerId
      && Math.hypot(pointer.x - this.pointerOrigin.x, pointer.y - this.pointerOrigin.y) <= TAP_SLOP_PX) {
      this.tapRelease = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    } else if (!this.multiTouchSequence) {
      this.tapRelease = undefined;
    }
    this.removePointer(event.pointerId);
  };
  private readonly onPointerCancel = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    this.tapRelease = undefined;
    this.removePointer(event.pointerId);
  };

  private removePointer(pointerId: number): void {
    this.pointers.delete(pointerId);
    if (pointerId === this.primaryPointerId) this.primaryPointerId = this.pointers.keys().next().value;
    const primary = this.primaryPointerId === undefined ? undefined : this.pointers.get(this.primaryPointerId);
    if (primary) {
      this.pointerOrigin = { ...primary };
      if (this.pointers.size === 1) this.showDragOrigin(primary);
    }
    if (this.pointers.size >= 2) this.rebaseGesture();
    if (this.pointers.size === 0) {
      this.primaryPointerId = undefined;
      this.multiTouchSequence = false;
      this.hideDragOrigin();
    }
  }

  private gestureMetrics(): { distance: number; centroidY: number } {
    const [a, b] = [...this.pointers.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), centroidY: (a.y + b.y) / 2 };
  }

  private rebaseGesture(): void {
    const metrics = this.gestureMetrics();
    this.gestureDistance = metrics.distance;
    this.gestureCentroidY = metrics.centroidY;
  }

  private reset(): void {
    this.keys.clear();
    this.pointers.clear();
    this.primaryPointerId = undefined;
    this.pointerOrigin = { x: 0, y: 0 };
    this.multiTouchSequence = false;
    this.cameraDelta = { zoomDelta: 0, tiltDelta: 0 };
    this.tapRelease = undefined;
    this.jumpQueued = false;
    this.hideDragOrigin();
  }

  private showDragOrigin(point: PointerPosition): void {
    if (!this.dragIndicator) return;
    this.dragIndicator.style.left = `${point.x}px`;
    this.dragIndicator.style.top = `${point.y}px`;
    this.dragIndicator.hidden = false;
  }

  private hideDragOrigin(): void {
    if (this.dragIndicator) this.dragIndicator.hidden = true;
  }
}
