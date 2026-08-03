import type { EcsWorld } from "../ecs/createEcsWorld";
import type { FixedSystem } from "../ecs/System";
import type { ThreeRenderer } from "../rendering/ThreeRenderer";

export const DAY_LENGTH_SECONDS = 75;
export const NIGHT_LENGTH_SECONDS = 50;

export interface DayNightState {
  isDay: boolean;
  /** Seconds into the current phase. */
  phaseTime: number;
  /** 0 = midnight-ish night peak, 1 = noon day peak (smooth blend for lighting). */
  lightBlend: number;
}

export function createDayNightState(isDay = true): DayNightState {
  return { isDay, phaseTime: 0, lightBlend: isDay ? 1 : 0 };
}

/**
 * Advances the day/night cycle and drives renderer lighting.
 * Day is safe (no ducks); night spawns rubber vampire ducks.
 */
export class DayNightSystem implements FixedSystem {
  constructor(
    private readonly renderer: ThreeRenderer,
    private readonly timeLabel?: HTMLElement | null,
    private readonly onPhaseChange?: (isDay: boolean) => void,
  ) {}

  fixedUpdate(world: EcsWorld, deltaSeconds: number): void {
    const entity = world.entities.find((e) => e.dayNight);
    if (!entity?.dayNight) return;
    const state = entity.dayNight;
    state.phaseTime += deltaSeconds;
    const phaseLen = state.isDay ? DAY_LENGTH_SECONDS : NIGHT_LENGTH_SECONDS;
    if (state.phaseTime >= phaseLen) {
      state.phaseTime = 0;
      state.isDay = !state.isDay;
      this.onPhaseChange?.(state.isDay);
    }
    // Smooth light blend toward day (1) or night (0)
    const target = state.isDay ? 1 : 0;
    state.lightBlend += (target - state.lightBlend) * Math.min(1, deltaSeconds * 1.2);
    this.renderer.setDayNightBlend(state.lightBlend);
    // Compact mobile indicator: emoji only
    const chip = document.getElementById("time-chip");
    if (chip) {
      chip.textContent = state.isDay ? "☀️" : "🌙";
      chip.setAttribute("aria-label", state.isDay ? "Day" : "Night");
      chip.title = state.isDay ? "Day (safe)" : "Night (ducks!)";
    }
    if (this.timeLabel) {
      this.timeLabel.textContent = state.isDay ? "Day" : "Night";
    }
  }
}
