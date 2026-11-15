import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Vrai sur un appareil à souris (ordinateur). Sur téléphone et tablette,
 * placer le curseur d'office ouvre le clavier et cache l'écran : on s'en abstient.
 */
export function canAutoFocus() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true
  );
}

/**
 * À brancher sur `onOpenAutoFocus` d'une fenêtre : pas de clavier ouvert d'office au toucher.
 * Le focus va sur la fenêtre elle-même, pour que les lecteurs d'écran l'annoncent.
 */
export function keepKeyboardClosedOnTouch(event: Event) {
  if (canAutoFocus()) return;
  event.preventDefault();
  const dialog = event.target instanceof HTMLElement ? event.target : null;
  dialog?.focus({ preventScroll: true });
}
