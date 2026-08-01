const nativeGameGestureEvents = ["contextmenu", "selectstart", "dragstart"] as const;

export const preventNativeGameGesture = (event: Event): void => {
  event.preventDefault();
};

interface BrowserSelection {
  readonly isCollapsed: boolean;
  removeAllRanges(): void;
}

const browserSelection = (): BrowserSelection | null => window.getSelection();

/** Prevents browser chrome on the gameplay surface without affecting nearby controls. */
export const installGameGestureProtection = (
  surface: EventTarget,
  getSelection: () => BrowserSelection | null = browserSelection,
): (() => void) => {
  const clearStaleSelection = (): void => {
    const selection = getSelection();
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
  };

  for (const type of nativeGameGestureEvents) {
    surface.addEventListener(type, preventNativeGameGesture);
  }
  surface.addEventListener("pointerdown", clearStaleSelection);
  clearStaleSelection();

  return () => {
    for (const type of nativeGameGestureEvents) {
      surface.removeEventListener(type, preventNativeGameGesture);
    }
    surface.removeEventListener("pointerdown", clearStaleSelection);
  };
};
