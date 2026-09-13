import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SidePanel } from "@/components/panel/SidePanel";
import { UserMenu } from "@/components/layout/UserMenu";
import { useAuth } from "@/hooks/useAuth";
import { portsQuery, routesQuery, upcomingDeparturesQuery } from "@/lib/ferry/queries";
import { emptyFilters, type Filters, type Selection } from "@/lib/ferry/types";
import { Button } from "@/components/ui/button";

const FerryMap = lazy(() => import("@/components/map/FerryMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FerryDZ — Carte des ferries vers l'Algérie" },
      {
        name: "description",
        content:
          "Explorez sur une carte les ports, lignes maritimes, durées de traversée et prochains départs vers l'Algérie.",
      },
      { property: "og:title", content: "FerryDZ — Carte des ferries vers l'Algérie" },
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
  const { user, isAdmin, signOut } = useAuth();

  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());

  const visibleRoutes = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    const portMatches = (id: string) => {
      const port = ports.find((item) => item.id === id);
      if (!port) return false;
      return `${port.name} ${port.city ?? ""} ${port.country_name}`
        .toLowerCase()
        .includes(term);
    };
    return routes.filter((route) => {
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

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-lg font-bold tracking-tight">FerryDZ</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Traversées vers l'Algérie
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          {isAdmin ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin">Back-office</Link>
            </Button>
          ) : null}
          <UserMenu />
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <aside className="h-[48vh] w-full shrink-0 border-t border-border md:h-auto md:w-[380px] md:border-r md:border-t-0">
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
    <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
      Chargement de la carte…
    </div>
  );
}
