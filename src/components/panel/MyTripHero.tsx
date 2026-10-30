import { VesselAlertTag } from "@/components/panel/VesselAlert";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Crosshair, Ship } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { tripEnd, useMyTrip, type MyTrip } from "@/lib/ferry/myTrip";
import { mergeTripSteps, myTripStatusQuery, tripStepsQuery } from "@/lib/ferry/presence";
import type { FleetShip } from "@/lib/ferry/fleet";
import type { Selection } from "@/lib/ferry/types";
import { formatDateTime } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
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
  const start = Date.parse(trip.departure.departure_at);
  const end = tripEnd(trip.departure);
  if (trip.departure.status === "cancelled") return { phase: "cancelled" as const, text: "Traversée annulée" };
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
 * Le cabas affiché est celui de mon étape (en route, au port, à bord, arrivé).
 */
export function MyTripHero({ onSelect }: { onSelect: (selection: Selection) => void }) {
  const { user } = useAuth();
  const { trip } = useMyTrip();
  const steps = mergeTripSteps(useQuery(tripStepsQuery).data);
  const status = useQuery(myTripStatusQuery(trip?.departure.id ?? "", user?.id)).data ?? null;
  const start = trip ? Date.parse(trip.departure.departure_at) : 0;
  const now = useNow(Boolean(trip) && start - Date.now() < 86_400_000);
  const alert = useVesselAlert(trip?.vessel?.id);
  if (!trip) return null;
  const phase = tripPhase(trip, now);
  // Navire en alerte : plus de compte à rebours ni d'« En mer », le départ reste à confirmer.
  const held = Boolean(alert) && phase.phase !== "cancelled" && phase.phase !== "arrived";
  const zone = portTimeZone(trip.from);
  const image =
    steps.find((step) => step.id === status)?.image ??
    (phase.phase === "sea" ? steps[2]!.image : phase.phase === "arrived" ? steps[3]!.image : steps[0]!.image);
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
            : "Partager l’arrivée avec ses proches";
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
        <img src={image} alt="" width={64} height={64} />
        <span className="bw-mytrip-hero__text">
          <small>
            Ma traversée{trip.vessel ? ` · ${trip.vessel.name}` : ""}{" "}
            <VesselAlertTag vesselId={trip.vessel?.id} />
          </small>
          <strong>
            {trip.from?.name ?? "Départ"} → {trip.to?.name ?? "Arrivée"}
          </strong>
          <span className="bw-mytrip-hero__date">
            {formatDateTime(trip.departure.departure_at, zone)}
            {trip.departure.status === "modified" ? " · horaire modifié" : ""}
          </span>
        </span>
        <ArrowRight size={18} aria-hidden />
      </button>
      <div className="bw-mytrip-hero__clock" aria-live="off">
        {held ? (
          <strong>{alert?.label} · départ à confirmer</strong>
        ) : phase.phase === "today" ? (
          <>
            <span>{phase.text}</span>
            <strong className="tabular-nums">{phase.countdown}</strong>
          </>
        ) : phase.phase === "sea" ? (
          <>
            <span>En mer</span>
            <span className="bw-mytrip-hero__progress" aria-label={`${Math.round(phase.progress * 100)} % du trajet`}>
              <span style={{ width: `${phase.progress * 100}%` }} />
            </span>
          </>
        ) : (
          <strong>{phase.text}</strong>
        )}
      </div>
      <div className="bw-mytrip-hero__foot">
        <span>{next}</span>
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
