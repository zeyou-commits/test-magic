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
  queue: { label: "Attente aux contrôles", kind: "port" },
  access: { label: "Accès difficile", kind: "port" },
} as const;
export type AlertCategory = keyof typeof alertCategories;
const alertSchema = z.object({
  id: z.string(),
  target_kind: z.enum(["vessel", "port"]),
  target_id: z.string(),
  category: z.enum(["delay", "boarding", "queue", "access"]),
  delay_minutes: z.number().nullable(),
  created_at: z.string(),
  expires_at: z.string(),
  own: z.boolean().nullable(),
  confirmations: z.number(),
  confirmed: z.boolean(),
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
  return (
    alertCategories[alert.category].label +
    (alert.delay_minutes === 120
      ? " · 2 h ou plus"
      : alert.delay_minutes
        ? ` · ≈ ${alert.delay_minutes} min`
        : "")
  );
}
