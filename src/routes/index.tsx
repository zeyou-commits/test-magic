import { DataUnavailableNotice } from "@/components/layout/DataUnavailableNotice";
import type React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SidePanel, type PanelTab } from "@/components/panel/SidePanel";
import { UserMenu } from "@/components/layout/UserMenu";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { capitalizeFirst, formatDateParts } from "@/lib/ferry/format";
import {
  emptyFilters,
  type Departure,
  type Filters,
  type Port,
  type RouteLine,
  type Selection,
} from "@/lib/ferry/types";
import type { PortMeta } from "@/components/map/FerryMap";
import { Button } from "@/components/ui/button";
import { MobileMapControls } from "@/components/map/MobileMapControls";
import { MapStatusBar } from "@/components/map/MapStatusBar";
import { MapLegend } from "@/components/map/MapLegend";
import { filtersFromUrl, mapStateToSearch, selectionFromUrl } from "@/lib/ferry/urlState";
import {
  departureDateKey,
  describeActiveFilters,
  filterDepartures,
  filterRoutes,
  routeTimeZones,
  summarizePorts,
} from "@/lib/ferry/filtering";
import { dateKeyInZone, portTimeZone } from "@/lib/ferry/time";
import { BrandLink, navLinks } from "@/components/layout/SiteLayout";
import { MobileTabBar } from "@/components/layout/MobileTabBar";

const FerryMap = lazy(() => import("@/components/map/FerryMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Batogo — Carte des ferries Europe ↔ Algérie" },
      {
        name: "description",
        content:
          "Toutes les traversées en ferry entre l'Europe et l'Algérie, dans les deux sens : ports, lignes, durées, compagnies et prochains départs en heure locale.",
      },
      { property: "og:title", content: "Batogo — Carte des ferries Europe ↔ Algérie" },
      {
        property: "og:description",
        content:
          "Les lignes maritimes et les prochains départs entre l'Europe et l'Algérie, dans les deux sens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

/** Hauteurs du tiroir mobile : replié, intermédiaire, plein écran (hors barre d'onglets). */
const TAB_BAR_HEIGHT = 56;
const COLLAPSED_HEIGHT = 96;
const MIDDLE_RATIO = 0.42;

function Index() {
  const [selection, setSelection] = useState<Selection | null>(() =>
    typeof window === "undefined" ? null : selectionFromUrl(window.location.search),
  );
  const [filters, setFilters] = useState<Filters>(() =>
    typeof window === "undefined" ? emptyFilters : filtersFromUrl(window.location.search),
  );
  const [panelTab, setPanelTab] = useState<PanelTab>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("plan") === "1"
      ? "plan"
      : "explore",
  );
  const [panelLevel, setPanelLevel] = useState<0 | 1 | 2>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("plan") === "1" &&
    window.innerWidth < 768
      ? 2
      : 1,
  );
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(true);
  const dragStartY = useRef<number | null>(null);
  const dragStartHeight = useRef(0);
  const dragMoved = useRef(false);
  const lastMove = useRef({ y: 0, t: 0, v: 0 });
  const asideRef = useRef<HTMLElement | null>(null);
  const [dragHeight, setDragHeightState] = useState<number | null>(null);
  const dragHeightRef = useRef<number | null>(null);
  const setDragHeight = (h: number | null) => {
    dragHeightRef.current = h;
    setDragHeightState(h);
  };
  const [viewportHeight, setViewportHeight] = useState(800);

  useEffect(() => {
    const update = () => setViewportHeight(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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

  const allResults = [portsResult, routesResult, departuresResult, companiesResult, vesselsResult];
  const isLoadingData = allResults.some((res) => res.isPending);
  const hasError = allResults.some((res) => res.isError);

  // L'URL reflète toujours la vue : un lien partagé rouvre exactement la même carte.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextSearch = mapStateToSearch(
      filters,
      selection,
      panelTab === "plan" ? { plan: "1" } : {},
    );
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [filters, selection, panelTab]);

  const timeZones = useMemo(() => routeTimeZones(routes, ports), [routes, ports]);

  // Un seul moteur de filtres pour la carte, la liste et le tiroir mobile.
  const matchingRoutes = useMemo(
    () => filterRoutes(routes, ports, departures, filters),
    [routes, ports, departures, filters],
  );
  // Sur la carte, la date sert de signal : les lignes sans départ ce jour-là restent visibles mais grisées.
  const mapRoutes = useMemo(
    () => filterRoutes(routes, ports, departures, filters, { ignoreDate: true }),
    [routes, ports, departures, filters],
  );
  const dateActiveRouteIds = useMemo(
    () => (filters.date ? matchingRoutes.map((route) => route.id) : []),
    [filters.date, matchingRoutes],
  );
  const matchingDepartures = useMemo(
    () =>
      filterDepartures(
        departures,
        new Set(matchingRoutes.map((route) => route.id)),
        filters,
        timeZones,
      ),
    [departures, matchingRoutes, filters, timeZones],
  );

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
    if (selection?.type === "port")
      return routes
        .filter((r) => r.departure_port_id === selection.id || r.arrival_port_id === selection.id)
        .map((r) => r.id);
    return [];
  }, [selection, routes]);

  // Les infobulles décrivent le réseau réel du port, indépendamment des filtres en cours.
  const portMeta = useMemo(() => {
    const meta: Record<string, PortMeta> = {};
    const companyName = new Map(companies.map((c) => [c.id, c.name]));
    const routeById = new Map(routes.map((route) => [route.id, route]));
    const portById = new Map(ports.map((port) => [port.id, port]));

    ports.forEach((port) => {
      const portRoutes = routes.filter(
        (r) =>
          r.status === "active" &&
          (r.departure_port_id === port.id || r.arrival_port_id === port.id),
      );
      const companyNames = new Set<string>();
      portRoutes.forEach((route) =>
        route.company_ids.forEach((id) => {
          const n = companyName.get(id);
          if (n) companyNames.add(n);
        }),
      );

      const timeZone = portTimeZone(port);
      const portDepartures = departures.filter(
        (d) => routeById.get(d.route_id)?.departure_port_id === port.id && d.status !== "cancelled",
      );

      meta[port.id] = {
        routes: portRoutes.length,
        companies: [...companyNames].sort(),
        upcoming: portDepartures.slice(0, 3).map((d) => {
          const parts = formatDateParts(d.departure_at, timeZone);
          return {
            date: capitalizeFirst(`${parts.weekday} ${parts.shortDate}`),
            time: parts.time,
            to: portById.get(routeById.get(d.route_id)?.arrival_port_id ?? "")?.name ?? null,
          };
        }),
      };
    });
    return meta;
  }, [ports, routes, departures, companies]);

  const chips = useMemo(
    () => describeActiveFilters(filters, ports, companies, vessels),
    [filters, ports, companies, vessels],
  );

  const snapHeights = () => {
    const vh = window.innerHeight;
    return [COLLAPSED_HEIGHT, Math.round(vh * MIDDLE_RATIO), vh - TAB_BAR_HEIGHT] as const;
  };
  const cyclePanelLevel = () => {
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    setPanelLevel((current) => (current === 2 ? 0 : ((current + 1) as 1 | 2)));
  };

  // Gestes continus façon Google Maps : le volet suit le doigt puis s'aimante avec l'élan.
  const startPanelDrag = (clientY: number) => {
    dragStartY.current = clientY;
    dragMoved.current = false;
    dragStartHeight.current =
      asideRef.current?.getBoundingClientRect().height ?? snapHeights()[panelLevel];
    lastMove.current = { y: clientY, t: performance.now(), v: 0 };
  };
  const movePanelDrag = (clientY: number) => {
    if (dragStartY.current === null) return;
    const delta = dragStartY.current - clientY;
    if (!dragMoved.current && Math.abs(delta) < 6) return;
    dragMoved.current = true;
    const [min, , max] = snapHeights();
    const raw = dragStartHeight.current + delta;
    // Résistance élastique au-delà des bornes.
    const h = raw < min ? min - (min - raw) * 0.25 : raw > max ? max + (raw - max) * 0.25 : raw;
    const now = performance.now();
    const dt = Math.max(1, now - lastMove.current.t);
    lastMove.current = { y: clientY, t: now, v: (lastMove.current.y - clientY) / dt };
    setDragHeight(h);
  };
  const finishPanelDrag = () => {
    if (dragStartY.current === null) return;
    dragStartY.current = null;
    if (!dragMoved.current || dragHeightRef.current === null) {
      setDragHeight(null);
      return;
    }
    const snaps = snapHeights();
    const h = dragHeightRef.current;
    const v = lastMove.current.v; // px/ms, positif = vers le haut
    let target: 0 | 1 | 2;
    if (Math.abs(v) > 0.5) {
      const above = snaps.findIndex((s) => s > h + 1);
      const below = [...snaps].reverse().findIndex((s) => s < h - 1);
      target = (v > 0 ? (above === -1 ? 2 : above) : below === -1 ? 0 : 2 - below) as 0 | 1 | 2;
    } else {
      target = snaps.reduce(
        (best, s, i) => (Math.abs(s - h) < Math.abs((snaps[best] ?? 0) - h) ? i : best),
        0,
      ) as 0 | 1 | 2;
    }
    setPanelLevel(target);
    setDragHeight(null);
    setTimeout(() => {
      dragMoved.current = false;
    }, 50);
  };
  const dragHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      startPanelDrag(e.clientY);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => movePanelDrag(e.clientY),
    onPointerUp: () => finishPanelDrag(),
    onPointerCancel: () => finishPanelDrag(),
  };

  // Espace masqué par le tiroir mobile : la carte se recentre au-dessus de lui.
  const mobileBottomInset =
    TAB_BAR_HEIGHT +
    (panelLevel === 0 ? COLLAPSED_HEIGHT : Math.round(viewportHeight * MIDDLE_RATIO));

  const openPlanner = () => {
    setPanelTab("plan");
    setPanelLevel(2);
  };
  const openExplorer = () => {
    setPanelTab("explore");
    setSelection(null);
    if (panelLevel === 0) setPanelLevel(1);
  };

  const collapsed = panelLevel === 0 && (dragHeight === null || dragHeight < 140);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      {/* EN-TÊTE ORDINATEUR */}
      <header className="absolute inset-x-0 top-0 z-50 hidden h-14 items-center justify-between gap-6 border-b border-border/60 bg-background/90 px-5 shadow-[0_1px_12px_-6px_hsl(0_0%_0%/0.15)] backdrop-blur-xl md:flex">
        <BrandLink />
        <nav
          aria-label="Navigation principale"
          className="flex min-w-0 items-center gap-0.5 overflow-x-auto"
        >
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: link.to === "/" }}
              className="relative whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-primary/10 [&.active]:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <UserMenu />
        </div>
      </header>

      <MobileMapControls
        ports={ports}
        routes={routes}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {panelLevel === 2 && (
        <button
          type="button"
          aria-label="Réduire le panneau"
          className="absolute inset-0 z-50 bg-foreground/10 md:hidden"
          onClick={() => setPanelLevel(1)}
        />
      )}

      {/* VOLET : tiroir en bas sur mobile, carte flottante à gauche sur ordinateur */}
      <aside
        ref={asideRef}
        style={dragHeight !== null ? { height: dragHeight } : undefined}
        className={`absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-[60] flex flex-col overflow-hidden bg-transparent ${dragHeight !== null ? "transition-none" : "transition-[height,width,transform] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"} md:bottom-auto md:left-5 md:right-auto md:top-[5.5rem] md:h-[calc(100vh-7rem)] md:w-[380px] md:overflow-visible md:rounded-2xl md:z-40 ${
          desktopPanelOpen ? "md:translate-x-0" : "md:translate-x-[calc(-100%-1.25rem)]"
        } ${panelLevel === 0 ? "h-24 rounded-t-xl" : panelLevel === 1 ? "h-[42dvh] rounded-t-xl" : "h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] rounded-t-xl"}`}
      >
        {collapsed ? (
          <CollapsedPanelSummary
            routes={routes}
            ports={ports}
            matchingRoutes={matchingRoutes}
            matchingDepartures={matchingDepartures}
            timeZones={timeZones}
            filters={filters}
            onOpen={() => {
              if (!dragMoved.current) setPanelLevel(1);
            }}
            dragHandlers={dragHandlers}
          />
        ) : (
          <Button
            type="button"
            variant="ghost"
            aria-label={panelLevel === 2 ? "Réduire le panneau" : "Agrandir le panneau"}
            className="flex h-8 w-full flex-none touch-none items-center justify-center rounded-none rounded-t-xl border-b border-border/50 bg-card py-0 md:hidden"
            onClick={cyclePanelLevel}
            {...dragHandlers}
            style={{ touchAction: "none" }}
          >
            <span className="batogo-handle" aria-hidden />
          </Button>
        )}

        <div
          id="map-side-panel"
          className={`${collapsed ? "hidden md:block" : "min-h-0 flex-1"} md:h-full ${desktopPanelOpen ? "" : "md:invisible md:pointer-events-none"}`}
        >
          <SidePanel
            selection={selection}
            onSelect={setSelection}
            filters={filters}
            onFiltersChange={setFilters}
            matchingRoutes={matchingRoutes}
            matchingDepartures={matchingDepartures}
            hidePrimarySearchOnMobile
            activeTab={panelTab}
            onTabChange={(tab) => {
              setPanelTab(tab);
              if (tab === "plan") setPanelLevel(2);
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={desktopPanelOpen ? "Réduire le panneau" : "Développer le panneau"}
          title={desktopPanelOpen ? "Réduire le panneau" : "Développer le panneau"}
          aria-expanded={desktopPanelOpen}
          aria-controls="map-side-panel"
          onClick={() => setDesktopPanelOpen((open) => !open)}
          className="absolute -right-8 top-1/2 hidden h-14 w-8 -translate-y-1/2 rounded-l-none rounded-r-lg border-l-0 bg-background/95 text-primary shadow-md backdrop-blur-md md:flex"
        >
          {desktopPanelOpen ? (
            <ChevronLeft className="size-5" />
          ) : (
            <ChevronRight className="size-5" />
          )}
        </Button>
      </aside>

      {/* NAVIGATION MOBILE */}
      <div className="absolute bottom-0 left-0 right-0 z-[70] md:hidden">
        <MobileTabBar
          className="h-[calc(3.5rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]"
          mapTab={panelTab === "plan" ? "plan" : "map"}
          onOpenMap={openExplorer}
          onOpenPlanner={openPlanner}
        />
      </div>

      {/* CARTE */}
      <main className="absolute inset-0 z-0 bg-[var(--sea)]">
        <DataUnavailableNotice className="absolute left-1/2 top-20 z-20 w-[min(92vw,26rem)] -translate-x-1/2" />
        <MapStatusBar
          chips={chips}
          filters={filters}
          onFiltersChange={setFilters}
          onReset={() => setFilters(emptyFilters)}
          loading={isLoadingData}
          hasError={hasError}
          onRetry={() => allResults.forEach((res) => void res.refetch())}
          panelOpen={desktopPanelOpen}
        />
        <MapLegend panelOpen={desktopPanelOpen} showDateHint={Boolean(filters.date)} />
        <ClientOnly fallback={<MapFallback />}>
          <Suspense fallback={<MapFallback />}>
            <FerryMap
              ports={ports}
              routes={routes}
              visibleRouteIds={mapRoutes.map((route) => route.id)}
              dateActiveRouteIds={dateActiveRouteIds}
              focusRouteIds={focusRouteIds}
              selection={selection}
              highlightedPortIds={highlightedPortIds}
              portMeta={portMeta}
              onSelect={setSelection}
              onOpenPanel={() => setPanelLevel(1)}
              onMapInteract={() => setPanelLevel((level) => (level === 2 ? 1 : level))}
              mobileBottomInset={mobileBottomInset}
              desktopLeftInset={desktopPanelOpen ? 420 : 40}
            />
          </Suspense>
        </ClientOnly>
      </main>
    </div>
  );
}

function CollapsedPanelSummary({
  routes,
  ports,
  matchingRoutes,
  matchingDepartures,
  timeZones,
  filters,
  onOpen,
  dragHandlers,
}: {
  routes: RouteLine[];
  ports: Port[];
  matchingRoutes: RouteLine[];
  matchingDepartures: Departure[];
  timeZones: Map<string, string>;
  filters: Filters;
  onOpen: () => void;
  dragHandlers: Record<string, (e: React.PointerEvent<HTMLElement>) => void>;
}) {
  const now = Date.now();
  const upcoming = matchingDepartures.filter(
    (departure) => new Date(departure.departure_at).getTime() >= now,
  );
  const next = upcoming[0];
  const todayCount = upcoming.filter((departure) => {
    const timeZone = timeZones.get(departure.route_id) ?? portTimeZone(null);
    return departureDateKey(departure, timeZones) === dateKeyInZone(new Date(), timeZone);
  }).length;
  const route = next ? routes.find((item) => item.id === next.route_id) : undefined;
  const from = route ? ports.find((port) => port.id === route.departure_port_id) : undefined;
  const to = route ? ports.find((port) => port.id === route.arrival_port_id) : undefined;
  const nextLabel =
    next && from && to
      ? (() => {
          const parts = formatDateParts(next.departure_at, portTimeZone(from));
          return `${from.name} → ${to.name}, ${parts.weekday} ${parts.shortDate} à ${parts.time}`;
        })()
      : "aucun départ connu pour cette recherche";
  const filtered = filters.departurePortIds.length > 0 || filters.arrivalPortIds.length > 0;
  const title = filtered
    ? `${summarizePorts(filters.departurePortIds, ports, "Tous départs")} → ${summarizePorts(filters.arrivalPortIds, ports, "toutes arrivées")}`
    : `${matchingRoutes.length} lignes • ${todayCount} départ${todayCount > 1 ? "s" : ""} aujourd’hui`;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onOpen}
      {...dragHandlers}
      className="h-24 w-full flex-none touch-none flex-col items-stretch justify-start gap-2 rounded-none rounded-t-xl border-b bg-card px-4 py-2 text-left md:hidden"
      style={{ touchAction: "none" }}
    >
      <span className="batogo-handle mx-auto" aria-hidden />
      <span className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-foreground">{title}</span>
          <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
            Prochain départ : {nextLabel}
          </span>
        </span>
        <span className="shrink-0 text-sm font-bold text-primary">Voir</span>
      </span>
    </Button>
  );
}

function MapFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[var(--sea)] text-sm font-semibold text-primary/70">
      <span className="animate-pulse">Chargement de la carte…</span>
    </div>
  );
}
