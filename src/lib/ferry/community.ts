import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export type CommunityKind = "vessel" | "port";
export const alertCategories = {
  delay: { label: "Retard au départ", kind: "vessel" },
  boarding: { label: "Embarquement commencé", kind: "vessel" },
  disembarking: { label: "Débarquement commencé", kind: "vessel" },
  queue: { label: "File d’attente importante", kind: "port" },
  access: { label: "Accès difficile", kind: "port" },
  parking: { label: "Parking complet", kind: "port" },
  fluid: { label: "Passage fluide", kind: "port" },
} as const;
/** Catégories proposées par défaut : celles connues avant le script SQL du 26/10/2026. */
export const legacyAlertCategories = new Set(["delay", "boarding", "queue", "access"]);
/**
 * Précisions proposées après le choix d'une situation (façon Waze), enregistrées dans `detail`
 * (script SQL du 28/10/2026). Le retard garde ses durées historiques dans `delay_minutes`.
 */
export const alertDetails: Partial<
  Record<AlertCategory, { short: string; question: string; options: { code: string; label: string }[] }>
> = {
  queue: {
    short: "File d’attente",
    question: "Combien de temps d’attente ?",
    options: [
      { code: "queue_30", label: "Moins de 30 min" },
      { code: "queue_60", label: "Environ 1 h" },
      { code: "queue_120", label: "2 h et plus" },
    ],
  },
  access: {
    short: "Accès difficile",
    question: "Que se passe-t-il ?",
    options: [
      { code: "access_traffic", label: "Bouchon pour entrer au port" },
      { code: "access_closed", label: "Accès fermé ou dévié" },
      { code: "access_works", label: "Travaux" },
    ],
  },
  parking: {
    short: "Parking complet",
    question: "Quel parking ?",
    options: [
      { code: "parking_boarding", label: "Parking d’embarquement" },
      { code: "parking_visitors", label: "Parking accompagnants" },
    ],
  },
  boarding: {
    short: "Embarquement commencé",
    question: "Pour qui ?",
    options: [
      { code: "boarding_vehicles", label: "Véhicules" },
      { code: "boarding_foot", label: "Passagers à pied" },
    ],
  },
  disembarking: {
    short: "Débarquement commencé",
    question: "Pour qui ?",
    options: [
      { code: "disembarking_vehicles", label: "Véhicules" },
      { code: "disembarking_foot", label: "Passagers à pied" },
    ],
  },
};
export type AlertCategory = keyof typeof alertCategories;
const alertSchema = z.object({
  id: z.string(),
  target_kind: z.enum(["vessel", "port"]),
  target_id: z.string(),
  category: z.enum(["delay", "boarding", "disembarking", "queue", "access", "parking", "fluid"]),
  delay_minutes: z.number().nullable(),
  // Ajouté par le script du 28/10/2026.
  detail: z.string().nullable().optional().default(null),
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
export function activeAlerts(alerts: TravelAlert[], now = Date.now()) {
  return alerts.filter((a) => Date.parse(a.expires_at) > now);
}
export function alertLabel(alert: TravelAlert) {
  const precision = alertDetails[alert.category];
  const option = precision?.options.find((item) => item.code === alert.detail);
  if (precision && option) return `${precision.short} · ${option.label.toLowerCase()}`;
  return (
    alertCategories[alert.category].label +
    (alert.delay_minutes === 120
      ? " · 2 h ou plus"
      : alert.delay_minutes
        ? ` · ≈ ${alert.delay_minutes} min`
        : "")
  );
}

/**
 * Envoie un signalement. Sans le script du 28/10/2026, la précision est ignorée
 * et le signalement part quand même (même comportement qu'avant).
 */
export async function reportTravel(input: {
  kind: CommunityKind;
  target: string;
  category: AlertCategory;
  delay: number | null;
  detail: string | null;
}) {
  const base = {
    p_kind: input.kind,
    p_target: input.target,
    p_category: input.category,
    p_delay: input.category === "delay" ? input.delay : null,
  };
  let result = await supabase.rpc(
    "bw_report_travel",
    input.detail ? { ...base, p_detail: input.detail } : base,
  );
  if (input.detail && result.error?.code === "PGRST202")
    result = await supabase.rpc("bw_report_travel", base);
  return result.error;
}
