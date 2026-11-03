import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Check, Navigation, Waves } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  CROSSING_STEPS,
  crossingProgress,
  crossingSteps,
  ferryLeft,
  sceneLabel,
  type CrossingStep,
} from "@/lib/ferry/crossingProgress";
import { formatDateParts } from "@/lib/ferry/format";
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
  // Parti ou pas ? Seule une preuve le dit : heure de départ relevée, ou navire vu en mer.
  const seenAtSea = progress.signal?.phase === "sea";
  const departed =
    progress.times.departure.kind === "observed" ||
    seenAtSea ||
    progress.times.arrival.kind === "observed";
  const pastDeparture = at >= Date.parse(progress.times.departure.iso ?? departure.departure_at);
  const steps =
    departure.status === "cancelled"
      ? null
      : crossingSteps({
          scene,
          departed,
          arrived: progress.times.arrival.kind === "observed",
          pastDeparture,
          arrivalDue: progress.arrivalDue,
        });
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
                ? `Parti · ${atSeaLabel.toLowerCase()}`
                : "Au port"
              : departed
                ? atSeaLabel
                : "Départ en attente de confirmation";
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
            <span>
              {steps?.departure === "pending"
                ? "Si le navire est parti à l’heure"
                : progress.trustLabel}
            </span>
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
      {steps ? (
        <CrossingSteps
          marks={steps}
          departure={departure}
          times={progress.times}
          seenAtSea={seenAtSea}
          ratio={progress.ratio}
          estimated={estimated}
          fromZone={portTimeZone(from)}
          toZone={portTimeZone(to)}
        />
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

const STEP_LABEL: Record<CrossingStep, string> = {
  boarding: "Embarquement",
  departure: "Départ",
  sea: "Traversée",
  arrival: "Arrivée",
  landing: "Débarquement",
};
const MARK_TITLE = {
  done: "Constaté",
  assumed: "Sans doute passé, d’après l’horaire",
  current: "En cours",
  pending: "Heure passée, pas encore confirmé",
  todo: "À venir",
} as const;

/** Embarquement, départ, traversée, arrivée, débarquement : ce qui est fait, en cours ou à confirmer. */
function CrossingSteps({
  marks,
  departure,
  times,
  seenAtSea,
  ratio,
  estimated,
  fromZone,
  toZone,
}: {
  marks: NonNullable<ReturnType<typeof crossingSteps>>;
  departure: Departure;
  times: ReturnType<typeof crossingProgress>["times"];
  seenAtSea: boolean;
  ratio: number | null;
  estimated: boolean;
  fromZone: string;
  toZone: string;
}) {
  const time = (iso: string | null, zone: string) => (iso ? formatDateParts(iso, zone).time : null);
  const leave = time(times.departure.iso, fromZone);
  const land = time(times.arrival.iso, toZone);
  const presentation =
    departure.presentation_minutes && times.departure.scheduledIso
      ? time(
          new Date(
            Date.parse(times.departure.scheduledIso) - departure.presentation_minutes * 60_000,
          ).toISOString(),
          fromZone,
        )
      : null;
  const sub: Record<CrossingStep, string | null> = {
    boarding: presentation ? `présentation ${presentation}` : null,
    departure:
      times.departure.kind === "observed"
        ? `parti à ${leave}`
        : seenAtSea
          ? "parti, vu en mer"
          : marks.departure === "pending"
            ? `prévu ${leave} · à confirmer`
            : leave
              ? `prévu ${leave}`
              : null,
    sea:
      marks.sea === "current" && ratio !== null
        ? `${estimated ? "≈ " : ""}${Math.round(ratio * 100)} %`
        : null,
    arrival: land
      ? times.arrival.kind === "observed"
        ? `arrivé à ${land}`
        : marks.arrival === "pending"
          ? `prévue ${land} · à confirmer`
          : `${times.arrival.kind === "estimated" ? "≈" : "prévue"} ${land}`
      : null,
    landing: null,
  };
  const pending = Object.values(marks).includes("pending");
  return (
    <div className="bw-crossing-steps">
      <ol aria-label="Étapes de la traversée">
        {CROSSING_STEPS.map((step) => (
          <li key={step} data-mark={marks[step]} title={MARK_TITLE[marks[step]]}>
            <span className="bw-crossing-steps__dot" aria-hidden>
              {marks[step] === "done" || marks[step] === "assumed" ? (
                <Check size={11} strokeWidth={3} />
              ) : marks[step] === "pending" ? (
                "?"
              ) : null}
            </span>
            <strong>{STEP_LABEL[step]}</strong>
            {sub[step] ? <small>{sub[step]}</small> : null}
            <span className="sr-only"> · {MARK_TITLE[marks[step]]}</span>
          </li>
        ))}
      </ol>
      {pending ? (
        <p className="bw-crossing-steps__note">
          « À confirmer » : l’heure est passée, mais aucun signal du navire ni information
          vérifiée ne le confirme encore.
        </p>
      ) : null}
    </div>
  );
}
