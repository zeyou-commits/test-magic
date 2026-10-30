import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fleetDeparturesQuery,
  upcomingDeparturesQuery,
  portsQuery,
  routesQuery,
  vesselsQuery,
} from "./queries";
import { buildFleet, type FleetShip } from "./fleet";
import { immobilizedVessels, incidentsQuery } from "./incidents";
import { useLiveShips } from "./useLiveShips";

let shiftMs: number | null = null;
/** Développement uniquement : ?tshift=8 avance l'horloge de 8 h pour voir des navires en pleine mer. */
function clockShiftMs() {
  if (shiftMs === null) {
    const raw =
      import.meta.env.DEV && typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("tshift")
        : null;
    shiftMs = raw ? Number(raw) * 3600_000 || 0 : 0;
  }
  return shiftMs;
}

/** Tous les navires à afficher : déduits des horaires, remplacés par leur position réelle si le suivi est actif. */
export function useFleet(): FleetShip[] {
  const { data: departures = [] } = useQuery(fleetDeparturesQuery);
  // Secours : le flux complet des départs futurs évite qu’un décalage de fenêtre/cache
  // fasse disparaître un navire pourtant associé à une traversée publiée.
  const { data: upcomingDepartures = [] } = useQuery(upcomingDeparturesQuery());
  const allDepartures = useMemo(() => {
    const byId = new Map(
      [...departures, ...upcomingDepartures].map((departure) => [departure.id, departure]),
    );
    return [...byId.values()];
  }, [departures, upcomingDepartures]);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const liveShips = useLiveShips();
  const [tick, setTick] = useState(0);

  // Un navire avance de moins de 0,1 % de sa route par minute : un recalcul par minute suffit.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return useMemo(
    () =>
      buildFleet(
        allDepartures,
        routes,
        ports,
        vessels,
        liveShips,
        Date.now() + clockShiftMs(),
        immobilizedVessels(incidents),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allDepartures, routes, ports, vessels, liveShips, incidents, tick],
  );
}
