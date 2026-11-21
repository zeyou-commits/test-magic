import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Les « routes du bled » : grands itinéraires vers les ports, puis en Algérie après le débarquement. */
export type StopKind =
  "carburant" | "aire" | "manger" | "priere" | "dormir" | "garage" | "billets" | "port" | "autre";
export type StopFeature =
  | "h24"
  | "manger"
  | "halal"
  | "priere"
  | "ablutions"
  | "dormir"
  | "parking"
  | "parking_sur"
  | "parking_pl"
  | "douches"
  | "toilettes"
  | "billets"
  | "garage"
  | "dab"
  | "cafe";
export type StopSource = "osm" | "web" | "communaute";

export type Stop = {
  id: string;
  k: StopKind;
  n: string;
  km: number;
  lat: number;
  lon: number;
  f: StopFeature[];
  src: StopSource;
  url?: string;
  date?: string;
  note?: string;
  place?: string;
  direction?: "aller" | "retour" | "both";
};

export type BledRoute = {
  id: string;
  name: string;
  side: "europe" | "algerie";
  via: string[];
  km: number;
  h: number;
  /** Le relevé OpenStreetMap a été fait sur toute la route. */
  releve: boolean;
  /** [lon, lat, km] tous les ~3 km. */
  line: [number, number, number][];
  stops: Stop[];
};

export type RoutesData = { version: string; routes: BledRoute[] };

export async function loadRoutesData(): Promise<RoutesData> {
  const res = await fetch("/data/routes-du-bled.json");
  if (!res.ok) throw new Error("Les routes n'ont pas pu être chargées.");
  return (await res.json()) as RoutesData;
}

/** Table hors des types générés : client non typé, comme pour les autres tables récentes. */
const db = supabase as unknown as SupabaseClient;

export type CommunityStopRow = {
  id: string;
  route_code: string;
  kind: StopKind;
  name: string;
  place: string;
  lat: number | null;
  lon: number | null;
  features: StopFeature[];
  direction: "aller" | "retour" | "both";
  note: string | null;
  decided_at: string | null;
};

/** Haltes proposées par la communauté et validées par l'équipe. */
export async function loadCommunityStops(): Promise<CommunityStopRow[]> {
  const { data, error } = await db.rpc("bw_route_stops_public");
  if (error) {
    // Script SQL pas encore appliqué : la page reste utilisable sans les haltes de la communauté.
    if (error.code === "PGRST202") return [];
    throw error;
  }
  return (data ?? []) as CommunityStopRow[];
}

export type StopProposal = {
  route: string;
  kind: StopKind;
  name: string;
  place: string;
  lat: number | null;
  lon: number | null;
  features: StopFeature[];
  direction: "aller" | "retour" | "both";
  note: string;
};

export async function submitStop(p: StopProposal): Promise<void> {
  const { error } = await db.rpc("bw_route_stop_submit", {
    p_route: p.route,
    p_kind: p.kind,
    p_name: p.name,
    p_place: p.place,
    p_lat: p.lat,
    p_lon: p.lon,
    p_features: p.features,
    p_direction: p.direction,
    p_note: p.note || null,
  });
  if (error) throw new Error(error.message);
}

/** Kilomètre et écart au tracé d'un point (projection locale, suffisante à cette échelle). */
export function locateOnRoute(
  route: BledRoute,
  lon: number,
  lat: number,
): { km: number; off: number } {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  let best = { km: 0, off: Infinity };
  for (let i = 1; i < route.line.length; i++) {
    const [x1, y1, k1] = route.line[i - 1]!;
    const [x2, y2, k2] = route.line[i]!;
    const ax = (x1 - lon) * kx,
      ay = (y1 - lat) * ky;
    const dx = (x2 - x1) * kx,
      dy = (y2 - y1) * ky;
    const l2 = dx * dx + dy * dy;
    const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
    const d = Math.hypot(ax + u * dx, ay + u * dy);
    if (d < best.off) best = { km: Math.round(k1 + u * (k2 - k1)), off: d };
  }
  return best;
}

/** Les haltes de la communauté validées, placées sur leur route. */
export function mergeCommunity(route: BledRoute, rows: CommunityStopRow[]): Stop[] {
  const extra: Stop[] = rows
    .filter((r) => r.route_code === route.id && r.lat != null && r.lon != null)
    .map((r) => ({
      id: `c-${r.id}`,
      k: r.kind,
      n: r.name,
      km: locateOnRoute(route, r.lon!, r.lat!).km,
      lat: r.lat!,
      lon: r.lon!,
      f: r.features,
      src: "communaute" as const,
      place: r.place,
      direction: r.direction,
      ...(r.note ? { note: r.note } : {}),
      ...(r.decided_at ? { date: r.decided_at.slice(0, 10) } : {}),
    }));
  return [...route.stops, ...extra].sort((a, b) => a.km - b.km);
}

export const KIND_COLOR: Record<StopKind, string> = {
  carburant: "#2f80c9",
  aire: "#2f80c9",
  manger: "#e0a21b",
  priere: "#7c4dbd",
  dormir: "#e0663a",
  garage: "#7d6b5a",
  billets: "#0e7a43",
  port: "#0d3043",
  autre: "#5f7486",
};

export const mapsLink = (s: { lat: number; lon: number }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;

/**
 * Durées habituelles des traversées, par sens (« marseille-oran » ≠ « oran-marseille »),
 * telles que l'équipe les tient dans les lignes. En minutes.
 */
export async function loadDureesMer(): Promise<Record<string, number>> {
  const { data, error } = await db
    .from("routes")
    .select(
      "typical_duration_minutes, dep:ports!routes_departure_port_id_fkey(slug), arr:ports!routes_arrival_port_id_fkey(slug)",
    )
    .eq("status", "active");
  if (error) throw error;
  const out: Record<string, number> = {};
  type Bout = { slug: string } | { slug: string }[] | null;
  const slug = (b: Bout) => (Array.isArray(b) ? b[0]?.slug : b?.slug);
  for (const r of (data ?? []) as unknown as {
    typical_duration_minutes: number | null;
    dep: Bout;
    arr: Bout;
  }[]) {
    const min = r.typical_duration_minutes;
    const a = slug(r.dep);
    const b = slug(r.arr);
    if (a && b && min && min > 0) out[`${a}-${b}`] = min;
  }
  return out;
}
