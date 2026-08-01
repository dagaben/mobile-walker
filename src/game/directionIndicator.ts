let expandedIndicator: HTMLElement | undefined;

function setExpanded(indicator: HTMLElement, expanded: boolean): void {
  indicator.dataset.expanded = String(expanded);
  indicator.setAttribute("aria-expanded", String(expanded));
}

/** Makes a direction indicator toggle its name while keeping only one indicator expanded. */
export function makeDirectionIndicatorExpandable(indicator: HTMLElement): () => void {
  setExpanded(indicator, false);
  const toggle = (): void => {
    const expand = expandedIndicator !== indicator;
    if (expandedIndicator) setExpanded(expandedIndicator, false);
    expandedIndicator = expand ? indicator : undefined;
    setExpanded(indicator, expand);
  };
  indicator.addEventListener("click", toggle);
  return () => {
    indicator.removeEventListener("click", toggle);
    if (expandedIndicator === indicator) expandedIndicator = undefined;
  };
}

/** Collapses an indicator when its target or guide is no longer available. */
export function collapseDirectionIndicator(indicator: HTMLElement): void {
  if (expandedIndicator === indicator) expandedIndicator = undefined;
  setExpanded(indicator, false);
}
