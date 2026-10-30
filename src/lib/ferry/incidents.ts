import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { Departure, RouteLine } from "./types";

/** Tables du script « contacts_incidents_entraide », pas encore dans les types générés. */
export const incidentsDb = typedSupabase as unknown as SupabaseClient;

export type IncidentStatus = "reported" | "verifying" | "confirmed" | "resolved" | "rejected";
export type IncidentImpact = "confirmed" | "possible" | "none";

export type VesselIncident = {
  id: string;
  vessel_id: string;
  status: IncidentStatus;
  public_note: string;
  source_name: string;
  source_url: string | null;
  verified_at: string | null;
  report_id: string | null;
  created_at: string;
  updated_at: string;
  bw_incident_departures: { departure_id: string; impact: IncidentImpact }[];
};

/** Lecture publique : la base ne renvoie que ce qui est vérifié ou en cours de vérification. */
export const incidentsQuery = queryOptions({
  queryKey: ["vessel-incidents"],
  queryFn: async (): Promise<VesselIncident[]> => {
    const { data, error } = await incidentsDb
      .from("bw_vessel_incidents")
      .select("*, bw_incident_departures(departure_id, impact)")
      .order("created_at", { ascending: false });
    // Script pas encore exécuté : le site fonctionne comme avant.
    if (error) return [];
    return (data ?? []) as VesselIncident[];
  },
  staleTime: 60_000,
  refetchInterval: 5 * 60_000,
});

export const isOpenIncident = (incident: VesselIncident) =>
  incident.status === "verifying" || incident.status === "confirmed";

/** Dossier à afficher pour un navire : ouvert, sinon levé récemment. */
export function incidentForVessel(
  incidents: VesselIncident[],
  vesselId: string | null | undefined,
) {
  if (!vesselId) return null;
  const own = incidents.filter(
    (i) => i.vessel_id === vesselId && (isOpenIncident(i) || i.status === "resolved"),
  );
  return own.find(isOpenIncident) ?? own[0] ?? null;
}

/**
 * Effet sur un départ précis. Suivre un navire immobilisé ne rend pas tous ses départs touchés :
 * un départ que l'équipe n'a pas qualifié reste « sans conséquence connue ».
 */
export function impactOnDeparture(
  incident: VesselIncident | null,
  departureId: string,
): IncidentImpact {
  return (
    incident?.bw_incident_departures.find((d) => d.departure_id === departureId)?.impact ?? "none"
  );
}

/** Départs à proposer au dossier : à venir, sur ce navire, dans les 14 prochains jours. */
export function departuresToReview<
  T extends { vessel_id: string | null; departure_at: string; status: string },
>(departures: T[], vesselId: string, now = Date.now(), days = 14) {
  return departures
    .filter(
      (d) =>
        d.vessel_id === vesselId &&
        d.status !== "cancelled" &&
        Date.parse(d.departure_at) >= now &&
        Date.parse(d.departure_at) <= now + days * 86_400_000,
    )
    .sort((a, b) => a.departure_at.localeCompare(b.departure_at));
}

/**
 * Autres traversées à vérifier : même liaison d'abord, puis même port d'arrivée, au plus près de
 * la date prévue, jamais sur le navire immobilisé. Aucune information de place ni de tarif.
 */
export function alternativeDepartures(
  departure: Pick<Departure, "id" | "route_id" | "vessel_id" | "departure_at">,
  departures: Departure[],
  routes: Pick<RouteLine, "id" | "arrival_port_id">[],
  now = Date.now(),
  { limit = 5, windowDays = 10 } = {},
) {
  const arrivalOf = new Map(routes.map((r) => [r.id, r.arrival_port_id]));
  const target = Date.parse(departure.departure_at);
  const arrival = arrivalOf.get(departure.route_id);
  return departures
    .filter((d) => {
      const at = Date.parse(d.departure_at);
      return (
        d.id !== departure.id &&
        d.status !== "cancelled" &&
        at >= now &&
        Math.abs(at - target) <= windowDays * 86_400_000 &&
        (!departure.vessel_id || d.vessel_id !== departure.vessel_id) &&
        (d.route_id === departure.route_id || (arrival && arrivalOf.get(d.route_id) === arrival))
      );
    })
    .sort((a, b) => {
      const sameRoute =
        Number(b.route_id === departure.route_id) - Number(a.route_id === departure.route_id);
      return (
        sameRoute ||
        Math.abs(Date.parse(a.departure_at) - target) -
          Math.abs(Date.parse(b.departure_at) - target)
      );
    })
    .slice(0, limit);
}
