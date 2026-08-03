import "./style.css";

import { Game } from "./core/Game";
import { getBrowserStorage, resetGameState } from "./game/persistence";
import { installGameGestureProtection } from "./game/gameGestureProtection";
import { installPauseUi, armPausePlayGuard } from "./game/pauseUi";
import { TITLE_POSTER_DATA_URI } from "./titlePosterData";
import { fetchLeaderboard, renderLeaderboardList } from "./game/leaderboard";
import {
  clampNeighborhoodOffset,
  MAX_NEIGHBORHOOD_OFFSET,
  MIN_NEIGHBORHOOD_OFFSET,
  type ChunkNeighborhoodOffsets,
} from "./world/chunkCoordinates";
import {
  CAMERA_ORIENTATION_STORAGE_KEY, FOLLOW_RESPONSIVENESS_STORAGE_KEY,
  isCameraOrientationMode, isFollowResponsiveness,
  type CameraOrientationMode, type FollowResponsiveness,
} from "./game/cameraOrientation";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const restartButton = document.querySelector<HTMLButtonElement>("#restart-button");
const resetProgressButton = document.querySelector<HTMLButtonElement>("#reset-progress-button");
const settingsButton = document.querySelector<HTMLButtonElement>("#settings-button");
const settingsPanel = document.querySelector<HTMLElement>("#settings-panel");
const debugButton = document.querySelector<HTMLButtonElement>("#debug-button");
const debugPanel = document.querySelector<HTMLElement>("#debug-panel");
const wireframeInput = document.querySelector<HTMLInputElement>("#debug-wireframe");
const biomesInput = document.querySelector<HTMLInputElement>("#debug-biomes");
const poiDirectionsInput = document.querySelector<HTMLInputElement>("#debug-poi-directions");
const terrainOcclusionInput = document.querySelector<HTMLInputElement>("#debug-terrain-occlusion");
const occlusionMapInput = document.querySelector<HTMLInputElement>("#debug-occlusion-map");
const poisInput = document.querySelector<HTMLSelectElement>("#debug-pois");
const cameraInput = document.querySelector<HTMLInputElement>("#debug-camera");
const performanceInput = document.querySelector<HTMLInputElement>("#debug-performance");
const shadowsInput = document.querySelector<HTMLInputElement>("#debug-shadows");
const movementYawInput = document.querySelector<HTMLInputElement>("#movement-yaw");
const movementYawValue = document.querySelector<HTMLOutputElement>("#movement-yaw-value");
const orientationControl = document.querySelector<HTMLElement>("#camera-orientation");
const responsivenessControl = document.querySelector<HTMLElement>("#follow-responsiveness");
const movementYawSettings = document.querySelector<HTMLElement>("#movement-yaw-settings");
const responsivenessSettings = document.querySelector<HTMLElement>("#follow-responsiveness-settings");
const sunlightVerticalInput = document.querySelector<HTMLInputElement>("#sunlight-vertical");
const sunlightHorizontalInput = document.querySelector<HTMLInputElement>("#sunlight-horizontal");
const sunlightVerticalValue = document.querySelector<HTMLOutputElement>("#sunlight-vertical-value");
const sunlightHorizontalValue = document.querySelector<HTMLOutputElement>("#sunlight-horizontal-value");
const offsetButtons = document.querySelectorAll<HTMLButtonElement>("[data-offset-direction]");
const offsetOutputs = {
  north: document.querySelector<HTMLOutputElement>("#offset-north"),
  west: document.querySelector<HTMLOutputElement>("#offset-west"),
  east: document.querySelector<HTMLOutputElement>("#offset-east"),
  south: document.querySelector<HTMLOutputElement>("#offset-south"),
};
const startScreen = document.querySelector<HTMLElement>("#start-screen");
const playButton = document.querySelector<HTMLButtonElement>("#play-button");
const titlePoster = document.querySelector<HTMLImageElement>("#title-poster");
if (titlePoster) {
  titlePoster.src = TITLE_POSTER_DATA_URI;
}
const homeScores = document.querySelector<HTMLElement>("#home-scores");

if (!canvas || !restartButton || !resetProgressButton || !settingsButton || !settingsPanel || !debugButton || !debugPanel
  || !wireframeInput || !biomesInput || !poiDirectionsInput || !terrainOcclusionInput || !occlusionMapInput || !poisInput
  || !cameraInput || !performanceInput || !shadowsInput || !movementYawInput || !movementYawValue || !orientationControl
  || !responsivenessControl || !movementYawSettings || !responsivenessSettings || !sunlightVerticalInput
  || !sunlightHorizontalInput || !sunlightVerticalValue || !sunlightHorizontalValue
  || !startScreen || !playButton) {
  throw new Error("Required UI elements are missing from the document.");
}

const storage = getBrowserStorage();
const MOVEMENT_YAW_STORAGE_KEY = "mobile-walker-movement-yaw";
const SUNLIGHT_STORAGE_KEY = "mobile-walker-sunlight";
const NEIGHBORHOOD_STORAGE_KEY = "mobile-walker-neighborhood";

let orientationMode: CameraOrientationMode = "follow-movement";
let followResponsiveness: FollowResponsiveness = "normal";
try {
  const savedOrientation = storage.getItem(CAMERA_ORIENTATION_STORAGE_KEY);
  if (isCameraOrientationMode(savedOrientation)) orientationMode = savedOrientation;
  const savedResponsiveness = storage.getItem(FOLLOW_RESPONSIVENESS_STORAGE_KEY);
  if (isFollowResponsiveness(savedResponsiveness)) followResponsiveness = savedResponsiveness;
  const savedYaw = Number(storage.getItem(MOVEMENT_YAW_STORAGE_KEY));
  if (Number.isFinite(savedYaw)) movementYawInput.value = String(Math.min(45, Math.max(-45, savedYaw)));
} catch { /* keep defaults */ }
try {
  const savedAngles = JSON.parse(storage.getItem(SUNLIGHT_STORAGE_KEY) ?? "null") as { vertical?: unknown; horizontal?: unknown } | null;
  if (typeof savedAngles?.vertical === "number" && Number.isFinite(savedAngles.vertical)) sunlightVerticalInput.value = String(Math.min(90, Math.max(10, savedAngles.vertical)));
  if (typeof savedAngles?.horizontal === "number" && Number.isFinite(savedAngles.horizontal)) sunlightHorizontalInput.value = String(Math.min(360, Math.max(0, savedAngles.horizontal)));
} catch { /* keep defaults */ }

const game = new Game(canvas);
installPauseUi(game);
const removeGameGestureProtection = installGameGestureProtection(canvas);
const selectSegment = (control: HTMLElement, value: string): void => {
  for (const button of control.querySelectorAll<HTMLButtonElement>("button[role=radio]")) {
    const selected = button.dataset.value === value;
    button.setAttribute("aria-checked", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
};
const updateOrientation = (mode: CameraOrientationMode): void => {
  orientationMode = mode;
  selectSegment(orientationControl, mode);
  movementYawSettings.hidden = mode !== "north-locked";
  responsivenessSettings.hidden = mode !== "follow-movement";
  game.setCameraOrientationMode(mode);
  try { storage.setItem(CAMERA_ORIENTATION_STORAGE_KEY, mode); } catch { /* ok */ }
};
const updateResponsiveness = (value: FollowResponsiveness): void => {
  followResponsiveness = value;
  selectSegment(responsivenessControl, value);
  game.setFollowResponsiveness(value);
  try { storage.setItem(FOLLOW_RESPONSIVENESS_STORAGE_KEY, value); } catch { /* ok */ }
};
const activateSegment = (event: Event): void => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
  if (!button) return;
  if (button.parentElement === orientationControl && isCameraOrientationMode(button.dataset.value)) updateOrientation(button.dataset.value);
  if (button.parentElement === responsivenessControl && isFollowResponsiveness(button.dataset.value)) updateResponsiveness(button.dataset.value);
  button.focus();
};
const navigateSegment = (event: KeyboardEvent): void => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  const control = event.currentTarget as HTMLElement;
  const buttons = [...control.querySelectorAll<HTMLButtonElement>("button[data-value]")];
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  let next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : current + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1);
  next = (next + buttons.length) % buttons.length;
  event.preventDefault();
  buttons[next].click();
};
const restartGame = (): void => window.location.reload();
const resetProgress = (): void => {
  resetGameState(getBrowserStorage());
  window.location.reload();
};
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
const updateDebugView = (): void => {
  game.setDebugView({
    wireframe: wireframeInput.checked,
    biomeGuide: biomesInput.checked,
    disableTerrainOcclusion: terrainOcclusionInput.checked,
    occlusionMap: occlusionMapInput.checked,
    pois: poisInput.value as "off" | "accepted" | "candidates",
  });
  game.setCameraDetailsEnabled(cameraInput.checked);
  game.setPerformanceViewEnabled(performanceInput.checked);
  game.setShadowsEnabled(shadowsInput.checked);
};
const updatePoiDirections = (): void => game.setPoiDirectionsEnabled(poiDirectionsInput.checked);
const updateMovementYaw = (): void => {
  const degrees = Number(movementYawInput.value);
  movementYawValue.value = `${degrees}°`;
  game.setMovementYawStrength(degrees);
  try { storage.setItem(MOVEMENT_YAW_STORAGE_KEY, String(degrees)); } catch { /* ok */ }
};
const updateSunlight = (): void => {
  const angles = { vertical: Number(sunlightVerticalInput.value), horizontal: Number(sunlightHorizontalInput.value) };
  sunlightVerticalValue.value = `${angles.vertical}°`;
  sunlightHorizontalValue.value = `${angles.horizontal}°`;
  game.setSunlightAngles(angles);
  try { storage.setItem(SUNLIGHT_STORAGE_KEY, JSON.stringify(angles)); } catch { /* ok */ }
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
  try { storage.setItem(NEIGHBORHOOD_STORAGE_KEY, JSON.stringify(offsets)); } catch { /* ok */ }
};
const changeNeighborhoodOffset = (event: MouseEvent): void => {
  const button = event.currentTarget as HTMLButtonElement;
  const direction = button.dataset.offsetDirection as keyof ChunkNeighborhoodOffsets;
  offsetOutputs[direction]!.value = String(Number(offsetOutputs[direction]!.value) + Number(button.dataset.offsetChange));
  updateNeighborhood();
};

async function loadHomeLeaderboard(): Promise<void> {
  if (!homeScores) return;
  try {
    const board = await fetchLeaderboard();
    renderLeaderboardList(homeScores, board);
  } catch {
    homeScores.innerHTML = "<li style='opacity:.7'>No scores yet — be the first!</li>";
  }
}

function beginPlay(): void {
  if (startScreen) startScreen.hidden = true;
  // Block ghost-clicks on the pause toolbar under the PLAY button (mobile).
  armPausePlayGuard();
  updateNeighborhood();
  updateResponsiveness(followResponsiveness);
  updateOrientation(orientationMode);
  updateDebugView();
  updatePoiDirections();
  updateMovementYaw();
  updateSunlight();
  game.start();
  // Ensure we never leave the world paused + overlay up after PLAY.
  armPausePlayGuard();
}

restartButton.addEventListener("click", restartGame);
resetProgressButton.addEventListener("click", resetProgress);
settingsButton.addEventListener("click", toggleSettingsPanel);
debugButton.addEventListener("click", toggleDebugPanel);
for (const input of [wireframeInput, biomesInput, terrainOcclusionInput, occlusionMapInput, poisInput]) {
  input.addEventListener("change", updateDebugView);
}
poiDirectionsInput.addEventListener("change", updatePoiDirections);
cameraInput.addEventListener("change", updateDebugView);
performanceInput.addEventListener("change", updateDebugView);
shadowsInput.addEventListener("change", updateDebugView);
movementYawInput.addEventListener("input", updateMovementYaw);
orientationControl.addEventListener("click", activateSegment);
orientationControl.addEventListener("keydown", navigateSegment);
responsivenessControl.addEventListener("click", activateSegment);
responsivenessControl.addEventListener("keydown", navigateSegment);
sunlightVerticalInput.addEventListener("input", updateSunlight);
sunlightHorizontalInput.addEventListener("input", updateSunlight);
for (const button of offsetButtons) button.addEventListener("click", changeNeighborhoodOffset);
playButton.addEventListener("click", beginPlay);

void loadHomeLeaderboard();

window.addEventListener("pagehide", () => {
  try {
    orientationControl.removeEventListener("click", activateSegment);
    orientationControl.removeEventListener("keydown", navigateSegment);
    responsivenessControl.removeEventListener("click", activateSegment);
    responsivenessControl.removeEventListener("keydown", navigateSegment);
    sunlightVerticalInput.removeEventListener("input", updateSunlight);
    sunlightHorizontalInput.removeEventListener("input", updateSunlight);
    for (const button of offsetButtons) button.removeEventListener("click", changeNeighborhoodOffset);
    playButton.removeEventListener("click", beginPlay);
    removeGameGestureProtection();
    game.dispose();
  } catch { /* best-effort */ }
});
