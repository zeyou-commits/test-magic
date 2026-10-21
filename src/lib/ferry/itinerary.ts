import type { Sailing } from "./trips";

export interface RoadLeg {
  portId: string;
  distanceKm: number;
  durationMin: number;
}

export interface ItineraryMapPreview {
  key: number;
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
  totalMinutes: number;
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
    return [{
      sailing, originRoad: first, destinationRoad: last, ferryEuro, roadEuro,
      totalEuro: ferryEuro + roadEuro, roadKm,
      totalMinutes: Math.round((arrivalAt - startedAt) / 60_000), arrivalAt,
    }];
  });
}

export type ItineraryPriority = "cost" | "time" | "driving";

export function sortItineraries(options: ItineraryOption[], priority: ItineraryPriority) {
  return [...options].sort((a, b) => {
    if (priority === "time") return a.arrivalAt - b.arrivalAt || a.totalEuro - b.totalEuro;
    if (priority === "driving") return a.roadKm - b.roadKm || a.arrivalAt - b.arrivalAt;
    return a.totalEuro - b.totalEuro || a.arrivalAt - b.arrivalAt;
  });
}
