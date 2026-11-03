import type { Sailing } from "./trips";
import type { Port, RouteLine } from "./types";
import { portTimeZone } from "./time";
import { compareRecommended, type TravelerType } from "./trips";

export interface RoadLeg {
  portId: string;
  distanceKm: number;
  durationMin: number;
}

export interface ItineraryMapPreview {
  key: number;
  fit?: boolean;
  routeId: string;
  origin: [number, number];
  destination: [number, number];
  departurePort: [number, number];
  arrivalPort: [number, number];
  roadToPort: [number, number][];
  roadDetailed: boolean;
  ferry: [number, number][];
  roadFromPort: [number, number][];
  alternatives: [number, number][][];
}

export interface ItineraryOption {
  sailing: Sailing;
  originRoad: RoadLeg;
  destinationRoad: RoadLeg;
  ferryEuro: number;
  roadEuro: number;
  totalEuro: number;
  roadKm: number;
  /** Durée du trajet effectivement parcouru, embarquement compris, sans jours d'attente. */
  totalMinutes: number;
  /** Départ conseillé du domicile pour atteindre ce ferry. */
  leaveHomeAt: number;
  /** Temps entre la première disponibilité saisie et le départ conseillé. */
  waitUntilTravelMin: number;
  arrivalAt: number;
}

/** Marges de simulation, affichées dans le récapitulatif du trajet. */
export const BOARDING_BUFFER_MIN = 240;
export const DISEMBARK_BUFFER_MIN = 240;

/** Repère de sécurité routière : une pause toutes les deux heures de conduite. */
export const PAUSE_EVERY_MIN = 120;
export const PAUSE_MIN = 15;
/** Pas de pause conseillée à moins d'une demi-heure de l'arrivée. */
export function drivingPauses(driveMin: number) {
  return Math.max(0, Math.floor((driveMin - 30) / PAUSE_EVERY_MIN));
}
/** Le temps réel d'un trajet routier : conduite et pauses conseillées. */
export function legWithPauses(driveMin: number) {
  return driveMin + drivingPauses(driveMin) * PAUSE_MIN;
}

/** Un repère par liaison pour comparer les ports lorsqu'aucun horaire n'est publié.
 * Le 15 du mois ne représente pas un départ réservable.
 */
export function buildSimulatedSailings(routes: RouteLine[], ports: Port[], period: string, publishedRouteIds: Set<string> = new Set()): Sailing[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return [];
  const departureAt = new Date(`${period}-15T12:00:00Z`);
  const portById = new Map(ports.filter((port) => port.status === "active").map((port) => [port.id, port]));
  return routes.flatMap((route) => {
    if (route.status !== "active" || publishedRouteIds.has(route.id)) return [];
    const from = portById.get(route.departure_port_id);
    const to = portById.get(route.arrival_port_id);
    if (!from || !to) return [];
    const durationMin = route.typical_duration_minutes && route.typical_duration_minutes > 0
      ? route.typical_duration_minutes
      : route.distance_km && route.distance_km > 0
        ? Math.max(360, Math.min(2160, Math.round(route.distance_km / 28 * 60)))
        : 1200;
    const arrivalAt = new Date(departureAt.getTime() + durationMin * 60_000);
    return [{
      isSimulation: true,
      departure: {
        id: `simulation:${route.id}:${period}`, route_id: route.id, company_id: route.company_ids[0] ?? "", vessel_id: null,
        schedule_id: null, departure_at: departureAt.toISOString(), arrival_at: arrivalAt.toISOString(), duration_minutes: durationMin,
        status: "scheduled" as const, source_name: null, source_url: null, last_verified_at: null, reliability: "to_verify" as const,
        notes: null, is_demo: true,
      },
      route, from, to, company: undefined, vessel: undefined,
      fromZone: portTimeZone(from), toZone: portTimeZone(to), dayKey: `${period}-15`, depTime: "", arrTime: null,
      arrDayOffset: Math.floor(durationMin / 1440), durationMin, depHour: 12,
    } satisfies Sailing];
  });
}

/** Ne compare que les traversées atteignables après le trajet routier et l'embarquement. */
export function buildItineraryOptions(
  sailings: Sailing[],
  toDeparturePorts: RoadLeg[],
  fromArrivalPorts: RoadLeg[],
  startedAt: number,
  ferryFare: (sailing: Sailing) => number,
  fuelLitresPer100Km: number,
  fuelEuroPerLitre: number,
  tollEuroPerKm: number,
  boardingBufferMin = BOARDING_BUFFER_MIN,
  disembarkBufferMin = DISEMBARK_BUFFER_MIN,
): ItineraryOption[] {
  const outward = new Map(toDeparturePorts.map((leg) => [leg.portId, leg]));
  const onward = new Map(fromArrivalPorts.map((leg) => [leg.portId, leg]));
  return sailings.flatMap((sailing) => {
    const first = outward.get(sailing.from.id);
    const last = onward.get(sailing.to.id);
    if (!first || !last || sailing.durationMin === null) return [];
    const departureAt = Date.parse(sailing.departure.departure_at);
    if (!Number.isFinite(departureAt) || departureAt < startedAt + (legWithPauses(first.durationMin) + boardingBufferMin) * 60_000) return [];
    const ferryArrivalAt = sailing.departure.arrival_at
      ? Date.parse(sailing.departure.arrival_at)
      : departureAt + sailing.durationMin * 60_000;
    if (!Number.isFinite(ferryArrivalAt)) return [];
    const arrivalAt = ferryArrivalAt + (disembarkBufferMin + legWithPauses(last.durationMin)) * 60_000;
    const roadKm = first.distanceKm + last.distanceKm;
    const ferryEuro = ferryFare(sailing);
    const roadEuro = Math.round(roadKm * (fuelLitresPer100Km / 100 * fuelEuroPerLitre + tollEuroPerKm));
    const leaveHomeAt = departureAt - (legWithPauses(first.durationMin) + boardingBufferMin) * 60_000;
    return [{
      sailing, originRoad: first, destinationRoad: last, ferryEuro, roadEuro,
      totalEuro: ferryEuro + roadEuro, roadKm,
      totalMinutes: Math.round((arrivalAt - leaveHomeAt) / 60_000),
      leaveHomeAt,
      waitUntilTravelMin: Math.max(0, Math.round((leaveHomeAt - startedAt) / 60_000)),
      arrivalAt,
    }];
  });
}

export type ItineraryPriority = "recommended" | "cost" | "time" | "driving";

export function sortItineraries(options: ItineraryOption[], priority: ItineraryPriority, children = 0) {
  return [...options].sort((a, b) => {
    if (priority === "time") return a.totalMinutes - b.totalMinutes || a.arrivalAt - b.arrivalAt;
    if (priority === "driving") return a.roadKm - b.roadKm || a.arrivalAt - b.arrivalAt;
    if (priority === "recommended") {
      // Même règle que la recherche de traversées, sur la durée porte à porte.
      const traveler: TravelerType = children > 0 ? "family" : "couple";
      const candidate = (option: ItineraryOption) => ({
        minutes: option.totalMinutes,
        hour: option.sailing.depHour,
        euro: option.totalEuro,
      });
      return compareRecommended(candidate(a), candidate(b), traveler) || a.arrivalAt - b.arrivalAt;
    }
    return a.totalEuro - b.totalEuro || a.arrivalAt - b.arrivalAt;
  });
}

/** En dessous d'une heure, l'écart est plus petit que nos marges : on ne désigne pas de gagnant. */
export const TIE_MIN = 60;

export function gapLabel(gapMin: number) {
  if (gapMin < TIE_MIN) return "À égalité";
  if (gapMin >= 2880) return `+${Math.round(gapMin / 1440)} j`;
  const rounded = Math.round(gapMin / 30) * 30;
  const hours = Math.floor(rounded / 60);
  return `+${hours} h${rounded % 60 ? " 30" : ""}`;
}

/**
 * Le comparatif : avec des dates, celui qui arrive le premier ; sans date publiée, seulement la durée.
 * Le premier de la liste reçue est le trajet recommandé ; il reste toujours dans le comparatif.
 */
export function compareItineraries(options: ItineraryOption[], limit = 6) {
  const recommended = options[0];
  if (!recommended) return [];
  const dated = !recommended.sailing.isSimulation;
  const score = (option: ItineraryOption) => (dated ? option.arrivalAt / 60_000 : option.totalMinutes);
  const best = (value: (option: ItineraryOption) => number) =>
    [...options].sort((a, b) => value(a) - value(b))[0]!;
  const fastest = best(score);
  const cheapest = best((option) => option.totalEuro);
  const nearest = best((option) => option.roadKm);
  const must = [recommended, fastest, cheapest, nearest];
  const others = [...options].sort((a, b) => score(a) - score(b)).filter((option) => !must.includes(option));
  const kept = [...new Set(must), ...others].slice(0, limit);
  return kept
    .sort((a, b) => score(a) - score(b))
    .map((option) => {
      const tags: string[] = [];
      if (option === recommended) tags.push("Recommandé");
      if (option === fastest && options.length > 1) tags.push(dated ? "Arrive le premier" : "Le plus court");
      if (option === cheapest && options.length > 1) tags.push("Moins cher");
      if (option === nearest && options.length > 1) tags.push("Moins de route");
      return {
        option,
        tags,
        gapMin: Math.round(score(option) - score(fastest)),
        euroDelta: Math.round(option.totalEuro - recommended.totalEuro),
      };
    });
}

/** Une proposition par couple de ports : le premier départ atteignable de chaque liaison.
 * Les autres dates restent disponibles dans la recherche des traversées.
 */
export function distinctItineraries(options: ItineraryOption[], priority: ItineraryPriority, children = 0) {
  const byPorts = new Map<string, ItineraryOption>();
  for (const option of options) {
    const key = `${option.sailing.from.id}|${option.sailing.to.id}`;
    const previous = byPorts.get(key);
    const departureAt = Date.parse(option.sailing.departure.departure_at);
    if (!previous || (previous.sailing.isSimulation && !option.sailing.isSimulation) ||
      (Boolean(previous.sailing.isSimulation) === Boolean(option.sailing.isSimulation) &&
        (departureAt < Date.parse(previous.sailing.departure.departure_at) ||
          (departureAt === Date.parse(previous.sailing.departure.departure_at) && option.totalEuro < previous.totalEuro)))) {
      byPorts.set(key, option);
    }
  }
  return sortItineraries([...byPorts.values()], priority, children);
}
