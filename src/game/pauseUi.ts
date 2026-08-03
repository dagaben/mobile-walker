import type { Game } from "../core/Game";

/** Toolbar pause button, keyboard P/Escape, and pause overlay. */
export function installPauseUi(game: Game): void {
  const pauseButton = document.querySelector<HTMLButtonElement>("#pause-button");

  const togglePauseUi = (): void => {
    const paused = game.togglePause();
    if (pauseButton) {
      pauseButton.setAttribute("aria-pressed", String(paused));
      pauseButton.setAttribute("aria-label", paused ? "Resume game" : "Pause game");
      pauseButton.title = paused ? "Resume" : "Pause";
      pauseButton.innerHTML = paused
        ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5v14l11-7Z" /></svg>'
        : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" /></svg>';
    }
    const overlay = document.getElementById("pause-overlay");
    if (overlay) overlay.hidden = !paused;
  };

  pauseButton?.addEventListener("click", togglePauseUi);
  document.getElementById("resume-button")?.addEventListener("click", () => {
    if (game.isPaused()) togglePauseUi();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "p" || event.key === "P" || event.key === "Escape") {
      const go = document.getElementById("game-over-screen");
      if (go && !go.classList.contains("hidden")) return;
      togglePauseUi();
    }
  });
}
