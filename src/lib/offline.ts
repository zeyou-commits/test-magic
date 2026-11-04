import {
  dehydrate,
  hydrate,
  type DehydratedState,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

/**
 * Le voyage hors ligne : sur un ferry, le réseau disparaît. Les données du voyage (mes traversées,
 * préparation, ports, liaisons, navires, compagnies, étapes) sont gardées sur l'appareil à chaque
 * chargement réussi, et reprises seulement si la page s'ouvre sans réseau.
 */
const KEY = "bledway:offline-voyage:v1";
const KEPT: QueryKey[] = [
  ["my-trips"],
  ["trip-preparation"],
  ["ports"],
  ["routes"],
  ["vessels"],
  ["companies"],
  ["bw-trip-steps"],
];
const isKept = (key: QueryKey) =>
  KEPT.some((prefix) => prefix.every((part, index) => key[index] === part)) &&
  // Les vues d'administration ne voyagent pas.
  !key.includes("admin");

/** Heure de la dernière sauvegarde, pour le dire dans le bandeau hors ligne. */
export function offlineSavedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? ((JSON.parse(raw) as { savedAt?: number }).savedAt ?? null) : null;
  } catch {
    return null;
  }
}

/** Sans réseau à l'ouverture : on reprend le voyage gardé. En ligne, rien n'est repris. */
export function restoreOffline(client: QueryClient) {
  if (typeof window === "undefined" || navigator.onLine) return;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) hydrate(client, (JSON.parse(raw) as { state: DehydratedState }).state);
  } catch {
    /* sauvegarde illisible : on continue sans */
  }
}

/** Garde le voyage à jour sur l'appareil, quelques secondes après chaque chargement réussi. */
export function keepOffline(client: QueryClient) {
  let timer: number | undefined;
  const save = () => {
    try {
      const state = dehydrate(client, {
        shouldDehydrateQuery: (query) => query.state.status === "success" && isKept(query.queryKey),
      });
      window.localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), state }));
    } catch {
      /* stockage plein ou indisponible : le voyage reste seulement en mémoire */
    }
  };
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    if (!isKept(event.query.queryKey)) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(save, 2_000);
  });
}
