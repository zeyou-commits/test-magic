import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ReviewKind, ReviewScores } from "./reviewCriteria";
import type { TravellerCard } from "@/lib/community/travellers";
export const reviewsDb = supabase as unknown as SupabaseClient;
export const entityReviewsKey = ["entity-reviews"] as const;
export type EntityReview = {
  id: string;
  target_kind: ReviewKind;
  target_id: string;
  scores: ReviewScores;
  published_scores: ReviewScores | null;
  status: string;
  updated_at: string;
  published_at: string | null;
};
export type ReviewFeed = {
  count: number;
  average: number | null;
  criteria: Record<string, { average: number; count: number }>;
  reviews: {
    id: string;
    scores: ReviewScores;
    score: number;
    date: string;
    author: TravellerCard | null;
  }[];
};
export const entityReviewsQuery = (kind: ReviewKind, id: string) =>
  queryOptions({
    queryKey: [...entityReviewsKey, kind, id],
    queryFn: async () => {
      const { data, error } = await reviewsDb.rpc("bw_entity_review_feed", {
        p_kind: kind,
        p_target: id,
      });
      if (error) throw new Error("Les notes sont momentanément indisponibles.");
      return data as ReviewFeed;
    },
    staleTime: 30_000,
    retry: false,
  });
export const ownEntityReviewsQuery = (userId?: string) =>
  queryOptions({
    queryKey: [...entityReviewsKey, "mine", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await reviewsDb
        .from("bw_entity_reviews")
        .select("id,target_kind,target_id,scores,published_scores,status,updated_at,published_at")
        .eq("user_id", userId!)
        .order("updated_at", { ascending: false });
      if (error) throw new Error("Vos notes ne sont pas disponibles pour le moment.");
      return data as EntityReview[];
    },
    retry: false,
  });
