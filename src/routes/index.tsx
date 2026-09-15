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
    const portOpen = (id: string) =>
      ports.find((item) => item.id === id)?.status === "active";
    const selected = new Set(filters.portIds);
    return routes.filter((route) => {
      if (!portOpen(route.departure_port_id) || !portOpen(route.arrival_port_id)) return false;
      if (
        selected.size > 0 &&
        !selected.has(route.departure_port_id) &&
        !selected.has(route.arrival_port_id)
      )
        return false;
      if (filters.departureCountry) {
        const from = ports.find((item) => item.id === route.departure_port_id);
        if (from?.country_code !== filters.departureCountry) return false;
      }
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
      const portDepartures = departures.filter((departure) => {
        if (!visibleIds.has(departure.route_id)) return false;
        const route = routes.find((item) => item.id === departure.route_id);
        return route?.departure_port_id === port.id && departure.status !== "cancelled";
      });
      const toName = (departure: (typeof portDepartures)[number]) => {
        const route = routes.find((item) => item.id === departure.route_id);
        return route
          ? (ports.find((item) => item.id === route.arrival_port_id)?.name ?? null)
          : null;
      };
      const next = portDepartures[0];
      meta[port.id] = {
        routes: portRoutes.length,
        companies: [...companyNames].sort(),
        vessels: [...vesselNames].sort(),
        nextDeparture: next ? formatDateTime(next.departure_at) : null,
        nextTo: next ? toName(next) : null,
        upcoming: portDepartures.slice(0, 3).map((departure) => ({
          label: formatDateTime(departure.departure_at),
          to: toName(departure),
        })),
        hasMore: portDepartures.length > 3,
      };
    });
    return meta;
  }, [ports, routes, visibleRoutes, departures, companies, vessels]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      
      {/* HEADER FLOTTANT ET TRANSLUCIDE */}
      <header className="absolute left-0 right-0 top-0 z-50 flex items-center justify-between gap-3 border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-xl text-foreground shadow-sm">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark className="size-8 text-primary" />
          <span className="flex flex-col leading-none">
            <span className="font-display text-lg font-bold tracking-tight">Batogo</span>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Traversées en ferry vers l'Algérie
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden text-foreground hover:bg-secondary hover:text-foreground sm:inline-flex"
          >
            <Link to="/horaires">Horaires</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden text-foreground hover:bg-secondary hover:text-foreground sm:inline-flex"
          >
            <Link to="/ports">Ports</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden text-foreground hover:bg-secondary hover:text-foreground sm:inline-flex"
          >
            <Link to="/guide">Guide</Link>
          </Button>
          {isAdmin ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-foreground hover:bg-secondary hover:text-foreground"
            >
              <Link to="/admin">Back-office</Link>
            </Button>
          ) : null}
          <UserMenu />
        </nav>
      </header>

      {/* PANNEAU LATÉRAL FLOTTANT */}
      <aside className="absolute bottom-0 left-0 right-0 z-40 flex max-h-[85vh] flex-col overflow-hidden rounded-t-[2rem] border-t border-border/50 bg-background/95 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] backdrop-blur-xl transition-transform duration-500 ease-out md:bottom-auto md:left-4 md:top-24 md:h-[calc(100vh-7.5rem)] md:w-[400px] md:rounded-3xl md:border md:shadow-[var(--shadow-elegant)]">
        <SidePanel
          selection={selection}
          onSelect={setSelection}
          filters={filters}
          onFiltersChange={setFilters}
          visibleRoutes={visibleRoutes}
        />
      </aside>

      {/* CARTE EN PLEIN ÉCRAN */}
      <main className="absolute inset-0 z-0 bg-[var(--sea)]">
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
  );
}

function MapFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center gap-2 text-sm text-muted-foreground">
      <span className="animate-pulse font-display font-semibold">Chargement de la carte…</span>
    </div>
  );
}
