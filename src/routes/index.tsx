import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SidePanel } from "@/components/panel/SidePanel";
import { UserMenu } from "@/components/layout/UserMenu";
import { BrandMark } from "@/components/layout/BrandMark";
import { useAuth } from "@/hooks/useAuth";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { formatDateTime } from "@/lib/ferry/format";
import { emptyFilters, type Filters, type Selection } from "@/lib/ferry/types";
import type { PortMeta } from "@/components/map/FerryMap";
import { Button } from "@/components/ui/button";

const FerryMap = lazy(() => import("@/components/map/FerryMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Batogo — Carte des ferries vers l'Algérie" },
      {
        name: "description",
        content:
          "Explorez sur une carte interactive les ports, lignes maritimes, durées de traversée et prochains départs vers l'Algérie.",
      },
      { property: "og:title", content: "Batogo — Carte des ferries vers l'Algérie" },
      {
        property: "og:description",
        content:
          "Ports, lignes, durées de traversée et prochains départs vers l'Algérie, sur une seule carte.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const { isAdmin } = useAuth();

  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);

  const visibleRoutes = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    const portMatches = (id: string) => {
      const port = ports.find((item) => item.id === id);
      if (!port) return false;
      return `${port.name} ${port.city ?? ""} ${port.country_name}`
        .toLowerCase()
        .includes(term);
    };
    // Un port fermé temporairement : ses lignes disparaissent de la carte.
    const portOpen = (id: string) =>
      ports.find((item) => item.id === id)?.status === "active";
    return routes.filter((route) => {
      if (!portOpen(route.departure_port_id) || !portOpen(route.arrival_port_id)) return false;
      if (filters.departurePortId && route.departure_port_id !== filters.departurePortId)
        return false;
      if (filters.arrivalPortId && route.arrival_port_id !== filters.arrivalPortId) return false;
      if (filters.companyId && !route.company_ids.includes(filters.companyId)) return false;
      if (filters.vesselId) {
        const hasVessel = departures.some(
          (departure) =>
            departure.route_id === route.id && departure.vessel_id === filters.vesselId,
        );
        if (!hasVessel) return false;
      }
      if (filters.date) {
        const hasDate = departures.some(
          (departure) =>
            departure.route_id === route.id &&
            departure.departure_at.slice(0, 10) === filters.date,
        );
        if (!hasDate) return false;
      }
      if (term && !portMatches(route.departure_port_id) && !portMatches(route.arrival_port_id))
        return false;
      return true;
    });
  }, [routes, ports, departures, filters]);

  const highlightedPortIds = useMemo(() => {
    if (selection?.type === "port") return [selection.id];
    if (selection?.type === "route") {
      const route = routes.find((item) => item.id === selection.id);
      return route ? [route.departure_port_id, route.arrival_port_id] : [];
    }
    const filtered =
      visibleRoutes.length !== routes.length
        ? [
            ...new Set(
              visibleRoutes.flatMap((route) => [
                route.departure_port_id,
                route.arrival_port_id,
              ]),
            ),
          ]
        : [];
    return filtered;
  }, [selection, routes, visibleRoutes]);

  // Sélection d'un port : seules ses lignes restent en couleur, les autres se grisent.
  const focusRouteIds = useMemo(() => {
    if (selection?.type === "route") return [selection.id];
    if (selection?.type === "port")
      return routes
        .filter(
          (route) =>
            route.departure_port_id === selection.id || route.arrival_port_id === selection.id,
        )
        .map((route) => route.id);
    return [];
  }, [selection, routes]);

  // Infobulle de survol : lignes visibles, compagnies, navires et prochain départ connu.
  const portMeta = useMemo(() => {
    const meta: Record<string, PortMeta> = {};
    const visibleIds = new Set(visibleRoutes.map((route) => route.id));
    const companyName = new Map(companies.map((company) => [company.id, company.name]));
    const vesselName = new Map(vessels.map((vessel) => [vessel.id, vessel.name]));
    ports.forEach((port) => {
      const portRoutes = visibleRoutes.filter(
        (route) =>
          route.departure_port_id === port.id || route.arrival_port_id === port.id,
      );
      const routeIds = new Set(portRoutes.map((route) => route.id));
      const companyNames = new Set<string>();
      portRoutes.forEach((route) =>
        route.company_ids.forEach((id) => {
          const name = companyName.get(id);
          if (name) companyNames.add(name);
        }),
      );
      const vesselNames = new Set<string>();
      departures.forEach((departure) => {
        if (!routeIds.has(departure.route_id) || departure.status === "cancelled") return;
        const company = companyName.get(departure.company_id);
        if (company) companyNames.add(company);
        const vessel = departure.vessel_id ? vesselName.get(departure.vessel_id) : null;
        if (vessel) vesselNames.add(vessel);
      });
      const next = departures.find((departure) => {
        if (!visibleIds.has(departure.route_id)) return false;
        const route = routes.find((item) => item.id === departure.route_id);
        return route?.departure_port_id === port.id && departure.status !== "cancelled";
      });
      const nextRoute = next ? routes.find((item) => item.id === next.route_id) : undefined;
      meta[port.id] = {
        routes: portRoutes.length,
        companies: [...companyNames].sort(),
        vessels: [...vesselNames].sort(),
        nextDeparture: next ? formatDateTime(next.departure_at) : null,
        nextTo: nextRoute
          ? ports.find((item) => item.id === nextRoute.arrival_port_id)?.name ?? null
          : null,
      };
    });
    return meta;
  }, [ports, routes, visibleRoutes, departures, companies, vessels]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="relative z-20 flex items-center justify-between gap-3 border-b border-border bg-[image:var(--gradient-header)] px-4 py-2.5 text-primary-foreground">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark className="size-8" />
          <span className="flex flex-col leading-none">
            <span className="font-display text-lg font-bold tracking-tight">Batogo</span>
            <span className="hidden text-[11px] text-primary-foreground/70 sm:inline">
              Traversées en ferry vers l'Algérie
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:inline-flex"
          >
            <Link to="/horaires">Horaires</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:inline-flex"
          >
            <Link to="/ports">Ports</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:inline-flex"
          >
            <Link to="/guide">Guide</Link>
          </Button>
          {isAdmin ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <Link to="/admin">Back-office</Link>
            </Button>
          ) : null}
          <UserMenu />
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <aside className="h-[48vh] w-full shrink-0 border-t border-border shadow-[var(--shadow-panel)] md:h-auto md:w-[390px] md:border-r md:border-t-0">
          <SidePanel
            selection={selection}
            onSelect={setSelection}
            filters={filters}
            onFiltersChange={setFilters}
            visibleRoutes={visibleRoutes}
          />
        </aside>
        <main className="relative min-h-0 flex-1 bg-[var(--sea)]">
          <ClientOnly fallback={<MapFallback />}>
            <Suspense fallback={<MapFallback />}>
              <FerryMap
                ports={ports}
                routes={routes}
                visibleRouteIds={visibleRoutes.map((route) => route.id)}
                focusRouteIds={focusRouteIds}
                selection={selection}
                highlightedPortIds={highlightedPortIds}
                portMeta={portMeta}
                onSelect={setSelection}
              />
            </Suspense>
          </ClientOnly>
        </main>
      </div>
    </div>
  );
}

function MapFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center gap-2 text-sm text-muted-foreground">
      <span className="animate-pulse font-display font-semibold">Chargement de la carte…</span>
    </div>
  );
}
