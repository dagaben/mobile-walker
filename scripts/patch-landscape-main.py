from pathlib import Path
path = Path("src/main.ts")
text = path.read_text()
if "requestLandscape" in text:
    print("already patched")
    raise SystemExit(0)
old = """function beginPlay(): void {
  if (startScreen) startScreen.hidden = true;
  // Block ghost-clicks on the pause toolbar under the PLAY button (mobile).
  armPausePlayGuard();
"""
new = """function requestLandscape(): void {
  try {
    const orient = (screen as Screen & { orientation?: ScreenOrientation }).orientation;
    if (orient && typeof orient.lock === "function") {
      void orient.lock("landscape").catch(() => undefined);
    }
  } catch { /* unsupported */ }
}

function beginPlay(): void {
  if (startScreen) startScreen.hidden = true;
  // Block ghost-clicks on the pause toolbar under the PLAY button (mobile).
  armPausePlayGuard();
  requestLandscape();
"""
if old not in text:
    raise SystemExit("beginPlay marker not found")
text = text.replace(old, new, 1)
needle = 'playButton.addEventListener("click", beginPlay);'
insert = '''playButton.addEventListener("click", beginPlay);
window.addEventListener("orientationchange", () => {
  window.setTimeout(() => window.dispatchEvent(new Event("resize")), 120);
  window.setTimeout(() => window.dispatchEvent(new Event("resize")), 320);
});'''
if needle in text and "orientationchange" not in text:
    text = text.replace(needle, insert, 1)
path.write_text(text)
print("main.ts patched")
