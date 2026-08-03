import type { Game } from "../core/Game";

let ignorePauseUntil = 0;
let syncUi: ((paused: boolean) => void) | null = null;
let gameRef: Game | null = null;

function isBlockingOverlayVisible(): boolean {
  const start = document.getElementById("start-screen");
  if (start && !start.hidden) return true;
  const go = document.getElementById("game-over-screen");
  if (go && !go.classList.contains("hidden") && !(go as HTMLElement).hidden) return true;
  return false;
}

/** Toolbar pause button, keyboard P/Escape, and pause overlay. */
export function installPauseUi(game: Game): void {
  gameRef = game;
  const pauseButton = document.querySelector<HTMLButtonElement>("#pause-button");
  const overlay = document.getElementById("pause-overlay");
  const resumeButton = document.getElementById("resume-button");

  syncUi = (paused: boolean): void => {
    if (pauseButton) {
      pauseButton.setAttribute("aria-pressed", String(paused));
      pauseButton.setAttribute("aria-label", paused ? "Resume game" : "Pause game");
      pauseButton.title = paused ? "Resume" : "Pause";
      pauseButton.innerHTML = paused
        ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5v14l11-7Z" /></svg>'
        : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" /></svg>';
    }
    if (overlay) {
      overlay.hidden = !paused;
      if (paused) overlay.classList.remove("hidden");
      else overlay.classList.add("hidden");
    }
  };

  const togglePauseUi = (): void => {
    if (Date.now() < ignorePauseUntil) return;
    if (isBlockingOverlayVisible()) return;
    const paused = game.togglePause();
    syncUi?.(paused);
  };

  const forceResume = (): void => {
    if (game.isPaused()) {
      game.togglePause();
    }
    syncUi?.(false);
  };

  pauseButton?.addEventListener(
    "click",
    (event) => {
      if (Date.now() < ignorePauseUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      togglePauseUi();
    },
    true,
  );

  resumeButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    forceResume();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "p" && event.key !== "P" && event.key !== "Escape") return;
    if (isBlockingOverlayVisible()) return;
    if (Date.now() < ignorePauseUntil) return;
    togglePauseUi();
  });
}

/**
 * Call when the user presses PLAY.
 * Prevents the mobile "ghost click" that lands on the pause button after the
 * full-screen start overlay is removed under the same finger/pointer.
 * Also clears any stuck pause overlay.
 */
export function armPausePlayGuard(): void {
  ignorePauseUntil = Date.now() + 600;
  if (gameRef?.isPaused()) {
    gameRef.togglePause();
  }
  syncUi?.(false);
}
