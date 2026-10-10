import { useSyncExternalStore } from "react";

// Signale quand la base ne répond pas, pour afficher un message au lieu d'une page d'erreur.
let offline = false;
const listeners = new Set<() => void>();

export function markOffline() {
  if (offline || typeof window === "undefined") return;
  offline = true;
  listeners.forEach((listener) => listener());
}

export function isNetworkError(message: string) {
  return /fetch|network|timeout|load failed|503|502|504/i.test(message);
}

export function useDataOffline() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => offline,
    () => false,
  );
}
