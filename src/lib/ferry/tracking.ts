// Suivi en direct : position projetée, distance restante, heure d'arrivée estimée.
import type { Departure, Port, RouteLine, Vessel } from "./types";
import type { LngLat } from "./geo";

export interface LivePosition {
  mmsi: number;
  vesselName: string | null;
  status: string | null;
  latitude: number;
  longitude: number;
  speedKnots: number | null;
  courseDeg: number | null;
  reportedAt: string | null;
  atdAt?: string | null;
  ataAt?: string | null;
  lastPortId?: string | null;
  declaredDestination?: string | null;
  declaredEta?: string | null;
  fetchedAt: string;
}

/** Un navire suivi, rattaché à sa traversée. */
export type PhysicalVesselStatus =
  | "boarding" | "boarding_closed" | "departing" | "at_sea" | "approaching" | "docked" | "unknown";

export interface PhysicalStatus {
  code: PhysicalVesselStatus;
  label: string;
  tone: "success" | "warning" | "info" | "muted";
}

export interface LiveShip {
  vessel: Vessel;
  departure: Departure;
  route: RouteLine;
  position: LivePosition;
  /** « sea » : en traversée ; « port » : à quai ou départ imminent. */
  phase: "sea" | "port";
  /** Âge de la dernière position reçue, en minutes. */
  ageMinutes: number;
  /** Distance restante en ligne droite jusqu'au port d'arrivée (km). */
  remainingKm: number | null;
  /** Heure d'arrivée estimée (ISO) et retard par rapport à l'horaire (minutes, négatif = avance). */
  etaIso: string | null;
  delayMinutes: number | null;
  /** Mode démonstration (développement) : position fictive. */
  demo?: boolean;
}

const KNOT_MS = 0.514444;
const EARTH_KM = 6371;
const rad = (value: number) => (value * Math.PI) / 180;
const deg = (value: number) => (value * 180) / Math.PI;

export function haversineKm(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point atteint en suivant un cap pendant une distance donnée. */
export function destination(start: LngLat, courseDeg: number, distanceKm: number): LngLat {
  const d = distanceKm / EARTH_KM;
  const brg = rad(courseDeg);
  const lat1 = rad(start[1]);
  const lng1 = rad(start[0]);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [deg(lng2), deg(lat2)];
}

/**
 * Position estimée « maintenant » : la dernière position connue, avancée selon le cap et la vitesse.
 * Limitée à 40 minutes d'extrapolation pour ne jamais dériver si les données cessent d'arriver.
 */
export function projectedPosition(position: LivePosition, now: number): LngLat {
  const base: LngLat = [position.longitude, position.latitude];
  if (!position.speedKnots || position.courseDeg === null || position.speedKnots < 1) return base;
  const reported = position.reportedAt
    ? Date.parse(position.reportedAt)
    : Date.parse(position.fetchedAt);
  const elapsed = Math.min(40 * 60_000, Math.max(0, now - reported));
  const km = (position.speedKnots * KNOT_MS * elapsed) / 1000 / 1000;
  return destination(base, position.courseDeg, km);
}

/** Estimation : distance en ligne droite / vitesse actuelle. Indicatif, comme l'écart à l'horaire. */
export function estimateArrival(
  position: LivePosition,
  arrivalPort: Pick<Port, "longitude" | "latitude">,
  scheduledArrivalIso: string | null,
  now: number,
) {
  const here = projectedPosition(position, now);
  const remainingKm = haversineKm(here, [arrivalPort.longitude, arrivalPort.latitude]);
  const speed = position.speedKnots ?? 0;
  if (speed < 3)
    return { remainingKm, etaIso: null as string | null, delayMinutes: null as number | null };
  const etaMs = now + ((remainingKm * 1000) / (speed * KNOT_MS)) * 1000;
  const delayMinutes = scheduledArrivalIso
    ? Math.round((etaMs - Date.parse(scheduledArrivalIso)) / 60_000)
    : null;
  return { remainingKm, etaIso: new Date(etaMs).toISOString(), delayMinutes };
}

/** Traversée en cours ou imminente d'un navire (ou null). */
export function activeDeparture(
  departures: Departure[],
  vessel: Vessel,
  now: number,
): { departure: Departure; phase: "sea" | "port" } | null {
  let best: { departure: Departure; phase: "sea" | "port"; distance: number } | null = null;
  departures.forEach((departure) => {
    if (departure.vessel_id !== vessel.id || departure.status === "cancelled") return;
    const start = Date.parse(departure.departure_at);
    const end = departure.arrival_at ? Date.parse(departure.arrival_at) : start + 36 * 3600_000;
    if (now >= start - 6 * 3600_000 && now <= end + 3600_000) {
      const phase = now >= start && now <= end ? "sea" : "port";
      const distance = Math.abs(now - start);
      if (
        !best ||
        (phase === "sea" && best.phase !== "sea") ||
        (phase === best.phase && distance < best.distance)
      ) {
        best = { departure, phase, distance };
      }
    }
  });
  return best
    ? {
        departure: (best as { departure: Departure }).departure,
        phase: (best as { phase: "sea" | "port" }).phase,
      }
    : null;
}

/** Départ le plus proche dans le temps (passé ou futur) : sert à rattacher un signal AIS hors horaire. */
export function nearestDeparture(
  departures: Departure[],
  vessel: Vessel,
  now: number,
): Departure | null {
  let best: { departure: Departure; distance: number } | null = null;
  departures.forEach((departure) => {
    if (departure.vessel_id !== vessel.id || departure.status === "cancelled") return;
    const distance = Math.abs(now - Date.parse(departure.departure_at));
    if (!best || distance < best.distance) best = { departure, distance };
  });
  return best ? (best as { departure: Departure }).departure : null;
}

/** Au-delà de cet âge, un signal AIS n'est plus considéré comme l'état réel du navire. */
export const LIVE_MAX_AGE_MINUTES = 6 * 60;

/** Phase réelle déduite du signal : en mouvement (≥ 3 nœuds) → en mer, sinon à quai. */
export function phaseFromSignal(position: LivePosition): "sea" | "port" {
  return (position.speedKnots ?? 0) >= 3 ? "sea" : "port";
}

export function formatAge(minutes: number): string {
  if (minutes < 2) return "à l’instant";
  if (minutes < 60) return `il y a ${Math.round(minutes)} min`;
  return `il y a ${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, "0")}`;
}

export function formatDelay(minutes: number | null): {
  label: string;
  tone: "ok" | "late" | "unknown";
} {
  // Un écart de plus de 6 h n'est pas crédible (horaire ou vitesse erronés) : on ne l'affiche pas.
  if (minutes === null || Math.abs(minutes) > 360)
    return { label: "Heure d’arrivée à confirmer", tone: "unknown" };
  if (Math.abs(minutes) < 15) return { label: "À l’heure", tone: "ok" };
  const abs = Math.abs(minutes);
  const text =
    abs >= 60 ? `${Math.floor(abs / 60)} h ${String(abs % 60).padStart(2, "0")}` : `${abs} min`;
  return minutes > 0
    ? { label: `Retard estimé : ${text}`, tone: "late" }
    : { label: `En avance de ${text}`, tone: "ok" };
}

/** Cap en point cardinal (« sud-ouest »). */
export function courseLabel(course: number | null): string {
  if (course === null) return "—";
  const names = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"];
  return names[Math.round(course / 45) % 8]!;
}


/** Statut physique calculé à partir de la position AIS et des coordonnées portuaires. */
export function physicalStatus(
  position: LivePosition,
  departurePort: Pick<Port, "latitude" | "longitude"> | null,
  arrivalPort: Pick<Port, "latitude" | "longitude"> | null,
  scheduledDepartureIso: string | null,
  now = Date.now(),
  allPorts?: Array<Pick<Port, "latitude" | "longitude">>,
): PhysicalStatus {
  const point: LngLat = [position.longitude, position.latitude];
  const speed = position.speedKnots ?? 0;
  const fromKm = departurePort ? haversineKm(point, [departurePort.longitude, departurePort.latitude]) : Infinity;
  const toKm = arrivalPort ? haversineKm(point, [arrivalPort.longitude, arrivalPort.latitude]) : Infinity;
  const departure = scheduledDepartureIso ? Date.parse(scheduledDepartureIso) : NaN;
  const hoursToDeparture = Number.isFinite(departure) ? (departure - now) / 3_600_000 : Infinity;
  const nearestPortKm = allPorts?.length
    ? Math.min(...allPorts.map((port) => haversineKm(point, [port.longitude, port.latitude])))
    : Math.min(fromKm, toKm);
  const etaMinutes = speed >= 1.5 ? (toKm / (speed * KNOT_MS / 1000)) / 60 : Infinity;
  if (toKm < 1 && speed < 1.5) return { code: "docked", label: "Accosté à quai", tone: "info" };
  if (fromKm < 3 && speed >= 3) return { code: "departing", label: "Appareillage en cours", tone: "warning" };
  if (toKm < 15 && etaMinutes < 45) return { code: "approaching", label: "En approche", tone: "warning" };
  if (fromKm < 2 && speed < 1.5 && hoursToDeparture >= 1 && hoursToDeparture <= 3)
    return { code: "boarding", label: "Embarquement en cours", tone: "info" };
  if (fromKm < 2 && speed < 1.5 && hoursToDeparture >= 0 && hoursToDeparture < 1)
    return { code: "boarding_closed", label: "Embarquement clos", tone: "warning" };
  if (nearestPortKm > 15 && speed >= 3)
    return { code: "at_sea", label: "En mer", tone: "success" };
  if (toKm < 15) return { code: "approaching", label: "En approche", tone: "warning" };
  return { code: "unknown", label: "Position AIS reçue", tone: "muted" };
}
