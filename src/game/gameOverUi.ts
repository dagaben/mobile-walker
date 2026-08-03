import {
  fetchLeaderboard,
  qualifiesForBoard,
  renderLeaderboardList,
  submitScore,
} from "./leaderboard";
import { VD_GAME_OVER_EVENT } from "./ducks";

/** Wire game-over overlay + shared multiplayer leaderboard UI. */
export function installGameOverUi(): void {
  const gameOverScreen = document.querySelector<HTMLElement>("#game-over-screen");
  const finalScoreEl = document.querySelector<HTMLElement>("#final-score");
  const nameEntry = document.querySelector<HTMLElement>("#name-entry");
  const goLeaderboard = document.querySelector<HTMLElement>("#go-leaderboard");
  const goScores = document.querySelector<HTMLElement>("#go-scores");
  const submitNameButton = document.querySelector<HTMLButtonElement>("#submit-name-button");
  const playAgainButton = document.querySelector<HTMLButtonElement>("#play-again-button");
  const nameLetters = [0, 1, 2].map((i) => document.querySelector<HTMLInputElement>(`#name-letter-${i}`));
  let pendingGameOverScore = 0;

  async function showGameOver(score: number): Promise<void> {
    pendingGameOverScore = Math.floor(score);
    if (finalScoreEl) finalScoreEl.textContent = `Score: ${pendingGameOverScore}`;
    gameOverScreen?.classList.remove("hidden");
    const board = await fetchLeaderboard();
    if (qualifiesForBoard(pendingGameOverScore, board)) {
      nameEntry?.classList.remove("hidden");
      goLeaderboard?.classList.add("hidden");
      nameLetters[0]?.focus();
    } else {
      nameEntry?.classList.add("hidden");
      goLeaderboard?.classList.remove("hidden");
      if (goScores) renderLeaderboardList(goScores, board);
    }
  }

  window.addEventListener(VD_GAME_OVER_EVENT, ((event: CustomEvent<{ score: number }>) => {
    void showGameOver(event.detail.score);
  }) as EventListener);

  for (let i = 0; i < nameLetters.length; i += 1) {
    const input = nameLetters[i];
    if (!input) continue;
    input.addEventListener("input", () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 1);
      if (input.value && i < 2) nameLetters[i + 1]?.focus();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && i > 0) nameLetters[i - 1]?.focus();
      if (event.key === "Enter") submitNameButton?.click();
    });
  }

  submitNameButton?.addEventListener("click", async () => {
    const name = nameLetters.map((el) => (el?.value || "A")).join("");
    submitNameButton.disabled = true;
    submitNameButton.textContent = "SAVING…";
    const board = await submitScore(name, pendingGameOverScore);
    nameEntry?.classList.add("hidden");
    goLeaderboard?.classList.remove("hidden");
    if (goScores) renderLeaderboardList(goScores, board);
    submitNameButton.disabled = false;
    submitNameButton.textContent = "SAVE TO GLOBAL BOARD";
  });

  playAgainButton?.addEventListener("click", () => {
    window.location.reload();
  });
}
