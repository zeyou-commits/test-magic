import type { Departure, RouteLine } from "@/lib/ferry/types";

/**
 * Signaler un retard (ou l'embarquement) : on choisit la traversée concernée parmi celles
 * programmées au départ du port. Les voyageurs voient les 7 prochains jours ; l'équipe peut
 * regarder plus loin. Les mêmes bornes sont contrôlées par le serveur (bw_report_travel).
 */
export const CROSSING_CATEGORIES = ["delay", "boarding"] as const;
export const REPORT_WINDOW_DAYS = 7;
/**
 * Une traversée déjà partie reste signalable tant qu'elle n'est pas arrivée depuis plus de 2 h
 * (un retard à l'arrivée compte aussi), dans la limite de 36 h après son départ.
 */
export const REPORT_PAST_HOURS = 36;
const AFTER_ARRIVAL_MS = 2 * 3_600_000;
/** Sans heure d'arrivée connue, la traversée est réputée terminée 48 h après le départ. */
const UNKNOWN_ARRIVAL_MS = 48 * 3_600_000;
/** « Voir au-delà de 7 jours » : réservé à l'équipe. */
export const STAFF_WINDOW_DAYS = 90;

export function needsCrossing(category: string | null | undefined) {
  return Boolean(category && (CROSSING_CATEGORIES as readonly string[]).includes(category));
}

export function crossingWindow(now: number, beyond: boolean) {
  return {
    since: new Date(now - REPORT_PAST_HOURS * 3_600_000).toISOString(),
    until: new Date(
      now + (beyond ? STAFF_WINDOW_DAYS : REPORT_WINDOW_DAYS) * 86_400_000,
    ).toISOString(),
  };
}

/** Les traversées au départ de ce port dans la fenêtre, de la plus proche à la plus lointaine. */
export function crossingsFromPort(
  departures: Departure[],
  routes: Pick<RouteLine, "id" | "departure_port_id">[],
  portId: string | null,
  now: number,
  beyond = false,
) {
  if (!portId) return [];
  const routeIds = new Set(
    routes.filter((route) => route.departure_port_id === portId).map((route) => route.id),
  );
  const { since, until } = crossingWindow(now, beyond);
  const from = Date.parse(since);
  const to = Date.parse(until);
  return departures
    .filter((departure) => {
      const at = Date.parse(departure.departure_at);
      const arrival = departure.arrival_at ? Date.parse(departure.arrival_at) : at + UNKNOWN_ARRIVAL_MS;
      return (
        arrival + AFTER_ARRIVAL_MS >= now &&
        routeIds.has(departure.route_id) &&
        !departure.is_demo &&
        departure.status !== "cancelled" &&
        at >= from &&
        at < to
      );
    })
    .sort((a, b) => Date.parse(a.departure_at) - Date.parse(b.departure_at));
}
