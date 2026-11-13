import { JOURNEY_LAYOUT_EVENT, publishFilmFrame, type JourneyLayout } from "@/lib/ferry/journeyFilm";
import { counterFilters, syncFilters, matchesTraffic } from "@/lib/ferry/filterSync";
import { seoHead } from "@/lib/seo/site";
import { DataUnavailableNotice } from "@/components/layout/DataUnavailableNotice";
import type React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  ArrowLeft,
  Compass,
  Globe2,
  MessagesSquare,
  Minus,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ClientOnly, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SidePanel } from "@/components/panel/SidePanel";
import {
  companiesQuery,
  fleetDeparturesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  schedulesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { capitalizeFirst, formatDateParts } from "@/lib/ferry/format";
import { emptyFilters, type Filters, type Selection, type RouteLine } from "@/lib/ferry/types";
import {
  fleetShortcutInfo,
  sortDockedByDeparture,
  publishedRouteIds,
  type LineVisibility,
  type MapPreview,
} from "@/lib/ferry/mapPresentation";
import type { PortMeta } from "@/components/map/FerryMap";
import { Button } from "@/components/ui/button";
import { MapStatusBar } from "@/components/map/MapStatusBar";
import { MapLegend } from "@/components/map/MapLegend";
import { QuickReport } from "@/components/map/QuickReport";
import { MessagesFab, VoyageSalonsPicker } from "@/components/panel/MessagesFab";
import { OPEN_ROOM_PICKER_EVENT } from "@/lib/ferry/chatDemo";
import { RoomInvite } from "@/components/panel/RoomInvite";
import { afterOverlayClose, handleOverlayBack } from "@/lib/ferry/backStack";
import { MyTripMapChip } from "@/components/panel/MyTripHero";
import { MapSearch } from "@/components/map/MapSearch";
import { MapStats, type MapShortcut } from "@/components/map/MapStats";
import { FLASH_SELECT_EVENT } from "@/components/panel/FlashCenter";
import { FLASH_PREVIEW_EVENT } from "@/components/panel/FlashFeed";
import { filtersFromUrl, mapStateToSearch, selectionFromUrl } from "@/lib/ferry/urlState";
import { hasActiveFilters, filterRoutes, summarizePorts } from "@/lib/ferry/filtering";
import { portTimeZone } from "@/lib/ferry/time";
import { portTraffic } from "@/lib/ferry/portTraffic";
import { buildSailings, legSailings } from "@/lib/ferry/trips";
import { useFleet } from "@/lib/ferry/useFleet";
import { SiteHeader, SiteFooter } from "@/components/layout/SiteLayout";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { HomeContent } from "@/components/home/HomeContent";
import type { ItineraryMapPreview } from "@/lib/ferry/itinerary";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmbeddedRoom } from "@/components/panel/LiveRoom";
import { LivePulse } from "@/components/panel/LivePulse";
import { JourneyFrieze } from "@/components/journey/JourneyFrieze";
import { STEP_ICONS } from "@/components/journey/JourneyFrieze";
import { JourneyTimeline } from "@/components/journey/JourneyTimeline";
import { useVoyage } from "@/components/journey/useVoyage";
import { GO_HOME_EVENT, OPEN_VOYAGE_EVENT, useVoyageTrip } from "@/lib/ferry/voyageTrip";
import { readItineraryChoice } from "@/lib/ferry/travelProfile";
import { tr } from "@/lib/i18n";

const FerryMap = lazy(() => import("@/components/map/FerryMap"));

export const Route = createFileRoute("/")({
  // Les lignes phares de l'accueil doivent figurer dans le HTML servi :
  // le navigateur reçoit les mêmes données pour hydrater sans écart.
  loader: async ({ context }) => {
    const [ports, routes] = await Promise.all([
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(routesQuery),
    ]);
    return { ports, routes };
  },
  head: () =>
    seoHead(
      "BledWay — le Waze du ferry Europe–Maghreb, en direct",
      "Le Waze du ferry Europe–Maghreb, dès aujourd'hui vers l'Algérie : navires en direct, retards, annulations, signalements au port, toutes les compagnies.",
      "/",
    ),
  component: Index,
});

/** Hauteurs du tiroir mobile : replié, intermédiaire, plein écran (hors barre d'onglets). */
const TAB_BAR_HEIGHT = 56;
const COLLAPSED_HEIGHT = 128;
/** « Ma traversée » replié : une seule ligne, l'étape en cours. */
const VOYAGE_COLLAPSED_HEIGHT = 96;
const MIDDLE_RATIO = 0.68;
const DESKTOP_PANEL = 420;

function Index() {
  // Même source côté serveur et navigateur : l'URL du routeur (évite les écarts de rendu).
  const initialSearch = useRouterState({ select: (state) => state.location.searchStr });
  const [selection, setSelection] = useState<Selection | null>(() =>
    selectionFromUrl(initialSearch),
  );
  const [selectionHistory, setSelectionHistory] = useState<Selection[]>([]);
  // « Mon voyage » : un mode de la carte (adresse /?voyage=1), jamais actif par défaut.
  const [voyageOn, setVoyageOn] = useState(() => new URLSearchParams(initialSearch).has("voyage"));
  // Téléphone : toutes les étapes repliées dans la liste verticale de « Mon voyage ».
  const [timelineClosed, setTimelineClosed] = useState(false);
  // Une fiche ouverte depuis « Mon voyage » : son retour ramène au voyage, pas à l'accueil.
  const [voyageBack, setVoyageBack] = useState(false);
  // Ouverture depuis une notification : son message s'affiche en tête de la fiche demandée.
  const [noticeTarget] = useState(() => ({
    id: new URLSearchParams(initialSearch).get("notice"),
    selection: selectionFromUrl(initialSearch),
  }));
  const handleSelect = (newSelection: Selection | null, peek = false) => {
    setTrafficPreview(null);
    setHighlightRouteId(null);
    if (newSelection) window.dispatchEvent(new Event("batogo:close-filters"));
    setPeekSelectionKey(peek && newSelection ? `${newSelection.type}:${newSelection.id}` : null);
    if (newSelection === null) {
      setSelection(null);
      setSelectionHistory([]);
    } else {
      // Ouvrir une fiche (port, navire, traversée) quitte « Mon voyage » : la carte reprend la main,
      // et le retour de la fiche y ramène.
      if (voyageOn) setVoyageBack(true);
      setVoyageOn(false);
      if (typeof window !== "undefined" && window.innerWidth >= 768) setDesktopPanelOpen(true);
      if (selection && (selection.type !== newSelection.type || selection.id !== newSelection.id)) {
        setSelectionHistory((prev) => [...prev, selection]);
      }
      setSelection(newSelection);
      setPanelMode(null);
      if (newSelection.type === "vessel" || newSelection.type === "departure")
        setPanelLevel(peek ? 1 : 2);
    }
    setFocusShipId(null);
  };
  // Fil Flash info (en-tête mobile) : ouvre la fiche demandée sans recharger la page.
  const handleSelectRef = useRef(handleSelect);
  handleSelectRef.current = handleSelect;
  useEffect(() => {
    const onFlashSelect = (event: Event) => {
      const detail = (event as CustomEvent<Selection>).detail;
      if (detail?.type && detail.id) handleSelectRef.current(detail);
    };
    // Survol d'une info du fil : le trajet ou le port concerné s'éclaire sur la carte.
    const onFlashPreview = (event: Event) =>
      setTrafficPreview((event as CustomEvent<MapPreview | null>).detail ?? null);
    window.addEventListener(FLASH_SELECT_EVENT, onFlashSelect);
    window.addEventListener(FLASH_PREVIEW_EVENT, onFlashPreview);
    return () => {
      window.removeEventListener(FLASH_SELECT_EVENT, onFlashSelect);
      window.removeEventListener(FLASH_PREVIEW_EVENT, onFlashPreview);
    };
  }, []);
  const closeCurrent = () => {
    setPeekSelectionKey(null);
    if (selectionHistory.length > 0) {
      const previous = selectionHistory[selectionHistory.length - 1];
      setSelectionHistory((prev) => prev.slice(0, -1));
      setSelection(previous ?? null);
      setFocusShipId(null);
    } else if (voyageBack) {
      setSelection(null);
      setSelectionHistory([]);
      setFocusShipId(null);
      setVoyageBack(false);
      setVoyageOn(true);
      setPanelLevel(1);
    } else {
      setSelection(null);
      setSelectionHistory([]);
      setFocusShipId(null);
      resetToMap();
    }
  };
  const backLabel =
    selectionHistory.length > 0
      ? selectionHistory[selectionHistory.length - 1]?.type === "vessel"
        ? "Navire"
        : selectionHistory[selectionHistory.length - 1]?.type === "port"
          ? "Port"
          : "Précédent"
      : voyageBack
        ? "Mon voyage"
        : "Accueil";
  const [filters, setFiltersState] = useState<Filters>(() => filtersFromUrl(initialSearch));
  const [trafficPreview, setTrafficPreview] = useState<MapPreview | null>(null);
  const [lineVisibility, setLineVisibility] = useState<LineVisibility>("all");
  const [highlightRouteId, setHighlightRouteId] = useState<string | null>(null);
  const [focusedRouteId, setFocusedRouteId] = useState<string | null>(null);
  // Arrivée simple sur la carte : le volet mobile s'ouvre replié (la recherche seule est visible).
  // Un lien vers une fiche, des filtres ou « Mon voyage » garde son ouverture habituelle.
  const [panelLevel, setPanelLevel] = useState<0 | 1 | 2>(() => {
    const params = new URLSearchParams(initialSearch);
    const plainArrival =
      !params.has("voyage") &&
      !selectionFromUrl(initialSearch) &&
      !hasActiveFilters(filtersFromUrl(initialSearch));
    return plainArrival ? 0 : 1;
  });
  const [peekSelectionKey, setPeekSelectionKey] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"departures" | "search" | "itinerary" | null>(() =>
    hasActiveFilters(filtersFromUrl(initialSearch)) ? "departures" : null,
  );
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
  const shortcutCompanyId = filters.companyId;
  // Compagnie posée automatiquement par le choix d'un navire (pas par l'utilisateur).
  const [companyFromShip, setCompanyFromShip] = useState<string | null>(null);
  const [shortcutMenuOpen, setShortcutMenuOpen] = useState(false);
  const shortcutScrollY = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (shortcutScrollY.current === null) return;
    window.scrollTo({ top: shortcutScrollY.current, behavior: "instant" });
    shortcutScrollY.current = null;
  }, [activeShortcut, shortcutMenuOpen]);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(true);
  const [desktopPanelWidth, setDesktopPanelWidth] = useState(DESKTOP_PANEL);
  const [companionWidth, setCompanionWidth] = useState(0);
  // Le résultat du trajet porte à porte prend la moitié de l'écran sur PC.
  const [journeyWide, setJourneyWide] = useState(false);
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

  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>(".bw-home > .bw-header");
    const home = mapStageRef.current?.closest<HTMLElement>(".bw-home");
    if (!header || !home) return;
    const update = () =>
      home.style.setProperty("--bw-header-height", `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(update);
    observer.observe(header);
    update();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (panelLevel !== 2 || !window.matchMedia("(max-width: 767px)").matches) return;
    const background = [
      ...document.querySelectorAll<HTMLElement>(
        ".bw-home > .bw-header, .bw-home #preparer, .bw-home > .bw-footer, .bw-home .bw-map-canvas",
      ),
    ];
    const previous = background.map((element) => element.inert);
    background.forEach((element) => {
      element.inert = true;
    });
    return () =>
      background.forEach((element, index) => {
        element.inert = previous[index] ?? false;
      });
  }, [panelLevel]);

  const initialData = Route.useLoaderData();
  const portsResult = useQuery({ ...portsQuery, initialData: initialData.ports });
  const routesResult = useQuery({ ...routesQuery, initialData: initialData.routes });
  const departuresResult = useQuery(upcomingDeparturesQuery());
  const companiesResult = useQuery(companiesQuery);

  const { data: ports = [] } = portsResult;
  const { data: routes = [] } = routesResult;
  const { data: departures = [] } = departuresResult;
  const { data: companies = [] } = companiesResult;

  const { data: schedules = [] } = useQuery(schedulesQuery);
  const fleet = useFleet();

  // « Mon voyage » : la frise, l'étape et le salon par-dessus la carte complète (flotte et ports).
  const isMobile = useIsMobile();
  const { trip: voyageTrip, ready: voyageReady } = useVoyageTrip();
  const [salonOpen, setSalonOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1280,
  );
  const [salonDialog, setSalonDialog] = useState(false);
  // « Autres salons » depuis le salon de la traversée : la fenêtre du salon se ferme d'abord
  // (et son retour arrière avec), puis la liste s'ouvre.
  const [voyagePicker, setVoyagePicker] = useState(false);
  const voyageOnRef = useRef(voyageOn);
  voyageOnRef.current = voyageOn;
  useEffect(() => {
    const pick = () => {
      // Hors mode voyage, c'est le raccourci des salons (MessagesFab) qui ouvre la liste.
      if (!voyageOnRef.current) return;
      setSalonDialog(false);
      window.setTimeout(() => afterOverlayClose(() => setVoyagePicker(true)), 60);
    };
    window.addEventListener(OPEN_ROOM_PICKER_EVENT, pick);
    return () => window.removeEventListener(OPEN_ROOM_PICKER_EVENT, pick);
  }, []);
  const voyage = useVoyage(voyageOn ? voyageTrip : null, {
    isMobile,
    fleet,
    onSelect: (next) => handleSelectRef.current(next),
    onAsk: () => (window.innerWidth < 768 ? setSalonDialog(true) : setSalonOpen(true)),
  });
  // « Mon voyage, étape par étape » (barre du bas, lien de « Ma traversée ») : sur téléphone,
  // la page s'ouvre volet déplié en grand (niveau 3), l'étape lisible sans avoir à le tirer.
  const enterVoyage = () => {
    resetToMap();
    setVoyageOn(true);
    setPanelLevel(2);
  };
  const enterVoyageRef = useRef(enterVoyage);
  enterVoyageRef.current = enterVoyage;
  useEffect(() => {
    const open = () => enterVoyageRef.current();
    window.addEventListener(OPEN_VOYAGE_EVENT, open);
    return () => window.removeEventListener(OPEN_VOYAGE_EVENT, open);
  }, []);
  // Arrivée sur /?voyage=1 alors que l'accueil est déjà affiché (lien du menu, notification).
  useEffect(() => {
    if (new URLSearchParams(initialSearch).has("voyage")) enterVoyageRef.current();
  }, [initialSearch]);
  // Aucun voyage à montrer : on le dit, et la carte reste telle quelle.
  const hasVoyageTrip = Boolean(voyageTrip);
  useEffect(() => {
    if (!voyageOn || !voyageReady || hasVoyageTrip) return;
    setVoyageOn(false);
    toast("Aucune traversée suivie pour l'instant", {
      description:
        "Suivez votre traversée, ou celle d'un proche : elle s'affichera ici, étape par étape.",
      action: {
        label: "Simuler mon trajet",
        onClick: () => window.dispatchEvent(new Event("bledway:open-itinerary")),
      },
    });
  }, [voyageOn, voyageReady, hasVoyageTrip]);
  // Des tableaux stables pour la carte : elle ne recadre que si l'étape change vraiment.
  const voyageFitKey = voyage?.mapProps.fitPortIds.join("|") ?? "";
  const voyageFit = useMemo(() => (voyageFitKey ? voyageFitKey.split("|") : []), [voyageFitKey]);
  const voyagePortsKey = voyage?.mapProps.highlightedPortIds.join("|") ?? "";
  const voyagePorts = useMemo(
    () => (voyagePortsKey ? voyagePortsKey.split("|") : []),
    [voyagePortsKey],
  );
  const voyageRouteId = voyage?.trip.route.id ?? null;
  const voyageRoutes = useMemo(() => (voyageRouteId ? [voyageRouteId] : []), [voyageRouteId]);
  const { data: fleetDepartures = [] } = useQuery(fleetDeparturesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const vesselCards = useMemo(() => {
    const byCompany = new Map(companies.map((c) => [c.id, c]));
    return Object.fromEntries(
      vessels.map((v) => {
        const company = v.company_id ? byCompany.get(v.company_id) : undefined;
        return [
          v.id,
          {
            photoUrl: v.photo_url,
            logoUrl: company?.logo_url ?? null,
            companyName: company?.name ?? null,
          },
        ];
      }),
    );
  }, [vessels, companies]);
  const allDepartures = useMemo(
    () => [...new Map([...fleetDepartures, ...departures].map((d) => [d.id, d])).values()],
    [fleetDepartures, departures],
  );
  const setFilters = useCallback(
    (next: React.SetStateAction<Filters>) => {
      setFiltersState((current) =>
        syncFilters(
          current,
          typeof next === "function" ? next(current) : next,
          vessels,
          allDepartures,
        ),
      );
    },
    [vessels, allDepartures],
  );
  const trafficFleet = useMemo(
    () =>
      fleet.filter((ship) => {
        const departure = allDepartures.find((d) => d.id === ship.departureId);
        return departure ? matchesTraffic(departure, routes, ports, filters) : false;
      }),
    [fleet, allDepartures, routes, ports, filters],
  );
  const companyContextFleet = useMemo(
    () =>
      fleet.filter((ship) => {
        const departure = allDepartures.find((d) => d.id === ship.departureId);
        return departure
          ? matchesTraffic(departure, routes, ports, {
              ...filters,
              companyId: null,
              vesselId: null,
            })
          : false;
      }),
    [fleet, allDepartures, routes, ports, filters],
  );
  // Les compteurs ignorent le navire choisi : un seul est sélectionné à la fois, le total reste réel.
  const shortcutFleet = useMemo(
    () =>
      fleet.filter((ship) => {
        const departure = allDepartures.find((d) => d.id === ship.departureId);
        return departure
          ? matchesTraffic(departure, routes, ports, counterFilters(filters, companyFromShip))
          : false;
      }),
    [fleet, allDepartures, routes, ports, filters, companyFromShip],
  );
  const atSea = useMemo(
    () => shortcutFleet.filter((ship) => ship.state === "sea"),
    [shortcutFleet],
  );
  const upcomingShips = useMemo(
    () =>
      sortDockedByDeparture(
        shortcutFleet.filter((ship) => ship.state === "docked"),
        allDepartures,
        routes,
        ports,
        Date.now(),
      ).map(({ ship }) => ship),
    [shortcutFleet, allDepartures, routes, ports],
  );
  const shipCompanyIds = useMemo(() => {
    const byDeparture = new Map(
      [...departures, ...fleetDepartures].map((departure) => [departure.id, departure.company_id]),
    );
    return new Set(
      companyContextFleet
        .map((ship) => byDeparture.get(ship.departureId))
        .filter((id): id is string => Boolean(id)),
    );
  }, [companyContextFleet, departures, fleetDepartures]);
  const shortcutCompanies = useMemo(
    () =>
      companies
        .filter((company) => shipCompanyIds.has(company.id))
        .map((company) => ({
          id: company.id,
          name: company.name,
          logoUrl: company.logo_url,
          count: new Set(
            companyContextFleet
              .filter((ship) =>
                [...departures, ...fleetDepartures].some(
                  (d) => d.id === ship.departureId && d.company_id === company.id,
                ),
              )
              .map((ship) => ship.vesselId ?? ship.id),
          ).size,
        })),
    [companies, shipCompanyIds, companyContextFleet, departures, fleetDepartures],
  );
  const mapFleet = useMemo(() => {
    if (activeShortcut === "sea") return atSea;
    if (activeShortcut === "upcoming") return upcomingShips;
    return trafficFleet;
  }, [activeShortcut, atSea, upcomingShips, trafficFleet]);
  const companyFocusShips = shortcutCompanyId ? mapFleet : [];
  // « Ports uniquement » cache les bateaux, sauf si on demande ensuite « En mer » ou « À quai ».
  const hideShips =
    lineVisibility === "ports" && activeShortcut !== "sea" && activeShortcut !== "upcoming";
  const displayedFleet = hideShips
    ? []
    : trafficPreview?.companyId
      ? companyContextFleet
      : mapFleet;
  const hoverCompanyShipIds = useMemo(() => {
    if (!trafficPreview?.companyId) return [];
    const departureIds = new Set(
      [...departures, ...fleetDepartures]
        .filter((d) => d.company_id === trafficPreview.companyId)
        .map((d) => d.id),
    );
    return fleet.filter((ship) => departureIds.has(ship.departureId)).map((ship) => ship.id);
  }, [trafficPreview?.companyId, departures, fleetDepartures, fleet]);

  const allResults = [portsResult, routesResult, departuresResult, companiesResult];
  const isLoadingData = allResults.some((res) => res.isPending);
  const hasError = allResults.some((res) => res.isError);

  // L'URL reflète toujours la vue : un lien partagé rouvre exactement la même recherche.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextSearch = mapStateToSearch(filters, selection, voyageOn ? { voyage: "1" } : {});
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [filters, selection, voyageOn]);

  // Bouton retour du téléphone : chaque fiche ouverte a son entrée dans l'historique du navigateur.
  const handleBack = () => {
    if ((window.history.state as { bwPanel?: boolean } | null)?.bwPanel) window.history.back();
    else closeCurrent();
  };
  const closeCurrentRef = useRef(closeCurrent);
  closeCurrentRef.current = closeCurrent;
  const closePanelRef = useRef(() => {});
  const panelKey = selection ? `${selection.type}:${selection.id}` : panelMode;
  const openPanelRef = useRef<{ selected: boolean; open: boolean }>({
    selected: false,
    open: false,
  });
  openPanelRef.current = { selected: Boolean(selection), open: Boolean(panelKey) };
  const lastPanelKey = useRef<string | null>(null);
  const fromHistory = useRef(false);
  useEffect(() => {
    if (panelKey && panelKey !== lastPanelKey.current && !fromHistory.current)
      window.history.pushState({ ...(window.history.state as object | null), bwPanel: true }, "");
    lastPanelKey.current = panelKey ?? null;
    fromHistory.current = false;
  }, [panelKey]);
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (handleOverlayBack()) return;
      if (!openPanelRef.current.open) {
        // Fiche déjà fermée par sa croix : cette entrée ne sert plus.
        if ((event.state as { bwPanel?: boolean } | null)?.bwPanel) window.history.back();
        return;
      }
      fromHistory.current = true;
      if (openPanelRef.current.selected) closeCurrentRef.current();
      else closePanelRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const homeMode = panelMode === null && !selection;
  const mapFilters = filters;
  const previewRouteId = trafficPreview?.routeId ?? highlightRouteId;
  const scheduledRouteIds = useMemo(
    () => publishedRouteIds(departures, schedules, routes, ports, Date.now()),
    [departures, schedules, routes, ports],
  );
  // Un seul état de recherche alimente la carte, la liste et le tiroir mobile.
  const matchingRoutes = useMemo(
    () =>
      filterRoutes(
        routes,
        ports,
        allDepartures,
        { ...mapFilters, date: null },
        {
          companies,
          vessels,
        },
      ),
    [routes, ports, allDepartures, mapFilters, companies, vessels],
  );
  const fleetVisibleRouteIds = useMemo(
    () =>
      matchingRoutes
        .filter(
          (route) =>
            activeShortcut !== "companies" ||
            !shortcutCompanyId ||
            route.company_ids.includes(shortcutCompanyId),
        )
        .map((route) => route.id),
    [matchingRoutes, activeShortcut, shortcutCompanyId],
  );
  const mapVisibleRouteIds = useMemo(
    () =>
      lineVisibility === "none" || lineVisibility === "ports"
        ? []
        : fleetVisibleRouteIds.filter(
            (id) => lineVisibility === "all" || scheduledRouteIds.includes(id),
          ),
    [lineVisibility, fleetVisibleRouteIds, scheduledRouteIds],
  );
  const sailings = useMemo(
    () => buildSailings(departures, routes, ports, companies, []),
    [departures, routes, ports, companies],
  );
  const matchingSailings = useMemo(
    () =>
      legSailings(
        sailings,
        filters.departurePortIds,
        filters.arrivalPortIds,
        filters.companyId,
        null,
        filters.direction,
      ),
    [
      sailings,
      filters.departurePortIds,
      filters.arrivalPortIds,
      filters.companyId,
      filters.direction,
    ],
  );

  const hasPair =
    !homeMode && filters.departurePortIds.length > 0 && filters.arrivalPortIds.length > 0;

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

  const displayedRouteIds = useMemo(
    () =>
      lineVisibility === "none" || lineVisibility === "ports"
        ? []
        : [
            ...new Set([
              ...mapVisibleRouteIds,
              ...[previewRouteId, mapSelection?.type === "route" ? mapSelection.id : null].filter(
                (id): id is string => Boolean(id),
              ),
            ]),
          ],
    [lineVisibility, mapVisibleRouteIds, previewRouteId, mapSelection],
  );

  const focusRouteIds = useMemo(() => {
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
  }, [mapSelection, routes, hasPair, matchingRoutes, returnRoutes]);

  const highlightedPortIds = useMemo(() => {
    if (trafficPreview?.portId) return [trafficPreview.portId];
    if (previewRouteId) {
      const route = routes.find((item) => item.id === previewRouteId);
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
    previewRouteId,
    trafficPreview?.portId,
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
    if (filters.companyId || filters.vesselId) {
      for (const route of matchingRoutes) {
        ids.add(route.departure_port_id);
        ids.add(route.arrival_port_id);
      }
      return [...ids];
    }
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
  }, [
    mapSelection,
    focusedRouteId,
    routes,
    matchingRoutes,
    filters.companyId,
    filters.vesselId,
    filters.departurePortIds,
    filters.arrivalPortIds,
  ]);

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
      const traffic = portTraffic(port.id, routes, allDepartures);
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
            departureId: departure.id,
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
            departureId: departure.id,
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

  const middleRatio = !selection && panelMode === null ? 0.46 : MIDDLE_RATIO;
  const snapHeights = () => {
    const vh = mapStageRef.current?.clientHeight ?? window.innerHeight;
    return [COLLAPSED_HEIGHT, Math.round(vh * middleRatio), vh - TAB_BAR_HEIGHT] as const;
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
    if (Math.abs(v) > 0.35) {
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
  // Relais défilement → volet (façon Google Maps) : en haut de la liste, continuer à tirer
  // vers le bas fait descendre le volet sous le doigt ; un geste vif le fait changer de cran.
  const panelGesture = useRef({
    start: startPanelDrag,
    move: movePanelDrag,
    finish: finishPanelDrag,
    level: panelLevel,
  });
  panelGesture.current = {
    start: startPanelDrag,
    move: movePanelDrag,
    finish: finishPanelDrag,
    level: panelLevel,
  };
  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;
    let touchY: number | null = null;
    let scroller: HTMLElement | null = null;
    let handoff = false;
    const onStart = (e: TouchEvent) => {
      if (window.innerWidth >= 768 || e.touches.length !== 1) return;
      const target = e.target as Element | null;
      if (!target?.closest("#map-side-panel")) return;
      touchY = e.touches[0]!.clientY;
      scroller = target.closest<HTMLElement>(".batogo-panel-scroll, .overflow-y-auto");
      handoff = false;
    };
    const onMove = (e: TouchEvent) => {
      if (touchY === null) return;
      const y = e.touches[0]!.clientY;
      const g = panelGesture.current;
      if (!handoff) {
        const down = y - touchY;
        const atTop = !scroller || scroller.scrollTop <= 0;
        const pullDown = down > 8 && atTop;
        const pullUp = down < -8 && g.level < 2;
        if (!pullDown && !pullUp) return;
        handoff = true;
        g.start(y);
      }
      e.preventDefault();
      g.move(y);
    };
    const onEnd = () => {
      if (handoff) panelGesture.current.finish();
      touchY = null;
      handoff = false;
    };
    aside.addEventListener("touchstart", onStart, { passive: true });
    aside.addEventListener("touchmove", onMove, { passive: false });
    aside.addEventListener("touchend", onEnd);
    aside.addEventListener("touchcancel", onEnd);
    return () => {
      aside.removeEventListener("touchstart", onStart);
      aside.removeEventListener("touchmove", onMove);
      aside.removeEventListener("touchend", onEnd);
      aside.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const dragHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      startPanelDrag(e.clientY);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => movePanelDrag(e.clientY),
    onPointerUp: () => finishPanelDrag(),
    onPointerCancel: () => finishPanelDrag(),
  };

  const panelWidth = journeyWide
    ? Math.max(desktopPanelWidth, Math.min(720, Math.round(window.innerWidth * 0.5)))
    : desktopPanelWidth;

  // Espace masqué par le tiroir mobile : la carte se recentre au-dessus de lui.
  const isPeekSelection =
    peekSelectionKey !== null && peekSelectionKey === `${selection?.type}:${selection?.id}`;
  const peekHeight = Math.min(
    Math.round(viewportHeight * 0.6),
    Math.max(240, viewportHeight - 260),
  );
  const mobileBottomInset =
    panelLevel === 0
      ? TAB_BAR_HEIGHT + (voyage ? VOYAGE_COLLAPSED_HEIGHT : COLLAPSED_HEIGHT)
      : panelLevel === 2
        ? viewportHeight - TAB_BAR_HEIGHT
        : TAB_BAR_HEIGHT +
          (isPeekSelection
            ? peekHeight
            : Math.round(
                viewportHeight * (panelMode === "itinerary" || voyage ? 0.5 : middleRatio),
              ));
  const mobilePanelHeight = mobileBottomInset;
  // Sur mobile, choisir un navire, un port ou une traversée rouvre le tiroir s'il était replié.
  useEffect(() => {
    if (selection?.type === "vessel" || selection?.type === "departure")
      setPanelLevel(isPeekSelection ? 1 : 2);
    else if (selection && panelLevel === 0) setPanelLevel(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.type, selection?.id, isPeekSelection]);

  useEffect(() => {
    const onLayout = (event: Event) => {
      const { wide, cinema } = (event as CustomEvent<JourneyLayout>).detail;
      if (wide !== undefined) setJourneyWide(wide);
      if (cinema !== undefined && window.innerWidth < 768) setPanelLevel(cinema ? 0 : 2);
    };
    window.addEventListener(JOURNEY_LAYOUT_EVENT, onLayout);
    return () => window.removeEventListener(JOURNEY_LAYOUT_EVENT, onLayout);
  }, []);

  // Sur mobile, la carte passe devant : un toucher replie le volet tout de suite.
  useEffect(() => {
    const press = (event: PointerEvent) => {
      if (window.innerWidth >= 768) return;
      if ((event.target as Element | null)?.closest?.(".maplibregl-canvas")) setPanelLevel(0);
    };
    document.addEventListener("pointerdown", press, true);
    return () => document.removeEventListener("pointerdown", press, true);
  }, []);
  // Un filtre de la carte actif replie le volet ; il se remet quand plus aucun ne l'est.
  const mapFilterActive = activeShortcut !== null;
  // Seul un vrai changement de filtre déplace le volet (pas le premier affichage).
  const previousFilterActive = useRef(mapFilterActive);
  useEffect(() => {
    if (previousFilterActive.current === mapFilterActive) return;
    previousFilterActive.current = mapFilterActive;
    if (window.innerWidth >= 768) return;
    if (mapFilterActive) setPanelLevel(0);
    else setPanelLevel((level) => (level === 0 ? 1 : level));
  }, [mapFilterActive]);

  // La recherche ouverte sur mobile prend toute la hauteur.
  useEffect(() => {
    const full = () => setPanelLevel(2);
    window.addEventListener("batogo:panel-full", full);
    return () => window.removeEventListener("batogo:panel-full", full);
  }, []);
  useEffect(() => {
    const close = () => resetToMap();
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
  });

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

  // Le résumé replié est désactivé : le vrai volet reste toujours affiché (pas de capsule tronquée).
  const collapsed = false as boolean;

  const resetToMap = () => {
    setVoyageBack(false);
    document.querySelector(".bw-home")?.scrollIntoView({ behavior: "instant", block: "start" });
    handleSelect(null);
    setPanelLevel(1);
    setPanelMode(null);
    setDesktopPanelOpen(true);
    setItineraryPreview(null);
    setFocusedRouteId(null);
    setFocusTarget(null);
    setTrafficPreview(null);
    setHighlightRouteId(null);
    setPortsActive(false);
    setActiveShortcut(null);
    setShortcutMenuOpen(false);
    window.dispatchEvent(new Event("batogo:close-filters"));
    // Le film de la Route ne survit jamais au retour à la carte (il masque Signaler et les raccourcis).
    publishFilmFrame(null);
  };

  closePanelRef.current = resetToMap;
  // Le trajet du voyage, comme partout sur le site : chaque port et le navire ouvrent leur fiche.
  const voyageRoute = voyage ? (
    <>
      <button
        type="button"
        className="bw-inline-link"
        onClick={() => handleSelect({ type: "port", id: voyage.trip.from.id })}
      >
        {voyage.trip.from.name}
      </button>
      {" → "}
      <button
        type="button"
        className="bw-inline-link"
        onClick={() => handleSelect({ type: "port", id: voyage.trip.to.id })}
      >
        {voyage.trip.to.name}
      </button>
    </>
  ) : null;
  const voyageVessel = voyage?.trip.vessel ? (
    <button
      type="button"
      className="bw-inline-link"
      onClick={() => handleSelect({ type: "vessel", id: voyage.trip.vessel!.id })}
    >
      {voyage.trip.vessel.name}
    </button>
  ) : null;
  const voyageTitle = voyage ? (
    <>
      {voyageRoute}
      {voyageVessel ? (
        <>
          {" · "}
          {voyageVessel}
        </>
      ) : null}
    </>
  ) : null;
  // Téléphone, volet replié : l'étape en cours sur une ligne, un toucher ouvre le volet.
  const voyageNow = voyage?.friezeSteps.find((step) => step.state === "current");
  const NowIcon = voyageNow ? STEP_ICONS[voyageNow.id] : null;
  // Quitter « Ma traversée » : retour à l'accueil de la carte (bouton du volet, logo, « Carte »).
  const leaveVoyage = () => {
    setVoyageOn(false);
    resetToMap();
  };
  // Téléphone : en « Ma traversée », seul le volet défile. La page d'accueil sous la carte ne
  // remonte plus par accident quand le geste déborde de la liste des étapes.
  const voyageActive = Boolean(voyage);
  useEffect(() => {
    if (!voyageActive || !isMobile) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    const root = document.documentElement;
    root.classList.add("bw-voyage-lock");
    return () => root.classList.remove("bw-voyage-lock");
  }, [voyageActive, isMobile]);
  const leaveVoyageRef = useRef(leaveVoyage);
  leaveVoyageRef.current = leaveVoyage;
  useEffect(() => {
    const onHome = () => leaveVoyageRef.current();
    window.addEventListener(GO_HOME_EVENT, onHome);
    return () => window.removeEventListener(GO_HOME_EVENT, onHome);
  }, []);

  const openMobileDepartures = () => {
    if (panelMode === "departures" && !selection) {
      resetToMap();
      return;
    }
    resetToMap();
    setPortsActive(false);
    setActiveShortcut(null);
    setShortcutMenuOpen(false);
    setPanelMode("departures");
    setPanelLevel(2);
  };

  // De la Route à « Trouver » : le mois et les ports déjà trouvés passent dans la recherche,
  // sauf si une recherche précise est déjà en cours.
  const applyItineraryChoice = () => {
    const choice = readItineraryChoice();
    if (!choice) return;
    setFilters((current) =>
      current.departurePortIds.length || current.arrivalPortIds.length
        ? current
        : {
            ...current,
            departurePortIds: [choice.departurePortId],
            arrivalPortIds: [choice.arrivalPortId],
            direction: "eu-dz",
            date: current.date ?? `${choice.period}-01`,
            flexDays: current.date ? current.flexDays : 15,
            ...(current.date ? {} : { returnDate: null, roundTrip: false }),
          },
    );
  };

  const openMobileSearch = () => {
    if (panelMode === "search" && !selection) {
      resetToMap();
      return;
    }
    if (panelMode === "itinerary") applyItineraryChoice();
    resetToMap();
    setPortsActive(false);
    setActiveShortcut(null);
    setShortcutMenuOpen(false);
    setPanelMode("search");
    setPanelLevel(2);
  };

  const openItinerary = () => {
    if (window.innerWidth >= 768)
      document.getElementById("carte")?.scrollIntoView({ behavior: "instant" });
    if (panelMode === "itinerary" && !selection) {
      // Téléphone : déjà sur Route, le bouton plie ou déplie le volet de Route (comme « Carte »
      // pour le sien) au lieu de ramener à la carte.
      if (window.innerWidth < 768) {
        setPanelLevel((level) => (level === 0 ? 1 : 0));
        return;
      }
      resetToMap();
      return;
    }
    resetToMap();
    setPanelMode("itinerary");
    setPanelLevel(1);
    setDesktopPanelOpen(true);
  };

  const showMobilePorts = () => {
    if (activeShortcut === "ports") {
      resetToMap();
      return;
    }
    resetToMap();
    setActiveShortcut("ports");
    setShortcutMenuOpen(true);
    setPortsPulseKey(Date.now());
  };
  useEffect(() => {
    if (panelMode === "search") window.dispatchEvent(new Event("batogo:edit-filters"));
    else {
      window.dispatchEvent(new Event("batogo:close-filters"));
      if (panelMode === "departures") window.dispatchEvent(new Event("batogo:show-departures"));
    }
  }, [panelMode]);

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
      else if (action === "search") openSearchFromMenu();
      else if (action === "ports") showMobilePorts();
      else if (action === "itinerary") openItinerary();
      // « Demander aux voyageurs » depuis « Une question ? » d'une autre page.
      else if (action === "salons") window.dispatchEvent(new Event(OPEN_ROOM_PICKER_EVENT));
    }, 120);
    return () => window.clearTimeout(timer);
    // Navigation entrante : l'action enregistrée n'est lue qu'une fois au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const open = () => {
      window.sessionStorage.removeItem("bledway:open-home-action");
      openItinerary();
    };
    window.addEventListener("bledway:open-itinerary", open);
    return () => window.removeEventListener("bledway:open-itinerary", open);
  });

  // « Réserver » (en-tête) : la recherche de traversée, ouverte et prête à remplir, sans bascule.
  const openSearchFromMenu = () => {
    if (window.innerWidth >= 768)
      document.getElementById("carte")?.scrollIntoView({ behavior: "instant" });
    if (panelMode === "itinerary") applyItineraryChoice();
    if (selection) handleSelect(null);
    setPanelMode("search");
    setActiveShortcut(null);
    setShortcutMenuOpen(false);
    setDesktopPanelOpen(true);
    setPanelLevel(2);
    window.dispatchEvent(new Event("batogo:edit-filters"));
  };
  useEffect(() => {
    const open = () => {
      window.sessionStorage.removeItem("bledway:open-home-action");
      openSearchFromMenu();
    };
    window.addEventListener("bledway:open-search", open);
    return () => window.removeEventListener("bledway:open-search", open);
  });

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
        {tr("ui.pageIndex.allerAuContenu")}
      </a>
      <SiteHeader />
      <main id="contenu" tabIndex={-1}>
        <h1 className="sr-only">
          {tr("ui.pageIndex.ferriesEuropeMaghrebCarteDes")}
        </h1>
        <section
          id="carte"
          aria-label={tr("ui.pageIndex.carteEtRechercheDeTraversees")}
          className="bw-map-stage"
          data-panel-open={true}
          data-panel-full={panelLevel === 2}
          ref={mapStageRef}
          style={
            {
              "--desktop-panel-width": `${panelWidth}px`,
              "--stage-height": `${viewportHeight}px`,
              "--mobile-panel-height": `${mobilePanelHeight}px`,
              "--mobile-peek-height": `${peekHeight}px`,
              "--middle-panel-height": `${Math.round(viewportHeight * middleRatio)}px`,
            } as React.CSSProperties
          }
        >
          {panelLevel === 2 && (
            <button
              type="button"
              aria-label={tr("ui.pageIndex.reduireLePanneau")}
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
                "--desktop-panel-width": `${panelWidth}px`,
              } as React.CSSProperties
            }
            className={`bw-map-panel absolute bottom-0 left-0 right-0 z-[60] flex flex-col overflow-hidden bg-transparent ${dragHeight !== null ? "transition-none" : "transition-[height,width,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"} md:bottom-5 md:left-5 md:right-auto md:top-5 md:h-auto md:w-[var(--desktop-panel-width)] md:overflow-visible md:rounded-3xl md:z-40 ${
              desktopPanelOpen ? "md:translate-x-0" : "md:translate-x-[calc(-100%-1.25rem)]"
            } ${panelLevel === 0 ? (voyage ? "h-24 rounded-t-3xl" : "h-32 rounded-t-3xl") : panelLevel === 1 ? (isPeekSelection ? "h-[var(--mobile-peek-height)] rounded-t-3xl" : panelMode === "itinerary" || voyage ? "h-[calc(var(--stage-height)*0.5)] rounded-t-3xl" : "h-[var(--middle-panel-height)] rounded-t-3xl") : "h-[calc(var(--stage-height)-3.5rem)] rounded-t-3xl"}`}
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
                    : tr("ui.pageIndex.trouverMaTraversee")
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
                aria-label={panelLevel === 2 ? tr("ui.pageIndex.reduireLePanneau") : tr("ui.pageIndex.agrandirLePanneau")}
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
              hidden={Boolean(voyage)}
              className={`${collapsed ? "hidden md:block" : "min-h-0 flex-1"} md:h-full ${desktopPanelOpen ? "" : "md:invisible md:pointer-events-none"}`}
            >
              <SidePanel
                noticeId={
                  noticeTarget.id &&
                  selection?.type === noticeTarget.selection?.type &&
                  selection?.id === noticeTarget.selection?.id
                    ? noticeTarget.id
                    : null
                }
                companionEnabled={desktopPanelOpen && !voyage}
                onCompanionWidth={setCompanionWidth}
                selection={selection}
                onSelect={handleSelect}
                onBack={handleBack}
                backLabel={backLabel}
                filters={filters}
                onFiltersChange={setFilters}
                onHighlightRoute={setHighlightRouteId}
                onFocusRoute={setFocusedRouteId}
                homeMode={homeMode}
                onTrafficPreview={setTrafficPreview}
                onOpenSearch={() => {
                  if (panelMode === "itinerary") applyItineraryChoice();
                  setPanelMode("search");
                  setActiveShortcut(null);
                  setShortcutMenuOpen(false);
                  setDesktopPanelOpen(true);
                }}
                itineraryOpen={panelMode === "itinerary"}
                onOpenItinerary={openItinerary}
                onCloseItinerary={resetToMap}
                onItineraryPreview={updateItineraryPreview}
                onItineraryResultsReady={() => {
                  if (window.innerWidth < 768) setPanelLevel(2);
                }}
                onBookPeriod={(period, choice) => {
                  setPanelMode("search");
                  setActiveShortcut(null);
                  setShortcutMenuOpen(false);
                  setDesktopPanelOpen(true);
                  if (window.innerWidth < 768) setPanelLevel(2);
                  setFilters((current) => ({
                    ...current,
                    date: `${period}-01`,
                    returnDate: null,
                    roundTrip: false,
                    flexDays: 15,
                    ...(choice
                      ? {
                          departurePortIds: [choice.departurePortId],
                          arrivalPortIds: [choice.arrivalPortId],
                          direction: "eu-dz" as const,
                        }
                      : {}),
                  }));
                }}
              />
            </div>
            {voyage ? (
              <div
                className={`bw-voyage-aside ${desktopPanelOpen ? "" : "md:invisible md:pointer-events-none"}`}
                data-level={panelLevel}
              >
                {isMobile ? (
                  <>
                    {/* Un seul en-tête : le trajet, puis deux boutons ronds. La liste fait le reste. */}
                    <div className="bw-voyage-head">
                      {panelLevel === 0 && voyageNow && NowIcon ? (
                        <button
                          type="button"
                          className="bw-voyage-head__now"
                          onClick={() => setPanelLevel(1)}
                        >
                          <span aria-hidden>
                            <NowIcon size={16} />
                          </span>
                          <strong>{voyageNow.label}</strong>
                          <small>{voyageNow.sub}</small>
                        </button>
                      ) : (
                        <div className="bw-voyage-head__title">
                          <strong>{voyageRoute}</strong>
                          <small>
                            {voyage.summary.short}
                            {voyageVessel ? (
                              <>
                                {" · "}
                                {voyageVessel}
                              </>
                            ) : null}
                            {voyage.summary.cancelled ? <em>{tr("ui.pageIndex.annulee")}</em> : null}
                          </small>
                        </div>
                      )}
                      {voyage.placesButton}
                      <button
                        type="button"
                        className="bw-round-button"
                        onClick={leaveVoyage}
                        aria-label={tr("ui.pageIndex.retourALAccueil")}
                        title={tr("ui.pageIndex.retourALAccueil")}
                      >
                        <ArrowLeft size={16} aria-hidden />
                      </button>
                    </div>
                    {panelLevel > 0 ? (
                      <div className="bw-voyage-aside__scroll">
                        {voyage.tripCard ? (
                          <div className="bw-voyage-traffic">{voyage.tripCard}</div>
                        ) : null}
                        {voyage.liveAlert ? (
                          <LivePulse
                            info={voyage.info}
                            onOpen={() =>
                              handleSelect({ type: "departure", id: voyage.trip.departure.id })
                            }
                          />
                        ) : null}
                        <JourneyTimeline
                          steps={voyage.friezeSteps}
                          openId={timelineClosed ? null : voyage.shown}
                          hereLabel={voyage.hereLabel}
                          onToggle={(next) => {
                            if (!timelineClosed && voyage.friezeSteps[next]?.id === voyage.shown) {
                              setTimelineClosed(true);
                              return;
                            }
                            setTimelineClosed(false);
                            voyage.setStoryIndex(next);
                          }}
                          renderOpen={(id) => voyage.renderPanel(id, false)}
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="bw-voyage-aside__bar">
                      <button type="button" onClick={leaveVoyage}>
                        <ArrowLeft size={15} aria-hidden />{tr("ui.pageIndex.retourALAccueil2")}
                      </button>
                      {voyage.placesEntry ?? <span>{tr("ui.pageIndex.traverseeSuivie")}</span>}
                    </div>
                    {/* Ma traversée défile avec l'étape : le bateau en tête, puis l'étape regardée. */}
                    <div className="bw-voyage-aside__scroll">
                      {voyage.tripCard ? (
                        <div className="bw-voyage-traffic">{voyage.tripCard}</div>
                      ) : null}
                      <div className="bw-voyage-aside__step" key={voyage.shown ?? voyage.current}>
                        {voyage.liveAlert ? (
                          <LivePulse
                            info={voyage.info}
                            onOpen={() =>
                              handleSelect({ type: "departure", id: voyage.trip.departure.id })
                            }
                          />
                        ) : null}
                        {voyage.renderPanel(
                          voyage.shown ?? voyage.current,
                          Boolean(voyage.pinned),
                          voyage.close,
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={tr("ui.pageIndex.redimensionnerLeVolet")}
              title={tr("ui.pageIndex.faireGlisserPourAjusterLa")}
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
              aria-label={desktopPanelOpen ? tr("ui.pageIndex.reduireLePanneau") : tr("ui.pageIndex.developperLePanneau")}
              title={desktopPanelOpen ? tr("ui.pageIndex.reduireLePanneau") : tr("ui.pageIndex.developperLePanneau")}
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
              activeTab={
                voyage && panelLevel > 0
                  ? "voyage"
                  : panelLevel === 0
                    ? "map"
                    : panelMode === "itinerary"
                      ? "itinerary"
                      : (panelMode ?? "map")
              }
              onOpenMap={() => {
                // Toujours le même résultat : la carte d'accueil, ses raccourcis, Signaler et Salon.
                // Le bouton ne laisse jamais un film, « Ma traversée », une fiche ou un écran
                // (Route, Départs, recherche) par-dessus la carte.
                const scrolled = window.scrollY > 40;
                const elsewhere = Boolean(voyage) || panelMode !== null || Boolean(selection);
                if (elsewhere) {
                  if (voyage) leaveVoyage();
                  else resetToMap();
                  setPanelLevel(voyage ? 1 : 0);
                } else if (scrolled) {
                  // Plus bas dans la page, le bouton ramène d'abord à la carte, volet replié.
                  setPanelLevel(0);
                } else {
                  publishFilmFrame(null);
                  setPanelLevel((level) => (level === 0 ? 1 : 0));
                }
                // Après le repli du volet, qui décale encore la page.
                if (scrolled)
                  window.setTimeout(() => window.scrollTo({ top: 0, behavior: "instant" }), 60);
              }}
              onOpenVoyage={() => {
                if (voyage) setPanelLevel((level) => (level === 0 ? 2 : 0));
                else enterVoyage();
              }}
              onMoreToggle={resetToMap}
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
            <QuickReport ports={ports} fleet={fleet} departures={departures} selection={selection}>
              {voyage ? (
                // En mode voyage, le bouton des salons ouvre (ou réduit) le salon de la traversée.
                <button
                  type="button"
                  className="bw-journey-salon-fab bw-voyage-salon-fab"
                  data-mobile={isMobile || undefined}
                  aria-pressed={isMobile ? undefined : salonOpen}
                  onClick={() => (isMobile ? setSalonDialog(true) : setSalonOpen((open) => !open))}
                  aria-label={
                    !isMobile && salonOpen
                      ? tr("ui.pageIndex.reduireLeSalonDeLa")
                      : tr("ui.pageIndex.ouvrirLeSalonDeLa")
                  }
                >
                  <MessagesSquare size={20} aria-hidden />
                  {isMobile ? null : <span>{tr("ui.pageIndex.salon")}</span>}
                </button>
              ) : (
                <MessagesFab onSelect={(next) => handleSelectRef.current(next)} />
              )}
            </QuickReport>
            {voyage ? (
              <VoyageSalonsPicker
                onSelect={(next) => handleSelectRef.current(next)}
                open={voyagePicker}
                onOpenChange={setVoyagePicker}
              />
            ) : null}
            <RoomInvite onSelect={(next) => handleSelectRef.current(next)} />
            {/* Ma traversée pas encore sur la carte : chrono flottant. */}
            {voyage ? null : (
              <MyTripMapChip fleet={fleet} onOpen={(next) => handleSelectRef.current(next)} />
            )}
            <MapStats
              search={
                <MapSearch
                  atSea={atSea}
                  onOpen={() => {
                    setShortcutMenuOpen(false);
                    if (window.innerWidth < 768) setPanelLevel(0);
                  }}
                  onSelect={(next) => handleSelectRef.current(next)}
                  onRoute={exploreRoute}
                />
              }
              atSea={atSea}
              upcomingShips={upcomingShips}
              companies={shortcutCompanies}
              portsCount={ports.length}
              activeShortcut={activeShortcut}
              menuOpen={shortcutMenuOpen}
              selectedCompanyId={filters.companyId}
              onDismiss={() => {
                setShortcutMenuOpen(false);
                setTrafficPreview(null);
              }}
              lineVisibility={lineVisibility}
              onLineVisibility={setLineVisibility}
              onPreview={setTrafficPreview}
              infoOf={(ship) => fleetShortcutInfo(ship, allDepartures, routes, ports, Date.now())}
              onToggle={(shortcut) => {
                if (window.innerWidth >= 768) shortcutScrollY.current = window.scrollY;
                resetToMap();
                // Un navire choisi depuis ce raccourci : re-cliquer revient à la carte complète.
                if (
                  (shortcut === "sea" || shortcut === "upcoming") &&
                  (focusShipId || filters.vesselId)
                ) {
                  setFocusShipId(null);
                  setFilters((current) => ({ ...current, vesselId: null, companyId: null }));
                  setActiveShortcut(null);
                  setShortcutMenuOpen(false);
                  return;
                }
                // Compagnie filtrée : re-cliquer le raccourci retire le filtre (comme En mer / À quai).
                if (
                  shortcut === "companies" &&
                  activeShortcut === "companies" &&
                  filters.companyId
                ) {
                  setTrafficPreview(null);
                  setFilters((current) => ({ ...current, companyId: null }));
                  setActiveShortcut(null);
                  setShortcutMenuOpen(false);
                  return;
                }
                if (activeShortcut === shortcut && shortcutMenuOpen) {
                  setActiveShortcut(null);
                  setShortcutMenuOpen(false);
                  return;
                }
                setActiveShortcut(shortcut);
                setShortcutMenuOpen(true);
                if (shortcut === "ports") setPortsPulseKey(Date.now());
              }}
              onSelectCompany={(companyId) => {
                setTrafficPreview(null);
                setCompanyFromShip(null);
                setFilters((current) => ({ ...current, companyId }));
                setShortcutMenuOpen(false);
              }}
              onSelectShip={(ship) => {
                const departure = allDepartures.find((d) => d.id === ship.departureId);
                // Une compagnie déjà choisie par l'utilisateur reste un vrai filtre.
                if (!filters.companyId || filters.companyId === companyFromShip)
                  setCompanyFromShip(departure?.company_id ?? null);
                setFilters((current) => ({
                  ...current,
                  vesselId: ship.vesselId,
                  companyId: departure?.company_id ?? current.companyId,
                }));
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
            {voyage && !isMobile ? null : (
              <MapLegend panelOpen={desktopPanelOpen} showDateHint={false} />
            )}
            {voyage && !isMobile ? (
              <div
                className="bw-voyage-layer"
                style={
                  {
                    "--voyage-left": `${desktopPanelOpen ? panelWidth + 40 : 60}px`,
                  } as React.CSSProperties
                }
              >
                {salonOpen ? (
                  <aside className="bw-voyage-salon" aria-label={voyage.salon.title}>
                    <button
                      type="button"
                      className="bw-journey-salon__min"
                      onClick={() => setSalonOpen(false)}
                      aria-label={tr("ui.pageIndex.reduireLeSalon")}
                    >
                      <Minus size={14} aria-hidden />
                    </button>
                    <EmbeddedRoom
                      kind="crossing"
                      room={voyage.salon.room}
                      title={voyage.salon.title}
                      moment={voyage.salon.moment}
                      starterContext={voyage.salon.starterContext}
                    />
                  </aside>
                ) : null}
                <section className="bw-voyage-dock" aria-label={tr("ui.pageIndex.monVoyageEtapeParEtape")}>
                  <header className="bw-voyage-dock__head">
                    <div className="bw-voyage-dock__title">
                      <span>{voyage.summary.heading}</span>
                      <strong>{voyageTitle}</strong>
                      {voyage.summary.cancelled ? <b>{tr("ui.pageIndex.annulee2")}</b> : null}
                    </div>
                    {voyage.summary.countdown ? (
                      <p>
                        <b>{voyage.summary.countdown}</b>{tr("ui.pageIndex.avantLeDepart")}
                      </p>
                    ) : null}
                    {voyage.traveller && voyage.summary.total ? (
                      <p>
                        <b>
                          {voyage.summary.done}/{voyage.summary.total}
                        </b>{" "}
                        {tr("ui.pageIndex.actionsFaites")}
                      </p>
                    ) : null}
                    <button type="button" className="bw-voyage-dock__exit" onClick={leaveVoyage}>
                      <ArrowLeft size={15} aria-hidden />{tr("ui.pageIndex.accueil")}
                    </button>
                  </header>
                  <JourneyFrieze
                    steps={voyage.friezeSteps}
                    shownId={voyage.shown}
                    pinnedId={voyage.pinned}
                    onHover={voyage.setHover}
                    onPin={(step) => {
                      voyage.pin(step);
                      setDesktopPanelOpen(true);
                    }}
                    hereLabel={voyage.hereLabel}
                  />
                </section>
              </div>
            ) : null}
            <ClientOnly fallback={<MapFallback />}>
              <Suspense fallback={<MapFallback />}>
                <FerryMap
                  focusTarget={focusTarget}
                  itineraryPreview={voyage ? voyage.mapProps.itineraryPreview : itineraryPreview}
                  portsPulseKey={activeShortcut === "ports" || portsActive ? portsPulseKey : 0}
                  portsMode={activeShortcut === "ports"}
                  companyFocusShips={companyFocusShips}
                  focusShipId={voyage ? voyage.mapProps.focusShipId : focusShipId}
                  vesselCards={vesselCards}
                  ports={ports}
                  routes={routes}
                  visibleRouteIds={displayedRouteIds}
                  fleetVisibleRouteIds={fleetVisibleRouteIds}
                  hoverVesselId={trafficPreview?.vesselId ?? null}
                  hoverShipIds={hoverCompanyShipIds}
                  hoverPortId={trafficPreview?.portId ?? null}
                  dateActiveRouteIds={scheduledRouteIds.length ? scheduledRouteIds : ["__none__"]}
                  focusRouteIds={voyage ? voyageRoutes : focusRouteIds}
                  selection={mapSelection}
                  highlightedPortIds={voyage ? voyagePorts : highlightedPortIds}
                  fitPortIds={voyage ? voyageFit : fitPortIds}
                  hoverRouteId={previewRouteId}
                  fleet={displayedFleet}
                  selectedVesselId={selection?.type === "vessel" ? selection.id : null}
                  portMeta={portMeta}
                  onSelect={handleSelect}
                  onOpenPanel={() => setPanelLevel(2)}
                  onMapInteract={(kind) => {
                    setShortcutMenuOpen(false);
                    if (kind === "port") {
                      handleSelect(null);
                      setPanelLevel(1);
                    } else if (kind === "vessel") setPanelLevel(2);
                    else if (kind === "route") setPanelLevel(2);
                    // Mobile : déplacer ou zoomer à deux doigts ne touche ni au volet ni au cadrage.
                    else if (window.innerWidth < 768) {
                      setTrafficPreview(null);
                      window.dispatchEvent(new Event("batogo:close-filters"));
                    } else if (panelMode !== "itinerary") resetToMap();
                  }}
                  mobileBottomInset={mobileBottomInset}
                  desktopLeftInset={
                    desktopPanelOpen ? panelWidth + 80 + (voyage ? 0 : companionWidth) : 50
                  }
                  desktopRightInset={voyage && !isMobile && salonOpen ? 400 : 0}
                  desktopBottomInset={voyage && !isMobile ? 150 : 0}
                />
              </Suspense>
            </ClientOnly>
          </div>
          {voyage ? null : (
            <a className="bw-map-scroll" href="#preparer">
              <Compass size={16} />{tr("ui.pageIndex.etApresLaTraversee")}<ArrowDown size={16} />
            </a>
          )}
          {voyage ? (
            <Dialog open={salonDialog} onOpenChange={setSalonDialog}>
              <DialogContent className="bw-chat-window">
                {salonDialog ? (
                  <EmbeddedRoom
                    kind="crossing"
                    room={voyage.salon.room}
                    title={voyage.salon.title}
                    moment={voyage.salon.moment}
                    starterContext={voyage.salon.starterContext}
                  />
                ) : null}
              </DialogContent>
            </Dialog>
          ) : null}
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
          {nextLabel === "Ports, dates et voyageurs" ? tr("ui.pageIndex.trouver") : tr("ui.pageIndex.voir")}
        </span>
      </span>
    </Button>
  );
}

function MapFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[var(--sea)] text-sm font-semibold text-primary/70">
      <span className="animate-pulse">{tr("ui.pageIndex.chargementDeLaCarte")}</span>
    </div>
  );
}
