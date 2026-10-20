import { useEffect, useMemo, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  companiesQuery,
  portsQuery,
  fleetDeparturesQuery,
  routesQuery,
  vesselsQuery,
} from "./queries";
import { routeArc, pointAlong } from "./geo";
import {
  departureForSignal,
  estimateArrival,
  LIVE_MAX_AGE_MINUTES,
  phaseFromSignal,
  type LivePosition,
  type LiveShip,
} from "./tracking";

/**
 * Positions fournies par le serveur. Le serveur ne rappelle l'API externe que toutes les 20 minutes
 * (cache partagé) : interroger cette adresse plus souvent ne coûte rien en appels API.
 */
export const vesselPositionsQuery = queryOptions({
  queryKey: ["vessel-positions"],
  queryFn: async (): Promise<LivePosition[]> => {
    try {
      const response = await fetch("/api/vessel-positions");
      if (!response.ok) return [];
      const body = (await response.json()) as { positions?: LivePosition[] };
      return body.positions ?? [];
    } catch {
      return [];
    }
  },
  refetchInterval: 5 * 60_000,
  staleTime: 4 * 60_000,
  retry: false,
});

/** Mode démonstration, réservé au développement local : ajouter ?livedemo=1 à l'adresse. */
let demoFlag: boolean | null = null;
function demoEnabled() {
  // Lu une seule fois : l'adresse est ensuite réécrite par la page et perd ce paramètre.
  if (demoFlag === null) {
    demoFlag =
      import.meta.env.DEV &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("livedemo");
  }
  return demoFlag;
}

/** Navires suivis, rattachés à leur traversée en cours. */
export function useLiveShips(): LiveShip[] {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const { data: positions = [] } = useQuery(vesselPositionsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: departures = [] } = useQuery(fleetDeparturesQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  useQuery(companiesQuery);

  return useMemo(() => {
    const now = Date.now();
    const routeById = new Map(routes.map((route) => [route.id, route]));
    const portById = new Map(ports.map((port) => [port.id, port]));
    const ships: LiveShip[] = [];

    if (demoEnabled()) {
      // Développement uniquement : les 5 prochaines traversées apparaissent « en mer ».
      departures
        .filter((departure) => departure.vessel_id && departure.status !== "cancelled")
        .slice(0, 5)
        .forEach((departure, index) => {
          const route = routeById.get(departure.route_id);
          const vessel = vessels.find((item) => item.id === departure.vessel_id);
          const from = route ? portById.get(route.departure_port_id) : undefined;
          const to = route ? portById.get(route.arrival_port_id) : undefined;
          if (!route || !vessel || !from || !to) return;
          const arc = routeArc(from, to);
          const progress = 0.2 + index * 0.14;
          const [lng, lat] = pointAlong(arc, progress);
          const [nextLng, nextLat] = pointAlong(arc, Math.min(1, progress + 0.02));
          const course = ((Math.atan2(nextLng - lng, nextLat - lat) * 180) / Math.PI + 360) % 360;
          const position: LivePosition = {
            mmsi: 200000000 + index,
            vesselName: vessel.name,
            status: "En route",
            latitude: lat,
            longitude: lng,
            speedKnots: 17 + index,
            courseDeg: course,
            reportedAt: new Date(now - (4 + index * 3) * 60_000).toISOString(),
            fetchedAt: new Date(now).toISOString(),
          };
          const estimate = estimateArrival(position, to, departure.arrival_at, now);
          ships.push({
            vessel,
            departure,
            route,
            position,
            phase: "sea",
            ageMinutes: 4 + index * 3,
            ...estimate,
            demo: true,
          });
        });
      return ships;
    }

    const byMmsi = new Map(positions.map((position) => [position.mmsi, position]));
    vessels.forEach((vessel) => {
      if (!vessel.mmsi) return;
      const position = byMmsi.get(vessel.mmsi);
      if (!position) return;
      const reported = position.reportedAt ? Date.parse(position.reportedAt) : NaN;
      if (!Number.isFinite(reported) || reported > now + 60_000) return;
      const ageMinutes = Math.max(0, (now - reported) / 60_000);
      // Le signal AIS récent fait foi : il est affiché même si aucun départ n'est prévu à cette heure.
      if (ageMinutes > LIVE_MAX_AGE_MINUTES) return;
      const departure = departureForSignal(departures, vessel, position, routes, now);
      if (!departure) return;
      const route = routeById.get(departure.route_id);
      const to = route ? portById.get(route.arrival_port_id) : undefined;
      if (!route || !to) return;
      const estimate = estimateArrival(position, to, departure.arrival_at, now);
      ships.push({
        vessel,
        departure,
        route,
        position,
        phase: phaseFromSignal(position),
        ageMinutes,
        ...estimate,
      });
    });
    return ships;
  }, [positions, vessels, departures, routes, ports, tick]);
}
