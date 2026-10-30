import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Navigation, Waves } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { crossingProgress } from "@/lib/ferry/crossingProgress";
import { departureStopped, incidentForVessel, incidentsQuery } from "@/lib/ferry/incidents";
import type { Departure, Port } from "@/lib/ferry/types";
import { useVesselAlert } from "@/lib/ferry/vesselAlerts";
import { formatAge, type LiveShip } from "@/lib/ferry/tracking";
import { portTimeZone } from "@/lib/ferry/time";
import { TrackingTimes } from "./TrackingTimes";

import { MiniFerry } from "./MiniFerry";

export function CrossingCard({
  departure,
  from,
  to,
  live,
}: {
  departure: Departure;
  from: Port;
  to: Port;
  live?: LiveShip | null | undefined;
}) {
  const { isAdmin } = useAuth();
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const at = Date.now();
  const stopped = departureStopped(
    incidentForVessel(incidents, departure.vessel_id),
    departure,
    at,
  );
  const alert = useVesselAlert(departure.vessel_id);
  const awaited = Boolean(alert) && at < Date.parse(departure.departure_at);
  const progress = crossingProgress(departure, from, to, live, at, stopped);
  const sourceLabel = isAdmin ? progress.source : "Avancement";
  const status =
    departure.status === "cancelled"
      ? "Traversée annulée"
      : progress.times.arrival.kind === "observed"
        ? "Arrivée constatée"
        : progress.hold
          ? progress.hold.fresh
            ? "Encore à quai · en retard"
            : "Départ à confirmer · en retard"
          : stopped || awaited
          ? `${alert?.label ?? "Navire immobilisé"}${awaited ? " · départ à confirmer" : ""}`
          : at < Date.parse(departure.departure_at) && progress.signal?.phase !== "sea"
            ? "Prochaine traversée"
            : progress.signal
              ? progress.signal.phase === "sea"
                ? "En mer"
                : "Au port"
              : "Traversée en cours";
  return (
    <section className="bw-crossing" aria-label="Avancement de la traversée">
      <div className="bw-crossing-top" data-alert={stopped || awaited || undefined}>
        <span>
          {stopped || awaited ? <b className="bw-alert-mark" aria-hidden>!</b> : <Waves size={16} aria-hidden />}
          {status}
        </span>
        {isAdmin && progress.signal ? (
          <small>AIS · {formatAge(progress.signal.ageMinutes)}</small>
        ) : null}
      </div>
      <div className="bw-crossing-route">
        <strong>{from.name}</strong>
        <ArrowRight size={17} aria-hidden />
        <strong>{to.name}</strong>
      </div>
      {progress.ratio !== null && !awaited ? (
        <div className="bw-crossing-progress">
          <div className="bw-crossing-progress-label">
            <span>{sourceLabel}</span>
            <strong>{Math.round(progress.ratio * 100)} %</strong>
          </div>
          <div
            className="bw-crossing-track"
            role="progressbar"
            aria-label={sourceLabel}
            aria-valuenow={Math.round(progress.ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${progress.ratio * 100}%` }} />
            <i style={{ left: `${Math.max(4, Math.min(96, progress.ratio * 100))}%` }}>
              <MiniFerry size={62} />
            </i>
          </div>
        </div>
      ) : null}
      <TrackingTimes
        departure={departure}
        live={progress.signal}
        fromZone={portTimeZone(from)}
        toZone={portTimeZone(to)}
      />
      {progress.signal &&
      (progress.signal.remainingKm !== null || progress.signal.position.speedKnots !== null) ? (
        <div className="bw-crossing-metrics">
          <Navigation size={13} aria-hidden />
          {progress.signal.remainingKm !== null && progress.times.arrival.kind !== "observed" ? (
            <span>≈ {Math.round(progress.signal.remainingKm)} km à parcourir</span>
          ) : null}
          {progress.signal.position.speedKnots !== null ? (
            <span>{progress.signal.position.speedKnots.toFixed(1)} nœuds</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
