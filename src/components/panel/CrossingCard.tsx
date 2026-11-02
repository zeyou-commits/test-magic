import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Navigation, Waves } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { crossingProgress, ferryLeft, sceneLabel } from "@/lib/ferry/crossingProgress";
import { departureStopped, incidentForVessel, incidentsQuery } from "@/lib/ferry/incidents";
import type { Departure, Port } from "@/lib/ferry/types";
import { useVesselAlert } from "@/lib/ferry/vesselAlerts";
import { delayLabel, formatAge, type LiveShip } from "@/lib/ferry/tracking";
import { portTimeZone } from "@/lib/ferry/time";
import { TrackingTimes } from "./TrackingTimes";

import { MiniFerry } from "./MiniFerry";
import { SeaChip } from "./SeaForecast";

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
  const estimated = progress.trust !== "live" && progress.trust !== "observed";
  const atSeaLabel = estimated ? "En mer · estimé" : "En mer";
  const scene = awaited ? "stopped" : progress.scene;
  const label = sceneLabel(scene);
  const delay = progress.reportedPostponed ? null : delayLabel(progress.times);
  const status =
    departure.status === "cancelled"
      ? "Traversée annulée"
      : progress.reportedPostponed
        ? "Report ou annulation signalé"
      : progress.reportedQuay
        ? "Encore à quai · en retard"
      : label && !progress.hold
        ? label
      : progress.times.arrival.kind === "observed"
        ? "Arrivée constatée"
        : progress.hold
          ? progress.hold.fresh
            ? "Encore à quai · en retard"
            : "Départ à confirmer · en retard"
          : progress.arrivalDue && progress.signal?.phase !== "sea"
          ? "Arrivée à confirmer"
          : stopped || awaited
          ? `${alert?.label ?? "Navire immobilisé"}${awaited ? " · départ à confirmer" : ""}`
          : at < Date.parse(departure.departure_at) && progress.signal?.phase !== "sea"
            ? "Prochaine traversée"
            : progress.signal
              ? progress.signal.phase === "sea"
                ? atSeaLabel
                : "Au port"
              : atSeaLabel;
  return (
    <section className="bw-crossing" aria-label="Avancement de la traversée">
      <div className="bw-crossing-top" data-alert={stopped || awaited || undefined}>
        <span>
          {stopped || awaited ? <b className="bw-alert-mark" aria-hidden>!</b> : <Waves size={16} aria-hidden />}
          {status}
        </span>
        {delay ? <b className="bw-delay-badge">Retardé · {delay}</b> : null}
        {departure.status === "cancelled" ? null : (
          <SeaChip
            departureId={departure.id}
            from={from}
            to={to}
            departureAt={departure.departure_at}
            arrivalAt={progress.times.arrival.iso}
          />
        )}
        {isAdmin ? (
          <small>
            {progress.source}
            {progress.signal ? ` · ${formatAge(progress.signal.ageMinutes)}` : ""}
          </small>
        ) : null}
      </div>
      <div className="bw-crossing-route">
        <strong>{from.name}</strong>
        <ArrowRight size={17} aria-hidden />
        <strong>{to.name}</strong>
      </div>
      {scene === "stopped" ? (
        <div className="bw-crossing-progress">
          <div className="bw-crossing-progress-label">
            <span>
              {progress.reportedPostponed
                ? "Signalé sur place et validé par BledWay, à confirmer auprès de la compagnie"
                : (alert?.label ?? "Navire immobilisé")}
            </span>
          </div>
          <div className="bw-crossing-track">
            <i style={{ left: ferryLeft(0, 62, scene, 4) }}>
              <MiniFerry size={62} scene={scene} />
            </i>
          </div>
        </div>
      ) : progress.ratio !== null ? (
        <div className="bw-crossing-progress">
          <div className="bw-crossing-progress-label">
            <span>{progress.trustLabel}</span>
            <strong>
              {estimated ? "≈ " : ""}
              {Math.round(progress.ratio * 100)} %
            </strong>
          </div>
          <div
            className="bw-crossing-track"
            data-estimated={estimated || undefined}
            role="progressbar"
            aria-label={progress.trustLabel}
            aria-valuenow={Math.round(progress.ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${progress.ratio * 100}%` }} />
            <i style={{ left: ferryLeft(progress.ratio * 100, 62, scene, 4) }}>
              <MiniFerry size={62} scene={scene} />
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
      {progress.trust === "live" &&
      progress.signal &&
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
