import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import { MobileMapControls } from "@/components/map/MobileMapControls";
import { filtersFromUrl, mapStateToSearch, selectionFromUrl } from "@/lib/ferry/urlState";
import { navLinks } from "@/components/layout/SiteLayout";

const FerryMap = lazy(() => import("@/components/map/FerryMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Batogo — Carte des ferries vers l'Algérie" },
      { name: "description", content: "Explorez sur une carte interactive les ports, lignes maritimes, durées de traversée et prochains départs vers l'Algérie." },
    ],
  }),
  component: Index,
});

function Index() {
  const [selection, setSelection] = useState<Selection | null>(() => typeof window === "undefined" ? null : selectionFromUrl(window.location.search));
  const [filters, setFilters] = useState<Filters>(() => typeof window === "undefined" ? emptyFilters : filtersFromUrl(window.location.search));
  const [panelLevel, setPanelLevel] = useState<0 | 1 | 2>(1);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(true);
  const dragStartY = useRef<number | null>(null);
  const dragStartLevel = useRef<0 | 1 | 2>(1);
  const { isAdmin } = useAuth();

  const portsResult = useQuery(portsQuery);
  const routesResult = useQuery(routesQuery);
  const departuresResult = useQuery(upcomingDeparturesQuery());
  const companiesResult = useQuery(companiesQuery);
  const vesselsResult = useQuery(vesselsQuery);
  
  const { data: ports = [] } = portsResult;
  const { data: routes = [] } = routesResult;
  const { data: departures = [] } = departuresResult;
  const { data: companies = [] } = companiesResult;
  const { data: vessels = [] } = vesselsResult;
  
  const isLoadingData = [portsResult, routesResult, departuresResult, companiesResult, vesselsResult].some((res) => res.isPending);
  const hasDemoData = ports.some(i => i.is_demo) || routes.some(i => i.is_demo) || companies.some(i => i.is_demo) || vessels.some(i => i.is_demo);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextSearch = mapStateToSearch(filters, selection);
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [filters, selection]);

  const visibleRoutes = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    const portMatches = (id: string) => {
      const port = ports.find((item) => item.id === id);
      return port ? `${port.name} ${port.city ?? ""} ${port.country_name}`.toLowerCase().includes(term) : false;
    };
    const portOpen = (id: string) => ports.find((item) => item.id === id)?.status === "active";
    const selected = new Set(filters.portIds);
    const selectedCountries = new Set(filters.countryCodes);
    
    return routes.filter((route) => {
      if (!portOpen(route.departure_port_id) || !portOpen(route.arrival_port_id)) return false;
      if (selectedCountries.size > 0 && !selectedCountries.has(ports.find((item) => item.id === route.departure_port_id)?.country_code ?? "") && !selectedCountries.has(ports.find((item) => item.id === route.arrival_port_id)?.country_code ?? "")) return false;
      if (selected.size > 0 && !filters.departurePortId && !filters.arrivalPortId && !selected.has(route.departure_port_id) && !selected.has(route.arrival_port_id)) return false;
      if (filters.departureCountry) {
        const from = ports.find((item) => item.id === route.departure_port_id);
        if (from?.country_code !== filters.departureCountry) return false;
      }
      if (filters.departurePortId && route.departure_port_id !== filters.departurePortId) return false;
      if (filters.arrivalPortId && route.arrival_port_id !== filters.arrivalPortId) return false;
      if (filters.companyId && !route.company_ids.includes(filters.companyId)) return false;
      if (filters.vesselId && !departures.some(d => d.route_id === route.id && d.vessel_id === filters.vesselId)) return false;
      if (filters.date && !departures.some(d => d.route_id === route.id && d.departure_at.slice(0, 10) === filters.date)) return false;
      if (term && !portMatches(route.departure_port_id) && !portMatches(route.arrival_port_id)) return false;
      return true;
    });
  }, [routes, ports, departures, filters]);

  const highlightedPortIds = useMemo(() => {
    if (selection?.type === "port") return [selection.id];
    if (selection?.type === "route") {
      const route = routes.find((item) => item.id === selection.id);
      return route ? [route.departure_port_id, route.arrival_port_id] : [];
    }
    return [];
  }, [selection, routes]);

  const focusRouteIds = useMemo(() => {
    if (selection?.type === "route") return [selection.id];
    if (selection?.type === "port") return routes.filter(r => r.departure_port_id === selection.id || r.arrival_port_id === selection.id).map(r => r.id);
    return [];
  }, [selection, routes]);

  const portMeta = useMemo(() => {
    const meta: Record<string, PortMeta> = {};
    const visibleIds = new Set(visibleRoutes.map((route) => route.id));
    const companyName = new Map(companies.map(c => [c.id, c.name]));
    const vesselName = new Map(vessels.map(v => [v.id, v.name]));
    
    ports.forEach((port) => {
      const portRoutes = visibleRoutes.filter(r => r.departure_port_id === port.id || r.arrival_port_id === port.id);
      const routeIds = new Set(portRoutes.map(r => r.id));
      const companyNames = new Set<string>();
      
      portRoutes.forEach((route) => route.company_ids.forEach(id => { const n = companyName.get(id); if (n) companyNames.add(n); }));
      
      const vesselNames = new Set<string>();
      departures.forEach((departure) => {
        if (!routeIds.has(departure.route_id) || departure.status === "cancelled") return;
        const c = companyName.get(departure.company_id); if (c) companyNames.add(c);
        const v = departure.vessel_id ? vesselName.get(departure.vessel_id) : null; if (v) vesselNames.add(v);
      });
      
      const portDepartures = departures.filter(d => visibleIds.has(d.route_id) && routes.find(r => r.id === d.route_id)?.departure_port_id === port.id && d.status !== "cancelled");
      const next = portDepartures[0];
      
      meta[port.id] = {
        routes: portRoutes.length,
        companies: [...companyNames].sort(),
        vessels: [...vesselNames].sort(),
        nextDeparture: next ? formatDateTime(next.departure_at) : null,
        nextTo: next ? (ports.find(p => p.id === routes.find(r => r.id === next.route_id)?.arrival_port_id)?.name ?? null) : null,
        upcoming: portDepartures.slice(0, 3).map(d => ({
          label: formatDateTime(d.departure_at),
          to: ports.find(p => p.id === routes.find(r => r.id === d.route_id)?.arrival_port_id)?.name ?? null,
        })),
        hasMore: portDepartures.length > 3,
      };
    });
    return meta;
  }, [ports, routes, visibleRoutes, departures, companies, vessels]);

  const setSelectionAndOpen = (next: Selection | null) => setSelection(next);
  const openPanel = () => setPanelLevel(1);
  const cyclePanelLevel = () => setPanelLevel((current) => (current === 2 ? 0 : ((current + 1) as 1 | 2)));

  const startPanelDrag = (clientY: number) => { dragStartY.current = clientY; dragStartLevel.current = panelLevel; };
  const finishPanelDrag = (clientY: number) => {
    if (dragStartY.current === null) return;
    const distance = dragStartY.current - clientY;
    if (Math.abs(distance) >= 44) {
      setPanelLevel(Math.max(0, Math.min(2, dragStartLevel.current + (distance > 0 ? 1 : -1))) as 0|1|2);
    }
    dragStartY.current = null;
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      
      {/* HEADER BUREAU: Fixé en haut, bord à bord, sobre */}
      <header className="absolute left-0 right-0 top-0 z-50 hidden h-16 items-center justify-between border-b border-border/60 bg-white/95 px-6 text-foreground shadow-sm backdrop-blur-md md:flex">
        <Link to="/" className="flex items-center gap-3">
          <BrandMark className="size-7 text-primary" />
          <span className="font-display text-lg font-bold tracking-tight">Batogo</span>
        </Link>
        <nav className="flex items-center gap-6">
          <div className="hidden items-center gap-6 lg:flex">
            {navLinks.slice(1).map((link) => (
              <Link key={link.to} to={link.to} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                {link.label}
              </Link>
            ))}
          </div>
          <div className="h-4 w-px bg-border mx-2 hidden lg:block"></div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary font-medium hover:bg-secondary"
            onClick={() => setDesktopPanelOpen((open) => !open)}
          >
            {desktopPanelOpen ? "Cacher le panneau" : "Afficher les lignes"}
          </Button>
          {isAdmin && (
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link to="/admin">Admin</Link>
            </Button>
          )}
          <UserMenu />
        </nav>
      </header>

      <MobileMapControls
        ports={ports}
        routes={routes}
        departures={departures}
        filters={filters}
        onFiltersChange={setFilters}
        onSelect={setSelection}
        onOpenPanel={() => setPanelLevel(1)}
      />

      {panelLevel === 2 && (
        <button type="button" aria-label="Fermer" className="absolute inset-0 z-50 bg-foreground/10 md:hidden" onClick={() => setPanelLevel(1)} />
      )}

      {/* PANNEAU LATÉRAL : Style carte flottante subtile, aligné à gauche sous le header */}
      <aside
        className={`absolute bottom-0 left-0 right-0 z-[60] flex flex-col overflow-hidden bg-transparent transition-[height,width,opacity,transform] duration-300 ease-out md:bottom-auto md:left-5 md:top-[5.5rem] md:h-[calc(100vh-7rem)] md:w-[380px] md:rounded-2xl md:z-40 ${
          desktopPanelOpen ? "md:opacity-100 md:translate-x-0" : "md:pointer-events-none md:opacity-0 md:-translate-x-4"
        } ${panelLevel === 0 ? "h-24 rounded-t-xl" : panelLevel === 1 ? "h-[45dvh] rounded-t-xl" : "h-[100dvh]"}`}
      >
        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full touch-none rounded-none py-0 md:hidden flex items-center justify-center bg-card/80 backdrop-blur-md border-b border-border/50"
          onClick={cyclePanelLevel}
          onPointerDown={(e) => startPanelDrag(e.clientY)}
          onPointerUp={(e) => finishPanelDrag(e.clientY)}
          onPointerCancel={() => { dragStartY.current = null; }}
          onPointerMove={(e) => { if (dragStartY.current !== null) e.currentTarget.setPointerCapture(e.pointerId); }}
          style={{ touchAction: "none" }}
        >
          <div className="batogo-handle" />
        </Button>

        <SidePanel
          selection={selection}
          onSelect={setSelectionAndOpen}
          filters={filters}
          onFiltersChange={setFilters}
          visibleRoutes={visibleRoutes}
          hidePrimarySearchOnMobile
        />
        
        {hasDemoData && (
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-[12px] text-amber-900 shadow-sm backdrop-blur-md md:bottom-4">
            Données de démonstration : vérifiez les informations avant tout départ.
          </div>
        )}
      </aside>

      {/* NAV MOBILE FIXE */}
      <nav className="absolute bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-border bg-background/95 pb-1 backdrop-blur-xl md:hidden">
        <Link to="/" className="flex flex-col items-center gap-1 text-primary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
          <span className="text-[10px] font-medium">Carte</span>
        </Link>
        <Link to="/horaires" className="flex flex-col items-center gap-1 text-muted-foreground">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span className="text-[10px] font-medium">Horaires</span>
        </Link>
        <Link to="/ports" className="flex flex-col items-center gap-1 text-muted-foreground">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3"></circle><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"></path></svg>
          <span className="text-[10px] font-medium">Ports</span>
        </Link>
        <Link to="/guide" className="flex flex-col items-center gap-1 text-muted-foreground">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
          <span className="text-[10px] font-medium">Guide</span>
        </Link>
      </nav>

      {/* CARTE */}
      <main className="absolute inset-0 z-0 bg-[var(--sea)]">
        {isLoadingData && (
          <div className="pointer-events-none absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-full border border-border bg-background/95 px-4 py-2 text-[11px] font-semibold text-foreground shadow-sm">
            Actualisation...
          </div>
        )}
        <ClientOnly fallback={<MapFallback />}>
          <Suspense fallback={<MapFallback />}>
            <FerryMap
              ports={ports}
              routes={routes}
              visibleRouteIds={visibleRoutes.map((route) => route.id)}
              focusRouteIds={focusRouteIds}
              selection={selection}
              filters={filters}
              onFiltersChange={setFilters}
              highlightedPortIds={highlightedPortIds}
              portMeta={portMeta}
              onSelect={setSelectionAndOpen}
              onOpenPanel={openPanel}
              onMapInteract={() => setPanelLevel(0)}
            />
          </Suspense>
        </ClientOnly>
      </main>
    </div>
  );
}

function MapFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[var(--sea)] text-[13px] font-semibold text-primary/70">
      <span className="animate-pulse">Chargement de la carte…</span>
    </div>
  );
}
