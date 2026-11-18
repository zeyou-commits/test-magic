type StackElement = { style: { zIndex: string } };
let last: StackElement | null = null;
let order = 100;

/** Ports are DOM markers and ships are MapLibre popups: both share one local stacking order. */
export function bringTooltipToFront(element: StackElement | null | undefined) {
  if (!element || element === last) return;
  element.style.zIndex = String(++order);
  last = element;
}

/**
 * Bulles ouvertes de la carte (messages d'un lieu, signalements) : posées dans le calque de la
 * carte (`.bw-map-canvas`), à côté des filtres, et non dans MapLibre. Le conteneur MapLibre est
 * isolé (z auto) : tout ce qu'il contient passe sous la colonne des filtres (z 30). Le calque a
 * exactement la taille de la carte, une bulle positionnée par MapLibre reste donc à sa place.
 */
export const MAP_BUBBLE_Z = "40";
export function liftAboveMapControls(
  container: HTMLElement,
  element: HTMLElement | null | undefined,
) {
  if (!element) return;
  const layer = container.parentElement?.closest<HTMLElement>(".bw-map-canvas") ?? null;
  if (layer && element.parentElement !== layer) layer.append(element);
  element.style.zIndex = MAP_BUBBLE_Z;
}
