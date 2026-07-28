import "./style.css";

import { Game } from "./core/Game";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");

if (!canvas) {
  throw new Error("The game canvas could not be found.");
}

const game = new Game(canvas);
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
