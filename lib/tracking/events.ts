import { haversineKm } from "../ferry/tracking";
import type { ParsedPosition } from "./parse";

type PortPoint = { id: string; latitude: number; longitude: number };
export interface PreviousObservation {
  latitude: number | null; longitude: number | null; speed_knots: number | null; reported_at: string | null;
  last_port_id: string | null; departure_port_id: string | null; arrival_port_id: string | null;
  atd_at: string | null; ata_at: string | null; event_departure_id: string | null;
}
export function acceptableReport(position: ParsedPosition, previous: PreviousObservation | null, now: number) {
  const reported = position.reportedAt ? Date.parse(position.reportedAt) : NaN;
  return Number.isFinite(reported) && reported <= now + 60_000 && now - reported <= 6 * 3600_000 &&
    (!previous?.reported_at || reported > Date.parse(previous.reported_at));
}
export interface PortEvent {
  atd_at?: string | null; ata_at?: string | null; atd_after?: string | null; ata_after?: string | null;
  departure_port_id?: string | null; arrival_port_id?: string | null; last_port_id?: string | null; event_departure_id?: string | null;
}
export function observePortEvent(position: ParsedPosition, previous: PreviousObservation | null, ports: PortPoint[], now: number): PortEvent {
  if (!acceptableReport(position, previous, now) || !position.reportedAt || now - Date.parse(position.reportedAt) > 30 * 60_000) return {};
  const distance = (port: PortPoint) => haversineKm([position.longitude, position.latitude], [port.longitude, port.latitude]);
  const nearest = ports.map((port) => ({ port, km: distance(port) })).sort((a, b) => a.km - b.km)[0];
  const speed = position.speedKnots;
  const previousPort = ports.find((p) => p.id === previous?.last_port_id);
  const previousAge = previous?.reported_at ? Date.parse(position.reportedAt) - Date.parse(previous.reported_at) : Infinity;
  const previouslyDocked = previousPort && previous?.latitude != null && previous.longitude != null && previous.speed_knots != null && previous.speed_knots < 1.5 &&
    haversineKm([previous.longitude, previous.latitude], [previousPort.longitude, previousPort.latitude]) < 2;
  const voyageOpen = Boolean(previous?.atd_at && !previous.ata_at);
  if (voyageOpen && nearest && nearest.km < 2 && speed !== null && speed < 1.5 && nearest.port.id !== previous?.departure_port_id) {
    return { ata_at: position.reportedAt, ata_after: previous?.reported_at ?? null, arrival_port_id: nearest.port.id, last_port_id: nearest.port.id };
  }
  if (!voyageOpen && previouslyDocked && previousAge <= 30 * 60_000 && previousPort && distance(previousPort) >= 3 && speed !== null && speed >= 3) {
    return { atd_at: position.reportedAt, atd_after: previous?.reported_at ?? null, departure_port_id: previousPort.id, ata_at: null, ata_after: null, arrival_port_id: null, event_departure_id: null };
  }
  if (!voyageOpen && nearest && nearest.km < 2 && speed !== null && speed < 1.5) return { last_port_id: nearest.port.id };
  return {};
}