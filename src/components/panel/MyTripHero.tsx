import { CabasImg } from "@/components/CabasImg";
import { crossingProgress, ferryLeft, replacedTime } from "@/lib/ferry/crossingProgress";
import { delayLabel, reportedCrossing } from "@/lib/ferry/tracking";
import { MiniFerry } from "./MiniFerry";
import { useLiveShips } from "@/lib/ferry/useLiveShips";
import { VesselAlertTag } from "@/components/panel/VesselAlert";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Crosshair, Ship } from "lucide-react";
import { SeaIcon, useSeaPeak } from "./SeaForecast";
import { seaHeight, seaLevel } from "@/lib/ferry/seaState";
import { TravellerAvatar } from "@/components/community/TravellerAvatar";
import { myTravellerQuery } from "@/lib/community/travellers";
import {
  prepProgress,
  preparationQuery,
  requestPrepFocus,
  tripDirection,
} from "@/lib/ferry/preparation";
import { useAuth } from "@/hooks/useAuth";
import { tripClosingIn, tripEnd, useMyTrip, type MyTrip } from "@/lib/ferry/myTrip";
import {
  dockedSinceQuery,
  mergeTripSteps,
  myTripStatusQuery,
  tripStepsQuery,
} from "@/lib/ferry/presence";
import { formatDocked, portPassage } from "@/lib/ferry/portPassage";
import { PortPassage } from "./PortPassage";
import { RoomButton } from "./LiveRoom";
import type { FleetShip } from "@/lib/ferry/fleet";
import type { Selection } from "@/lib/ferry/types";
import { formatDateParts, formatDateTime } from "@/lib/ferry/format";
import { dateKeyInZone, portTimeZone } from "@/lib/ferry/time";
import { useVesselAlert } from "@/lib/ferry/vesselAlerts";

/** Heure courante, rafraîchie chaque seconde le jour J, chaque minute sinon. */
export function useNow(fast: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), fast ? 1_000 : 60_000);
    return () => window.clearInterval(id);
  }, [fast]);
  return now;
}

const pad = (value: number) => String(value).padStart(2, "0");
/** « Départ dans 2 j 05 h », « 03 : 12 : 45 », « En mer », « Bien arrivés ». */
export function tripPhase(trip: MyTrip, now: number) {
  // Un retard validé décale le compte à rebours et l'arrivée.
  const start = reportedCrossing(trip.departure, now).start;
  const end = tripEnd(trip.departure);
  if (trip.departure.status === "cancelled")
    return { phase: "cancelled" as const, text: "Traversée annulée" };
  if (now < start) {
    const seconds = Math.floor((start - now) / 1000);
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    return days >= 1
      ? { phase: "before" as const, text: `Départ dans ${days} j ${pad(hours)} h`, countdown: null }
      : {
          phase: "today" as const,
          text: "Départ dans",
          countdown: `${pad(hours)} : ${pad(minutes)} : ${pad(seconds % 60)}`,
        };
  }
  if (now < end) {
    const progress = Math.min(1, Math.max(0, (now - start) / (end - start)));
    return { phase: "sea" as const, text: "En mer", progress };
  }
  return { phase: "arrived" as const, text: "Bien arrivés !" };
}

/**
 * Accueil : « Ma traversée » toujours en tête, avec le compte à rebours, l'état et l'action utile.
 * L'avatar est celui de mon profil ; sans profil, le cabas de mon étape.
 */
export function MyTripHero({ onSelect }: { onSelect: (selection: Selection) => void }) {
  const { user } = useAuth();
  const { trip } = useMyTrip();
  const ships = useLiveShips();
  const steps = mergeTripSteps(useQuery(tripStepsQuery).data);
  const status = useQuery(myTripStatusQuery(trip?.departure.id ?? "", user?.id)).data ?? null;
  const start = trip ? Date.parse(trip.departure.departure_at) : 0;
  const now = useNow(Boolean(trip) && start - Date.now() < 86_400_000);
  const alert = useVesselAlert(trip?.vessel?.id);
  const me = useQuery(myTravellerQuery(user?.id)).data;
  const preparation = useQuery(preparationQuery(trip?.departure.id, user?.id)).data;
  const dockedSeen = useQuery(dockedSinceQuery(trip?.departure.id ?? "")).data ?? null;
  const seaPeak = useSeaPeak(
    trip?.departure.id,
    trip?.from,
    trip?.to,
    trip?.departure.departure_at,
    trip ? new Date(tripEnd(trip.departure)).toISOString() : null,
  );
  if (!trip) return null;
  const phase = tripPhase(trip, now);
  const live = ships.find((ship) => ship.departure.id === trip.departure.id) ?? null;
  const progress =
    trip.from && trip.to ? crossingProgress(trip.departure, trip.from, trip.to, live, now) : null;
  const estimated = progress?.trust !== "live";
  const delay = progress && !progress.reportedPostponed ? delayLabel(progress.times) : null;
  const percent = progress?.ratio == null ? null : Math.round(progress.ratio * 100);
  const arrivedForSure = progress?.trust === "observed" || status === "arrived";
  const prep = preparation ? prepProgress(preparation, tripDirection(trip.from)) : null;
  // Navire en alerte : plus de compte à rebours ni d'« En mer », le départ reste à confirmer.
  const held = Boolean(alert) && phase.phase !== "cancelled" && !arrivedForSure;
  // Une fois le départ passé, préparer le voyage n'a plus de sens.
  const prepOpen = phase.phase === "before" || phase.phase === "today";
  // Arrivée constatée d'abord, sinon le premier arrêt vu à quai.
  const passage = portPassage({
    dockedSince: trip.departure.reported_arrived_at ?? trip.departure.web_arrived_at ?? dockedSeen,
    scheduledEnd: tripEnd(trip.departure),
    status,
    now,
  });
  const inPassage = passage.active && !held && phase.phase !== "cancelled";
  const closingIn = tripClosingIn(trip.departure, now);
  const zone = portTimeZone(trip.from);
  const arrivalZone = portTimeZone(trip.to);
  const departureIso = progress?.times.departure.iso ?? trip.departure.departure_at;
  const arrivalIso = progress?.times.arrival.iso ?? null;
  const dayDelta =
    arrivalIso && trip.to
      ? Math.round(
          (Date.parse(`${dateKeyInZone(arrivalIso, arrivalZone)}T00:00:00Z`) -
            Date.parse(`${dateKeyInZone(departureIso, zone)}T00:00:00Z`)) /
            86_400_000,
        )
      : 0;
  // Le suivi prend toute la place dès que le voyage a commencé : c'est le même bloc que « En navigation ».
  const underway =
    Boolean(progress) &&
    !inPassage &&
    !held &&
    !progress?.reportedPostponed &&
    (phase.phase === "sea" || Boolean(progress?.reportedQuay) || Boolean(progress?.hold));
  const image =
    steps.find((step) => step.id === status)?.image ??
    (phase.phase === "sea"
      ? steps[2]!.image
      : phase.phase === "arrived"
        ? (steps.find((step) => step.id === "arrived") ?? steps[0]!).image
        : steps[0]!.image);
  const next = held
    ? "Contactez la compagnie avant de partir et consultez les informations à jour"
    : phase.phase === "cancelled"
      ? "Voir les autres départs et les informations de la compagnie"
      : phase.phase === "before"
        ? "Préparer ma traversée : papiers, horaires, heure de présentation"
        : phase.phase === "today"
          ? `Rejoindre le port${trip.from ? ` ${/^[aeiouyhâéèêîôûAEIOUYHÂÉÈÊÎÔÛ]/.test(trip.from.name) ? "d’" : "de "}${trip.from.name}` : ""} et dire « Au port »`
          : phase.phase === "sea"
            ? "Suivre le navire et l’arrivée estimée"
            : arrivedForSure
              ? "Partager l’arrivée avec ses proches"
              : "Vous êtes arrivés ? Dites-le aux autres voyageurs";
  return (
    <section
      className="bw-mytrip-hero"
      data-phase={phase.phase}
      data-alert={held || undefined}
      aria-label="Ma traversée"
    >
      <button
        type="button"
        className="bw-mytrip-hero__main"
        onClick={() => onSelect({ type: "departure", id: trip.departure.id })}
      >
        <span className="bw-mytrip-hero__avatar">
          {me ? (
            <TravellerAvatar card={me} size={48} static />
          ) : (
            <CabasImg src={image} alt="" width={64} height={64} />
          )}
        </span>
        <span className="bw-mytrip-hero__text">
          {underway ? null : (
            <small>
              Ma traversée{trip.vessel ? ` · ${trip.vessel.name}` : ""}{" "}
              <VesselAlertTag vesselId={trip.vessel?.id} />
            </small>
          )}
          {underway ? (
            <strong className="bw-mytrip-hero__title">
              Ma traversée : {trip.from?.name ?? "Départ"} - {trip.to?.name ?? "Arrivée"}
            </strong>
          ) : (
            <strong>
              {trip.from?.name ?? "Départ"} → {trip.to?.name ?? "Arrivée"}
            </strong>
          )}
          {underway ? null : (
            <span className="bw-mytrip-hero__date">
              {formatDateTime(departureIso, zone)}
              {trip.departure.status === "modified" ? " · horaire modifié" : ""}
            </span>
          )}
          {delay && !underway ? <b className="bw-delay-badge">Retardé · {delay}</b> : null}
        </span>
        <ArrowRight size={18} aria-hidden />
      </button>
      {inPassage ? (
        <PortPassage
          departureId={trip.departure.id}
          portName={trip.to?.name ?? "d'arrivée"}
          minutes={passage.minutes}
          status={status}
        />
      ) : null}
      {underway || inPassage ? null : (
        <div className="bw-mytrip-hero__status">
          <div className="bw-mytrip-hero__clock" aria-live="off">
            {held ? (
              <strong>{alert?.label} · départ à confirmer</strong>
            ) : progress?.reportedPostponed ? (
              <strong>Report ou annulation signalé</strong>
            ) : progress?.reportedQuay ? (
              <strong>Encore à quai</strong>
            ) : phase.phase === "today" ? (
              <>
                <span>{phase.text}</span>
                <strong className="tabular-nums">{phase.countdown}</strong>
              </>
            ) : progress?.hold ? (
              <strong>{progress.hold.fresh ? "Encore à quai" : "Départ à confirmer"}</strong>
            ) : phase.phase === "arrived" && !arrivedForSure ? (
              <>
                <strong>Arrivée à confirmer</strong>
                {progress ? <small className="bw-trust">{progress.trustLabel}</small> : null}
              </>
            ) : (
              <strong>{phase.text}</strong>
            )}
          </div>
          {seaPeak != null && !held && phase.phase !== "cancelled" && phase.phase !== "arrived" ? (
            <div
              className="bw-mytrip-hero__sea"
              data-level={seaLevel(seaPeak).id}
              aria-label={`${seaLevel(seaPeak).label} prévue`}
            >
              <SeaIcon peak={seaPeak} size={24} />
              <span>
                <small>Mer</small>
                <b>
                  {seaLevel(seaPeak).short} · {seaHeight(seaPeak)}
                </b>
              </span>
            </div>
          ) : null}
        </div>
      )}
      {underway && progress ? (
        <div className="bw-mytrip-hero__voyage">
          {percent !== null ? (
            <>
              <div className="bw-mytrip-hero__voyage-head">
                <small>
                  {progress.reportedQuay || progress.hold
                    ? "Encore à quai"
                    : estimated
                      ? "En mer · estimé"
                      : "En mer"}
                </small>
                {seaPeak != null ? (
                  <span
                    className="bw-mytrip-hero__sea"
                    data-compact
                    data-level={seaLevel(seaPeak).id}
                    aria-label={`${seaLevel(seaPeak).label} prévue sur le reste du trajet`}
                  >
                    <SeaIcon peak={seaPeak} size={16} />
                    <b>{seaHeight(seaPeak)}</b>
                  </span>
                ) : null}
                <strong>
                  {estimated ? "≈ " : ""}
                  {percent} %
                </strong>
              </div>
              <div
                className="bw-crossing-track"
                data-estimated={estimated || undefined}
                role="progressbar"
                aria-label="Avancement de la traversée"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${percent}%` }} />
                <i style={{ left: ferryLeft(percent, 54, progress.scene, 4) }}>
                  <MiniFerry size={54} scene={progress.scene} />
                </i>
              </div>
            </>
          ) : (
            <small>Départ à confirmer</small>
          )}
          <div className="bw-mytrip-hero__voyage-times">
            {arrivalIso ? (
              <span className="bw-mytrip-hero__arrival">
                <span>
                  Arrivée <b>{formatDateParts(arrivalIso, arrivalZone).time}</b>
                  {dayDelta > 0 ? <sup>+{dayDelta} j</sup> : null}
                </span>
                {delay ? <small>Retard {delay}</small> : null}
                {replacedTime(progress.times.arrival) ? (
                  <s className="bw-old-time">
                    {formatDateParts(replacedTime(progress.times.arrival)!, arrivalZone).time}
                  </s>
                ) : null}
              </span>
            ) : null}
            {trip.vessel ? (
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("batogo:focus-vessel", {
                      detail: { vesselId: trip.vessel!.id },
                    }),
                  )
                }
              >
                <Crosshair size={13} aria-hidden /> {trip.vessel.name}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {prep && prepOpen && !underway ? (
        <button
          type="button"
          className="bw-mytrip-hero__prep"
          onClick={() => {
            requestPrepFocus(trip.departure.id);
            onSelect({ type: "departure", id: trip.departure.id });
          }}
        >
          <b>
            {prep.done}/{prep.total}
          </b>
          <span>{prep.next ? `À faire : ${prep.next.label}` : "Préparation terminée"}</span>
          <ArrowRight size={14} aria-hidden />
        </button>
      ) : null}
      {underway ? null : (
        <div className="bw-mytrip-hero__foot">
          {prep ? null : <span>{next}</span>}
          {trip.vessel && !held && (phase.phase === "today" || phase.phase === "sea") ? (
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("batogo:focus-vessel", { detail: { vesselId: trip.vessel!.id } }),
                )
              }
            >
              <Crosshair size={14} aria-hidden /> Voir mon navire
            </button>
          ) : null}
        </div>
      )}
      {closingIn !== null ? (
        <p className="bw-mytrip-hero__closing" role="status">
          Voyage terminé : cette fiche se ferme{" "}
          {closingIn < 60_000
            ? "dans moins d’une minute"
            : `dans ${formatDocked(Math.ceil(closingIn / 60_000))}`}
          .
        </p>
      ) : null}
      {phase.phase !== "cancelled" ? (
        <RoomButton
          departureId={trip.departure.id}
          onOpen={() => onSelect({ type: "departure", id: trip.departure.id })}
        />
      ) : null}
    </section>
  );
}

/**
 * Carte : quand mon navire n'y est pas encore (départ lointain, navire hors zone), une pastille
 * flottante avec le chrono ; un toucher ouvre « Ma traversée ».
 */
export function MyTripMapChip({
  fleet,
  onOpen,
}: {
  fleet: FleetShip[];
  onOpen: (selection: Selection) => void;
}) {
  const { trip } = useMyTrip();
  const start = trip ? Date.parse(trip.departure.departure_at) : 0;
  const now = useNow(Boolean(trip) && start - Date.now() < 86_400_000);
  const alert = useVesselAlert(trip?.vessel?.id);
  if (!trip) return null;
  const onMap = fleet.some((ship) => ship.vesselId && ship.vesselId === trip.departure.vessel_id);
  const phase = tripPhase(trip, now);
  if (onMap || phase.phase === "arrived") return null;
  return (
    <button
      type="button"
      className="bw-mytrip-chip"
      onClick={() => onOpen({ type: "departure", id: trip.departure.id })}
    >
      <span className="bw-mytrip-chip__icon" aria-hidden>
        <Ship size={16} />
      </span>
      <span>
        <small>Ma traversée{trip.vessel ? ` · ${trip.vessel.name}` : ""}</small>
        <strong className="tabular-nums">
          {alert && phase.phase !== "cancelled"
            ? "Départ à confirmer"
            : phase.phase === "today"
              ? `Départ dans ${phase.countdown}`
              : phase.text}
        </strong>
      </span>
    </button>
  );
}
