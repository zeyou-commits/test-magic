/**
 * Règles du bandeau d'actualités :
 * - une info rattachée à des traversées s'efface une fois la dernière arrivée (ou, à défaut, le
 *   départ + 24 h) passée de 12 h : « traversée avancée au 11 novembre » ne défile plus le 13 ;
 * - fermé, le bandeau revient dès qu'une nouvelle information arrive, ou au plus tard le lendemain.
 */
export const AFTER_CROSSING_MS = 12 * 3_600_000;
const CROSSING_FALLBACK_MS = 24 * 3_600_000;
export const DISMISS_FOR_MS = 24 * 3_600_000;

export type DepartureTimes = { departure_at: string; arrival_at: string | null };

/** Fin de la dernière traversée liée (ms), ou null si aucune n'est connue. */
export function lastCrossingEnd(ids: string[], times: Map<string, DepartureTimes>) {
  let end: number | null = null;
  for (const id of ids) {
    const t = times.get(id);
    if (!t) continue;
    const at = t.arrival_at
      ? Date.parse(t.arrival_at)
      : Date.parse(t.departure_at) + CROSSING_FALLBACK_MS;
    if (Number.isFinite(at) && (end === null || at > end)) end = at;
  }
  return end;
}

/** L'info ne concerne plus que des traversées terminées. */
export function crossingNewsExpired(
  item: { departure_ids: string[]; ends_at: string | null },
  times: Map<string, DepartureTimes>,
  now: number,
) {
  if (item.ends_at || !item.departure_ids.length) return false;
  // Toutes les traversées doivent être connues : sinon on ne présume pas qu'elles sont passées.
  if (!item.departure_ids.every((id) => times.has(id))) return false;
  const end = lastCrossingEnd(item.departure_ids, times);
  return end !== null && now - end > AFTER_CROSSING_MS;
}

/** Fermeture mémorisée : « version|horodatage » (les anciennes valeurs sans horodatage valent 0). */
export function encodeDismiss(version: string, now: number) {
  return `${now}#${version}`;
}

export function isDismissed(stored: string | null, version: string, now: number) {
  if (!stored) return false;
  const sep = stored.indexOf("#");
  const at = sep > 0 ? Number(stored.slice(0, sep)) : 0;
  const value = sep > 0 ? stored.slice(sep + 1) : stored;
  return value === version && Number.isFinite(at) && now - at < DISMISS_FOR_MS;
}
