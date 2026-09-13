import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  Company,
  Departure,
  Port,
  PortReview,
  RatingCriterion,
  RouteLine,
  Schedule,
  Vessel,
} from "./types";

function unwrap<T>(result: { data: unknown; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T;
}

// Côté public : on montre les ports publiés (ouverts ou temporairement fermés),
// jamais les brouillons.
export const portsQuery = queryOptions({
  queryKey: ["ports"],
  queryFn: async () =>
    unwrap<Port[]>(
      await supabase.from("ports").select("*").neq("status", "draft").order("name"),
    ),
  staleTime: 5 * 60 * 1000,
});

// Côté back-office : tous les ports, brouillons compris.
export const adminPortsQuery = queryOptions({
  queryKey: ["ports", "admin"],
  queryFn: async () =>
    unwrap<Port[]>(await supabase.from("ports").select("*").order("name")),
  staleTime: 30 * 1000,
});

export const companiesQuery = queryOptions({
  queryKey: ["companies"],
  queryFn: async () =>
    unwrap<Company[]>(await supabase.from("companies").select("*").order("name")),
  staleTime: 5 * 60 * 1000,
});

export const vesselsQuery = queryOptions({
  queryKey: ["vessels"],
  queryFn: async () =>
    unwrap<Vessel[]>(await supabase.from("vessels").select("*").order("name")),
  staleTime: 5 * 60 * 1000,
});

function mapRoutes(rows: Array<Record<string, unknown>>): RouteLine[] {
  return rows.map((row) => ({
    ...(row as unknown as RouteLine),
    company_ids: ((row["route_operators"] as Array<{ company_id: string }>) ?? []).map(
      (o) => o.company_id,
    ),
  }));
}

// Côté public : seules les lignes actives sont affichées sur la carte.
export const routesQuery = queryOptions({
  queryKey: ["routes"],
  queryFn: async (): Promise<RouteLine[]> =>
    mapRoutes(
      unwrap<Array<Record<string, unknown>>>(
        await supabase
          .from("routes")
          .select("*, route_operators(company_id)")
          .eq("status", "active"),
      ),
    ),
  staleTime: 5 * 60 * 1000,
});

// Côté back-office : toutes les lignes, y compris suspendues et brouillons.
export const adminRoutesQuery = queryOptions({
  queryKey: ["routes", "admin"],
  queryFn: async (): Promise<RouteLine[]> =>
    mapRoutes(
      unwrap<Array<Record<string, unknown>>>(
        await supabase.from("routes").select("*, route_operators(company_id)"),
      ),
    ),
  staleTime: 30 * 1000,
});

export const schedulesQuery = queryOptions({
  queryKey: ["schedules"],
  queryFn: async () =>
    unwrap<Schedule[]>(await supabase.from("schedules").select("*").order("departure_time")),
  staleTime: 5 * 60 * 1000,
});

export function upcomingDeparturesQuery(limit = 300) {
  return queryOptions({
    queryKey: ["departures", "upcoming", limit],
    queryFn: async () =>
      unwrap<Departure[]>(
        await supabase
          .from("departures")
          .select("*")
          .gte("departure_at", new Date().toISOString())
          .order("departure_at")
          .limit(limit),
      ),
    staleTime: 60 * 1000,
  });
}

export const ratingCriteriaQuery = queryOptions({
  queryKey: ["rating_criteria"],
  queryFn: async () =>
    unwrap<RatingCriterion[]>(
      await supabase
        .from("rating_criteria")
        .select("*")
        .eq("status", "active")
        .order("sort_order"),
    ),
  staleTime: 10 * 60 * 1000,
});

export interface PublishedReview extends PortReview {
  ratings: Array<{ criterion_id: string; score: number }>;
  author: string | null;
}

export function portReviewsQuery(portId: string) {
  return queryOptions({
    queryKey: ["port_reviews", portId],
    queryFn: async (): Promise<PublishedReview[]> => {
      const rows = unwrap<Array<Record<string, unknown>>>(
        await supabase
          .from("port_reviews")
          .select("*, review_ratings(criterion_id, score)")
          .eq("port_id", portId)
          .eq("status", "published")
          .order("created_at", { ascending: false }),
      );
      const userIds = [...new Set(rows.map((row) => row["user_id"] as string))];
      const profiles = userIds.length
        ? unwrap<Array<{ id: string; display_name: string | null }>>(
            await supabase.from("profiles").select("id, display_name").in("id", userIds),
          )
        : [];
      const names = new Map(profiles.map((profile) => [profile.id, profile.display_name]));
      return rows.map((row) => ({
        ...(row as unknown as PortReview),
        ratings: (row["review_ratings"] as Array<{ criterion_id: string; score: number }>) ?? [],
        author: names.get(row["user_id"] as string) ?? null,
      }));
    },
    staleTime: 60 * 1000,
  });
}

