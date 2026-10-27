import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export type CommunityKind = "vessel" | "port";

/**
 * Niveau de base de données requis : 0 = d'origine, 1 = script du 26/10, 2 = script du 29/10,
 * 3 = script du 30/10 (situations du port le long de la file d'attente).
 */
export type Level = 0 | 1 | 2 | 3;
export type SituationOption = {
  code: string;
  label: string;
  /** Retard : durée enregistrée dans `delay_minutes` (pas de précision). */
  delay?: number;
  /** Signalement impactant : il faut être sur place (position vérifiée par le serveur). */
  onSite?: boolean;
  level?: Level;
  /** Ancienne précision, proposée seulement tant que le script suivant n'est pas exécuté. */
  upTo?: Level;
};
export type Situation = {
  label: string;
  where: CommunityKind;
  /** Couleur unique de la situation : tuiles, pastilles de carte, bulles et fiches. */
  color: string;
  /** Durée d'affichage en minutes (appliquée par le serveur à partir du script du 29/10). */
  lifetime: number;
  level: Level;
  /** Plus proposée à la saisie ; les signalements existants restent lisibles. */
  retired?: boolean;
  /** Retirée de la saisie à partir de ce niveau. */
  retiredFrom?: Level;
  question?: string;
  /** Une précision doit être choisie (le retard). */
  required?: boolean;
  options?: SituationOption[];
};

/** Services du port signalés ouverts ou fermés (précision `service_<code>_<open|closed>`). */
export const portServices = [
  { code: "snack", label: "Snack, restauration", open: "ouvert", closed: "fermé" },
  { code: "prayer", label: "Salle de prière", open: "disponible", closed: "indisponible" },
  { code: "toilets", label: "Toilettes", open: "ouvertes", closed: "fermées" },
  { code: "water", label: "Eau potable", open: "disponible", closed: "indisponible" },
  { code: "atm", label: "Distributeur", open: "en service", closed: "hors service" },
  { code: "exchange", label: "Bureau de change", open: "ouvert", closed: "fermé" },
  { code: "fuel", label: "Station-service", open: "ouverte", closed: "fermée" },
  { code: "kids", label: "Espace enfants", open: "ouvert", closed: "fermé" },
] as const;
export type PortService = (typeof portServices)[number]["code"];
const serviceDetail = /^service_([a-z]+)_(open|closed)$/;
/** « Snack, restauration · ouvert » à partir de la précision enregistrée. */
export function serviceLabel(detail: string | null) {
  const match = detail ? serviceDetail.exec(detail) : null;
  const service = portServices.find((item) => item.code === match?.[1]);
  if (!match || !service) return null;
  return `${service.label} · ${match[2] === "open" ? service.open : service.closed}`;
}

/**
 * Catalogue unique des situations signalées par les voyageurs.
 * Au port, dans l'ordre de la file d'attente : accès, enregistrement, file, formalités, appel, services.
 * Tout l'affichage (saisie, carte, fiches, Flash info, modération) en dépend.
 */
export const situations = {
  access: {
    label: "Accès au port",
    where: "port",
    color: "#dc4c1d",
    lifetime: 120,
    level: 0,
    question: "Comment ça se passe ?",
    options: [
      { code: "access_ok", label: "Ça roule", level: 3 },
      { code: "access_traffic", label: "Bouchon pour entrer" },
      { code: "access_closed", label: "Accès fermé ou dévié", onSite: true, level: 2 },
      { code: "access_works", label: "Travaux" },
    ],
  },
  checkin: {
    label: "Enregistrement",
    where: "port",
    color: "#2563eb",
    lifetime: 120,
    level: 3,
    required: true,
    question: "Aux guichets de la compagnie",
    options: [
      { code: "checkin_open", label: "Ouvert" },
      { code: "checkin_notyet", label: "Pas encore ouvert" },
      { code: "checkin_queue", label: "Longue file au guichet" },
    ],
  },
  queue: {
    label: "File d’attente",
    where: "port",
    color: "#e0a100",
    lifetime: 90,
    level: 0,
    question: "Comment avance la file ?",
    options: [
      { code: "queue_moving", label: "La file avance", level: 3 },
      { code: "queue_stopped", label: "File à l’arrêt", level: 3 },
      { code: "queue_long", label: "File très longue", level: 3 },
      { code: "queue_30", label: "Moins de 30 min", upTo: 2 },
      { code: "queue_60", label: "Environ 1 h", upTo: 2 },
      { code: "queue_120", label: "2 h et plus", upTo: 2 },
    ],
  },
  formalities: {
    label: "Formalités (police, douane)",
    where: "port",
    color: "#c2410c",
    lifetime: 90,
    level: 2,
    question: "Aux contrôles",
    options: [
      { code: "formalities_open", label: "Ouvertes", level: 3 },
      { code: "formalities_short", label: "Attente courte", level: 3 },
      { code: "formalities_long", label: "Longue attente", level: 3 },
      { code: "formalities_notyet", label: "Pas encore ouvertes", level: 3 },
      { code: "formalities_30", label: "Moins de 30 min", upTo: 2 },
      { code: "formalities_60", label: "Environ 1 h", upTo: 2 },
      { code: "formalities_120", label: "2 h et plus", upTo: 2 },
    ],
  },
  call: {
    label: "Appel à l’embarquement",
    where: "port",
    color: "#9333ea",
    lifetime: 60,
    level: 3,
    required: true,
    question: "Avant de monter à bord",
    options: [
      { code: "call_called", label: "Embarquement appelé" },
      { code: "call_waiting", label: "Pas encore appelé, on patiente" },
    ],
  },
  service: {
    label: "Services du port",
    where: "port",
    color: "#0f766e",
    lifetime: 120,
    level: 3,
    required: true,
    question: "Quel service ?",
  },
  parking: {
    label: "Parking complet",
    where: "port",
    color: "#2f6fd6",
    lifetime: 120,
    level: 1,
    retired: true,
    options: [
      { code: "parking_boarding", label: "Parking d’embarquement" },
      { code: "parking_visitors", label: "Parking accompagnants" },
    ],
  },
  fluid: {
    label: "Ça passe bien",
    where: "port",
    color: "#2e9d6a",
    lifetime: 60,
    level: 1,
    // Remplacé par les états positifs de chaque situation (« Ça roule », « La file avance »…).
    retiredFrom: 3,
  },
  delay: {
    label: "Retard",
    where: "vessel",
    color: "#d6336c",
    lifetime: 180,
    level: 0,
    question: "Retard annoncé sur place",
    required: true,
    options: [
      { code: "delay_30", label: "≈ 30 min", delay: 30 },
      { code: "delay_60", label: "≈ 1 h", delay: 60 },
      { code: "delay_120", label: "2 h et plus", delay: 120 },
      { code: "delay_postponed", label: "Reporté ou annulé", onSite: true, level: 2 },
    ],
  },
  boarding: {
    label: "Embarquement commencé",
    where: "vessel",
    color: "#0c8599",
    lifetime: 60,
    level: 0,
    question: "Pour qui ?",
    options: [
      { code: "boarding_vehicles", label: "Véhicules" },
      { code: "boarding_foot", label: "Passagers à pied" },
    ],
  },
  disembarking: {
    label: "Débarquement commencé",
    where: "vessel",
    color: "#6741d9",
    lifetime: 60,
    level: 1,
    question: "Pour qui ?",
    options: [
      { code: "disembarking_vehicles", label: "Véhicules" },
      { code: "disembarking_foot", label: "Passagers à pied" },
    ],
  },
} satisfies Record<string, Situation>;
export type AlertCategory = keyof typeof situations;
export const situationOf = (category: AlertCategory): Situation => situations[category];
/** Situations proposées à la saisie selon les scripts SQL exécutés. */
export function availableSituations(level: Level) {
  return (Object.keys(situations) as AlertCategory[]).filter((key) => {
    const s = situationOf(key);
    return !s.retired && s.level <= level && (s.retiredFrom === undefined || level < s.retiredFrom);
  });
}
export const optionsFor = (category: AlertCategory, level: Level) =>
  (situationOf(category).options ?? []).filter(
    (option) => (option.level ?? 0) <= level && (option.upTo === undefined || level <= option.upTo),
  );
/** « Environ 1 h 30 » : durée d'affichage lisible. */
export function lifetimeLabel(category: AlertCategory) {
  const minutes = situationOf(category).lifetime;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h${rest ? ` ${rest}` : ""}` : `${minutes} min`;
}

const alertSchema = z.object({
  id: z.string(),
  target_kind: z.enum(["vessel", "port"]),
  target_id: z.string(),
  category: z.enum([
    "delay",
    "boarding",
    "disembarking",
    "queue",
    "formalities",
    "access",
    "parking",
    "fluid",
    "checkin",
    "call",
    "service",
  ]),
  delay_minutes: z.number().nullable(),
  // Ajouté par le script du 28/10/2026.
  detail: z.string().nullable().optional().default(null),
  // Ajoutés par le script du 29/10/2026 : auteur sur place et confirmations faites sur place.
  on_site: z.boolean().nullable().optional().default(false),
  on_site_confirmations: z.number().optional().default(0),
  created_at: z.string(),
  expires_at: z.string(),
  own: z.boolean().nullable(),
  confirmations: z.number(),
  confirmed: z.boolean(),
  // Ajoutés par le script du 26/10/2026 : valeurs neutres tant qu'il n'est pas appliqué.
  denials: z.number().optional().default(0),
  denied: z.boolean().optional().default(false),
});
const reviewSchema = z.object({
  id: z.string(),
  vessel_id: z.string(),
  score: z.number(),
  comment: z.string(),
  status: z.enum(["pending", "published", "hidden"]),
  created_at: z.string(),
  own: z.boolean().nullable(),
});
const feedSchema = z.object({
  enabled: z.literal(true),
  rating_count: z.number(),
  rating_average: z.number().nullable(),
  alerts: z.array(alertSchema),
  reviews: z.array(reviewSchema),
});
export type TravelAlert = z.infer<typeof alertSchema>;
export type VesselReview = z.infer<typeof reviewSchema>;
export const communityKey = ["bw-community"] as const;
// Distinguish an optional module awaiting SQL activation from a temporary service failure.
export const communityQuery = (
  kind?: CommunityKind,
  target?: string,
  moderation = false,
  viewer?: string,
) =>
  queryOptions({
    queryKey: [...communityKey, kind ?? "map", target ?? "all", moderation, viewer ?? "public"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bw_community_feed", {
        ...(kind ? { p_kind: kind } : {}),
        ...(target ? { p_target: target } : {}),
        p_moderation: moderation,
      });
      if (error) {
        if (error.code === "PGRST202" || error.code === "42883") return null;
        throw new Error("Les contributions sont momentanément indisponibles.");
      }
      return feedSchema.parse(data);
    },
    retry: false,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data === null ? false : 60_000),
  });
/** Version du catalogue en base : 2 = script du 29/10 (« sur place »), 3 = script du 30/10 (port). */
export const catalogQuery = queryOptions({
  queryKey: ["bw-signal-catalog"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("bw_signal_catalog_version");
    if (error) return 0;
    return typeof data === "number" ? data : 0;
  },
  retry: false,
  staleTime: 10 * 60_000,
});

export function activeAlerts(alerts: TravelAlert[], now = Date.now()) {
  return alerts.filter((a) => Date.parse(a.expires_at) > now);
}
/** Signalement impactant (report, annulation, accès fermé) : il a fallu être sur place. */
export const isImpact = (alert: TravelAlert) =>
  Boolean(
    situationOf(alert.category).options?.find((option) => option.code === alert.detail)?.onSite,
  );
/** Voyageurs sur place parmi l'auteur et ceux qui ont confirmé. */
export const onSiteCount = (alert: TravelAlert) =>
  (alert.on_site ? 1 : 0) + (alert.on_site_confirmations ?? 0);
/**
 * Affiché sur la carte et dans le Flash info : pas désavoué par la majorité, et pour un
 * signalement impactant, confirmé par au moins un second voyageur.
 */
export const isPublicAlert = (alert: TravelAlert) =>
  (alert.denials ?? 0) <= alert.confirmations && (!isImpact(alert) || alert.confirmations >= 1);

export function alertLabel(alert: TravelAlert) {
  if (alert.category === "service") return serviceLabel(alert.detail) ?? situationOf("service").label;
  const situation = situationOf(alert.category);
  const option = situation.options?.find(
    (item) => item.code === alert.detail || (item.delay && item.delay === alert.delay_minutes),
  );
  return option ? `${situation.label} · ${option.label.toLowerCase()}` : situation.label;
}

/** Position du voyageur, demandée au moment du geste ; jamais enregistrée par BledWay. */
export function currentPosition(timeout = 8_000): Promise<[number, number] | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator))
    return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.latitude, position.coords.longitude]),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 120_000 },
    ),
  );
}
// Arrondi à ~100 m : suffisant pour la vérification « sur place ».
const coords = (position: [number, number] | null) =>
  position
    ? { p_lat: Math.round(position[0] * 1000) / 1000, p_lng: Math.round(position[1] * 1000) / 1000 }
    : {};

/**
 * Envoie un signalement et indique si le serveur l'a reconnu « sur place ».
 * Sans les scripts récents, la précision et la position sont ignorées (comportement d'origine).
 */
export async function reportTravel(input: {
  kind: CommunityKind;
  target: string;
  category: AlertCategory;
  delay: number | null;
  detail: string | null;
  position: [number, number] | null;
}): Promise<{ error: { message: string } | null; onSite: boolean }> {
  const base = {
    p_kind: input.kind,
    p_target: input.target,
    p_category: input.category,
    p_delay: input.category === "delay" ? input.delay : null,
  };
  const attempts = [
    { ...base, p_detail: input.detail, ...coords(input.position) },
    ...(input.detail ? [{ ...base, p_detail: input.detail }] : []),
    base,
  ];
  for (const params of attempts) {
    const result = await supabase.rpc("bw_report_travel", params);
    if (result.error?.code === "PGRST202") continue;
    return { error: result.error, onSite: result.data === true };
  }
  return { error: { message: "" }, onSite: false };
}

/** Confirmer, « Ce n'est plus le cas » ou clore, avec la position si elle est connue. */
export async function alertAction(
  id: string,
  action: "confirm" | "deny" | "resolve",
  position: [number, number] | null = null,
) {
  const base = { p_alert: id, p_action: action };
  let result = await supabase.rpc("bw_alert_action", { ...base, ...coords(position) });
  if (position && result.error?.code === "PGRST202")
    result = await supabase.rpc("bw_alert_action", base);
  return result.error;
}
