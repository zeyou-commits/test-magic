import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { JourneyAudience } from "./journeySteps";
import { relativeTripQuery, type JourneyDeparture } from "./journeyTrips";
import { useMyTrip } from "./myTrip";
import { portsQuery, routesQuery, vesselsQuery } from "./queries";
import type { Port, RouteLine, Vessel } from "./types";

/** Ouvre « Mon voyage » sur la carte d'accueil quand elle est déjà affichée. */
export const OPEN_VOYAGE_EVENT = "bledway:open-voyage";
export const openVoyage = () => window.dispatchEvent(new Event(OPEN_VOYAGE_EVENT));

export type VoyageTrip = {
  audience: Exclude<JourneyAudience, "simulation">;
  departure: JourneyDeparture;
  route: RouteLine;
  from: Port;
  to: Port;
  vessel: Vessel | undefined;
};

/** Le voyage à afficher : ma traversée (voyageur) d'abord, sinon celle d'un proche suivi. */
export function useVoyageTrip(): { trip: VoyageTrip | null; ready: boolean } {
  const { user, loading } = useAuth();
  const { trip, ready } = useMyTrip();
  const relative = useQuery(relativeTripQuery(user?.id));
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  if (trip?.route && trip.from && trip.to)
    return {
      trip: {
        audience: "traveller",
        departure: trip.departure,
        route: trip.route,
        from: trip.from,
        to: trip.to,
        vessel: trip.vessel,
      },
      ready: true,
    };
  const departure = relative.data;
  if (departure) {
    const route = routes.find((item) => item.id === departure.route_id);
    const from = ports.find((port) => port.id === route?.departure_port_id);
    const to = ports.find((port) => port.id === route?.arrival_port_id);
    if (route && from && to)
      return {
        trip: {
          audience: "relative",
          departure,
          route,
          from,
          to,
          vessel: vessels.find((vessel) => vessel.id === departure.vessel_id),
        },
        ready: true,
      };
    return { trip: null, ready: false };
  }
  return { trip: null, ready: !loading && (!user || (ready && !relative.isPending)) };
}
