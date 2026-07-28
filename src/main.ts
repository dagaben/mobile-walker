import "./style.css";

import { Game } from "./core/Game";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const restartButton = document.querySelector<HTMLButtonElement>("#restart-button");
const debugButton = document.querySelector<HTMLButtonElement>("#debug-button");
const debugPanel = document.querySelector<HTMLElement>("#debug-panel");
const wireframeInput = document.querySelector<HTMLInputElement>("#debug-wireframe");
const boundariesInput = document.querySelector<HTMLInputElement>("#debug-boundaries");
const riverInput = document.querySelector<HTMLInputElement>("#debug-river");

if (!canvas || !restartButton || !debugButton || !debugPanel || !wireframeInput || !boundariesInput || !riverInput) {
  throw new Error("The game interface could not be found.");
}

const game = new Game(canvas);
const restartGame = (): void => window.location.reload();
const toggleDebugPanel = (): void => {
  const open = debugPanel.hidden;
  debugPanel.hidden = !open;
  debugButton.setAttribute("aria-expanded", String(open));
};
const updateDebugView = (): void => game.setDebugView({
  wireframe: wireframeInput.checked,
  boundaries: boundariesInput.checked,
  riverPlacement: riverInput.checked,
});

restartButton.addEventListener("click", restartGame);
debugButton.addEventListener("click", toggleDebugPanel);
for (const input of [wireframeInput, boundariesInput, riverInput]) input.addEventListener("change", updateDebugView);
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    restartButton.removeEventListener("click", restartGame);
    debugButton.removeEventListener("click", toggleDebugPanel);
    for (const input of [wireframeInput, boundariesInput, riverInput]) input.removeEventListener("change", updateDebugView);
    game.dispose();
  });
}
