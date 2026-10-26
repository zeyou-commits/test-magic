import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables Flash info / lieux pratiques pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

/** Module en attente du script SQL : on n'affiche rien plutôt qu'une erreur. */
const missingModule = (code?: string) =>
  code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205";

// ---------- Flash info ----------
export const newsKinds = {
  perturbation: { label: "Perturbation" },
  info: { label: "Info voyage" },
} as const;
export const newsOrigins = {
  official: { label: "Compagnie / port" },
  media: { label: "Média" },
  bledway: { label: "BledWay" },
} as const;
const newsSchema = z.object({
  id: z.string(),
  kind: z.enum(["perturbation", "info"]),
  origin: z.enum(["official", "media", "bledway"]),
  title: z.string(),
  summary: z.string(),
  source_name: z.string(),
  source_url: z.string().nullable(),
  route_ids: z.array(z.string()),
  port_ids: z.array(z.string()),
  company_ids: z.array(z.string()),
  // Traversées datées concernées (script du 27/10/2026) : liste vide tant qu'il n'est pas appliqué.
  departure_ids: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  published: z.boolean(),
  created_at: z.string(),
});
export type NewsItem = z.infer<typeof newsSchema>;
export const newsKey = ["bw-news"] as const;

/** Flash info publié et en cours (la base filtre déjà les dates pour le public). */
export const newsQuery = queryOptions({
  queryKey: [...newsKey, "live"],
  queryFn: async (): Promise<NewsItem[] | null> => {
    const { data, error } = await supabase
      .from("bw_news")
      .select("*")
      .eq("published", true)
      .order("starts_at", { ascending: false })
      .limit(60);
    if (error) {
      if (missingModule(error.code)) return null;
      throw new Error("Le flash info est momentanément indisponible.");
    }
    const now = Date.now();
    return z
      .array(newsSchema)
      .parse(data)
      .filter(
        (item) =>
          Date.parse(item.starts_at) <= now && (!item.ends_at || Date.parse(item.ends_at) > now),
      );
  },
  staleTime: 60_000,
  refetchInterval: 5 * 60_000,
});

/** Toutes les actualités (back-office). */
export const adminNewsQuery = queryOptions({
  queryKey: [...newsKey, "admin"],
  queryFn: async (): Promise<NewsItem[] | null> => {
    const { data, error } = await supabase
      .from("bw_news")
      .select("*")
      .order("starts_at", { ascending: false })
      .limit(200);
    if (error) {
      if (missingModule(error.code)) return null;
      throw new Error(error.message);
    }
    return z.array(newsSchema).parse(data);
  },
});

export interface NewsContext {
  routeIds?: string[] | undefined;
  portIds?: string[] | undefined;
  companyIds?: string[] | undefined;
  departureIds?: string[] | undefined;
}
/** Pour relier une traversée datée à ses ports (une info sur le départ du 23/11 concerne ses deux ports). */
export type DeparturePorts = Map<string, string[]>;

/**
 * Actualités pertinentes pour un contexte (traversée, port…). Une actualité sans rattachement concerne
 * tout le réseau Europe ↔ Algérie : elle apparaît partout. Une info rattachée à une traversée datée
 * n'apparaît que pour cette traversée et ses ports, jamais pour les autres départs du même trajet.
 */
export function newsForContext(
  items: NewsItem[],
  context: NewsContext = {},
  departurePorts: DeparturePorts = new Map(),
) {
  const routes = new Set(context.routeIds ?? []);
  const ports = new Set(context.portIds ?? []);
  const companies = new Set(context.companyIds ?? []);
  const departures = new Set(context.departureIds ?? []);
  const scoped = routes.size + ports.size + companies.size + departures.size > 0;
  return items
    .filter((item) => {
      const general =
        !item.route_ids.length &&
        !item.port_ids.length &&
        !item.company_ids.length &&
        !item.departure_ids.length;
      if (!scoped || general) return true;
      return (
        item.route_ids.some((id) => routes.has(id)) ||
        item.port_ids.some((id) => ports.has(id)) ||
        item.company_ids.some((id) => companies.has(id)) ||
        item.departure_ids.some(
          (id) =>
            departures.has(id) || (departurePorts.get(id) ?? []).some((port) => ports.has(port)),
        )
      );
    })
    .sort(
      (a, b) =>
        Number(b.kind === "perturbation") - Number(a.kind === "perturbation") ||
        Date.parse(b.starts_at) - Date.parse(a.starts_at),
    );
}

// ---------- Infos déjà vues (pastille « nouveau ») ----------
const SEEN_KEY = "bw-flash-seen";
export function readSeenFlash(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
export function markFlashSeen(keys: string[]) {
  try {
    const next = [...new Set([...readSeenFlash(), ...keys])].slice(-300);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("bledway:flash-seen"));
  } catch {
    /* stockage facultatif */
  }
}

// ---------- Lieux pratiques ----------
export const placeKinds = {
  fuel: { label: "Station-service", group: "before" },
  parking: { label: "Stationnement", group: "before" },
  food: { label: "Restauration", group: "before" },
  pharmacy: { label: "Pharmacie", group: "before" },
  exchange: { label: "Bureau de change", group: "after" },
  atm: { label: "Distributeur", group: "after" },
  sim: { label: "Carte SIM", group: "after" },
  other: { label: "Autre", group: "before" },
} as const;
export type PlaceKind = keyof typeof placeKinds;
const placeSchema = z.object({
  id: z.string(),
  port_id: z.string(),
  kind: z.enum(["fuel", "exchange", "atm", "pharmacy", "parking", "food", "sim", "other"]),
  name: z.string(),
  address: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  hours: z.string(),
  note: z.string(),
  distance_label: z.string(),
  verified_at: z.string().nullable(),
  published: z.boolean(),
});
export type PortPlace = z.infer<typeof placeSchema>;
export const placesKey = ["bw-port-places"] as const;

export const portPlacesQuery = (portId?: string, admin = false) =>
  queryOptions({
    queryKey: [...placesKey, portId ?? "all", admin],
    queryFn: async (): Promise<PortPlace[] | null> => {
      let request = supabase.from("bw_port_places").select("*").order("kind").order("name");
      if (portId) request = request.eq("port_id", portId);
      if (!admin) request = request.eq("published", true);
      const { data, error } = await request;
      if (error) {
        if (missingModule(error.code)) return null;
        throw new Error("Les lieux pratiques sont momentanément indisponibles.");
      }
      return z.array(placeSchema).parse(data);
    },
    staleTime: 5 * 60_000,
  });

/** Itinéraire vers le lieu (Google Maps, sans clé ni stockage). */
export function placeDirectionsUrl(place: PortPlace, portName: string) {
  const destination =
    place.latitude != null && place.longitude != null
      ? `${place.latitude},${place.longitude}`
      : `${place.name} ${place.address || portName}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

// ---------- Ma traversée : historique d'un départ ----------
const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  created_at: z.string(),
});
export type DepartureEvent = z.infer<typeof eventSchema>;
export const departureEventsQuery = (departureId: string) =>
  queryOptions({
    queryKey: ["bw-departure-events", departureId],
    queryFn: async (): Promise<DepartureEvent[] | null> => {
      const { data, error } = await supabase.rpc("bw_departure_events", {
        p_departure: departureId,
      });
      if (error) {
        if (missingModule(error.code)) return null;
        throw new Error("L’historique de la traversée est momentanément indisponible.");
      }
      return z.array(eventSchema).parse(data ?? []);
    },
    staleTime: 60_000,
  });

// ---------- « Utile » sur les avis de port ----------
const helpfulSchema = z.object({ review_id: z.string(), helpful: z.number(), mine: z.boolean() });
export const helpfulKey = ["bw-review-helpful"] as const;
export const reviewHelpfulQuery = (portId: string, viewer?: string) =>
  queryOptions({
    queryKey: [...helpfulKey, portId, viewer ?? "public"],
    queryFn: async (): Promise<Map<string, { helpful: number; mine: boolean }> | null> => {
      const { data, error } = await supabase.rpc("bw_review_helpful_counts", { p_port: portId });
      if (error) {
        if (missingModule(error.code)) return null;
        throw new Error("Votes indisponibles.");
      }
      return new Map(
        z
          .array(helpfulSchema)
          .parse(data ?? [])
          .map((row) => [row.review_id, { helpful: row.helpful, mine: row.mine }]),
      );
    },
    staleTime: 60_000,
  });
export async function toggleReviewHelpful(reviewId: string) {
  const { error } = await supabase.rpc("bw_toggle_review_helpful", { p_review: reviewId });
  if (error) throw new Error("Votre vote n’a pas pu être enregistré.");
}

/** Accès libre au client non typé pour le back-office des contenus. */
export const flashClient = supabase;

export function relativeAge(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "hier" : `il y a ${days} j`;
}
