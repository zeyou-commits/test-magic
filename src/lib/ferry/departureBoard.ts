import { emptyFilters, type Departure, type Port } from "./types";
import { formatAge, type LiveShip } from "./tracking";
import { mapStateToSearch } from "./urlState";
import type { VesselAlert } from "./vesselAlerts";

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
  const seen = signal ? `Signal du navire reçu ${formatAge(signal.ageMinutes)}.` : "";
  if (departure.status === "cancelled")
    return {
      label: "Annulée",
      tone: "alert",
      proof: "Traversée annulée selon le programme publié.",
    };
  if (observedArrival)
    return {
      label: "Arrivée constatée",
      tone: "done",
      proof: `Arrivée vue par le signal du navire. ${seen}`,
    };
  if (alert)
    return {
      label: `${alert.short} · à confirmer`,
      tone: "alert",
      proof: `${alert.label} selon la source. Seule la compagnie décide du sort de cette traversée : contactez-la avant de partir.`,
    };
  if (hold)
    return {
      label: hold.fresh ? "Encore à quai" : "Départ à confirmer",
      tone: "warning",
      proof: hold.fresh
        ? `Le navire est toujours à quai après l'heure prévue. ${seen}`
        : `Dernier signal à quai trop ancien pour savoir s'il est parti. ${seen}`,
    };
  if (signal?.phase === "sea")
    return {
      label: "En mer",
      tone: "live",
      proof: `Constaté en mer. ${seen} Arrivée estimée, à confirmer.`,
    };
  if (signal) return { label: "À quai", tone: "seen", proof: `Constaté à quai. ${seen}` };
  if (shiftMinutes !== null && shiftMinutes >= 5)
    return {
      label: "Retard estimé",
      tone: "warning",
      proof: `Retard estimé d'après le signal du navire. ${seen}`,
    };
  if (departure.status === "modified")
    return {
      label: "Horaire modifié",
      tone: "warning",
      proof: "Horaire modifié dans le programme publié.",
    };
  if (Date.parse(departure.departure_at) <= now)
    return {
      label: "Non confirmé",
      tone: "planned",
      proof: "L'heure prévue est passée, mais aucun signal du navire ne confirme le départ.",
    };
  return { label: "Prévu", tone: "planned", proof: PLANNED };
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
