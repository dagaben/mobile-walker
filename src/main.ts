import "./style.css";

import { Game } from "./core/Game";
import { getBrowserStorage, resetGameState } from "./game/persistence";
import {
  clampNeighborhoodOffset,
  type ChunkNeighborhoodOffsets,
} from "./world/chunkCoordinates";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const restartButton = document.querySelector<HTMLButtonElement>("#restart-button");
const resetProgressButton = document.querySelector<HTMLButtonElement>("#reset-progress-button");
const settingsButton = document.querySelector<HTMLButtonElement>("#settings-button");
const settingsPanel = document.querySelector<HTMLElement>("#settings-panel");
const debugButton = document.querySelector<HTMLButtonElement>("#debug-button");
const debugPanel = document.querySelector<HTMLElement>("#debug-panel");
const wireframeInput = document.querySelector<HTMLInputElement>("#debug-wireframe");
const biomesInput = document.querySelector<HTMLInputElement>("#debug-biomes");
const cameraInput = document.querySelector<HTMLInputElement>("#debug-camera");
const performanceInput = document.querySelector<HTMLInputElement>("#debug-performance");
const offsetInputs = Object.fromEntries(["west", "east", "north", "south"].map((direction) => [
  direction, document.querySelector<HTMLInputElement>(`#offset-${direction}`),
])) as Record<keyof ChunkNeighborhoodOffsets, HTMLInputElement | null>;

if (!canvas || !restartButton || !resetProgressButton || !settingsButton || !settingsPanel || !debugButton || !debugPanel || !wireframeInput || !biomesInput || !cameraInput || !performanceInput || Object.values(offsetInputs).some((input) => !input)) {
  throw new Error("The game interface could not be found.");
}

const NEIGHBORHOOD_STORAGE_KEY = "mobile-walker:neighborhood-offsets";
const storage = getBrowserStorage();
try {
  const savedOffsets = JSON.parse(storage.getItem(NEIGHBORHOOD_STORAGE_KEY) ?? "null") as Partial<ChunkNeighborhoodOffsets> | null;
  if (savedOffsets) for (const [direction, input] of Object.entries(offsetInputs)) {
    const value = savedOffsets[direction as keyof ChunkNeighborhoodOffsets];
    if (typeof value === "number" && Number.isFinite(value)) input!.value = String(value);
  }
} catch { /* Invalid or unavailable settings fall back to the values in the interface. */ }

const game = new Game(canvas);
const restartGame = (): void => window.location.reload();
const resetProgress = (): void => { resetGameState(getBrowserStorage()); window.location.reload(); };
const toggleSettingsPanel = (): void => {
  const open = settingsPanel.hidden;
  settingsPanel.hidden = !open;
  settingsButton.setAttribute("aria-expanded", String(open));
  if (open) {
    debugPanel.hidden = true;
    debugButton.setAttribute("aria-expanded", "false");
  }
};
const toggleDebugPanel = (): void => {
  const open = debugPanel.hidden;
  debugPanel.hidden = !open;
  debugButton.setAttribute("aria-expanded", String(open));
  if (open) {
    settingsPanel.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
  }
};
const updateDebugView = (): void => game.setDebugView({
  wireframe: wireframeInput.checked,
  biomeGuide: biomesInput.checked,
});
const updateCameraDetails = (): void => game.setCameraDetailsEnabled(cameraInput.checked);
const updatePerformanceView = (): void => game.setPerformanceViewEnabled(performanceInput.checked);
const updateNeighborhood = (): void => {
  const offsets = Object.fromEntries(Object.entries(offsetInputs).map(([direction, input]) => {
    const value = clampNeighborhoodOffset(Number(input!.value));
    input!.value = String(value);
    return [direction, value];
  })) as unknown as ChunkNeighborhoodOffsets;
  game.setNeighborhoodOffsets(offsets);
  try { storage.setItem(NEIGHBORHOOD_STORAGE_KEY, JSON.stringify(offsets)); } catch { /* Gameplay remains live without storage. */ }
};

restartButton.addEventListener("click", restartGame);
resetProgressButton.addEventListener("click", resetProgress);
settingsButton.addEventListener("click", toggleSettingsPanel);
debugButton.addEventListener("click", toggleDebugPanel);
for (const input of [wireframeInput, biomesInput]) input.addEventListener("change", updateDebugView);
cameraInput.addEventListener("change", updateCameraDetails);
performanceInput.addEventListener("change", updatePerformanceView);
for (const input of Object.values(offsetInputs)) input!.addEventListener("input", updateNeighborhood);
updateNeighborhood();
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    restartButton.removeEventListener("click", restartGame);
    resetProgressButton.removeEventListener("click", resetProgress);
    settingsButton.removeEventListener("click", toggleSettingsPanel);
    debugButton.removeEventListener("click", toggleDebugPanel);
    for (const input of [wireframeInput, biomesInput]) input.removeEventListener("change", updateDebugView);
    cameraInput.removeEventListener("change", updateCameraDetails);
    performanceInput.removeEventListener("change", updatePerformanceView);
    for (const input of Object.values(offsetInputs)) input!.removeEventListener("input", updateNeighborhood);
    game.dispose();
  });
}
