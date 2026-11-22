import { useSyncExternalStore } from "react";

/**
 * Accueil en page vitrine (PC ≥ 1180 px sur Réserver, ou navigateur du téléphone) : la page
 * d'accueil le signale ici. Le bandeau du haut s'en sert pour laisser le fil d'actualités à la
 * pastille « En direct » du haut de page ; les alertes graves restent dans le bandeau.
 */
let landing = false;
const listeners = new Set<() => void>();

export function setHomeLanding(value: boolean) {
  if (landing === value) return;
  landing = value;
  listeners.forEach((listener) => listener());
}

export function useHomeLanding() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => landing,
    () => false,
  );
}
