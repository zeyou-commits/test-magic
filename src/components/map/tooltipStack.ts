type StackElement = { style: { zIndex: string } };
let last: StackElement | null = null;
let order = 100;

/** Ports are DOM markers and ships are MapLibre popups: both share one local stacking order. */
export function bringTooltipToFront(element: StackElement | null | undefined) {
  if (!element || element === last) return;
  element.style.zIndex = String(++order);
  last = element;
}
