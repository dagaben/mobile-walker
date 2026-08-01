import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");

describe("game gesture styles", () => {
  it("disables selection and callouts on the game shell", () => {
    expect(styles).toMatch(/html, body, #app, #game-canvas\s*{[^}]*-webkit-user-select:\s*none;/s);
    expect(styles).toMatch(/html, body, #app, #game-canvas\s*{[^}]*user-select:\s*none;/s);
    expect(styles).toMatch(/html, body, #app, #game-canvas\s*{[^}]*-webkit-touch-callout:\s*none;/s);
  });

  it("keeps canvas gestures owned by the input controller", () => {
    expect(styles).toMatch(/#game-canvas\s*{[^}]*touch-action:\s*none;/s);
  });

  it("restores normal behavior for controls and scrollable panels", () => {
    expect(styles).toMatch(/input, textarea, select, \[contenteditable="true"\]\s*{[^}]*user-select:\s*auto;[^}]*-webkit-touch-callout:\s*default;/s);
    expect(styles).toMatch(/\.debug-panel, \.settings-panel\s*{[^}]*overflow-y:\s*auto;[^}]*touch-action:\s*pan-y;/s);
  });
});
