import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { portTimeZone } from "@/lib/ferry/time";

const db = typedSupabase as unknown as SupabaseClient;

export type Journey = {
  id: string;
  user_id: string;
  outbound_departure_id: string | null;
  inbound_departure_id: string | null;
};
export type ReturnDeparture = {
  id: string;
  departure_at: string;
  route_id: string;
  status: string;
  from_name: string;
  to_name: string;
  from_country_code: string;
  company_name: string | null;
  vessel_id: string | null;
  vessel_name: string | null;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function useMyJourneys(userId: string) {
  return useQuery({
    queryKey: ["my-journeys", userId],
    queryFn: async () => {
      const result = await db.from("bw_journeys")
        .select("id,user_id,outbound_departure_id,inbound_departure_id")
        .eq("user_id", userId).order("created_at", { ascending: false });
      if (result.error) throw result.error;
      return result.data as Journey[];
    },
  });
}

export function useJourneyForDeparture(userId: string | undefined, departureId: string) {
  return useQuery({
    queryKey: ["journey", userId, departureId],
    enabled: Boolean(userId && departureId),
    queryFn: async () => {
      const result = await db.from("bw_journeys")
        .select("id,user_id,outbound_departure_id,inbound_departure_id")
        .eq("user_id", userId!)
        .or(`outbound_departure_id.eq.${departureId},inbound_departure_id.eq.${departureId}`)
        .limit(1).maybeSingle();
      if (result.error) throw result.error;
      return result.data as Journey | null;
    },
  });
}

/** La traversée inverse est cherchée sur la ligne, jamais par nom de port. */
export function useReturnDepartures(departureId: string | null, search = "", date = "", sameLine = false) {
  return useQuery({
    queryKey: ["return-departures", departureId, normalize(search), date, sameLine],
    enabled: Boolean(departureId),
    queryFn: async () => {
      const selected = await db.from("departures").select("id,departure_at,arrival_at,duration_minutes,route_id")
        .eq("id", departureId!).single();
      if (selected.error) throw selected.error;
      const originalRoute = await db.from("routes").select("departure_port_id,arrival_port_id")
        .eq("id", selected.data.route_id).single();
      if (originalRoute.error) throw originalRoute.error;
      const [ports, routes, companies, vessels] = await Promise.all([
        db.from("ports").select("id,name,country_code"),
        db.from("routes").select("id,departure_port_id,arrival_port_id,status"),
        db.from("companies").select("id,name"),
        db.from("vessels").select("id,name"),
      ]);
      if (ports.error) throw ports.error;
      if (routes.error) throw routes.error;
      if (companies.error) throw companies.error;
      if (vessels.error) throw vessels.error;
      const portById = new Map((ports.data ?? []).map((port) => [port.id as string, port]));
      const outgoing = portById.get(originalRoute.data.departure_port_id);
      const incoming = portById.get(originalRoute.data.arrival_port_id);
      if (!outgoing || !incoming) return [] as ReturnDeparture[];
      // L'utilisateur peut rentrer par un autre port européen ; seul le sens doit être inverse.
      const anyPort = (routes.data ?? []).filter((route) => {
        const from = portById.get(route.departure_port_id);
        const to = portById.get(route.arrival_port_id);
        if (route.status !== "active" || !from || !to) return false;
        if (incoming.country_code === "DZ") return from.country_code === "DZ" && to.country_code !== "DZ";
        if (outgoing.country_code === "DZ") return from.country_code !== "DZ" && to.country_code === "DZ";
        return from.country_code === incoming.country_code && to.country_code === outgoing.country_code;
      });
      // Par défaut, le retour est la même ligne en sens inverse.
      const opposite = sameLine
        ? anyPort.filter(
            (route) =>
              route.departure_port_id === originalRoute.data.arrival_port_id &&
              route.arrival_port_id === originalRoute.data.departure_port_id,
          )
        : anyPort;
      const routeIds = opposite.map((route) => route.id as string);
      if (!routeIds.length) return [] as ReturnDeparture[];
      const companyById = new Map((companies.data ?? []).map((company) => [company.id as string, company.name as string]));
      const vesselById = new Map((vessels.data ?? []).map((vessel) => [vessel.id as string, vessel.name as string]));
      const term = normalize(search);
      const matchingRoutes = term ? opposite.filter((route) => {
        const from = portById.get(route.departure_port_id);
        const to = portById.get(route.arrival_port_id);
        return normalize(`${from?.name ?? ""} ${to?.name ?? ""}`).includes(term);
      }).map((route) => route.id as string) : [];
      const matchingCompanies = term ? [...companyById].filter(([, name]) => normalize(name).includes(term)).map(([id]) => id) : [];
      const matchingVessels = term ? [...vesselById].filter(([, name]) => normalize(name).includes(term)).map(([id]) => id) : [];
      if (term && !matchingRoutes.length && !matchingCompanies.length && !matchingVessels.length) return [] as ReturnDeparture[];
      const arrivalTime = selected.data.arrival_at
        ? Date.parse(selected.data.arrival_at)
        : Date.parse(selected.data.departure_at) + (selected.data.duration_minutes ?? 24 * 60) * 60_000;
      let query = db.from("departures")
        .select("id,departure_at,route_id,status,company_id,vessel_id")
        .in("route_id", routeIds)
        .gt("departure_at", new Date(Math.max(arrivalTime, Date.now())).toISOString())
        .neq("status", "cancelled")
        .eq("is_demo", false);
      if (date) {
        const day = Date.parse(`${date}T00:00:00Z`);
        if (Number.isFinite(day)) query = query.gte("departure_at", new Date(day - 24 * 60 * 60_000).toISOString()).lt("departure_at", new Date(day + 2 * 24 * 60 * 60_000).toISOString());
      }
      if (term) {
        const clauses = [
          matchingRoutes.length ? `route_id.in.(${matchingRoutes.join(",")})` : "",
          matchingCompanies.length ? `company_id.in.(${matchingCompanies.join(",")})` : "",
          matchingVessels.length ? `vessel_id.in.(${matchingVessels.join(",")})` : "",
        ].filter(Boolean);
        query = query.or(clauses.join(","));
      }
      const results = await query.order("departure_at").limit(date || term ? 150 : 40);
      if (results.error) throw results.error;
      const routeById = new Map(opposite.map((route) => [route.id as string, route]));
      return (results.data ?? []).flatMap((item) => {
        const route = routeById.get(item.route_id);
        const from = route ? portById.get(route.departure_port_id) : undefined;
        const to = route ? portById.get(route.arrival_port_id) : undefined;
        if (!from || !to) return [];
        const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: portTimeZone(from), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(item.departure_at));
        const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
        const day = `${part("year")}-${part("month")}-${part("day")}`;
        return date && day !== date ? [] : [{ ...item, from_name: from.name, to_name: to.name, from_country_code: from.country_code,
          company_name: companyById.get(item.company_id) ?? null, vessel_name: vesselById.get(item.vessel_id) ?? null }];
      }) as ReturnDeparture[];
    },
    staleTime: 60_000,
  });
}
