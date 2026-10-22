import type { Sailing } from "./trips";

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
  boardingBufferMin = 120,
): ItineraryOption[] {
  const outward = new Map(toDeparturePorts.map((leg) => [leg.portId, leg]));
  const onward = new Map(fromArrivalPorts.map((leg) => [leg.portId, leg]));
  return sailings.flatMap((sailing) => {
    const first = outward.get(sailing.from.id);
    const last = onward.get(sailing.to.id);
    if (!first || !last || sailing.durationMin === null) return [];
    const departureAt = Date.parse(sailing.departure.departure_at);
    if (!Number.isFinite(departureAt) || departureAt < startedAt + (first.durationMin + boardingBufferMin) * 60_000) return [];
    const ferryArrivalAt = sailing.departure.arrival_at
      ? Date.parse(sailing.departure.arrival_at)
      : departureAt + sailing.durationMin * 60_000;
    if (!Number.isFinite(ferryArrivalAt)) return [];
    const arrivalAt = ferryArrivalAt + last.durationMin * 60_000;
    const roadKm = first.distanceKm + last.distanceKm;
    const ferryEuro = ferryFare(sailing);
    const roadEuro = Math.round(roadKm * (fuelLitresPer100Km / 100 * fuelEuroPerLitre + tollEuroPerKm));
    const leaveHomeAt = departureAt - (first.durationMin + boardingBufferMin) * 60_000;
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
      const score = (option: ItineraryOption) => option.totalEuro + option.roadKm * (children > 0 ? 0.3 : 0.12) + option.totalMinutes / 60 * (children > 0 ? 5 : 2);
      return score(a) - score(b) || a.arrivalAt - b.arrivalAt;
    }
    return a.totalEuro - b.totalEuro || a.arrivalAt - b.arrivalAt;
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
    if (!previous || departureAt < Date.parse(previous.sailing.departure.departure_at) ||
      (departureAt === Date.parse(previous.sailing.departure.departure_at) && option.totalEuro < previous.totalEuro)) {
      byPorts.set(key, option);
    }
  }
  return sortItineraries([...byPorts.values()], priority, children);
}
