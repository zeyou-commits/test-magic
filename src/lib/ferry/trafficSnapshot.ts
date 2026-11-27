import { supabase } from "@/integrations/supabase/client";
import { dateKeyInZone, portTimeZone } from "./time";
import type { Company, Departure, Port, RouteLine } from "./types";

/**
 * Point du trafic daté : ce que disent les horaires publiés à un instant donné, calculé au rendu
 * (serveur au premier affichage) et repris tel quel par le navigateur. Les traversées « en cours »
 * sont déduites de l'horaire, jamais présentées comme une position constatée.
 */

const PARIS = "Europe/Paris";
const HOUR = 3600_000;
const DAY = 24 * HOUR;

export type SnapshotDeparture = Pick<
  Departure,
  | "id"
  | "route_id"
  | "company_id"
  | "departure_at"
  | "arrival_at"
  | "duration_minutes"
  | "status"
  | "reported_delay_minutes"
  | "reported_postponed_at"
  | "is_demo"
>;

export interface SnapshotCrossing {
  id: string;
  from: string;
  to: string;
  /** Fuseau du port de départ : les heures s'affichent en heure locale du port. */
  zone: string;
  /** Fuseau du port d'arrivée, pour l'heure d'arrivée prévue. */
  arrivalZone: string;
  company: string;
  departureAt: string;
  arrivalAt: string | null;
}

export type SnapshotDisruptionKind = "cancelled" | "postponed" | "delayed" | "modified";
export interface SnapshotDisruption extends SnapshotCrossing {
  kind: SnapshotDisruptionKind;
  delayMinutes: number | null;
}

export interface TrafficSnapshot {
  /** Instant du point (ISO). */
  at: string;
  /** Traversées dont l'horaire publié est en cours. */
  underway: SnapshotCrossing[];
  /** Départs encore à venir aujourd'hui (jour de Paris), demain, et sur 7 jours. */
  leftToday: number;
  tomorrow: number;
  nextSevenDays: number;
  nextToAlgeria: SnapshotCrossing | null;
  nextFromAlgeria: SnapshotCrossing | null;
  /** Annulations, reports, retards signalés et horaires modifiés sur 7 jours. */
  disruptions: SnapshotDisruption[];
}

const arrivalOf = (d: SnapshotDeparture) =>
  d.arrival_at
    ? Date.parse(d.arrival_at)
    : d.duration_minutes
      ? Date.parse(d.departure_at) + d.duration_minutes * 60_000
      : null;

function disruptionKind(d: SnapshotDeparture): SnapshotDisruptionKind | null {
  if (d.status === "cancelled") return "cancelled";
  if (d.reported_postponed_at) return "postponed";
  if ((d.reported_delay_minutes ?? 0) >= 15) return "delayed";
  if (d.status === "modified") return "modified";
  return null;
}

export function buildTrafficSnapshot(input: {
  now: number;
  departures: SnapshotDeparture[];
  routes: Pick<RouteLine, "id" | "departure_port_id" | "arrival_port_id">[];
  ports: Pick<Port, "id" | "name" | "country_code">[];
  companies: Pick<Company, "id" | "name">[];
}): TrafficSnapshot {
  const { now } = input;
  const routes = new Map(input.routes.map((r) => [r.id, r]));
  const ports = new Map(input.ports.map((p) => [p.id, p]));
  const companies = new Map(input.companies.map((c) => [c.id, c.name]));

  const crossings = input.departures
    .filter((d) => !d.is_demo && routes.has(d.route_id))
    .sort((a, b) => Date.parse(a.departure_at) - Date.parse(b.departure_at))
    .map((d) => {
      const route = routes.get(d.route_id)!;
      const from = ports.get(route.departure_port_id);
      const to = ports.get(route.arrival_port_id);
      const end = arrivalOf(d);
      const crossing: SnapshotCrossing = {
        id: d.id,
        from: from?.name ?? "",
        to: to?.name ?? "",
        zone: portTimeZone(from),
        arrivalZone: portTimeZone(to),
        company: companies.get(d.company_id) ?? "",
        departureAt: d.departure_at,
        arrivalAt: end === null ? null : new Date(end).toISOString(),
      };
      return { d, crossing, start: Date.parse(d.departure_at), end, toAlgeria: to?.country_code?.trim().toUpperCase() === "DZ" };
    })
    .filter((x) => x.crossing.from && x.crossing.to);

  const sailing = crossings.filter((x) => x.d.status !== "cancelled");
  const today = dateKeyInZone(new Date(now), PARIS);
  const tomorrowKey = dateKeyInZone(new Date(now + DAY), PARIS);
  const ahead = sailing.filter((x) => x.start > now);
  const week = ahead.filter((x) => x.start < now + 7 * DAY);

  return {
    at: new Date(now).toISOString(),
    underway: sailing
      .filter((x) => x.start <= now && x.end !== null && now < x.end)
      .map((x) => x.crossing),
    leftToday: ahead.filter((x) => dateKeyInZone(new Date(x.start), PARIS) === today).length,
    tomorrow: ahead.filter((x) => dateKeyInZone(new Date(x.start), PARIS) === tomorrowKey).length,
    nextSevenDays: week.length,
    nextToAlgeria: ahead.find((x) => x.toAlgeria)?.crossing ?? null,
    nextFromAlgeria: ahead.find((x) => !x.toAlgeria)?.crossing ?? null,
    disruptions: crossings
      .filter((x) => x.start > now - 12 * HOUR && x.start < now + 7 * DAY)
      .flatMap((x) => {
        const kind = disruptionKind(x.d);
        return kind
          ? [{ ...x.crossing, kind, delayMinutes: x.d.reported_delay_minutes ?? null }]
          : [];
      }),
  };
}

/** Lit les départs utiles (36 h passées pour les traversées en cours, 8 jours à venir). */
export async function loadTrafficSnapshot(context: {
  routes: Pick<RouteLine, "id" | "departure_port_id" | "arrival_port_id">[];
  ports: Pick<Port, "id" | "name" | "country_code">[];
  companies: Pick<Company, "id" | "name">[];
}): Promise<TrafficSnapshot | null> {
  const now = Date.now();
  try {
    const { data, error } = await supabase
      .from("departures")
      .select(
        "id, route_id, company_id, departure_at, arrival_at, duration_minutes, status, reported_delay_minutes, reported_postponed_at, is_demo",
      )
      .gte("departure_at", new Date(now - 36 * HOUR).toISOString())
      .lt("departure_at", new Date(now + 8 * DAY).toISOString())
      .order("departure_at")
      .limit(2000);
    if (error) return null;
    // Les colonnes de signalement (script du 27/11/2026) ne sont pas encore dans les types générés.
    const departures = (data ?? []) as unknown as SnapshotDeparture[];
    return buildTrafficSnapshot({ now, departures, ...context });
  } catch {
    return null;
  }
}
