import { seoHead } from "@/lib/seo/site";
import { DataUnavailableNotice } from "@/components/layout/DataUnavailableNotice";
import type React from "react";
import { ChevronLeft, ChevronRight, ArrowDown, Compass } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SidePanel } from "@/components/panel/SidePanel";
import {
  companiesQuery,
  fleetDeparturesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
} from "@/lib/ferry/queries";
import { capitalizeFirst, formatDateParts } from "@/lib/ferry/format";
import { emptyFilters, type Filters, type Selection, type RouteLine } from "@/lib/ferry/types";
import type { PortMeta } from "@/components/map/FerryMap";
import { Button } from "@/components/ui/button";
import { MapStatusBar } from "@/components/map/MapStatusBar";
import { MapLegend } from "@/components/map/MapLegend";
import { MapStats, type MapShortcut } from "@/components/map/MapStats";
import { filtersFromUrl, mapStateToSearch, selectionFromUrl } from "@/lib/ferry/urlState";
import { filterRoutes, summarizePorts } from "@/lib/ferry/filtering";
import { portTimeZone } from "@/lib/ferry/time";
import { portTraffic } from "@/lib/ferry/portTraffic";
import { buildSailings, legSailings } from "@/lib/ferry/trips";
import { useFleet } from "@/lib/ferry/useFleet";
import { SiteHeader, SiteFooter } from "@/components/layout/SiteLayout";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { HomeContent } from "@/components/home/HomeContent";
import type { ItineraryMapPreview } from "@/lib/ferry/itinerary";

const FerryMap = lazy(() => import("@/components/map/FerryMap"));

export const Route = createFileRoute("/")({
  head: () =>
    seoHead(
      "BledWay — Ferries Europe–Algérie, carte et départs",
      "Explorez les lignes, ports et départs connus entre l’Europe et l’Algérie. Préparez aussi votre voiture, votre traversée et votre budget avec nos guides.",
      "/",
    ),
  component: Index,
});

/** Hauteurs du tiroir mobile : replié, intermédiaire, plein écran (hors barre d'onglets). */
const TAB_BAR_HEIGHT = 56;
const COLLAPSED_HEIGHT = 96;
const MIDDLE_RATIO = 0.68;
const DESKTOP_PANEL = 420;

function Index() {
  const [selection, setSelection] = useState<Selection | null>(() =>
    typeof window === "undefined" ? null : selectionFromUrl(window.location.search),
  );
  const [selectionHistory, setSelectionHistory] = useState<Selection[]>([]);
  const handleSelect = (newSelection: Selection | null, peek = false) => {
    setPeekSelectionKey(peek && newSelection ? `${newSelection.type}:${newSelection.id}` : null);
    if (newSelection === null) {
      setSelection(null);
      setSelectionHistory([]);
    } else {
      if (selection && (selection.type !== newSelection.type || selection.id !== newSelection.id)) {
        setSelectionHistory((prev) => [...prev, selection]);
      }
      setSelection(newSelection);
      setPanelMode(null);
      if (newSelection.type === "vessel" || newSelection.type === "departure") setPanelLevel(peek ? 1 : 2);
    }
    setFocusShipId(null);
  };
  const handleBack = () => {
    setPeekSelectionKey(null);
    if (selectionHistory.length > 0) {
      const previous = selectionHistory[selectionHistory.length - 1];
      setSelectionHistory((prev) => prev.slice(0, -1));
      setSelection(previous ?? null);
      setFocusShipId(null);
    } else {
      setSelection(null);
      setSelectionHistory([]);
      setFocusShipId(null);
      if (typeof window !== "undefined" && window.innerWidth < 768) setPanelLevel(0);
    }
  };
  const backLabel =
    selectionHistory.length > 0
      ? selectionHistory[selectionHistory.length - 1]?.type === "vessel"
        ? "Navire"
        : selectionHistory[selectionHistory.length - 1]?.type === "port"
          ? "Port"
          : "Précédent"
      : "Rechercher";
  const [filters, setFilters] = useState<Filters>(() =>
    typeof window === "undefined" ? emptyFilters : filtersFromUrl(window.location.search),
  );
  const [highlightRouteId, setHighlightRouteId] = useState<string | null>(null);
  const [focusedRouteId, setFocusedRouteId] = useState<string | null>(null);
  const [panelLevel, setPanelLevel] = useState<0 | 1 | 2>(0);
  const [peekSelectionKey, setPeekSelectionKey] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"departures" | "search" | "itinerary" | null>(null);
  const [itineraryPreview, setItineraryPreview] = useState<ItineraryMapPreview | null>(null);
  const updateItineraryPreview = useCallback((preview: ItineraryMapPreview | null) => {
    setItineraryPreview(preview);
    setFocusedRouteId(preview?.routeId ?? null);
  }, []);
  useEffect(() => {
    if (panelMode !== "itinerary") setItineraryPreview(null);
  }, [panelMode]);
  const [portsActive, setPortsActive] = useState(false);
  const [activeShortcut, setActiveShortcut] = useState<MapShortcut>(null);
  const [shortcutCompanyId, setShortcutCompanyId] = useState<string | null>(null);
  const [shortcutMenuOpen, setShortcutMenuOpen] = useState(false);
  const shortcutScrollY = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (shortcutScrollY.current === null) return;
    window.scrollTo({ top: shortcutScrollY.current, behavior: "instant" });
    shortcutScrollY.current = null;
  }, [activeShortcut, shortcutMenuOpen]);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(true);
  const [desktopPanelWidth, setDesktopPanelWidth] = useState(DESKTOP_PANEL);
  const resizingPanel = useRef(false);
  const [focusTarget, setFocusTarget] = useState<{ center: [number, number]; key: number } | null>(
    null,
  );
  const [portsPulseKey, setPortsPulseKey] = useState(0);
  // Navire choisi depuis le tableau de bord : il reste pleinement visible même si une ligne est active.
  const [focusShipId, setFocusShipId] = useState<string | null>(null);
  const openPanel = () => {
    setDesktopPanelOpen(true);
    setPanelLevel((level) => (level === 0 ? 1 : level));
  };
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
  const [viewportHeight, setViewportHeight] = useState(620);
  const mapStageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = mapStageRef.current;
    if (!stage) return;
    const update = () => setViewportHeight(stage.clientHeight);
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    update();
    return () => observer.disconnect();
  }, []);

  const portsResult = useQuery(portsQuery);
  const routesResult = useQuery(routesQuery);
  const departuresResult = useQuery(upcomingDeparturesQuery());
  const companiesResult = useQuery(companiesQuery);

  const { data: ports = [] } = portsResult;
  const { data: routes = [] } = routesResult;
  const { data: departures = [] } = departuresResult;
  const { data: companies = [] } = companiesResult;

  const fleet = useFleet();
  const { data: fleetDepartures = [] } = useQuery(fleetDeparturesQuery);
  const atSea = useMemo(() => fleet.filter((ship) => ship.state === "sea"), [fleet]);
  const upcomingShips = useMemo(() => {
    const now = Date.now();
    const future = new Set([...departures, ...fleetDepartures]
      .filter((departure) => departure.status !== "cancelled" && new Date(departure.departure_at).getTime() > now)
      .map((departure) => departure.id));
    return fleet.filter((ship) => ship.state === "docked" && future.has(ship.departureId));
  }, [fleet, departures, fleetDepartures]);
  const shipCompanyIds = useMemo(() => {
    const byDeparture = new Map([...departures, ...fleetDepartures].map((departure) => [departure.id, departure.company_id]));
    return new Set([...atSea, ...upcomingShips].map((ship) => byDeparture.get(ship.departureId)).filter((id): id is string => Boolean(id)));
  }, [atSea, upcomingShips, departures, fleetDepartures]);
  const shortcutCompanies = useMemo(() => companies.filter((company) => shipCompanyIds.has(company.id)).map((company) => ({ id: company.id, name: company.name, logoUrl: company.logo_url })), [companies, shipCompanyIds]);
  const mapFleet = useMemo(() => {
    if (activeShortcut === "ports") return [];
    if (activeShortcut === "sea") return atSea;
    if (activeShortcut === "upcoming") return upcomingShips;
    if (activeShortcut === "companies" && shortcutCompanyId) {
      const byDeparture = new Map([...departures, ...fleetDepartures].map((departure) => [departure.id, departure.company_id]));
      return [...atSea, ...upcomingShips].filter((ship) => byDeparture.get(ship.departureId) === shortcutCompanyId);
    }
    return fleet;
  }, [activeShortcut, shortcutCompanyId, atSea, upcomingShips, fleet, departures, fleetDepartures]);
  const companyFocusShips = activeShortcut === "companies" && shortcutCompanyId ? mapFleet : [];

  const allResults = [portsResult, routesResult, departuresResult, companiesResult];
  const isLoadingData = allResults.some((res) => res.isPending);
  const hasError = allResults.some((res) => res.isError);

  // L'URL reflète toujours la vue : un lien partagé rouvre exactement la même recherche.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextSearch = mapStateToSearch(filters, selection);
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [filters, selection]);

  // Un seul état de recherche alimente la carte, la liste et le tiroir mobile.
  const matchingRoutes = useMemo(
    () => filterRoutes(routes, ports, departures, { ...filters, date: null }),
    [routes, ports, departures, filters],
  );
  const mapVisibleRouteIds = useMemo(() => matchingRoutes
    .filter((route) => activeShortcut !== "companies" || !shortcutCompanyId || route.company_ids.includes(shortcutCompanyId))
    .map((route) => route.id), [matchingRoutes, activeShortcut, shortcutCompanyId]);
  // Lignes avec au moins un départ à venir (non annulé) : les autres sont en pointillés.
  const scheduledRouteIds = useMemo(() => {
    const now = Date.now();
    return [
      ...new Set(
        departures
          .filter((d) => d.status !== "cancelled" && new Date(d.departure_at).getTime() >= now)
          .map((d) => d.route_id),
      ),
    ];
  }, [departures]);
  const sailings = useMemo(
    () => buildSailings(departures, routes, ports, companies, []),
    [departures, routes, ports, companies],
  );
  const matchingSailings = useMemo(
    () =>
      legSailings(sailings, filters.departurePortIds, filters.arrivalPortIds, filters.companyId),
    [sailings, filters.departurePortIds, filters.arrivalPortIds, filters.companyId],
  );

  const hasPair = filters.departurePortIds.length > 0 && filters.arrivalPortIds.length > 0;

  // Retour : lignes dans le sens inverse, mises en évidence sur la carte pour un aller-retour.
  const returnRoutes = useMemo(
    () =>
      hasPair && filters.roundTrip
        ? filterRoutes(routes, ports, departures, {
            ...filters,
            date: null,
            departurePortIds: filters.arrivalPortIds,
            arrivalPortIds: filters.departurePortIds,
          })
        : [],
    [hasPair, routes, ports, departures, filters],
  );

  // La carte reçoit la sélection « traversée » comme une ligne.
  const mapSelection: Selection | null = useMemo(() => {
    if (selection?.type === "departure") {
      const departure = [...departures, ...fleetDepartures].find(
        (item) => item.id === selection.id,
      );
      return departure ? { type: "route", id: departure.route_id } : null;
    }
    if (selection?.type === "vessel") {
      // Un navire sélectionné éclaire sa ligne du moment (traversée en cours ou prochain départ).
      const ship = fleet.find((item) => item.vesselId === selection.id);
      const departure = ship
        ? [...departures, ...fleetDepartures].find((item) => item.id === ship.departureId)
        : undefined;
      return departure ? { type: "route", id: departure.route_id } : null;
    }
    return selection;
  }, [selection, departures, fleetDepartures, fleet]);

  const focusRouteIds = useMemo(() => {
    if (highlightRouteId) return [highlightRouteId];
    if (mapSelection?.type === "route") return [mapSelection.id];
    if (mapSelection?.type === "port") {
      return routes
        .filter(
          (r) => r.departure_port_id === mapSelection.id || r.arrival_port_id === mapSelection.id,
        )
        .map((r) => r.id);
    }
    if (hasPair) return [...matchingRoutes, ...returnRoutes].map((route) => route.id);
    return [];
  }, [mapSelection, routes, hasPair, matchingRoutes, returnRoutes, highlightRouteId]);

  const highlightedPortIds = useMemo(() => {
    if (highlightRouteId) {
      const route = routes.find((item) => item.id === highlightRouteId);
      if (route) return [route.departure_port_id, route.arrival_port_id];
    }
    if (mapSelection?.type === "port") return [mapSelection.id];
    if (mapSelection?.type === "route") {
      const route = routes.find((item) => item.id === mapSelection.id);
      return route ? [route.departure_port_id, route.arrival_port_id] : [];
    }
    if (hasPair) return [...new Set([...filters.departurePortIds, ...filters.arrivalPortIds])];
    return [];
  }, [
    mapSelection,
    routes,
    hasPair,
    filters.departurePortIds,
    filters.arrivalPortIds,
    highlightRouteId,
  ]);

  // Cadrage automatique : les ports du trajet cherché (sans sélection).
  // Un trajet ouvert dans les résultats prime ; un seul côté choisi inclut ses destinations actives.
  const fitPortIds = useMemo(() => {
    if (mapSelection) return [];
    if (focusedRouteId) {
      const route = routes.find((item) => item.id === focusedRouteId);
      if (route) return [route.departure_port_id, route.arrival_port_id];
    }
    const from = filters.departurePortIds;
    const to = filters.arrivalPortIds;
    const ids = new Set([...from, ...to]);
    if (from.length === 0 || to.length === 0) {
      const chosen = from.length ? from : to;
      routes
        .filter((r) => r.status === "active")
        .forEach((r) => {
          if (from.length && chosen.includes(r.departure_port_id)) ids.add(r.arrival_port_id);
          if (to.length && chosen.includes(r.arrival_port_id)) ids.add(r.departure_port_id);
        });
    }
    return [...ids];
  }, [mapSelection, focusedRouteId, routes, filters.departurePortIds, filters.arrivalPortIds]);

  // Les infobulles décrivent le réseau réel du port, indépendamment des filtres en cours.
  const portMeta = useMemo<Record<string, PortMeta>>(() => {
    const meta: Record<string, PortMeta> = {};
    const companyById = new Map(companies.map((c) => [c.id, c]));
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
          const company = companyById.get(id);
          if (company) companyNames.add(company.name);
        }),
      );

      const timeZone = portTimeZone(port);
      const traffic = portTraffic(port.id, routes, departures);
      meta[port.id] = {
        departureCount: traffic.departures.length,
        arrivalCount: traffic.arrivals.length,
        routes: portRoutes.length,
        companies: [...companyNames].sort().map((name) => {
          const company = companies.find((item) => item.name === name);
          return { name, logoUrl: company?.logo_url ?? null };
        }),
        upcoming: traffic.departures.slice(0, 3).map((departure) => {
          const route = routes.find((item) => item.id === departure.route_id);
          const parts = formatDateParts(departure.departure_at, timeZone);
          return {
            date: capitalizeFirst(`${parts.weekday} ${parts.shortDate}`),
            time: parts.time,
            to: route ? (portById.get(route.arrival_port_id)?.name ?? null) : null,
            companyName: companyById.get(departure.company_id)?.name ?? null,
            logoUrl: companyById.get(departure.company_id)?.logo_url ?? null,
          };
        }),
        upcomingArrivals: traffic.arrivals.slice(0, 3).map(({ departure, route, arrivalAt }) => {
          const parts = formatDateParts(arrivalAt, timeZone);
          return {
            date: capitalizeFirst(`${parts.weekday} ${parts.shortDate}`),
            time: parts.time,
            from: portById.get(route.departure_port_id)?.name ?? null,
            companyName: companyById.get(departure.company_id)?.name ?? null,
            logoUrl: companyById.get(departure.company_id)?.logo_url ?? null,
          };
        }),
      };
    });
    return meta;
  }, [ports, routes, departures, companies]);

  const snapHeights = () => {
    const vh = mapStageRef.current?.clientHeight ?? window.innerHeight;
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
    const v = lastMove.current.v;
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
  const isPeekSelection = peekSelectionKey !== null && peekSelectionKey === `${selection?.type}:${selection?.id}`;
  const peekHeight = Math.min(Math.round(viewportHeight * 0.6), Math.max(240, viewportHeight - 260));
  const mobileBottomInset = panelLevel === 0 ? 0 : panelLevel === 2 ? viewportHeight - TAB_BAR_HEIGHT : isPeekSelection ? peekHeight : Math.round(viewportHeight * (panelMode === "itinerary" ? 0.52 : MIDDLE_RATIO));
  const mobilePanelHeight = mobileBottomInset;
  // Sur mobile, choisir un navire, un port ou une traversée rouvre le tiroir s'il était replié.
  useEffect(() => {
    if (selection?.type === "vessel" || selection?.type === "departure") setPanelLevel(isPeekSelection ? 1 : 2);
    else if (selection && panelLevel === 0) setPanelLevel(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.type, selection?.id, isPeekSelection]);

  // La recherche ouverte sur mobile prend toute la hauteur.
  useEffect(() => {
    const full = () => setPanelLevel(2);
    window.addEventListener("batogo:panel-full", full);
    return () => window.removeEventListener("batogo:panel-full", full);
  }, []);
  useEffect(() => {
    const close = () => {
      setPanelLevel(0);
      setPanelMode(null);
    };
    const results = () => {
      setPanelLevel(2);
      setPanelMode("departures");
    };
    window.addEventListener("batogo:close-panel", close);
    window.addEventListener("batogo:results-panel", results);
    return () => {
      window.removeEventListener("batogo:close-panel", close);
      window.removeEventListener("batogo:results-panel", results);
    };
  }, []);

  useEffect(() => {
    const focusVessel = (event: Event) => {
      const vesselId = (event as CustomEvent<{ vesselId?: string }>).detail?.vesselId;
      if (!vesselId) return;
      const ship = fleet.find((item) => item.vesselId === vesselId);
      if (!ship) return;
      handleSelect({ type: "vessel", id: vesselId });
      setFocusShipId(ship.id);
      const pos = ship.live ? ship.live.position : null;
      setFocusTarget({
        center: pos ? [pos.longitude, pos.latitude] : ship.lngLat,
        key: Date.now(),
      });
    };
    window.addEventListener("batogo:focus-vessel", focusVessel);
    return () => window.removeEventListener("batogo:focus-vessel", focusVessel);
  }, [fleet]);

  const collapsed = panelLevel === 0 && (dragHeight === null || dragHeight < 140);

  const resetToMap = () => {
    document.getElementById("carte")?.scrollIntoView({ behavior: "instant" });
    handleSelect(null);
    setPanelLevel(0);
    setPanelMode(null);
    setPortsActive(false);
    setActiveShortcut(null);
    setShortcutCompanyId(null);
    setShortcutMenuOpen(false);
    window.dispatchEvent(new Event("batogo:close-filters"));
  };

  const openMobileDepartures = () => {
    document.getElementById("carte")?.scrollIntoView({ behavior: "instant" });
    handleSelect(null);
    setFilters((current) => ({ ...current, roundTrip: false, returnDate: null }));
    setPortsActive(false);
    setActiveShortcut(null);
    setShortcutCompanyId(null);
    setShortcutMenuOpen(false);
    setPanelMode("departures");
    setPanelLevel(2);
    window.setTimeout(() => window.dispatchEvent(new Event("batogo:show-departures")), 60);
  };

  const openMobileSearch = () => {
    document.getElementById("carte")?.scrollIntoView({ behavior: "instant" });
    handleSelect(null);
    setPortsActive(false);
    setActiveShortcut(null);
    setShortcutCompanyId(null);
    setShortcutMenuOpen(false);
    setPanelMode("search");
    setPanelLevel(2);
    window.setTimeout(() => window.dispatchEvent(new Event("batogo:edit-filters")), 60);
  };

  const openItinerary = () => {
    document.getElementById("carte")?.scrollIntoView({ behavior: "instant" });
    handleSelect(null);
    setPortsActive(false);
    setActiveShortcut(null);
    setShortcutCompanyId(null);
    setShortcutMenuOpen(false);
    setPanelMode("itinerary");
    setPanelLevel(1);
    setDesktopPanelOpen(true);
  };

  const showMobilePorts = () => {
    document.getElementById("carte")?.scrollIntoView({ behavior: "instant" });
    handleSelect(null);
    setPanelMode(null);
    setPanelLevel(0);
    setPortsActive(true);
    setActiveShortcut(null);
    setShortcutCompanyId(null);
    setShortcutMenuOpen(false);
    setPortsPulseKey(Date.now());
    window.dispatchEvent(new Event("batogo:close-filters"));
  };

  useEffect(() => {
    if (!portsActive) return;
    const timer = window.setTimeout(() => setPortsActive(false), 3600);
    return () => window.clearTimeout(timer);
  }, [portsActive, portsPulseKey]);

  useEffect(() => {
    const action = window.sessionStorage.getItem("bledway:open-home-action");
    if (!action) return;
    const timer = window.setTimeout(() => {
      window.sessionStorage.removeItem("bledway:open-home-action");
      if (action === "departures") openMobileDepartures();
      else if (action === "search") openMobileSearch();
      else if (action === "ports") showMobilePorts();
      else if (action === "itinerary") openItinerary();
    }, 120);
    return () => window.clearTimeout(timer);
    // Navigation entrante : l'action enregistrée n'est lue qu'une fois au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exploreRoute = (route: RouteLine) => {
    setFilters((current) => ({
      ...current,
      departurePortIds: [route.departure_port_id],
      arrivalPortIds: [route.arrival_port_id],
      companyId: null,
      vesselId: null,
    }));
    handleSelect(null);
    setFocusedRouteId(route.id);
    openPanel();
    document.getElementById("carte")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };

  return (
    <div className="bw-home">
      <a href="#contenu" className="bw-skip-link">
        Aller au contenu
      </a>
      <SiteHeader />
      <main id="contenu" tabIndex={-1}>
        <h1 className="sr-only">BledWay — La route du Bled</h1>
        <section
          id="carte"
          aria-label="Carte et recherche de traversées"
          className="bw-map-stage"
          data-panel-open={panelLevel !== 0}
          ref={mapStageRef}
          style={
            {
              "--desktop-panel-width": `${desktopPanelWidth}px`,
              "--stage-height": `${viewportHeight}px`,
              "--mobile-panel-height": `${mobilePanelHeight}px`,
              "--mobile-peek-height": `${peekHeight}px`,
            } as React.CSSProperties
          }
        >
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
            style={
              {
                ...(dragHeight !== null ? { height: dragHeight } : {}),
                "--desktop-panel-width": `${desktopPanelWidth}px`,
              } as React.CSSProperties
            }
            className={`bw-map-panel absolute bottom-0 left-0 right-0 z-[60] flex flex-col overflow-hidden bg-transparent ${panelLevel === 0 && dragHeight === null ? "max-md:invisible max-md:pointer-events-none" : ""} ${dragHeight !== null ? "transition-none" : "transition-[height,width,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"} md:bottom-5 md:left-5 md:right-auto md:top-5 md:h-auto md:w-[var(--desktop-panel-width)] md:overflow-visible md:rounded-3xl md:z-40 ${
              desktopPanelOpen ? "md:translate-x-0" : "md:translate-x-[calc(-100%-1.25rem)]"
            } ${panelLevel === 0 ? "h-24 rounded-t-3xl" : panelLevel === 1 ? isPeekSelection ? "h-[var(--mobile-peek-height)] rounded-t-3xl" : panelMode === "itinerary" ? "h-[calc(var(--stage-height)*0.52)] rounded-t-3xl" : "h-[calc(var(--stage-height)*0.68)] rounded-t-3xl" : "h-[calc(var(--stage-height)-3.5rem)] rounded-t-3xl"}`}
          >
            {collapsed ? (
              <CollapsedPanelSummary
                matchingRoutesCount={matchingRoutes.length}
                nextLabel={(() => {
                  if (!filters.departurePortIds.length && !filters.arrivalPortIds.length)
                    return "Ports, dates et voyageurs";
                  const next = matchingSailings[0];
                  if (!next) return "aucun départ connu pour cette recherche";
                  const parts = formatDateParts(next.departure.departure_at, next.fromZone);
                  return `${next.from.name} → ${next.to.name}, ${parts.weekday} ${parts.shortDate} à ${parts.time}`;
                })()}
                title={
                  hasPair || filters.departurePortIds.length || filters.arrivalPortIds.length
                    ? `${summarizePorts(filters.departurePortIds, ports, "Tous départs")} → ${summarizePorts(filters.arrivalPortIds, ports, "toutes arrivées")}`
                    : "Trouver ma traversée"
                }
                onOpen={() => {
                  if (dragMoved.current) return;
                  if (
                    !filters.departurePortIds.length &&
                    !filters.arrivalPortIds.length &&
                    !selection
                  ) {
                    setPanelLevel(2);
                    window.dispatchEvent(new Event("batogo:edit-filters"));
                  } else setPanelLevel(1);
                }}
                dragHandlers={dragHandlers}
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                aria-label={panelLevel === 2 ? "Réduire le panneau" : "Agrandir le panneau"}
                className="flex h-5 w-full flex-none touch-none items-center justify-center rounded-none rounded-t-3xl border-b border-border/20 bg-card py-0 md:hidden"
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
                onSelect={handleSelect}
                onBack={handleBack}
                backLabel={backLabel}
                filters={filters}
                onFiltersChange={setFilters}
                onHighlightRoute={setHighlightRouteId}
                onFocusRoute={setFocusedRouteId}
                itineraryOpen={panelMode === "itinerary"}
                onOpenItinerary={openItinerary}
                onCloseItinerary={() => {
                  setPanelMode(null);
                  setItineraryPreview(null);
                  setFocusedRouteId(null);
                  if (window.innerWidth < 768) setPanelLevel(0);
                }}
                onItineraryPreview={updateItineraryPreview}
              />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionner le volet"
              title="Faire glisser pour ajuster la largeur"
              onPointerDown={(event) => {
                if (window.innerWidth < 768 || !desktopPanelOpen) return;
                event.preventDefault();
                resizingPanel.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!resizingPanel.current) return;
                setDesktopPanelWidth(Math.max(320, Math.min(600, event.clientX - 20)));
              }}
              onPointerUp={() => {
                resizingPanel.current = false;
              }}
              onPointerCancel={() => {
                resizingPanel.current = false;
              }}
              className="absolute -right-1 top-4 bottom-4 z-10 hidden w-2 cursor-ew-resize rounded-full transition-colors hover:bg-primary/30 md:block"
            />
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
          <div className="bw-home-mobile-tabs fixed bottom-0 left-0 right-0 z-[70] md:hidden">
            <MobileTabBar
              className="h-[calc(3.5rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]"
              activeTab={portsActive ? "ports" : panelLevel === 0 ? "map" : panelMode === "itinerary" ? "search" : (panelMode ?? "map")}
              onOpenMap={resetToMap}
              onOpenDepartures={openMobileDepartures}
              onOpenSearch={openMobileSearch}
              onShowPorts={showMobilePorts}
              onOpenItinerary={openItinerary}
            />
          </div>

          {/* CARTE */}
          <div className="bw-map-canvas absolute inset-0 z-0 bg-[var(--sea)]">
            <DataUnavailableNotice className="absolute left-1/2 top-20 z-20 w-[min(92vw,26rem)] -translate-x-1/2" />
            <MapStatusBar
              chips={[]}
              filters={filters}
              onFiltersChange={setFilters}
              onReset={() => setFilters(emptyFilters)}
              loading={isLoadingData}
              hasError={hasError}
              onRetry={() => allResults.forEach((res) => void res.refetch())}
              panelOpen={desktopPanelOpen}
            />
            <MapStats
              atSea={atSea}
              upcomingShips={upcomingShips}
              companies={shortcutCompanies}
              portsCount={ports.length}
              activeShortcut={activeShortcut}
              menuOpen={shortcutMenuOpen}
              selectedCompanyId={shortcutCompanyId}
              onToggle={(shortcut) => {
                if (window.innerWidth >= 768) shortcutScrollY.current = window.scrollY;
                handleSelect(null);
                setPanelMode(null);
                setItineraryPreview(null);
                setFocusedRouteId(null);
                setFocusTarget(null);
                if (window.innerWidth < 768) {
                  setPanelLevel(0);
                  setPanelMode(null);
                }
                if (activeShortcut === shortcut) {
                  setActiveShortcut(null);
                  setShortcutCompanyId(null);
                  setShortcutMenuOpen(false);
                  return;
                }
                setActiveShortcut(shortcut);
                setShortcutCompanyId(null);
                setShortcutMenuOpen(shortcut !== "ports");
                if (shortcut === "ports") setPortsPulseKey(Date.now());
              }}
              onSelectCompany={(companyId) => {
                setShortcutCompanyId(companyId);
                setShortcutMenuOpen(false);
              }}
              onSelectShip={(ship) => {
                setShortcutMenuOpen(false);
                if (ship.vesselId) handleSelect({ type: "vessel", id: ship.vesselId }, true);
                else handleSelect({ type: "departure", id: ship.departureId }, true);
                setFocusShipId(ship.id);
                const pos = ship.live ? ship.live.position : null;
                setFocusTarget({
                  center: pos ? [pos.longitude, pos.latitude] : ship.lngLat,
                  key: Date.now(),
                });
              }}
              companyOf={(ship) => {
                const dep = [...departures, ...fleetDepartures].find(
                  (d) => d.id === ship.departureId,
                );
                return companies.find((c) => c.id === dep?.company_id)?.name;
              }}
            />
            <MapLegend panelOpen={desktopPanelOpen} showDateHint={false} />
            <ClientOnly fallback={<MapFallback />}>
              <Suspense fallback={<MapFallback />}>
                <FerryMap
                  focusTarget={focusTarget}
                  itineraryPreview={itineraryPreview}
                  portsPulseKey={activeShortcut === "ports" || portsActive ? portsPulseKey : 0}
                  portsMode={activeShortcut === "ports"}
                  companyFocusShips={companyFocusShips}
                  focusShipId={focusShipId}
                  ports={ports}
                  routes={routes}
                  visibleRouteIds={mapVisibleRouteIds}
                  dateActiveRouteIds={scheduledRouteIds.length ? scheduledRouteIds : ["__none__"]}
                  focusRouteIds={focusRouteIds}
                  selection={mapSelection}
                  highlightedPortIds={highlightedPortIds}
                  fitPortIds={fitPortIds}
                  hoverRouteId={highlightRouteId}
                  fleet={mapFleet}
                  portMeta={portMeta}
                  onSelect={handleSelect}
                  onOpenPanel={() => setPanelLevel(2)}
                  onMapInteract={(kind) => {
                    setShortcutMenuOpen(false);
                    if (kind === "port") {
                      handleSelect(null);
                      setPanelLevel(0);
                    } else if (kind === "vessel") setPanelLevel(2);
                    else if (kind === "route") setPanelLevel(2);
                    else if (panelMode !== "itinerary") setPanelLevel(0);
                  }}
                  mobileBottomInset={mobileBottomInset}
                  desktopLeftInset={desktopPanelOpen ? desktopPanelWidth + 80 : 50}
                />
              </Suspense>
            </ClientOnly>
          </div>
          <a className="bw-map-scroll" href="#preparer">
            <Compass size={16} /> Et après la traversée ? <ArrowDown size={16} />
          </a>
        </section>
        <HomeContent ports={ports} routes={routes} onExplore={exploreRoute} />
      </main>
      <SiteFooter />
    </div>
  );
}

function CollapsedPanelSummary({
  title,
  nextLabel,
  matchingRoutesCount,
  onOpen,
  dragHandlers,
}: {
  title: string;
  nextLabel: string;
  matchingRoutesCount: number;
  onOpen: () => void;
  dragHandlers: Record<string, (e: React.PointerEvent<HTMLElement>) => void>;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onOpen}
      {...dragHandlers}
      className="h-24 w-full flex-none touch-none flex-col items-stretch justify-start gap-2 rounded-none rounded-t-3xl border-b bg-card px-4 py-2 text-left md:hidden"
      style={{ touchAction: "none" }}
      aria-label={`${title} — ${matchingRoutesCount} lignes. Ouvrir la liste`}
    >
      <span className="batogo-handle mx-auto" aria-hidden />
      <span className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-foreground">{title}</span>
          <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
            {nextLabel === "Ports, dates et voyageurs"
              ? nextLabel
              : `Prochain départ : ${nextLabel}`}
          </span>
        </span>
        <span className="shrink-0 text-sm font-bold text-primary">
          {nextLabel === "Ports, dates et voyageurs" ? "Chercher" : "Voir"}
        </span>
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
