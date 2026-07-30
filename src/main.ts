import "./style.css";

import { Game } from "./core/Game";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const restartButton = document.querySelector<HTMLButtonElement>("#restart-button");
const debugButton = document.querySelector<HTMLButtonElement>("#debug-button");
const debugPanel = document.querySelector<HTMLElement>("#debug-panel");
const wireframeInput = document.querySelector<HTMLInputElement>("#debug-wireframe");
const biomesInput = document.querySelector<HTMLInputElement>("#debug-biomes");
const cameraInput = document.querySelector<HTMLInputElement>("#debug-camera");
const performanceInput = document.querySelector<HTMLInputElement>("#debug-performance");

if (!canvas || !restartButton || !debugButton || !debugPanel || !wireframeInput || !biomesInput || !cameraInput || !performanceInput) {
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
  biomeGuide: biomesInput.checked,
});
const updateCameraDetails = (): void => game.setCameraDetailsEnabled(cameraInput.checked);
const updatePerformanceView = (): void => game.setPerformanceViewEnabled(performanceInput.checked);

restartButton.addEventListener("click", restartGame);
debugButton.addEventListener("click", toggleDebugPanel);
for (const input of [wireframeInput, biomesInput]) input.addEventListener("change", updateDebugView);
cameraInput.addEventListener("change", updateCameraDetails);
performanceInput.addEventListener("change", updatePerformanceView);
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    restartButton.removeEventListener("click", restartGame);
    debugButton.removeEventListener("click", toggleDebugPanel);
    for (const input of [wireframeInput, biomesInput]) input.removeEventListener("change", updateDebugView);
    cameraInput.removeEventListener("change", updateCameraDetails);
    performanceInput.removeEventListener("change", updatePerformanceView);
    game.dispose();
  });
}
