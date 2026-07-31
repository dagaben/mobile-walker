import "./style.css";

import { Game } from "./core/Game";
import { getBrowserStorage, resetGameState } from "./game/persistence";
import {
  clampNeighborhoodOffset,
  MAX_NEIGHBORHOOD_OFFSET,
  MIN_NEIGHBORHOOD_OFFSET,
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
const terrainOcclusionInput = document.querySelector<HTMLInputElement>("#debug-terrain-occlusion");
const occlusionMapInput = document.querySelector<HTMLInputElement>("#debug-occlusion-map");
const poisInput = document.querySelector<HTMLSelectElement>("#debug-pois");
const cameraInput = document.querySelector<HTMLInputElement>("#debug-camera");
const performanceInput = document.querySelector<HTMLInputElement>("#debug-performance");
const shadowsInput = document.querySelector<HTMLInputElement>("#debug-shadows");
const sunlightVerticalInput = document.querySelector<HTMLInputElement>("#sunlight-vertical");
const sunlightHorizontalInput = document.querySelector<HTMLInputElement>("#sunlight-horizontal");
const sunlightVerticalValue = document.querySelector<HTMLOutputElement>("#sunlight-vertical-value");
const sunlightHorizontalValue = document.querySelector<HTMLOutputElement>("#sunlight-horizontal-value");
const offsetOutputs = Object.fromEntries(["west", "east", "north", "south"].map((direction) => [
  direction, document.querySelector<HTMLOutputElement>(`#offset-${direction}`),
])) as Record<keyof ChunkNeighborhoodOffsets, HTMLOutputElement | null>;
const offsetButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-offset-direction][data-offset-change]")];

if (!canvas || !restartButton || !resetProgressButton || !settingsButton || !settingsPanel || !debugButton || !debugPanel || !wireframeInput || !biomesInput || !terrainOcclusionInput || !occlusionMapInput || !poisInput || !cameraInput || !performanceInput || !shadowsInput || !sunlightVerticalInput || !sunlightHorizontalInput || !sunlightVerticalValue || !sunlightHorizontalValue || Object.values(offsetOutputs).some((output) => !output) || offsetButtons.length !== 8) {
  throw new Error("The game interface could not be found.");
}

const NEIGHBORHOOD_STORAGE_KEY = "mobile-walker:neighborhood-offsets";
const SUNLIGHT_STORAGE_KEY = "mobile-walker:sunlight-angles";
const storage = getBrowserStorage();
try {
  const savedOffsets = JSON.parse(storage.getItem(NEIGHBORHOOD_STORAGE_KEY) ?? "null") as Partial<ChunkNeighborhoodOffsets> | null;
  if (savedOffsets) for (const [direction, output] of Object.entries(offsetOutputs)) {
    const value = savedOffsets[direction as keyof ChunkNeighborhoodOffsets];
    if (typeof value === "number" && Number.isFinite(value)) output!.value = String(clampNeighborhoodOffset(value));
  }
} catch { /* Invalid or unavailable settings fall back to the values in the interface. */ }
try {
  const savedAngles = JSON.parse(storage.getItem(SUNLIGHT_STORAGE_KEY) ?? "null") as { vertical?: unknown; horizontal?: unknown } | null;
  if (typeof savedAngles?.vertical === "number" && Number.isFinite(savedAngles.vertical)) sunlightVerticalInput.value = String(Math.min(90, Math.max(10, savedAngles.vertical)));
  if (typeof savedAngles?.horizontal === "number" && Number.isFinite(savedAngles.horizontal)) sunlightHorizontalInput.value = String(Math.min(360, Math.max(0, savedAngles.horizontal)));
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
  disableTerrainOcclusion: terrainOcclusionInput.checked,
  occlusionMap: occlusionMapInput.checked,
  pois: poisInput.value as "off" | "accepted" | "candidates",
});
const updateCameraDetails = (): void => game.setCameraDetailsEnabled(cameraInput.checked);
const updatePerformanceView = (): void => game.setPerformanceViewEnabled(performanceInput.checked);
const updateShadows = (): void => game.setShadowsEnabled(shadowsInput.checked);
const updateSunlight = (): void => {
  const angles = { vertical: Number(sunlightVerticalInput.value), horizontal: Number(sunlightHorizontalInput.value) };
  sunlightVerticalValue.value = `${angles.vertical}°`;
  sunlightHorizontalValue.value = `${angles.horizontal}°`;
  game.setSunlightAngles(angles);
  try { storage.setItem(SUNLIGHT_STORAGE_KEY, JSON.stringify(angles)); } catch { /* Gameplay remains live without storage. */ }
};
const updateNeighborhood = (): void => {
  const offsets = Object.fromEntries(Object.entries(offsetOutputs).map(([direction, output]) => {
    const value = clampNeighborhoodOffset(Number(output!.value));
    output!.value = String(value);
    return [direction, value];
  })) as unknown as ChunkNeighborhoodOffsets;
  for (const button of offsetButtons) {
    const direction = button.dataset.offsetDirection as keyof ChunkNeighborhoodOffsets;
    const change = Number(button.dataset.offsetChange);
    button.disabled = change < 0
      ? offsets[direction] <= MIN_NEIGHBORHOOD_OFFSET
      : offsets[direction] >= MAX_NEIGHBORHOOD_OFFSET;
  }
  game.setNeighborhoodOffsets(offsets);
  try { storage.setItem(NEIGHBORHOOD_STORAGE_KEY, JSON.stringify(offsets)); } catch { /* Gameplay remains live without storage. */ }
};
const changeNeighborhoodOffset = (event: MouseEvent): void => {
  const button = event.currentTarget as HTMLButtonElement;
  const direction = button.dataset.offsetDirection as keyof ChunkNeighborhoodOffsets;
  offsetOutputs[direction]!.value = String(Number(offsetOutputs[direction]!.value) + Number(button.dataset.offsetChange));
  updateNeighborhood();
};

restartButton.addEventListener("click", restartGame);
resetProgressButton.addEventListener("click", resetProgress);
settingsButton.addEventListener("click", toggleSettingsPanel);
debugButton.addEventListener("click", toggleDebugPanel);
for (const input of [wireframeInput, biomesInput, terrainOcclusionInput, occlusionMapInput, poisInput]) input.addEventListener("change", updateDebugView);
cameraInput.addEventListener("change", updateCameraDetails);
performanceInput.addEventListener("change", updatePerformanceView);
shadowsInput.addEventListener("change", updateShadows);
sunlightVerticalInput.addEventListener("input", updateSunlight);
sunlightHorizontalInput.addEventListener("input", updateSunlight);
for (const button of offsetButtons) button.addEventListener("click", changeNeighborhoodOffset);
updateNeighborhood();
game.start();
updateShadows();
updateSunlight();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    restartButton.removeEventListener("click", restartGame);
    resetProgressButton.removeEventListener("click", resetProgress);
    settingsButton.removeEventListener("click", toggleSettingsPanel);
    debugButton.removeEventListener("click", toggleDebugPanel);
    for (const input of [wireframeInput, biomesInput, terrainOcclusionInput, occlusionMapInput, poisInput]) input.removeEventListener("change", updateDebugView);
    cameraInput.removeEventListener("change", updateCameraDetails);
    performanceInput.removeEventListener("change", updatePerformanceView);
    shadowsInput.removeEventListener("change", updateShadows);
    sunlightVerticalInput.removeEventListener("input", updateSunlight);
    sunlightHorizontalInput.removeEventListener("input", updateSunlight);
    for (const button of offsetButtons) button.removeEventListener("click", changeNeighborhoodOffset);
    game.dispose();
  });
}
