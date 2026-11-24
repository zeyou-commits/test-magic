import { emptyFilters, type Departure, type Port } from "./types";
import { formatAge, type LiveShip } from "./tracking";
import { mapStateToSearch } from "./urlState";
import type { VesselAlert } from "./vesselAlerts";
import { tr } from "@/lib/i18n/translate";

export type BoardTone = "alert" | "warning" | "live" | "seen" | "planned" | "done";
export type BoardStatus = { label: string; tone: BoardTone; proof: string };

const PLANNED =
  "Horaire publié : aucun signal du navire pour le moment. Ce statut ne confirme pas le départ.";

/**
 * Statut d'une ligne du tableau : toujours « constaté » ou « prévu », jamais d'horaire présenté
 * comme une position réelle. Même ordre de priorité que la fiche traversée.
 */
export function boardStatus(input: {
  departure: Pick<Departure, "status" | "departure_at">;
  observedArrival: boolean;
  hold: { fresh: boolean } | null;
  signal: Pick<LiveShip, "phase" | "ageMinutes"> | null;
  shiftMinutes: number | null;
  alert: Pick<VesselAlert, "label" | "short"> | null;
  now: number;
}): BoardStatus {
  const { departure, observedArrival, hold, signal, shiftMinutes, alert, now } = input;
  const seen = signal ? tr("ui.libFerryDepartureBoard.signalDuNavireRecu", { formatAge: formatAge(signal.ageMinutes) }) : "";
  if (departure.status === "cancelled")
    return {
      label: tr("ui.libFerryDepartureBoard.annulee"),
      tone: "alert",
      proof: tr("ui.libFerryDepartureBoard.traverseeAnnuleeSelonLeProgramme"),
    };
  if (observedArrival)
    return {
      label: tr("ui.libFerryDepartureBoard.arriveeConstatee"),
      tone: "done",
      proof: tr("ui.libFerryDepartureBoard.arriveeVueParLeSignal", { seen }),
    };
  if (alert)
    return {
      label: tr("ui.libFerryDepartureBoard.aConfirmer", { short: alert.short }),
      tone: "alert",
      proof: tr("ui.libFerryDepartureBoard.selonLaSourceSeuleLa", { label: alert.label }),
    };
  if (hold)
    return {
      label: hold.fresh ? tr("ui.libFerryDepartureBoard.encoreAQuai") : tr("ui.libFerryDepartureBoard.departAConfirmer"),
      tone: "warning",
      proof: hold.fresh
        ? tr("ui.libFerryDepartureBoard.leNavireEstToujoursA", { seen })
        : tr("ui.libFerryDepartureBoard.dernierSignalAQuaiTrop", { seen }),
    };
  if (signal?.phase === "sea")
    return {
      label: tr("ui.libFerryDepartureBoard.enMer"),
      tone: "live",
      proof: tr("ui.libFerryDepartureBoard.constateEnMerArriveeEstimee", { seen }),
    };
  if (signal) return { label: tr("ui.libFerryDepartureBoard.aQuai"), tone: "seen", proof: tr("ui.libFerryDepartureBoard.constateAQuai", { seen }) };
  if (shiftMinutes !== null && shiftMinutes >= 5)
    return {
      label: tr("ui.libFerryDepartureBoard.retardEstime"),
      tone: "warning",
      proof: tr("ui.libFerryDepartureBoard.horaireMisAJourRetard"),
    };
  if (departure.status === "modified")
    return {
      label: tr("ui.libFerryDepartureBoard.horaireModifie"),
      tone: "warning",
      proof: tr("ui.libFerryDepartureBoard.horaireModifieDansLeProgramme"),
    };
  if (Date.parse(departure.departure_at) <= now)
    return {
      label: tr("ui.libFerryDepartureBoard.nonConfirme"),
      tone: "planned",
      proof: tr("ui.libFerryDepartureBoard.lHeurePrevueEstPassee"),
    };
  return { label: tr("ui.libFerryDepartureBoard.prevu"), tone: "planned", proof: PLANNED };
}

/** Période du tableau, jugée dans le fuseau du port concerné (la date du billet). */
export function inPeriod(
  dayKey: string,
  period: string | undefined,
  todayKey: string,
  tomorrowKey: string,
  weekEndKey: string,
) {
  if (!period) return true;
  if (period === "today") return dayKey === todayKey;
  if (period === "tomorrow") return dayKey === tomorrowKey;
  if (period === "week") return dayKey >= todayKey && dayKey <= weekEndKey;
  return dayKey === period;
}

/**
 * Lien vers la recherche des traversées, préremplie : même trajet et même date, toutes compagnies.
 * Unique point à changer le jour où le lien d'affiliation arrivera.
 */
export function priceSearchHref(
  from: Pick<Port, "id" | "country_code">,
  to: Pick<Port, "id">,
  dayKey: string,
) {
  return `/${mapStateToSearch(
    {
      ...emptyFilters,
      departurePortIds: [from.id],
      arrivalPortIds: [to.id],
      date: dayKey,
      roundTrip: false,
      direction: from.country_code === "DZ" ? "dz-eu" : "eu-dz",
    },
    null,
  )}`;
}
