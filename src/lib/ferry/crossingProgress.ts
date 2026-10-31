import {
  departureHold,
  formatAge,
  haversineKm,
  trackingTimes,
  TRUSTED_SIGNAL_MINUTES,
  type CrossingSchedule,
  type LiveShip,
} from "./tracking";
import type { Port } from "./types";

/**
 * D'où vient l'état affiché : arrivée constatée, position récente, position ancienne, ou horaire seul.
 * Le voyageur doit toujours pouvoir distinguer ce qui est observé de ce qui est calculé.
 */
export type TrackingTrust = "observed" | "live" | "aged" | "schedule";

export function trustLabel(trust: TrackingTrust, ageMinutes: number | null) {
  if (trust === "observed") return "Arrivée constatée";
  if (trust === "live") return `Position réelle · ${formatAge(ageMinutes ?? 0)}`;
  if (trust === "aged") return `Estimation · dernière position ${formatAge(ageMinutes ?? 0)}`;
  return "Estimation d’après l’horaire · position non captée";
}

/** The card never invents a duration or interprets a timetable as a confirmed position. */
export function crossingProgress(
  departure: CrossingSchedule,
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
  const observedArrival = times.arrival.kind === "observed";
  const trust: TrackingTrust = observedArrival
    ? "observed"
    : !signal
      ? "schedule"
      : signal.ageMinutes <= TRUSTED_SIGNAL_MINUTES
        ? "live"
        : "aged";
  // L'heure passée ne prouve pas l'arrivée : seul un signal peut la constater.
  const arrivalIso = times.arrival.iso;
  return {
    times,
    trust,
    trustLabel: trustLabel(trust, signal?.ageMinutes ?? null),
    arrivalDue:
      !observedArrival && !hold && Boolean(arrivalIso) && Date.parse(arrivalIso!) < now,
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
