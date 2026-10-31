import { queryOptions, useQuery } from "@tanstack/react-query";
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
export type Level = 0 | 1 | 2 | 3 | 4;
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
  /** Nom du picto (voir `iconRegistry`). */
  icon?: string;
  /** Masquée depuis l'admin : plus proposée, mais toujours lisible. */
  hidden?: boolean;
};
export type Situation = {
  label: string;
  where: CommunityKind;
  /** Couleur unique de la situation : tuiles, pastilles de carte, bulles et fiches. */
  color: string;
  /** Nom du picto (voir `iconRegistry`). */
  icon: string;
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

export type ServiceDef = {
  code: string;
  label: string;
  open: string;
  closed: string;
  icon: string;
  active?: boolean;
};
/** Services du port signalés ouverts ou fermés (précision `service_<code>_<open|closed>`). */
const builtinServices: ServiceDef[] = [
  { code: "snack", label: "Snack, restauration", open: "ouvert", closed: "fermé", icon: "utensils" },
  { code: "prayer", label: "Salle de prière", open: "disponible", closed: "indisponible", icon: "moon-star" },
  { code: "toilets", label: "Toilettes", open: "ouvertes", closed: "fermées", icon: "toilet" },
  { code: "water", label: "Eau potable", open: "disponible", closed: "indisponible", icon: "glass-water" },
  { code: "atm", label: "Distributeur", open: "en service", closed: "hors service", icon: "banknote" },
  { code: "exchange", label: "Bureau de change", open: "ouvert", closed: "fermé", icon: "coins" },
  { code: "fuel", label: "Station-service", open: "ouverte", closed: "fermée", icon: "fuel" },
  { code: "kids", label: "Espace enfants", open: "ouvert", closed: "fermé", icon: "baby" },
];

/**
 * Catalogue de secours, identique au contenu initial des tables du script du 31/10 :
 * utilisé tant que ces tables n'existent pas. Ensuite, c'est l'admin qui fait foi.
 */
const builtinSituations: Record<string, Situation> = {
  access: {
    label: "Accès au port",
    where: "port",
    color: "#dc4c1d",
    icon: "traffic-cone",
    lifetime: 120,
    level: 0,
    question: "Comment ça se passe ?",
    options: [
      { code: "access_ok", label: "Ça roule", icon: "circle-check", level: 3 },
      { code: "access_traffic", label: "Bouchon pour entrer", icon: "car" },
      { code: "access_closed", label: "Accès fermé ou dévié", icon: "ban", onSite: true, level: 2 },
      { code: "access_works", label: "Travaux", icon: "construction" },
    ],
  },
  checkin: {
    label: "Enregistrement",
    where: "port",
    color: "#2563eb",
    icon: "ticket",
    lifetime: 120,
    level: 3,
    required: true,
    question: "Aux guichets de la compagnie",
    options: [
      { code: "checkin_open", label: "Ouvert", icon: "door-open" },
      { code: "checkin_notyet", label: "Pas encore ouvert", icon: "clock" },
      { code: "checkin_queue", label: "Longue file au guichet", icon: "users" },
    ],
  },
  queue: {
    label: "File d’attente",
    where: "port",
    color: "#e0a100",
    icon: "users",
    lifetime: 90,
    level: 0,
    question: "Comment avance la file ?",
    options: [
      { code: "queue_moving", label: "La file avance", icon: "chevrons-right", level: 3 },
      { code: "queue_stopped", label: "File à l’arrêt", icon: "pause", level: 3 },
      { code: "queue_long", label: "File très longue", icon: "list-ordered", level: 3 },
      { code: "queue_30", label: "Moins de 30 min", icon: "timer", upTo: 2 },
      { code: "queue_60", label: "Environ 1 h", icon: "hourglass", upTo: 2 },
      { code: "queue_120", label: "2 h et plus", icon: "hourglass", upTo: 2 },
    ],
  },
  formalities: {
    label: "Formalités (police, douane)",
    where: "port",
    color: "#c2410c",
    icon: "stamp",
    lifetime: 90,
    level: 2,
    question: "Aux contrôles",
    options: [
      { code: "formalities_open", label: "Ouvertes", icon: "door-open", level: 3 },
      { code: "formalities_short", label: "Attente courte", icon: "timer", level: 3 },
      { code: "formalities_long", label: "Longue attente", icon: "hourglass", level: 3 },
      { code: "formalities_notyet", label: "Pas encore ouvertes", icon: "clock", level: 3 },
      { code: "formalities_30", label: "Moins de 30 min", icon: "timer", upTo: 2 },
      { code: "formalities_60", label: "Environ 1 h", icon: "hourglass", upTo: 2 },
      { code: "formalities_120", label: "2 h et plus", icon: "hourglass", upTo: 2 },
    ],
  },
  call: {
    label: "Appel à l’embarquement",
    where: "port",
    color: "#9333ea",
    icon: "bell-ring",
    lifetime: 60,
    level: 3,
    required: true,
    question: "Avant de monter à bord",
    options: [
      { code: "call_called", label: "Embarquement appelé", icon: "bell-ring" },
      { code: "call_waiting", label: "Pas encore appelé, on patiente", icon: "hourglass" },
    ],
  },
  service: {
    label: "Services du port",
    where: "port",
    color: "#0f766e",
    icon: "store",
    lifetime: 120,
    level: 3,
    required: true,
    question: "Quel service ?",
  },
  parking: {
    label: "Parking complet",
    where: "port",
    color: "#2f6fd6",
    icon: "parking-circle",
    lifetime: 120,
    level: 1,
    retired: true,
    options: [
      { code: "parking_boarding", label: "Parking d’embarquement", icon: "parking-circle" },
      { code: "parking_visitors", label: "Parking accompagnants", icon: "parking-circle" },
    ],
  },
  fluid: {
    label: "Ça passe bien",
    where: "port",
    color: "#2e9d6a",
    icon: "circle-check",
    lifetime: 60,
    level: 1,
    // Remplacé par les états positifs de chaque situation (« Ça roule », « La file avance »…).
    retiredFrom: 3,
  },
  delay: {
    label: "Retard",
    where: "vessel",
    color: "#d6336c",
    icon: "clock",
    lifetime: 180,
    level: 0,
    question: "Retard annoncé sur place",
    required: true,
    options: [
      { code: "delay_30", label: "≈ 30 min", icon: "timer", delay: 30 },
      { code: "delay_60", label: "≈ 1 h", icon: "hourglass", delay: 60 },
      { code: "delay_120", label: "2 h et plus", icon: "hourglass", delay: 120 },
      { code: "delay_postponed", label: "Reporté ou annulé", icon: "calendar-x", onSite: true, level: 2 },
    ],
  },
  state: {
    label: "État du navire",
    where: "vessel",
    color: "#d97706",
    icon: "ship",
    lifetime: 120,
    level: 0,
    question: "Où en est le navire ?",
    required: true,
    options: [
      { code: "state_quay", label: "Encore à quai", icon: "anchor" },
      { code: "state_departed", label: "Il est parti", icon: "ship" },
    ],
  },
  boarding: {
    label: "Embarquement commencé",
    where: "vessel",
    color: "#0c8599",
    icon: "log-in",
    lifetime: 60,
    level: 0,
    question: "Pour qui ?",
    options: [
      { code: "boarding_vehicles", label: "Véhicules", icon: "car" },
      { code: "boarding_foot", label: "Passagers à pied", icon: "footprints" },
    ],
  },
  disembarking: {
    label: "Débarquement commencé",
    where: "vessel",
    color: "#6741d9",
    icon: "log-out",
    lifetime: 60,
    level: 1,
    question: "Pour qui ?",
    options: [
      { code: "disembarking_vehicles", label: "Véhicules", icon: "car" },
      { code: "disembarking_foot", label: "Passagers à pied", icon: "footprints" },
    ],
  },
};

/** Catalogue en cours : celui de secours, remplacé par celui de la base dès qu'il est chargé. */
let catalog: { fromDb: boolean; situations: Record<string, Situation>; services: ServiceDef[] } = {
  fromDb: false,
  situations: builtinSituations,
  services: builtinServices,
};
export const catalogFromDb = () => catalog.fromDb;
/** Services proposés à la saisie (actifs, dans l'ordre de l'admin). */
export const portServices = () => catalog.services.filter((item) => item.active !== false);

const serviceDetail = /^service_([a-z0-9]+)_(open|closed)$/;
/** « Snack, restauration · ouvert » à partir de la précision enregistrée. */
export function serviceLabel(detail: string | null) {
  const match = detail ? serviceDetail.exec(detail) : null;
  const service = catalog.services.find((item) => item.code === match?.[1]);
  if (!match || !service) return null;
  return `${service.label} · ${match[2] === "open" ? service.open : service.closed}`;
}
/** Picto d'un service à partir de la précision enregistrée. */
export function serviceIcon(detail: string | null) {
  const match = detail ? serviceDetail.exec(detail) : null;
  return catalog.services.find((item) => item.code === match?.[1])?.icon ?? null;
}

// ---- Tables du catalogue (script du 31/10) ----
const situationRow = z.object({
  code: z.string(),
  label: z.string(),
  target_kind: z.enum(["port", "vessel"]),
  color: z.string(),
  icon: z.string(),
  lifetime_minutes: z.number(),
  question: z.string(),
  required: z.boolean(),
  sort: z.number(),
  active: z.boolean(),
  builtin: z.boolean(),
});
const optionRow = z.object({
  code: z.string(),
  situation: z.string(),
  label: z.string(),
  icon: z.string(),
  on_site: z.boolean(),
  delay_minutes: z.number().nullable(),
  lifetime_minutes: z.number().nullable(),
  sort: z.number(),
  active: z.boolean(),
});
const serviceRow = z.object({
  code: z.string(),
  label: z.string(),
  open_label: z.string(),
  closed_label: z.string(),
  icon: z.string(),
  sort: z.number(),
  active: z.boolean(),
});
export type SituationRow = z.infer<typeof situationRow>;
export type OptionRow = z.infer<typeof optionRow>;
export type ServiceRow = z.infer<typeof serviceRow>;
export const signalTablesKey = ["bw-signal-tables"] as const;
/** Contenu brut des tables du catalogue (admin et site) ; null si le script n'est pas exécuté. */
export const signalTablesQuery = queryOptions({
  queryKey: signalTablesKey,
  queryFn: async () => {
    const [situations, options, services] = await Promise.all([
      supabase.from("bw_signal_situations").select("*").order("sort").order("label"),
      supabase.from("bw_signal_options").select("*").order("sort").order("label"),
      supabase.from("bw_signal_services").select("*").order("sort").order("label"),
    ]);
    const error = situations.error ?? options.error ?? services.error;
    if (error) {
      if (["PGRST205", "42P01", "PGRST202"].includes(error.code)) return null;
      throw new Error("Le catalogue des signalements est momentanément indisponible.");
    }
    return {
      situations: z.array(situationRow).parse(situations.data),
      options: z.array(optionRow).parse(options.data),
      services: z.array(serviceRow).parse(services.data),
    };
  },
  retry: false,
  staleTime: 5 * 60_000,
});
type Tables = {
  situations: SituationRow[];
  options: OptionRow[];
  services: ServiceRow[];
};
let applied: Tables | null = null;
function applyTables(tables: Tables) {
  const situations: Record<string, Situation> = {};
  for (const row of tables.situations) {
    const options = tables.options
      .filter((option) => option.situation === row.code)
      .map((option) => ({
        code: option.code,
        label: option.label,
        icon: option.icon,
        onSite: option.on_site,
        ...(option.delay_minutes ? { delay: option.delay_minutes } : {}),
        ...(option.active ? {} : { hidden: true }),
      }));
    situations[row.code] = {
      label: row.label,
      where: row.target_kind,
      color: row.color,
      icon: row.icon,
      lifetime: row.lifetime_minutes,
      level: 0,
      question: row.question,
      required: row.required,
      ...(row.active ? {} : { retired: true }),
      ...(options.length ? { options } : {}),
    };
  }
  catalog = {
    fromDb: true,
    situations,
    services: tables.services.map((row) => ({
      code: row.code,
      label: row.label,
      open: row.open_label,
      closed: row.closed_label,
      icon: row.icon,
      active: row.active,
    })),
  };
}

/**
 * À appeler dans les écrans qui affichent ou saisissent des signalements :
 * charge la version du catalogue et, à partir du script du 31/10, son contenu en base.
 */
export function useSignalCatalog() {
  const version = useQuery(catalogQuery).data ?? 0;
  const tables = useQuery({ ...signalTablesQuery, enabled: version >= 4 });
  if (tables.data && tables.data !== applied) {
    applied = tables.data;
    applyTables(tables.data);
  }
  return { version, ready: version < 4 || tables.data != null || tables.isError };
}
/** Code d'une situation : défini dans le catalogue (et, à partir du 31/10, depuis l'admin). */
export type AlertCategory = string;
const unknownSituation: Situation = {
  label: "Information voyageurs",
  where: "port",
  color: "#64748b",
  icon: "flag",
  lifetime: 120,
  level: 0,
};
export const situationOf = (category: AlertCategory): Situation =>
  catalog.situations[category] ?? { ...unknownSituation, label: category };
/** Situations proposées à la saisie selon les scripts SQL exécutés. */
export function availableSituations(level: Level) {
  return Object.keys(catalog.situations).filter((key) => {
    const s = situationOf(key);
    return !s.retired && s.level <= level && (s.retiredFrom === undefined || level < s.retiredFrom);
  });
}
export const optionsFor = (category: AlertCategory, level: Level) =>
  (situationOf(category).options ?? []).filter(
    (option) =>
      !option.hidden &&
      (option.level ?? 0) <= level &&
      (option.upTo === undefined || level <= option.upTo),
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
  departure_id: z.string().nullable().optional().default(null),
  category: z.string(),
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
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    lastProblem = "unsupported";
    return Promise.resolve(null);
  }
  const attempt = (highAccuracy: boolean) =>
    new Promise<[number, number] | null>((resolve) => {
      // Certains navigateurs (applis Facebook, WhatsApp…) ne répondent jamais, ni position ni erreur.
      // Le délai du navigateur ne court pas tant que sa demande d'autorisation reste affichée : marge large.
      const guard = window.setTimeout(() => {
        lastProblem = "silent";
        resolve(null);
      }, timeout + NO_ANSWER_MARGIN_MS);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          window.clearTimeout(guard);
          lastProblem = null;
          resolve([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          window.clearTimeout(guard);
          lastProblem = error.code === error.PERMISSION_DENIED ? "denied" : "unavailable";
          resolve(null);
        },
        { enableHighAccuracy: highAccuracy, timeout, maximumAge: 120_000 },
      );
    });
  // La position du réseau est rapide et suffit à vérifier 3 km ; le GPS seulement à défaut.
  return attempt(false).then((here) =>
    here || lastProblem !== "unavailable" ? here : attempt(true),
  );
}

const NO_ANSWER_MARGIN_MS = 12_000;
export type LocationProblem = "denied" | "unavailable" | "unsupported" | "silent";
export const LOCATION_HELP_EVENT = "bledway:location-help";
let lastProblem: LocationProblem | null = null;
export const locationProblem = (): LocationProblem => lastProblem ?? "unavailable";

/** Position exigée par l'action : sinon, explique au voyageur comment l'autoriser. */
export async function requirePosition(timeout = 8_000) {
  const here = await currentPosition(timeout);
  if (!here)
    window.dispatchEvent(new CustomEvent(LOCATION_HELP_EVENT, { detail: locationProblem() }));
  return here;
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
  departureId?: string | null;
}): Promise<{ error: { message: string } | null; onSite: boolean; pendingReview: boolean }> {
  const base = {
    p_kind: input.kind,
    p_target: input.target,
    p_category: input.category,
    p_delay: input.category === "delay" ? input.delay : null,
    p_departure: input.kind === "vessel" ? input.departureId : null,
  };
  // A vessel report must never fall back to an older RPC that loses its crossing.
  if (input.kind === "vessel") {
    const result = await supabase.rpc("bw_report_travel", {
      ...base,
      p_detail: input.detail,
      p_lat: null,
      p_lng: null,
      ...coords(input.position),
    });
    const data = result.data as { status?: string; on_site?: boolean } | null;
    return { error: result.error, onSite: data?.on_site === true, pendingReview: data?.status === "review" };
  }
  const attempts = [
    { ...base, p_detail: input.detail, p_lat: null, p_lng: null, ...coords(input.position) },
    ...(input.detail ? [{ ...base, p_detail: input.detail }] : []),
    base,
  ];
  for (const params of attempts) {
    const result = await supabase.rpc("bw_report_travel", params);
    if (result.error?.code === "PGRST202") continue;
    const data = result.data as { status?: string; on_site?: boolean } | boolean | null;
    return { error: result.error, onSite: data === true || (typeof data === "object" && data?.on_site === true), pendingReview: typeof data === "object" && data?.status === "review" };
  }
  return { error: { message: "" }, onSite: false, pendingReview: false };
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
