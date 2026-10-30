import { departureHold, haversineKm, trackingTimes, type LiveShip } from "./tracking";
import type { Departure, Port } from "./types";

/** The card never invents a duration or interprets a timetable as a confirmed position. */
export function crossingProgress(
  departure: Departure,
  from: Port,
  to: Port,
  live?: LiveShip | null,
  now = Date.now(),
  /** Navire immobilisé selon un dossier : aucun avancement à montrer. */
  stopped = false,
) {
  const signal = live?.departure.id === departure.id ? live : null;
  const times = trackingTimes(departure, signal);
  const total = haversineKm([from.longitude, from.latitude], [to.longitude, to.latitude]);
  const geographic = signal && signal.ageMinutes <= 30 && signal.remainingKm !== null && total > 0;
  const start = Date.parse(departure.departure_at);
  const end = departure.arrival_at
    ? Date.parse(departure.arrival_at)
    : departure.duration_minutes && departure.duration_minutes > 0
      ? start + departure.duration_minutes * 60_000
      : NaN;
  const scheduled = Number.isFinite(start) && Number.isFinite(end) && end > start;
  // Encore à quai : aucun avancement. Dernier signal à quai trop ancien : on ne sait pas.
  const hold = signal ? departureHold(departure, signal.position, from, now) : null;
  const ratio =
    departure.status === "cancelled" || stopped
      ? null
      : hold
        ? hold.fresh
          ? 0
          : null
        : times.arrival.kind === "observed"
          ? 1
          : geographic
            ? 1 - signal.remainingKm! / total
            : scheduled
              ? (now - start) / (end - start)
              : null;
  return {
    times,
    ratio: ratio === null ? null : Math.max(0, Math.min(1, ratio)),
    source: hold
      ? "Signal AIS à quai"
      : times.arrival.kind === "observed"
        ? "Arrivée constatée (AIS)"
        : geographic
          ? "Position AIS · distance indicative"
          : "Repère horaire",
    signal,
    hold,
  };
}
