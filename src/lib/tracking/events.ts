import { haversineKm, PORT_RADIUS_KM } from "../ferry/tracking";
import type { ParsedPosition } from "./parse";

type PortPoint = { id: string; latitude: number; longitude: number };
/** Au-delà, un navire en route a quitté le port (rayon + 2 km de marge). */
const LEFT_PORT_KM = PORT_RADIUS_KM + 2;
/** Au-delà, trop loin du port pour recalculer l'heure de départ de façon fiable. */
export const INFERRED_DEPARTURE_MAX_KM = 60;
const KNOT_MS = 0.514444;

export interface PreviousObservation {
  latitude: number | null;
  longitude: number | null;
  speed_knots: number | null;
  reported_at: string | null;
  last_port_id: string | null;
  departure_port_id: string | null;
  arrival_port_id: string | null;
  atd_at: string | null;
  ata_at: string | null;
  event_departure_id: string | null;
}
export function acceptableReport(
  position: ParsedPosition,
  previous: PreviousObservation | null,
  now: number,
) {
  const reported = position.reportedAt ? Date.parse(position.reportedAt) : NaN;
  return (
    Number.isFinite(reported) &&
    reported <= now + 60_000 &&
    now - reported <= 6 * 3600_000 &&
    (!previous?.reported_at || reported > Date.parse(previous.reported_at))
  );
}
export interface PortEvent {
  atd_at?: string | null;
  ata_at?: string | null;
  atd_after?: string | null;
  ata_after?: string | null;
  departure_port_id?: string | null;
  arrival_port_id?: string | null;
  last_port_id?: string | null;
  event_departure_id?: string | null;
}
export function observePortEvent(
  position: ParsedPosition,
  previous: PreviousObservation | null,
  ports: PortPoint[],
  now: number,
): PortEvent {
  if (
    !acceptableReport(position, previous, now) ||
    !position.reportedAt ||
    now - Date.parse(position.reportedAt) > 30 * 60_000
  )
    return {};
  const distance = (port: PortPoint) =>
    haversineKm([position.longitude, position.latitude], [port.longitude, port.latitude]);
  const nearest = ports
    .map((port) => ({ port, km: distance(port) }))
    .sort((a, b) => a.km - b.km)[0];
  const speed = position.speedKnots;
  const previousPort = ports.find((p) => p.id === previous?.last_port_id);
  const previousAge = previous?.reported_at
    ? Date.parse(position.reportedAt) - Date.parse(previous.reported_at)
    : Infinity;
  const previouslyDocked =
    previousPort &&
    previous?.latitude != null &&
    previous.longitude != null &&
    previous.speed_knots != null &&
    previous.speed_knots < 1.5 &&
    haversineKm(
      [previous.longitude, previous.latitude],
      [previousPort.longitude, previousPort.latitude],
    ) < PORT_RADIUS_KM;
  const voyageOpen = Boolean(previous?.atd_at && !previous.ata_at);
  if (
    voyageOpen &&
    nearest &&
    nearest.km < PORT_RADIUS_KM &&
    speed !== null &&
    speed < 1.5 &&
    nearest.port.id !== previous?.departure_port_id
  ) {
    return {
      ata_at: position.reportedAt,
      ata_after: previous?.reported_at ?? null,
      arrival_port_id: nearest.port.id,
      last_port_id: nearest.port.id,
    };
  }
  // Départ : vu à quai (jusqu'à 18 h avant, l'écoute étant courte et un navire à quai n'émettant
  // que toutes les 3 min), puis en route hors du port. L'heure de départ est recalculée d'après
  // la distance parcourue et la vitesse, sans jamais remonter avant la dernière observation à quai.
  const away = previousPort ? distance(previousPort) : 0;
  if (
    !voyageOpen &&
    previouslyDocked &&
    previousPort &&
    previousAge <= 18 * 3600_000 &&
    away >= LEFT_PORT_KM &&
    away <= INFERRED_DEPARTURE_MAX_KM &&
    speed !== null &&
    speed >= 3
  ) {
    const sailedMs = ((away * 1000) / (Math.max(speed, 5) * KNOT_MS)) * 1000;
    const atd = Math.max(
      Date.parse(previous!.reported_at!),
      Date.parse(position.reportedAt) - sailedMs,
    );
    return {
      atd_at: new Date(atd).toISOString(),
      atd_after: previous?.reported_at ?? null,
      departure_port_id: previousPort.id,
      ata_at: null,
      ata_after: null,
      arrival_port_id: null,
      event_departure_id: null,
    };
  }
  if (!voyageOpen && nearest && nearest.km < PORT_RADIUS_KM && speed !== null && speed < 1.5)
    return { last_port_id: nearest.port.id };
  return {};
}
