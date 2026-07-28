import "./style.css";

import { Game } from "./core/Game";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const restartButton = document.querySelector<HTMLButtonElement>("#restart-button");

if (!canvas || !restartButton) {
  throw new Error("The game interface could not be found.");
}

const game = new Game(canvas);
const restartGame = (): void => window.location.reload();

restartButton.addEventListener("click", restartGame);
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    restartButton.removeEventListener("click", restartGame);
    game.dispose();
  });
}
