import { useVesselAlerts } from "@/lib/ferry/vesselAlerts";
import { useTravelMarkers } from "./useTravelMarkers";
import { bringTooltipToFront } from "./tooltipStack";
import { usePresenceMarkers } from "./usePresenceMarkers";
import { useMyTripMarker } from "./useMyTripMarker";
import { useChatBubbles } from "./useChatBubbles";
import { useJourneyFilm } from "./useJourneyFilm";
import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Port, RouteLine, Selection } from "@/lib/ferry/types";
import { formatDuration } from "@/lib/ferry/format";
import { algeriaGeoJson } from "@/lib/ferry/algeriaGeoJson";
import { routeArc } from "@/lib/ferry/geo";
import { shipAnchor, type FleetShip } from "@/lib/ferry/fleet";
import { LABEL_SIZE_STOPS, labelSize, placeAlongLines, placeLabels, type Box } from "./labelPlacement";
import {
  addShipImages,
  addVesselImages,
  dockSpread,
  pitchForZoom,
  shipIcon,
  shipTokenRadius,
  VESSEL_IMAGE_STEPS,
  vesselScreenHeight,
  shipShiftY,
  VESSEL_SCREEN_WIDTH,
  vesselScreenWidth,
  vesselImageId,
  wakeLevel,
} from "./shipIcons";
import { MAP_VESSELS, vesselMapIcon } from "@/lib/ferry/vesselVisuals";
import { fleetGroups } from "./fleetVisibility";
import { physicalStatus, projectedPosition } from "@/lib/ferry/tracking";
import { portTimeZone, wallTimeInZone } from "@/lib/ferry/time";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ItineraryMapPreview } from "@/lib/ferry/itinerary";

type FleetFrame = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, string | number>;
    geometry: { type: "Point"; coordinates: [number, number] };
  }>;
};

// En production, MapLibre v6 a besoin que son « worker » soit fourni explicitement.
// En développement, ce fichier injecté par Vite plante (« document is not defined ») et la carte
// reste vide : on laisse alors MapLibre utiliser son worker intégré.
if (!import.meta.env.DEV) setWorkerUrl(workerUrl);

export interface PortMeta {
  /** Nombre de lignes actives qui touchent le port (départ ou arrivée). */
  routes: number;
  departureCount: number;
  arrivalCount: number;
  companies: { name: string; logoUrl: string | null }[];
  /** Prochains départs depuis ce port, déjà formatés en heure locale du port. */
  upcoming: {
    departureId: string;
    date: string;
    time: string;
    to: string | null;
    companyName: string | null;
    logoUrl: string | null;
  }[];
  /** Prochaines arrivées prévues dans ce port, en heure locale. */
  upcomingArrivals: {
    departureId: string;
    date: string;
    time: string;
    from: string | null;
    companyName: string | null;
    logoUrl: string | null;
  }[];
}

interface FerryMapProps {
  ports: Port[];
  routes: RouteLine[];
  visibleRouteIds: string[];
  fleetVisibleRouteIds?: string[];
  hoverVesselId?: string | null;
  hoverShipIds?: string[];
  hoverPortId?: string | null;
  dateActiveRouteIds: string[];
  focusRouteIds: string[];
  selection: Selection | null;
  highlightedPortIds: string[];
  /** Flotte : un navire par traversée en cours ou à venir (position déduite des horaires ou réelle si suivie). */
  fleet?: FleetShip[];
  selectedVesselId?: string | null;
  /** Ligne survolée ou dépliée dans le volet : mise en évidence sans déplacer la carte. */
  hoverRouteId?: string | null;
  /** Ports à cadrer quand rien n'est sélectionné (trajet cherché). */
  fitPortIds?: string[];
  portMeta: Record<string, PortMeta>;
  onSelect: (selection: Selection | null) => void;
  onOpenPanel?: () => void;
  onMapInteract?: (kind?: "port" | "vessel" | "route") => void;
  /** Hauteur (px) masquée par le tiroir mobile et la barre d'onglets. */
  mobileBottomInset?: number;
  /** Largeur (px) masquée par le volet ordinateur. */
  desktopLeftInset?: number;
  /** Largeur (px) masquée à droite sur ordinateur (salon ouvert de « Mon voyage ») ; 0 par défaut. */
  desktopRightInset?: number;
  /** Hauteur (px) masquée en haut sur mobile (bandeau de « Mon voyage ») ; 0 par défaut. */
  mobileTopInset?: number;
  /** Navire à amener au centre de la zone visible (clé changeante = nouveau cadrage). */
  focusTarget?: { center: [number, number]; key: number } | null;
  itineraryPreview?: ItineraryMapPreview | null;
  /** Clé changeante : vue globale + clignotement des ports. */
  portsPulseKey?: number;
  /** Mode Ports actif : conserve les noms visibles jusqu'au second clic. */
  portsMode?: boolean;
  companyFocusShips?: FleetShip[];
  /** Navire choisi depuis le tableau de bord : jamais estompé, même si une ligne est sélectionnée. */
  focusShipId?: string | null;
  /** Logo de la compagnie et photo du navire, affichés au survol. */
  vesselCards?:
    | Record<
        string,
        { photoUrl: string | null; logoUrl: string | null; companyName: string | null }
      >
    | undefined;
}

// Limite de dézoom : on ne peut pas s'éloigner plus que « toute la Méditerranée occidentale visible »
// (plancher relevé selon la largeur d'écran pour empêcher une vue planisphère).
/** Entre ces deux zooms, les lignes passent de discrètes à pleinement lisibles. */
const ROUTES_FAR_ZOOM = 5;
const ROUTES_NEAR_ZOOM = 7;

function cameraDuration(milliseconds: number) {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : milliseconds;
}

function minZoomFloor() {
  const width = typeof window === "undefined" ? 1280 : window.innerWidth;
  if (width < 768) return 2.2;
  if (width < 1200) return 3.3;
  return 3.6;
}
const LIMIT_BOUNDS: [[number, number], [number, number]] = [
  [-16, 0],
  [26, 54],
];
/** Taille des durées sur les lignes, en pixels. */
const DURATION_SIZE = 9;
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
/** Le phare d'un port, vu de près : tour blanche et rouge, lanterne allumée. */
const LIGHTHOUSE_SVG = `<svg class="port-marker__lighthouse" viewBox="0 0 28 44" aria-hidden="true">
<defs><radialGradient id="bw-lh-glow"><stop offset="0" stop-color="#ffe27a" stop-opacity=".85"/><stop offset="1" stop-color="#ffe27a" stop-opacity="0"/></radialGradient>
<linearGradient id="bw-lh-tower" x1="0" x2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#f1efe9"/><stop offset="1" stop-color="#d9d6cd"/></linearGradient></defs>
<circle cx="14" cy="10" r="10" fill="url(#bw-lh-glow)"/>
<path d="M14 2.5 L19.5 7.5 H8.5 Z" fill="#b3261e"/>
<rect x="10" y="7.5" width="8" height="5.5" rx="1.4" fill="#ffd65a" stroke="#16324a" stroke-width=".9"/>
<rect x="8.6" y="13" width="10.8" height="2" rx="1" fill="#16324a"/>
<path d="M10.2 15 H17.8 L19.8 38 H8.2 Z" fill="url(#bw-lh-tower)" stroke="#16324a" stroke-opacity=".35" stroke-width=".8"/>
<path d="M9.8 20 H18.2 L18.6 24.5 H9.4 Z M9 29 H19 L19.4 33.5 H8.6 Z" fill="#c8452a"/>
<rect x="12.6" y="25.5" width="2.8" height="3" rx="1.2" fill="#16324a" opacity=".55"/>
<rect x="5.5" y="38" width="17" height="4.5" rx="2.2" fill="#7f97a3"/>
</svg>`;
const INLAND_COUNTRY_NAMES = [
  "Switzerland", "Austria", "Liechtenstein", "Luxembourg", "Czechia", "Czech Republic", "Slovakia",
  "Hungary", "Serbia", "Kosovo", "North Macedonia", "Moldova", "Belarus", "Andorra", "San Marino",
  "Vatican City", "Monaco", "Gibraltar", "Mali", "Niger", "Chad", "Burkina Faso",
];
/** Pays sans façade maritime, et micro-États qui encombrent la côte : leur nom est masqué. */
const INLAND_COUNTRIES = [
  "AD", "AT", "BA", "BF", "BY", "CF", "CH", "CZ", "ET", "GI", "HU", "LI", "LU", "MC", "MD", "MK",
  "ML", "NE", "RS", "SK", "SM", "SS", "TD", "VA", "XK",
];
// Vue d'ensemble : toute la Méditerranée occidentale, de l'Espagne à l'Italie et toute la côte algérienne.
const OVERVIEW_BOUNDS: [[number, number], [number, number]] = [
  [-3.5, 35],
  [10.5, 44],
];
const DESKTOP_OVERVIEW_BOUNDS: [[number, number], [number, number]] = [
  [-6.5, 34.5],
  [6.5, 44.5],
];

function mapColor(token: string, fallback: string) {
  const cssColor = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (!cssColor) return fallback;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return fallback;
  context.fillStyle = cssColor;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${red}, ${green}, ${blue})`;
}

function routeFeatures(
  routes: RouteLine[],
  ports: Map<string, Port>,
  visible: Set<string>,
  dateActive: Set<string>,
  focus: Set<string>,
  selection: Selection | null,
) {
  const visibleRoutes = routes.filter((route) => visible.has(route.id));
  const pairGroups = new Map<string, RouteLine[]>();

  visibleRoutes.forEach((route) => {
    const pairKey = [route.departure_port_id, route.arrival_port_id].sort().join("::");
    const group = pairGroups.get(pairKey) ?? [];
    group.push(route);
    pairGroups.set(pairKey, group);
  });

  const selectedRouteId = selection?.type === "route" ? selection.id : null;
  const selectedPortId = selection?.type === "port" ? selection.id : null;

  // Le nombre de lignes au départ donne un poids visuel à chaque ligne.
  const departureLineCounts = new Map<string, number>();
  visibleRoutes.forEach((route) => {
    departureLineCounts.set(
      route.departure_port_id,
      (departureLineCounts.get(route.departure_port_id) ?? 0) + 1,
    );
  });

  return visibleRoutes
    .map((route) => {
      const from = ports.get(route.departure_port_id);
      const to = ports.get(route.arrival_port_id);
      if (!from || !to) return null;

      const pairKey = [route.departure_port_id, route.arrival_port_id].sort().join("::");
      const group = pairGroups.get(pairKey) ?? [route];
      const displayRoute = group.slice().sort((a, b) => a.id.localeCompare(b.id))[0];
      if (!displayRoute) return null;
      const isDisplayRoute = route.id === displayRoute.id;
      const focusedPair = group.some((item) => focus.has(item.id));
      const bothWays = new Set(group.map((item) => item.departure_port_id)).size > 1;

      let durationMinutes: number | null = null;
      if (selectedRouteId)
        durationMinutes =
          group.find((item) => item.id === selectedRouteId)?.typical_duration_minutes ?? null;
      else if (selectedPortId)
        durationMinutes =
          group
            .filter((item) => item.departure_port_id === selectedPortId)
            .map((item) => item.typical_duration_minutes)
            .filter((value): value is number => value != null)[0] ?? null;
      else
        durationMinutes =
          group
            .map((item) => item.typical_duration_minutes)
            .filter((value): value is number => value != null)
            .sort((a, b) => b - a)[0] ?? null;

      const focusDimmed =
        focus.size > 0 && !focus.has(route.id) && !(isDisplayRoute && focusedPair);
      const dateDimmed = dateActive.size > 0 && !dateActive.has(route.id);
      // « ⇄ » signale une ligne exploitée dans les deux sens.
      const label =
        isDisplayRoute && durationMinutes
          ? `${bothWays && !selectedRouteId ? "⇄ " : ""}${formatDuration(durationMinutes)}`
          : "";

      return {
        type: "Feature" as const,
        properties: {
          id: route.id,
          color: "#1e5b7a",
          lineCount: departureLineCounts.get(route.departure_port_id) ?? 1,
          label,
          selected: selectedRouteId === route.id,
          focused: focus.has(route.id) || (isDisplayRoute && focusedPair),
          dimmed: focusDimmed,
          dateDimmed,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: routeArc(from, to),
        },
      };
    })
    .filter((feature): feature is NonNullable<typeof feature> => feature !== null);
}

/** Le nom du port collé à son point, de chaque côté possible. */
const PORT_LABEL_SIDES: Record<string, Partial<CSSStyleDeclaration>> = {
  right: { left: "9px", right: "", top: "0", bottom: "", transform: "translateY(-50%)" },
  left: { left: "", right: "9px", top: "0", bottom: "", transform: "translateY(-50%)" },
  bottom: { left: "0", right: "", top: "9px", bottom: "", transform: "translateX(-50%)" },
  top: { left: "0", right: "", top: "", bottom: "9px", transform: "translateX(-50%)" },
};
const anchorStyles: Record<string, Partial<CSSStyleDeclaration>> = {
  left: { right: "12px", top: "-9px" },
  right: { left: "12px", top: "-9px" },
  top: { transform: "translateX(-50%)", left: "0", bottom: "12px" },
  bottom: { transform: "translateX(-50%)", left: "0", top: "12px" },
};

function getPortLabelStyle(port: Port): Partial<CSSStyleDeclaration> {
  const base: Partial<CSSStyleDeclaration> =
    anchorStyles[port.label_anchor] ?? anchorStyles["left"] ?? {};
  const x = Number(port.label_offset_x) || 0;
  const y = Number(port.label_offset_y) || 0;
  const baseTransform = base.transform ?? "";
  return {
    left: base.left ?? "",
    right: base.right ?? "",
    top: base.top ?? "",
    bottom: base.bottom ?? "",
    transform: `${baseTransform}${baseTransform ? " " : ""}translate(${x}px, ${y}px)`,
  };
}

function positionPortTip(
  map: MapLibreMap,
  marker: Marker,
  tip: HTMLDivElement,
  /** Mobile : hauteur du tiroir qui masque le bas de la carte. */
  bottomInset = 0,
) {
  const container = map.getContainer();
  const mapRect = container.getBoundingClientRect();
  const markerRect = marker.getElement().getBoundingClientRect();
  const gap = 14;
  const padding = 10;
  const availableWidth = Math.max(0, mapRect.width - padding * 2);
  const topSafe = 84;
  const bottomSafe = mapRect.bottom - bottomInset - padding;

  tip.style.maxWidth = `${Math.min(300, availableWidth)}px`;
  tip.style.maxHeight = `${Math.max(160, bottomSafe - mapRect.top - topSafe)}px`;

  const tipRect = tip.getBoundingClientRect();
  const markerX = markerRect.left + markerRect.width / 2;
  const markerY = markerRect.top + markerRect.height / 2;
  const tipWidth = tipRect.width;
  const tipHeight = tipRect.height;

  let left = markerRect.right + gap;
  if (left + tipWidth > mapRect.right - padding) left = markerRect.left - tipWidth - gap;
  if (left < mapRect.left + padding)
    left = Math.max(mapRect.left + padding, markerX - tipWidth / 2);

  // La carte passe sous l'en-tête (et sous la recherche sur mobile) : l'infobulle reste en dessous.
  let top = markerY - tipHeight / 2;
  if (top < mapRect.top + topSafe) top = mapRect.top + topSafe;
  if (top + tipHeight > bottomSafe) top = bottomSafe - tipHeight;
  if (top < mapRect.top + topSafe) top = mapRect.top + topSafe;

  tip.style.left = `${left - markerRect.left}px`;
  tip.style.top = `${top - markerRect.top}px`;
}

export default function FerryMap({
  ports,
  routes,
  visibleRouteIds,
  fleetVisibleRouteIds = visibleRouteIds,
  hoverVesselId = null,
  hoverShipIds = [],
  hoverPortId = null,
  dateActiveRouteIds,
  focusRouteIds,
  selection,
  highlightedPortIds,
  fitPortIds = [],
  hoverRouteId = null,
  vesselCards = {},
  fleet = [],
  selectedVesselId = null,
  portMeta,
  onSelect,
  onOpenPanel,
  onMapInteract,
  mobileBottomInset = 0,
  desktopLeftInset = 420,
  desktopRightInset = 0,
  mobileTopInset = 0,
  focusTarget = null,
  itineraryPreview = null,
  portsPulseKey = 0,
  portsMode = false,
  companyFocusShips = [],
  focusShipId = null,
}: FerryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const itineraryCameraRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const portMarkersRef = useRef<Map<string, Marker>>(new Map());
  // Les lignes affichées, pour poser leurs durées à l'écart des navires.
  const routeFeaturesRef = useRef<ReturnType<typeof routeFeatures>>([]);
  const redrawFleetRef = useRef<(() => void) | null>(null);
  const lastDurations = useRef("");
  const selectRef = useRef(onSelect);
  const vesselCardsRef = useRef(vesselCards);
  vesselCardsRef.current = vesselCards;
  const interactRef = useRef(onMapInteract);
  const dismissedPortIdsRef = useRef<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);
  const [mapViewportKey, setMapViewportKey] = useState("");
  const vesselPopupRef = useRef<Popup | null>(null);
  const fleetPickerRef = useRef<Popup | null>(null);
  // Efface la fiche de survol d'un navire (appelé quand la souris passe sur un signalement).
  const clearShipHoverRef = useRef<() => void>(() => {});
  const pickFleetRef = useRef<((point: [number, number], portDistance?: number) => boolean) | null>(
    null,
  );
  const fleetRef = useRef<FleetShip[]>(fleet);
  const vesselAlertsNow = useVesselAlerts();
  const vesselAlertsRef = useRef(vesselAlertsNow);
  vesselAlertsRef.current = vesselAlertsNow;
  const lastFleetFrame = useRef<{ source: GeoJSONSource; data: FleetFrame } | null>(null);
  fleetRef.current = fleet;
  const vesselImagesRef = useRef<ReturnType<typeof addVesselImages> | null>(null);

  selectRef.current = onSelect;
  interactRef.current = onMapInteract;
  useTravelMarkers(mapRef, mapReady, ports, fleet, onSelect, onOpenPanel, () =>
    clearShipHoverRef.current(),
  );
  usePresenceMarkers(mapRef, mapReady, ports, fleet, onSelect, onOpenPanel);
  useMyTripMarker(mapRef, mapReady, fleet, onSelect, onOpenPanel);
  const isMobile = useIsMobile();
  // Une bulle des salons à la fois ; jamais quand une fiche ou un trajet occupe l'écran.
  useChatBubbles(
    mapRef,
    mapReady,
    fleet,
    ports,
    routes,
    Boolean(selection || itineraryPreview || (isMobile && mobileBottomInset > 260)),
    onSelect,
  );
  // Mobile : un tap sur un port n'ouvre que la bulle ; le volet s'ouvre via « Voir la fiche du port ».
  const [tipPortId, setTipPortId] = useState<string | null>(null);
  const hasFocus = focusRouteIds.length > 0;

  // Zone utile de la carte : ce qui n'est caché ni par le volet, ni par le tiroir, ni par l'en-tête.
  const insetsRef = useRef({
    isMobile,
    mobileBottomInset,
    desktopLeftInset,
    desktopRightInset,
    mobileTopInset,
  });
  insetsRef.current = {
    isMobile,
    mobileBottomInset,
    desktopLeftInset,
    desktopRightInset,
    mobileTopInset,
  };
  const viewPadding = () => {
    const {
      isMobile: mobile,
      mobileBottomInset: bottom,
      desktopLeftInset: left,
      desktopRightInset: right,
      mobileTopInset: top,
    } = insetsRef.current;
    if (mobile) return { top: 88 + top, right: 16, bottom: bottom + 12, left: 16 };
    // Sur ordinateur, la zone utile commence après le volet. Sur une fenêtre étroite, on garde
    // au moins 45 % de la largeur pour la carte afin que le trajet reste lisible.
    const width = containerRef.current?.clientWidth ?? 1200;
    return {
      top: 120,
      right: 60 + right,
      bottom: 60,
      left: Math.min(left + 36, Math.round(width * 0.56)),
    };
  };
  useJourneyFilm(
    mapRef,
    containerRef,
    mapReady,
    viewPadding,
    LIMIT_BOUNDS,
    () =>
      mapRef.current?.easeTo({
        center: [4, 39],
        zoom: 4.2,
        pitch: 0,
        padding: viewPadding(),
        duration: cameraDuration(700),
      }),
    Boolean(itineraryPreview),
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = new MapLibreMap({
      container,
      style: MAP_STYLE,
      bounds:
        typeof window !== "undefined" && window.innerWidth >= 768
          ? DESKTOP_OVERVIEW_BOUNDS
          : OVERVIEW_BOUNDS,
      fitBoundsOptions: { padding: viewPadding() },
      // La carte est physiquement cantonnée à la Méditerranée occidentale :
      // impossible de faire glisser hors de cette zone.
      maxBounds: LIMIT_BOUNDS,
      // Limite de dézoom (relevée, puis ajustée d'après la zone visible).
      minZoom: minZoomFloor(),
      maxZoom: 11,
      // À plat de loin pour lire les lignes ; l'inclinaison vient avec le zoom (pitchForZoom).
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      attributionControl: false,
      // Les noms du fond de carte ne doivent pas masquer un navire sélectionné.
      crossSourceCollisions: false,
      fadeDuration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
      cooperativeGestures: false,
      dragPan: true,
      touchPitch: false,
      scrollZoom: true,
    });
    map.touchZoomRotate.disableRotation();

    // Crédits OpenFreeMap / OpenStreetMap affichés dans la légende (bouton « i » unique).

    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    const resize = () =>
      requestAnimationFrame(() => {
        mapRef.current?.resize();
        setMapViewportKey(`${container.clientWidth}x${container.clientHeight}`);
      });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    window.addEventListener("resize", resize);

    map.on("moveend", () => {
      // Le film du trajet pilote lui-même l'inclinaison.
      if (container.dataset["film"] || container.dataset["picking"]) return;
      const pitch = pitchForZoom(map.getZoom());
      if (Math.abs(map.getPitch() - pitch) > 1.5)
        map.easeTo({ pitch, duration: cameraDuration(450) });
    });

    const handleMapInteraction = () => interactRef.current?.();
    map.on("dragstart", handleMapInteraction);
    // À faible zoom, les libellés des petits ports se masquent pour éviter les chevauchements.
    const updateZoomState = () => {
      container.dataset["lowZoom"] = String(map.getZoom() < 5.2);
      container.dataset["midZoom"] = String(map.getZoom() >= 5.2 && map.getZoom() < 7);
      // De près, le point du port devient un phare.
      container.dataset["nearZoom"] = String(map.getZoom() >= 7);
      // De près, le nom d'un navire ne s'efface plus devant les lignes.
      if (map.getLayer("fleet-labels")) {
        const near = map.getZoom() >= 7;
        map.setLayoutProperty("fleet-labels", "text-allow-overlap", near);
        map.setLayoutProperty("fleet-labels", "text-ignore-placement", near);
      }
    };
    updateZoomState();
    map.on("zoom", updateZoomState);

    map.on("error", (e) => console.error("MAP ERROR", e.error?.message ?? e.error));
    map.on("load", () => {
      // Fond maritime calme : les ports et les traversées portent la hiérarchie.
      for (const layer of map.getStyle().layers) {
        if (layer.type === "background")
          map.setPaintProperty(layer.id, "background-color", "#f6f2ea");
        if (layer.type === "fill") {
          map.setPaintProperty(
            layer.id,
            "fill-color",
            /water/.test(layer.id) ? "#e5eff0" : "#f6f2ea",
          );
        }
        if (
          layer.type === "raster" ||
          /hillshade|landcover|landuse|building|road|highway|bridge|tunnel|aeroway|airport|poi|railway|peak/.test(
            layer.id,
          )
        ) {
          map.setLayoutProperty(layer.id, "visibility", "none");
        }
        if (layer.type === "symbol" && /label_country|water_name/.test(layer.id)) {
          map.setPaintProperty(layer.id, "text-color", "#627d8a");
          map.setPaintProperty(layer.id, "text-halo-color", "#f6f2ea");
        }
      }
      // Les ports sont étiquetés par BledWay ; on masque les villes, régions et rivières du fond de carte.
      [
        "label_other",
        "label_village",
        "label_town",
        "label_city",
        "label_city_capital",
        "label_state",
        "waterway_line_label",
      ].forEach(
        (layerId) => {
          if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
        },
      );
      // Les noms de pays et de mers restent visibles, en français quand la traduction existe.
      map.getStyle().layers.forEach((layer) => {
        if (layer.type !== "symbol" || !/^(label_country|water_name)/.test(layer.id)) return;
        map.setLayoutProperty(layer.id, "text-field", [
          "coalesce",
          ["get", "name:fr"],
          ["get", "name_int"],
          ["get", "name"],
        ]);
      });
      // Andorre masquée ; « Espagne » remontée vers l'Atlantique pour dégager les ports méditerranéens.
      let countryFont: unknown;
      map.getStyle().layers.forEach((layer) => {
        if (layer.type !== "symbol" || !/^label_country/.test(layer.id)) return;
        countryFont ??= map.getLayoutProperty(layer.id, "text-font");
        // Seuls les pays qui bordent la mer restent nommés : la carte est celle des traversées.
        const hide = [
          "all",
          ["!", ["in", ["get", "name"], ["literal", ["España", "Andorra"]]]],
          ["!", ["in", ["get", "iso_a2"], ["literal", INLAND_COUNTRIES]]],
          // Certaines tuiles n'ont pas le code pays : on reconnaît aussi le nom anglais.
          ["!", ["in", ["get", "name:en"], ["literal", INLAND_COUNTRY_NAMES]]],
        ];
        const current = map.getFilter(layer.id);
        map.setFilter(layer.id, (current ? ["all", current, hide] : hide) as never);
      });
      map.addSource("bw-country-spain", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [-5.6, 41.9] },
        },
      });
      map.addLayer({
        id: "bw-country-spain",
        type: "symbol",
        source: "bw-country-spain",
        layout: {
          "text-field": "Espagne",
          "text-size": 15,
          "text-letter-spacing": 0.05,
          ...(countryFont ? { "text-font": countryFont as string[] } : {}),
        },
        paint: { "text-color": "#627d8a", "text-halo-color": "#f6f2ea", "text-halo-width": 1.2 },
      });

      map.addSource("algeria-highlight", { type: "geojson", data: algeriaGeoJson });
      map.addLayer({
        id: "algeria-highlight-fill",
        type: "fill",
        source: "algeria-highlight",
        paint: {
          "fill-color": mapColor("--map-country-highlight", "rgb(250, 245, 225)"),
          "fill-opacity": 0.28,
        },
      });
      map.addLayer({
        id: "algeria-highlight-outline",
        type: "line",
        source: "algeria-highlight",
        paint: {
          "line-color": mapColor("--map-country-outline", "rgb(120, 140, 150)"),
          "line-width": 1.2,
          "line-opacity": 0.6,
        },
      });

      map.addSource("ferry-routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "ferry-routes-glow",
        type: "line",
        source: "ferry-routes",
        filter: ["any", ["get", "selected"], ["get", "focused"]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "case",
            ["get", "selected"],
            mapColor("--map-route-selected", "rgb(214, 90, 60)"),
            ["get", "color"],
          ],
          "line-width": ["case", ["get", "selected"], 16, 11],
          "line-blur": 5,
          "line-opacity": ["case", ["get", "selected"], 0.45, 0.3],
        },
      });
      map.addLayer({
        id: "ferry-routes-casing",
        type: "line",
        source: "ferry-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": mapColor("--map-route-casing", "rgb(255, 255, 255)"),
          // De loin, les lignes s'effacent devant les navires et les ports.
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            ROUTES_FAR_ZOOM,
            ["case", ["get", "selected"], 5, ["get", "focused"], 3.6, 1.6],
            ROUTES_NEAR_ZOOM,
            [
              "case",
              ["get", "selected"],
              6,
              ["interpolate", ["linear"], ["get", "lineCount"], 1, 3, 5, 3.6, 20, 4.6],
            ],
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            ROUTES_FAR_ZOOM,
            ["case", ["any", ["get", "selected"], ["get", "focused"]], 0.85, 0.3],
            ROUTES_NEAR_ZOOM,
            ["case", ["get", "dateDimmed"], 0.25, ["get", "dimmed"], 0.15, 0.85],
          ],
        },
      });
      map.addLayer({
        id: "ferry-routes-line",
        type: "line",
        source: "ferry-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "case",
            ["get", "selected"],
            mapColor("--map-route-selected", "rgb(214, 90, 60)"),
            ["get", "dateDimmed"],
            "#627d8a",
            ["get", "color"],
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            ROUTES_FAR_ZOOM,
            [
              "case",
              ["get", "selected"],
              3.2,
              ["get", "focused"],
              2.4,
              ["interpolate", ["linear"], ["get", "lineCount"], 1, 0.7, 20, 1.3],
            ],
            ROUTES_NEAR_ZOOM,
            [
              "case",
              ["get", "selected"],
              4,
              ["get", "focused"],
              3.2,
              ["interpolate", ["linear"], ["get", "lineCount"], 1, 1.4, 5, 1.8, 10, 2.2, 20, 2.8],
            ],
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            ROUTES_FAR_ZOOM,
            [
              "case",
              ["any", ["get", "selected"], ["get", "focused"]],
              1,
              ["get", "dateDimmed"],
              0.28,
              ["get", "dimmed"],
              0.14,
              0.5,
            ],
            ROUTES_NEAR_ZOOM,
            ["case", ["get", "dateDimmed"], 0.45, ["get", "dimmed"], 0.18, 1],
          ],
          // Seules les lignes sans départ à la date choisie sont en pointillés (voir la légende).
          "line-dasharray": [
            "case",
            ["get", "dateDimmed"],
            ["literal", [2, 2]],
            ["literal", [1, 0]],
          ],
        },
      });
      // Une durée par ligne, posée par BledWay à la place libre la plus proche du milieu du tracé.
      map.addSource("route-durations", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "ferry-routes-duration",
        type: "symbol",
        source: "route-durations",
        minzoom: 5,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": DURATION_SIZE,
          // Les durées suivent l’orientation réelle des lignes pour rester discrètes et lisibles.
          "text-rotate": ["get", "angle"],
          "text-rotation-alignment": "viewport",
          "text-pitch-alignment": "viewport",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#1e3a4c",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2.2,
          "text-opacity": ["case", ["get", "dimmed"], 0, 1],
        },
      });

      // Les coques restent toujours visibles ; seuls les noms évitent les collisions.
      addShipImages(map);
      map.addSource("fleet", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "fleet-halo",
        type: "circle",
        source: "fleet",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            19.5,
            5,
            22,
            7,
            24.5,
            9,
            27.5,
            11,
            31.5,
            13,
            35,
            15,
            38,
          ],
          "circle-color": ["get", "haloColor"],
          "circle-opacity": ["get", "haloOpacity"],
          "circle-blur": 0.6,
        },
      });
      map.addLayer({
        id: "fleet-ships",
        type: "symbol",
        source: "fleet",
        layout: {
          "icon-image": ["get", "icon"],
          // Jeton rond, ferry de profil : il reste droit ; la flèche de cap tourne à part.
          "icon-rotation-alignment": "viewport",
          "icon-pitch-alignment": "viewport",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-padding": 0,
          // De 32 px en vue large à 80 px au zoom fort.
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            0.5,
            5,
            0.6,
            7,
            0.7,
            9,
            0.82,
            11,
            0.98,
            13,
            1.12,
            15,
            1.24,
          ],
          "symbol-sort-key": ["-", 5, ["get", "priority"]],
        },
        paint: {
          "icon-opacity": ["get", "opacity"],
          "icon-opacity-transition": { duration: 200 },
        },
      });
      vesselImagesRef.current = addVesselImages(map, MAP_VESSELS);
      for (const { width, minzoom, maxzoom } of VESSEL_IMAGE_STEPS)
        map.addLayer({
          id: `fleet-photo-${width}`,
          type: "symbol",
          source: "fleet",
          minzoom,
          maxzoom,
          filter: ["!=", ["get", "photo"], ""],
          layout: {
            "icon-image": ["concat", "vessel-", ["get", "photo"], `-${width}`],
            "icon-anchor": "bottom",
            "icon-rotation-alignment": "viewport",
            "icon-pitch-alignment": "viewport",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              ...VESSEL_SCREEN_WIDTH.map((value, index) => (index % 2 ? value / width : value)),
            ] as never,
            "symbol-sort-key": ["-", 5, ["get", "priority"]],
          },
          paint: { "icon-opacity": ["get", "photoOpacity"] },
        });
      map.addLayer({
        id: "fleet-heading",
        type: "symbol",
        source: "fleet",
        filter: ["all", ["==", ["get", "state"], "sea"], ["==", ["get", "photo"], ""]],
        layout: {
          "icon-image": "ship-heading",
          "icon-rotation-alignment": "map",
          "icon-rotate": ["get", "course"],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            0.5,
            5,
            0.6,
            7,
            0.7,
            9,
            0.82,
            11,
            0.98,
            13,
            1.12,
            15,
            1.24,
          ],
        },
        paint: { "icon-opacity": ["get", "photoOpacity"] },
      });
      map.addLayer({
        id: "fleet-alert",
        type: "symbol",
        source: "fleet",
        filter: ["==", ["get", "alert"], 1],
        // Un petit « ! » rouge au coin du navire ; le motif s'affiche au survol.
        layout: {
          "icon-image": "ship-alert",
          // Discret de loin, à la taille du navire de près.
          "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 5, 0.6, 7, 0.8, 9, 1] as never,
          "icon-offset": ["interpolate", ["linear"], ["zoom"], 3, ["case", ["==", ["get", "photo"], ""], ["literal", [14, -14]], ["literal", [18, -18]]], 5, ["case", ["==", ["get", "photo"], ""], ["literal", [12, -12]], ["literal", [22, -22]]], 6, ["case", ["==", ["get", "photo"], ""], ["literal", [10, -10]], ["literal", [27, -27]]], 7, ["case", ["==", ["get", "photo"], ""], ["literal", [9, -9]], ["literal", [44, -44]]], 9, ["case", ["==", ["get", "photo"], ""], ["literal", [7, -7]], ["literal", [71, -71]]], 11, ["case", ["==", ["get", "photo"], ""], ["literal", [7, -7]], ["literal", [134, -134]]], 13, ["case", ["==", ["get", "photo"], ""], ["literal", [7, -7]], ["literal", [202, -202]]]] as never,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: { "icon-opacity": ["get", "photoOpacity"] },
      });
      map.addLayer({
        id: "fleet-labels",
        type: "symbol",
        source: "fleet",
        layout: {
          "symbol-sort-key": ["get", "priority"],
          // Le nom, et le retard dès que le navire est assez grand pour être lu.
          "text-field": [
            "step",
            ["zoom"],
            ["get", "name"],
            6.5,
            [
              "format",
              ["get", "name"],
              {},
              ["case", ["==", ["get", "late"], ""], "", "\n"],
              {},
              ["get", "late"],
              { "text-color": "#b45309", "font-scale": 1.05 },
            ],
          ] as never,
          "text-font": ["Noto Sans Bold"],
          // Le nom grandit avec le navire : discret de loin, lisible de près.
          "text-size": ["interpolate", ["linear"], ["zoom"], ...LABEL_SIZE_STOPS] as never,
          // Collé à la coque, du côté libre : sous le navire, sinon au-dessus, à droite ou à gauche.
          "text-anchor": ["coalesce", ["get", "labelAnchor"], "top"] as never,
          "text-offset": ["coalesce", ["get", "labelOffset"], ["literal", [0, 0.3]]] as never,
          "text-pitch-alignment": "viewport",
          "text-rotation-alignment": "viewport",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-max-width": 12,
          "text-padding": 5,
        },
        paint: {
          "text-color": "#234b5e",
          "text-halo-color": "#fffefb",
          "text-halo-width": 1.8,
          "text-halo-blur": 0.4,
          "text-opacity": ["get", "photoOpacity"],
        },
      });
      map.addLayer({
        id: "fleet-count-bg",
        type: "circle",
        source: "fleet",
        filter: [">", ["get", "groupCount"], 1],
        paint: {
          "circle-radius": 9,
          "circle-color": "#0e7a43",
          "circle-stroke-color": "#fffefb",
          "circle-stroke-width": 1.5,
          "circle-translate": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            ["literal", [9.5, -9.5]],
            9,
            ["literal", [15.5, -15.5]],
            13,
            ["literal", [21, -21]],
            15,
            ["literal", [23, -23]],
          ],
          "circle-translate-anchor": "viewport",
        },
      });
      map.addLayer({
        id: "fleet-count",
        type: "symbol",
        source: "fleet",
        filter: [">", ["get", "groupCount"], 1],
        layout: {
          "text-field": ["to-string", ["get", "groupCount"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": 10,
          "text-offset": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            ["literal", [0.95, -0.95]],
            9,
            ["literal", [1.55, -1.55]],
            13,
            ["literal", [2.1, -2.1]],
            15,
            ["literal", [2.3, -2.3]],
          ],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#fffefb" },
      });
      // The hover card stays readable above the map, without enlarged text or rocking.
      const NO_SHIP = ["==", ["get", "shipId"], "__aucun__"] as never;
      map.addLayer({
        id: "fleet-hover-halo",
        type: "circle",
        source: "fleet",
        filter: NO_SHIP,
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            24,
            6,
            28,
            9,
            32,
            13,
            40,
            15,
            43,
          ],
          "circle-color": "#0e7a43",
          "circle-opacity": 0.18,
          "circle-blur": 0.6,
        },
      });
      const hoverTip = new Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 24,
        maxWidth: "240px",
        className: "bw-vessel-tooltip",
      });
      vesselPopupRef.current = hoverTip;
      let hoveredShip: string | null = null;
      // La carte affichée : celle du navire, ou celle de son alerte quand on survole le « ! ».
      let shownCard: string | null = null;
      const setHoveredShip = (id: string | null) => {
        hoveredShip = id;
        if (!id) shownCard = null;
        map.setFilter("fleet-hover-halo", id ? (["==", ["get", "shipId"], id] as never) : NO_SHIP);
        if (!id) hoverTip.remove();
      };
      clearShipHoverRef.current = () => {
        setHoveredShip(null);
        map.getCanvas().style.cursor = "";
      };
      const fleetLayers = [
        "fleet-ships",
        ...VESSEL_IMAGE_STEPS.map(({ width }) => `fleet-photo-${width}`),
        "fleet-labels",
        "fleet-alert",
        "fleet-count-bg",
        "fleet-count",
      ];
      type FleetPickEvent = {
        features?: MapLayerMouseEvent["features"];
        point: { x: number; y: number };
      };
      const closestShip = (event: FleetPickEvent) => {
        const features = event.features ?? [];
        const badge = features.find(
          (f) => f.layer.id === "fleet-count" || f.layer.id === "fleet-count-bg",
        );
        if (badge) return badge;
        const labels = features.filter((f) => f.layer.id === "fleet-labels");
        return (labels.length ? labels : features)
          .filter((f) => f.geometry.type === "Point")
          .sort((a, b) => {
            const pointA = map.project(
              (a.geometry as { coordinates: [number, number] }).coordinates,
            );
            const pointB = map.project(
              (b.geometry as { coordinates: [number, number] }).coordinates,
            );
            return (
              Math.hypot(pointA.x - event.point.x, pointA.y - event.point.y) -
              Math.hypot(pointB.x - event.point.x, pointB.y - event.point.y)
            );
          })[0];
      };
      const membersOf = (groupId: unknown) =>
        lastFleetFrame.current?.data.features.filter((f) => f.properties["groupId"] === groupId) ??
        [];
      const selectShip = (properties: Record<string, unknown>) => {
        fleetPickerRef.current?.remove();
        interactRef.current?.("vessel");
        const vesselId = properties["vesselId"],
          departureId = properties["departureId"];
        if (typeof vesselId === "string" && vesselId)
          selectRef.current({ type: "vessel", id: vesselId });
        else if (typeof departureId === "string")
          selectRef.current({ type: "departure", id: departureId });
      };
      map.on("mousemove", fleetLayers, (event) => {
        if (fleetPickerRef.current?.isOpen()) return;
        const feature = closestShip(event);
        const id = feature?.properties?.["shipId"];
        if (!feature || feature.geometry.type !== "Point" || typeof id !== "string") {
          setHoveredShip(null);
          return;
        }
        const coordinates = feature.geometry.coordinates as [number, number];
        const alertHit = (event.features ?? []).find((f) => f.layer.id === "fleet-alert");
        const alert = alertHit
          ? vesselAlertsRef.current.get(String(alertHit.properties?.["vesselId"] ?? ""))
          : undefined;
        const cardKey = alert ? `alert:${id}` : id;
        if (alert && cardKey !== shownCard) {
          // Le « ! » : la raison en bref, la source, et le détail d'un clic.
          if (id !== hoveredShip) setHoveredShip(id);
          shownCard = cardKey;
          const card = document.createElement("div");
          card.setAttribute("role", "tooltip");
          card.className = "bw-alert-tip";
          const title = document.createElement("strong");
          title.textContent = `${String(alertHit!.properties?.["name"] ?? "Navire")} · ${alert.label}`;
          const note = document.createElement("p");
          const text = (alert.note || alert.title).trim();
          note.textContent = text.length > 170 ? `${text.slice(0, 167).trimEnd()}…` : text;
          const foot = document.createElement("small");
          foot.textContent = `${alert.source ? `Source : ${alert.source} · ` : ""}cliquez pour le détail`;
          card.append(title, ...(text ? [note] : []), foot);
          hoverTip.setLngLat(coordinates).setDOMContent(card).addTo(map);
        } else if (!alert && cardKey !== shownCard) {
          setHoveredShip(id);
          shownCard = cardKey;
          const card = document.createElement("div");
          card.setAttribute("role", "tooltip");
          const name = document.createElement("strong"),
            status = document.createElement("p");
          const members = membersOf(feature.properties["groupId"]);
          name.textContent =
            members.length > 1
              ? `${members.length} navires à proximité`
              : String(feature.properties["name"] ?? "Navire");
          status.textContent =
            members.length > 1
              ? members.map((f) => f.properties["name"]).join(" · ")
              : String(feature.properties["allure"] ?? "");
          if (members.length <= 1) {
            // Médaillon compact : logo rond, nom du navire, puce d'allure.
            const info = vesselCardsRef.current[String(feature.properties["vesselId"] ?? "")];
            const moving = feature.properties["icon"] !== "ship-dock";
            card.className = "flex items-center gap-2 pr-1";
            const badge = document.createElement("span");
            badge.className =
              "grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-card ring-1 ring-border";
            if (info?.logoUrl) {
              const logo = document.createElement("img");
              logo.src = info.logoUrl;
              logo.alt = info.companyName ?? "";
              logo.className = "h-7 w-7 object-contain";
              badge.append(logo);
            } else badge.textContent = "⛴";
            const text = document.createElement("div");
            text.className = "min-w-0 leading-tight";
            name.className = "block text-sm";
            status.className = "flex items-center gap-1.5 text-xs text-muted-foreground";
            const dot = document.createElement("i");
            dot.className = `inline-block h-2 w-2 rounded-full ${moving ? "bg-destructive animate-pulse" : "bg-muted-foreground"}`;
            status.prepend(dot);
            if (info?.companyName) {
              const company = document.createElement("span");
              company.textContent = info.companyName;
              company.className = "block text-[11px] font-semibold text-muted-foreground";
              text.append(name, company, status);
            } else text.append(name, status);
            if (info?.photoUrl) {
              // Photo du navire au-dessus de son identité.
              card.className = "flex w-56 flex-col gap-2";
              const photo = document.createElement("img");
              photo.src = info.photoUrl;
              photo.alt = String(feature.properties["name"] ?? "");
              photo.className = "h-28 w-full rounded-lg object-contain bg-white p-1";
              const row = document.createElement("div");
              row.className = "flex items-center gap-2 pr-1";
              row.append(badge, text);
              card.append(photo, row);
            } else card.append(badge, text);
          } else card.append(name, status);
          hoverTip.setLngLat(coordinates).setDOMContent(card).addTo(map);
        } else hoverTip.setLngLat(coordinates);
        bringTooltipToFront(hoverTip.getElement());
      });
      map.on("mouseleave", fleetLayers, () => setHoveredShip(null));
      const closeFleetPopups = () => {
        setHoveredShip(null);
        fleetPickerRef.current?.remove();
      };
      map.on("dragstart", closeFleetPopups);
      map.on("zoomstart", closeFleetPopups);
      map.on("resize", closeFleetPopups);
      const pickFleet = (event: FleetPickEvent) => {
        setHoveredShip(null);
        setTipPortId(null);
        const feature = closestShip(event);
        if (!feature || feature.geometry.type !== "Point") return;
        const members = membersOf(feature.properties["groupId"]);
        if (members.length < 2) {
          selectShip(feature.properties);
          return;
        }
        fleetPickerRef.current?.remove();
        const card = document.createElement("div");
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-label", "Choisir un bateau");
        card.className = "min-w-48 space-y-1 p-1";
        const heading = document.createElement("strong");
        heading.textContent = `${members.length} navires à proximité`;
        heading.className = "mb-2 block pr-4 text-sm";
        card.append(heading);
        for (const member of members) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = String(member.properties["name"]);
          button.className =
            "block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary";
          button.addEventListener("click", (e) => {
            e.stopPropagation();
            selectShip(member.properties);
          });
          card.append(button);
        }
        fleetPickerRef.current = new Popup({
          closeButton: true,
          closeOnClick: true,
          className: "bw-fleet-picker",
          focusAfterOpen: false,
          anchor: "bottom",
          offset: 20,
          maxWidth: "280px",
        })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setDOMContent(card)
          .addTo(map);
        requestAnimationFrame(() => {
          const popup = fleetPickerRef.current;
          if (!popup?.isOpen()) return;
          const element = popup.getElement();
          bringTooltipToFront(element);
          const bounds = container.getBoundingClientRect();
          const insets = insetsRef.current;
          const left =
            bounds.left +
            (insets.isMobile ? 8 : Math.min(insets.desktopLeftInset, bounds.width * 0.56) + 8);
          const right = Math.min(window.innerWidth - 8, bounds.right - 8);
          const headerBottom =
            document.querySelector(".bw-home > .bw-header")?.getBoundingClientRect().bottom ?? 0;
          const top = Math.max(8, bounds.top + 8, headerBottom + 8);
          const bottom = Math.min(
            window.innerHeight - 8,
            bounds.bottom - (insets.isMobile ? insets.mobileBottomInset : 0) - 8,
          );
          element.style.maxWidth = `${Math.max(160, Math.min(280, right - left))}px`;
          card.style.maxHeight = `${Math.max(70, bottom - top - 40)}px`;
          const rect = element.getBoundingClientRect();
          element.style.marginLeft = `${rect.left < left ? left - rect.left : rect.right > right ? right - rect.right : 0}px`;
          element.style.marginTop = `${rect.top < top ? top - rect.top : rect.bottom > bottom ? bottom - rect.bottom : 0}px`;
          card.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
        });
      };
      map.on("click", fleetLayers, pickFleet);
      pickFleetRef.current = (point, portDistance = 8) => {
        // Zone de toucher élargie : un navire à quai se sélectionne même avec un doigt approximatif.
        const r = 24;
        const features = map.queryRenderedFeatures(
          [
            [point[0] - r, point[1] - r],
            [point[0] + r, point[1] + r],
          ],
          { layers: fleetLayers },
        );
        const event = { features, point: { x: point[0], y: point[1] } };
        const feature = closestShip(event);
        if (!feature || feature.geometry.type !== "Point") return false;
        const center = map.project(feature.geometry.coordinates as [number, number]);
        const badge = feature.layer.id === "fleet-count" || feature.layer.id === "fleet-count-bg";
        const shipDistance = Math.hypot(center.x - point[0], center.y - point[1]);
        // Le navire à quai a la priorité ; seul un toucher pile sur le point du port ouvre le port.
        const onPortDot = portDistance < 5 && shipDistance > portDistance + 6;
        if (!badge && (shipDistance > 30 || onPortDot)) return false;
        setTipPortId(null);
        pickFleet(event);
        return true;
      };
      map.on("mouseenter", fleetLayers, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", fleetLayers, () => {
        map.getCanvas().style.cursor = "";
      });

      const pickRoute = (event: MapLayerMouseEvent) => {
        // Un navire posé sur la ligne a la priorité : le clic ouvre le navire, pas la ligne.
        if (map.queryRenderedFeatures(event.point, { layers: fleetLayers }).length > 0) return;
        const id = event.features?.[0]?.properties?.["id"];
        if (typeof id !== "string") return;
        interactRef.current?.("route");
        // Cliquer une ligne la sélectionne, sans modifier les filtres de recherche.
        selectRef.current({ type: "route", id });
      };

      map.on("click", "ferry-routes-line", pickRoute);
      map.on("click", "ferry-routes-duration", pickRoute);
      map.on("mouseenter", "ferry-routes-line", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "ferry-routes-line", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", (event: MapMouseEvent) => {
        // Un clic sur un port ou sa bulle est géré par le marqueur lui-même.
        const target = event.originalEvent?.target;
        if (target instanceof Element && target.closest(".port-marker")) return;
        const hits = map.queryRenderedFeatures(event.point, {
          layers: ["ferry-routes-line", "ferry-routes-duration", ...fleetLayers],
        });
        if (hits.length === 0) {
          setTipPortId(null);
          selectRef.current(null);
        }
      });

      readyRef.current = true;
      setMapReady(true);
      requestAnimationFrame(() => map.resize());
    });

    return () => {
      map.off("dragstart", handleMapInteraction);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      vesselPopupRef.current?.remove();
      fleetPickerRef.current?.remove();
      pickFleetRef.current = null;
      vesselPopupRef.current = null;
      readyRef.current = false;
      setMapReady(false);
      portMarkersRef.current.forEach((marker) => marker.remove());
      portMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Surcouche de l'itinéraire porte à porte : route, traversée et derniers kilomètres.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getSource("itinerary-preview")) {
      map.addSource("itinerary-preview", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      const before = map.getLayer("fleet-halo") ? "fleet-halo" : undefined;
      map.addLayer(
        {
          id: "itinerary-alternatives",
          type: "line",
          source: "itinerary-preview",
          filter: ["==", ["get", "kind"], "alternative"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#87969b", "line-width": 3, "line-opacity": 0.58 },
        },
        before,
      );
      map.addLayer(
        {
          id: "itinerary-road-casing",
          type: "line",
          source: "itinerary-preview",
          filter: ["==", ["get", "kind"], "road"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#fffdf8", "line-width": 7, "line-opacity": 0.92 },
        },
        before,
      );
      map.addLayer(
        {
          id: "itinerary-road",
          type: "line",
          source: "itinerary-preview",
          filter: ["==", ["get", "kind"], "road"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#1e5b7a", "line-width": 4, "line-dasharray": [2, 1.3] },
        },
        before,
      );
      map.addLayer(
        {
          id: "itinerary-estimate",
          type: "line",
          source: "itinerary-preview",
          filter: ["==", ["get", "kind"], "estimate"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#1e5b7a",
            "line-width": 3,
            "line-opacity": 0.7,
            "line-dasharray": [1, 2],
          },
        },
        before,
      );
      map.addLayer(
        {
          id: "itinerary-ferry-casing",
          type: "line",
          source: "itinerary-preview",
          filter: ["==", ["get", "kind"], "ferry"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#fffdf8", "line-width": 11 },
        },
        before,
      );
      map.addLayer(
        {
          id: "itinerary-ferry",
          type: "line",
          source: "itinerary-preview",
          filter: ["==", ["get", "kind"], "ferry"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0e7a43", "line-width": 6 },
        },
        before,
      );
      map.addLayer({
        id: "itinerary-ends",
        type: "circle",
        source: "itinerary-preview",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 8,
          "circle-color": "#0e7a43",
          "circle-stroke-color": "#fffdf8",
          "circle-stroke-width": 3,
        },
      });
      map.addLayer({
        id: "itinerary-end-labels",
        type: "symbol",
        source: "itinerary-preview",
        filter: ["==", ["geometry-type"], "Point"],
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-offset": [0, 1.8],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#16324a", "text-halo-color": "#fffdf8", "text-halo-width": 2 },
      });
    }
    const source = map.getSource("itinerary-preview") as GeoJSONSource;
    if (!itineraryPreview) {
      source.setData({ type: "FeatureCollection", features: [] });
      itineraryCameraRef.current = null;
      map.setMaxBounds(LIMIT_BOUNDS);
      return;
    }
    map.setMaxBounds(null);
    map.setMinZoom(1.5);
    // Les anciens cadrages du volet peuvent laisser un padding persistant dans MapLibre.
    // Le remettre à zéro avant de calculer la caméra évite de déporter l'itinéraire dans l'Atlantique.
    // Pendant le film, la caméra lui appartient : ce cadrage ne doit pas la reprendre.
    const filmPlaying = Boolean(containerRef.current?.dataset["film"]);
    if (!filmPlaying) map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
    const preview = itineraryPreview;
    source.setData({
      type: "FeatureCollection",
      features: [
        ...preview.alternatives.map((coordinates) => ({
          type: "Feature" as const,
          properties: { kind: "alternative" },
          geometry: { type: "LineString" as const, coordinates },
        })),
        {
          type: "Feature" as const,
          properties: { kind: preview.roadDetailed ? "road" : "estimate" },
          geometry: { type: "LineString" as const, coordinates: preview.roadToPort },
        },
        {
          type: "Feature",
          properties: { kind: "ferry" },
          geometry: { type: "LineString", coordinates: preview.ferry },
        },
        {
          type: "Feature" as const,
          properties: { kind: preview.roadDetailed ? "road" : "estimate" },
          geometry: { type: "LineString" as const, coordinates: preview.roadFromPort },
        },
        {
          type: "Feature",
          properties: { label: "Départ" },
          geometry: { type: "Point", coordinates: preview.origin },
        },
        {
          type: "Feature",
          properties: { label: "Destination" },
          geometry: { type: "Point", coordinates: preview.destination },
        },
      ],
    });
    if (preview.fit === false) return;
    const basePadding = viewPadding();
    // Sur mobile, le trajet doit tenir dans la moitié haute laissée libre par le volet :
    // marges serrées pour garder tout le trajet lisible.
    const padding = insetsRef.current.isMobile
      ? {
          top: 44,
          right: 28,
          left: 28,
          bottom: insetsRef.current.mobileBottomInset + 10,
        }
      : basePadding;
    if (insetsRef.current.isMobile) {
      const floor = Math.max(1.5, map.getMinZoom() - 2);
      if (map.getMinZoom() > floor) map.setMinZoom(floor);
    }
    const width = containerRef.current?.clientWidth ?? 0;
    const height = containerRef.current?.clientHeight ?? 0;
    if (width - padding.left - padding.right < 100 || height - padding.top - padding.bottom < 100)
      return;
    const cameraFingerprint = `${preview.routeId}|${preview.origin.join(",")}|${preview.destination.join(",")}|${width}x${height}|${padding.left},${padding.right},${padding.top},${padding.bottom}`;
    if (itineraryCameraRef.current === cameraFingerprint) return;
    itineraryCameraRef.current = cameraFingerprint;
    // Les extrémités suffisent au cadrage : les points intermédiaires d'une géométrie
    // routière peuvent contenir un détour qui dézoomerait toute la carte.
    const points = [
      preview.origin,
      preview.departurePort,
      preview.arrivalPort,
      preview.destination,
    ];
    const bounds: [[number, number], [number, number]] = [
      [
        Math.min(...points.map((point) => point[0])) - 0.15,
        Math.min(...points.map((point) => point[1])) - 0.15,
      ],
      [
        Math.max(...points.map((point) => point[0])) + 0.15,
        Math.max(...points.map((point) => point[1])) + 0.15,
      ],
    ];
    // Le centre géographique peut sortir de l'itinéraire avec un volet asymétrique :
    // c'est normal. MapLibre place alors le trajet dans la partie réellement visible.
    if (filmPlaying) return;
    map.fitBounds(bounds, {
      padding,
      maxZoom: 5.8,
      linear: true,
      duration: insetsRef.current.isMobile ? 0 : cameraDuration(700),
    });
  }, [
    itineraryPreview?.key,
    mapReady,
    mapViewportKey,
    isMobile,
    mobileBottomInset,
    desktopLeftInset,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ordinaryLayers = [
      "ferry-routes-glow",
      "ferry-routes-casing",
      "ferry-routes-line",
      "ferry-routes-duration",
      "fleet-halo",
      "fleet-ships",
      ...VESSEL_IMAGE_STEPS.map(({ width }) => `fleet-photo-${width}`),
      "fleet-labels",
      "fleet-count-bg",
      "fleet-count",
      "fleet-hover-halo",
    ];
    for (const id of ordinaryLayers) {
      if (map.getLayer(id))
        map.setLayoutProperty(
          id,
          "visibility",
          itineraryPreview
            ? "none"
            : id === "ferry-routes-duration" && isMobile && !hasFocus
              ? "none"
              : "visible",
        );
    }
  }, [itineraryPreview, isMobile, hasFocus, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || selection || itineraryPreview || portsMode) return;
    // Recalcule la limite de dézoom d'après la place réellement disponible (volet ou tiroir compris).
    const limit = map.cameraForBounds(LIMIT_BOUNDS, { padding: viewPadding() });
    if (limit?.zoom !== undefined)
      map.setMinZoom(Math.min(minZoomFloor(), Math.max(2.2, limit.zoom - 0.6)));
    const chosen = fitPortIds
      .map((id) => ports.find((port) => port.id === id))
      .filter((port): port is Port => Boolean(port));
    if (chosen.length > 0) {
      const lngs = chosen.map((port) => port.longitude);
      const lats = chosen.map((port) => port.latitude);
      // Les ports du trajet cherché plus leurs destinations directes donnent un cadrage utile.
      map.fitBounds(
        [
          [Math.min(...lngs) - 0.6, Math.min(...lats) - 0.6],
          [Math.max(...lngs) + 0.6, Math.max(...lats) + 0.6],
        ],
        { padding: viewPadding(), maxZoom: 6.2, duration: cameraDuration(800) },
      );
    } else {
      // Petit écran : on cadre les liaisons qui ont au moins une traversée programmée, pour ne pas
      // sacrifier les lignes les plus fréquentées à une ligne lointaine sans départ.
      const active = new Set(dateActiveRouteIds);
      const activePorts = isMobile
        ? routes
            .filter((route) => active.has(route.id))
            .flatMap((route) => [route.departure_port_id, route.arrival_port_id])
            .map((id) => ports.find((port) => port.id === id))
            .filter((port): port is Port => Boolean(port))
        : [];
      if (activePorts.length > 1) {
        const lngs = activePorts.map((port) => port.longitude);
        const lats = activePorts.map((port) => port.latitude);
        map.fitBounds(
          [
            [Math.min(...lngs) - 0.4, Math.min(...lats) - 0.4],
            [Math.max(...lngs) + 0.4, Math.max(...lats) + 0.4],
          ],
          { padding: viewPadding(), maxZoom: 6, duration: cameraDuration(600) },
        );
      } else {
        // On utilise un point central "Espagne - Algérie" (~ longitude 0, latitude 39)
        map.easeTo({
          center: [4, 39],
          zoom: !isMobile ? 4.2 : 3.6,
          padding: viewPadding(), // Le padding décale magiquement le centre vers la droite !
          duration: cameraDuration(600),
        });
      }
    }
  }, [
    isMobile,
    mapReady,
    mobileBottomInset,
    desktopLeftInset,
    fitPortIds.join("|"),
    selection?.type,
    selection?.id,
    dateActiveRouteIds.join("|"),
    ports.length,
    itineraryPreview?.key,
    portsMode,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const activeIds = new Set(highlightedPortIds);
    const dimming = highlightedPortIds.length > 0;
    const tipInset = () => (insetsRef.current.isMobile ? insetsRef.current.mobileBottomInset : 0);

    const repositionVisibleTips = () => {
      portMarkersRef.current.forEach((marker) => {
        const element = marker.getElement();
        const tip = element.querySelector<HTMLDivElement>(".port-tip");
        if (!tip) return;
        const visible = element.dataset["tip"] === "true";
        if (visible) positionPortTip(map, marker, tip, tipInset());
      });
    };

    // La bulle fermée à la main reste fermée tant que le même port est ouvert.
    if (selection?.type !== "port") dismissedPortIdsRef.current.clear();

    ports.forEach((port) => {
      const existing = portMarkersRef.current.get(port.id);
      let marker: Marker;
      if (existing) {
        marker = existing;
      } else {
        const el = document.createElement("div");
        el.className = "port-marker";
        el.style.setProperty("--port-color", "#16324a");

        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "port-marker__dot";
        dot.setAttribute("aria-label", `Port de ${port.name}`);
        // Le phare se dresse côté terre : au nord des ports européens, au sud des ports algériens.
        // Le nom du port, lui, se place à côté sans le couvrir.
        el.dataset["land"] = port.country_code === "DZ" ? "down" : "up";
        dot.innerHTML = LIGHTHOUSE_SVG;

        const label = document.createElement("span");
        label.className = "port-marker__label";
        label.textContent = port.name;

        const tip = document.createElement("div");
        tip.className = "port-tip";

        const close = document.createElement("button");
        close.type = "button";
        close.className = "port-tip__close";
        close.setAttribute("aria-label", "Fermer");
        close.textContent = "×";
        close.addEventListener("click", (event) => {
          event.stopPropagation();
          // Ferme uniquement la bulle ; le détail du port reste ouvert dans le volet.
          dismissedPortIdsRef.current.add(port.id);
          setTipPortId(null);
          el.dataset["tip"] = "false";
          tip.inert = true;
          tip.setAttribute("aria-hidden", "true");
          close.blur();
          dot.blur();
        });
        tip.append(close);

        el.append(dot, label, tip);

        const select = (event: Event) => {
          event.stopPropagation();
          // La cible tactile transparente d'un port ne doit pas intercepter une coque ou son compteur.
          if (
            event.currentTarget === dot &&
            event instanceof MouseEvent &&
            (event.clientX || event.clientY)
          ) {
            const bounds = map.getCanvas().getBoundingClientRect();
            const point: [number, number] = [
              event.clientX - bounds.left,
              event.clientY - bounds.top,
            ];
            const center = map.project([port.longitude, port.latitude]);
            if (pickFleetRef.current?.(point, Math.hypot(point[0] - center.x, point[1] - center.y)))
              return;
          }
          dismissedPortIdsRef.current.delete(port.id);
          interactRef.current?.(insetsRef.current.isMobile ? "port" : undefined);
          // Cliquer un port le sélectionne, sans modifier les filtres de recherche.
          // Mobile (façon Google Maps) : la fiche s'ouvre dans le tiroir, sans bulle flottante.
          setTipPortId(null);
          selectRef.current({ type: "port", id: port.id });
          if (!insetsRef.current.isMobile)
            requestAnimationFrame(() => positionPortTip(map, marker, tip, tipInset()));
        };

        dot.addEventListener("click", select);
        label.addEventListener("click", select);

        // Survol à la souris : la bulle s'affiche pour tous les ports (fermés ou sans ligne compris).
        el.addEventListener("pointerenter", (event) => {
          if (event.pointerType !== "mouse") return;
          bringTooltipToFront(el);
          el.dataset["hover"] = "true";
          tip.inert = false;
          tip.setAttribute("aria-hidden", "false");
          requestAnimationFrame(() => positionPortTip(map, marker, tip, tipInset()));
        });
        el.addEventListener("focusin", () => bringTooltipToFront(el));
        el.addEventListener("pointerleave", (event) => {
          if (event.pointerType !== "mouse") return;
          el.dataset["hover"] = "false";
          if (el.dataset["tip"] !== "true") {
            tip.inert = true;
            tip.setAttribute("aria-hidden", "true");
          }
        });

        marker = new Marker({ element: el }).setLngLat([port.longitude, port.latitude]).addTo(map);
        portMarkersRef.current.set(port.id, marker);
      }

      const element = marker.getElement();
      const label = element.querySelector<HTMLSpanElement>(".port-marker__label");
      const meta = portMeta[port.id];
      const routeCount = meta?.routes ?? 0;

      // Position de départ ; la carte la recale ensuite du côté libre, près du point.
      if (label && !label.dataset["side"]) Object.assign(label.style, getPortLabelStyle(port));

      element.dataset["active"] = String(activeIds.has(port.id));
      // L'infobulle n'est affichée que pour le port ouvert (pas pour les deux ports d'un trajet cherché).
      element.dataset["tip"] = String(
        (isMobile
          ? tipPortId === port.id
          : selection?.type === "port" && selection.id === port.id) &&
          !dismissedPortIdsRef.current.has(port.id),
      );
      element.dataset["dimmed"] = String(dimming && !activeIds.has(port.id));
      element.dataset["closed"] = String(port.status === "inactive");
      element.dataset["noroutes"] = String(
        port.status !== "inactive" &&
          (routeCount === 0 || (meta?.departureCount ?? 0) + (meta?.arrivalCount ?? 0) === 0),
      );
      // Les ports secondaires (une seule ligne, éventuellement dans les deux sens) ont un libellé plus discret, mais toujours lisible.
      element.dataset["minor"] = String(routeCount <= 2);
      marker.setLngLat([port.longitude, port.latitude]);

      const tip = element.querySelector<HTMLDivElement>(".port-tip");
      if (!tip) return;
      const tipVisible = element.dataset["tip"] === "true";
      tip.inert = !tipVisible;
      tip.setAttribute("aria-hidden", String(!tipVisible));
      tip.querySelectorAll(":scope > *:not(.port-tip__close)").forEach((child) => child.remove());

      const header = document.createElement("div");
      header.className = "port-tip__header";

      const title = document.createElement("p");
      title.className = "port-tip__title";
      title.textContent = port.name;
      header.append(title);

      const companyCount = meta?.companies?.length ?? 0;
      const country = port.country_name ?? "Pays non renseigné";
      const routeLabel = routeCount === 1 ? "1 ligne" : `${routeCount} lignes`;
      const companyLabel = companyCount === 1 ? "1 compagnie" : `${companyCount} compagnies`;

      const metaLine = document.createElement("p");
      metaLine.className = "port-tip__country";
      metaLine.textContent = `${country} · ${routeLabel} · ${companyLabel}`;
      header.append(metaLine);
      tip.append(header);

      if (port.status === "inactive") {
        const closed = document.createElement("p");
        closed.className = "port-tip__closed";
        closed.textContent = "Temporairement fermé";
        tip.append(closed);
      }

      const tabBar = document.createElement("div");
      tabBar.className = "port-tip__tabs";
      tabBar.setAttribute("role", "group");
      tabBar.setAttribute("aria-label", "Départs ou arrivées");
      Object.assign(tabBar.style, {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "4px",
        margin: isMobile ? "6px 0 4px" : "10px 0 8px",
        padding: isMobile ? "2px" : "4px",
        borderRadius: "12px",
        background: "rgba(127,127,127,.12)",
      });
      const makeTab = (label: string, count: number, active: boolean) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        const badge = document.createElement("span");
        badge.className = "port-tip__count";
        badge.textContent = String(count);
        button.append(badge);
        button.setAttribute("aria-label", `${label} : ${count}`);
        button.setAttribute("aria-pressed", String(active));
        Object.assign(button.style, {
          minHeight: isMobile ? "26px" : "34px",
          border: "0",
          borderRadius: "8px",
          padding: isMobile ? "2px 6px" : "6px 8px",
          fontSize: "12px",
          fontWeight: "650",
          cursor: "pointer",
          color: active ? "var(--foreground, #171717)" : "var(--muted-foreground, #737373)",
          background: active ? "var(--background, #fff)" : "transparent",
          boxShadow: active ? "0 1px 3px rgba(0,0,0,.12)" : "none",
          transition: "all .18s ease",
        });
        return button;
      };
      const departureTab = makeTab("↗ Départs", meta?.departureCount ?? 0, true);
      const arrivalTab = makeTab("↙ Arrivées", meta?.arrivalCount ?? 0, false);
      tabBar.append(departureTab, arrivalTab);
      tip.append(tabBar);
      const scope = document.createElement("p");
      scope.className = "port-tip__scope";
      scope.textContent = "Horaires connus à venir · heure locale";
      if (isMobile) scope.hidden = true;
      tip.append(scope);
      const departurePanel = document.createElement("div");
      departurePanel.className = "port-tip__schedule";
      departurePanel.setAttribute("role", "region");
      departurePanel.setAttribute("aria-label", "Prochains départs");
      const arrivalPanel = document.createElement("div");
      arrivalPanel.className = "port-tip__schedule";
      arrivalPanel.setAttribute("role", "region");
      arrivalPanel.setAttribute("aria-label", "Prochaines arrivées");
      arrivalPanel.hidden = true;
      const makeRows = (
        items: {
          departureId: string;
          date: string;
          time: string;
          place: string | null;
          companyName: string | null;
          logoUrl: string | null;
        }[],
        emptyText: string,
      ) => {
        if (!items.length) {
          const empty = document.createElement("p");
          empty.className = "port-tip__next";
          empty.textContent = emptyText;
          return empty;
        }
        const list = document.createElement("ul");
        list.className = "port-tip__departures";
        items.slice(0, isMobile ? 2 : 3).forEach((item) => {
          const row = document.createElement("li");
          row.className = "port-tip__departure";
          // Chaque ligne mène à sa traversée.
          row.tabIndex = 0;
          row.setAttribute("role", "button");
          row.style.cursor = "pointer";
          const openDeparture = (event: Event) => {
            event.stopPropagation();
            setTipPortId(null);
            selectRef.current({ type: "departure", id: item.departureId });
            onOpenPanel?.();
          };
          row.addEventListener("click", openDeparture);
          row.addEventListener("keydown", (event) => {
            if (event.key === "Enter") openDeparture(event);
          });
          const date = document.createElement("span");
          date.className = "port-tip__departure-date";
          date.textContent = item.date;
          const time = document.createElement("span");
          time.className = "port-tip__departure-time";
          time.textContent = item.time;
          const details = document.createElement("span");
          details.style.cssText = "display:flex;flex-direction:column;min-width:0;gap:2px;flex:1";
          const place = document.createElement("span");
          place.className = "port-tip__departure-destination";
          place.textContent = item.place ?? "";
          place.style.cssText =
            "font-size:11px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
          details.append(place);
          if (item.companyName) {
            const company = document.createElement("span");
            company.style.cssText =
              "display:flex;align-items:center;gap:5px;min-width:0;font-size:10px;line-height:1.2;color:var(--muted-foreground,#737373)";
            if (item.logoUrl) {
              const logo = document.createElement("img");
              logo.src = item.logoUrl;
              logo.alt = "";
              logo.loading = "lazy";
              logo.style.cssText =
                "width:18px;height:18px;object-fit:contain;border-radius:4px;background:#fff;border:1px solid rgba(127,127,127,.2);padding:1px;flex-shrink:0";
              logo.onerror = () => logo.remove();
              company.append(logo);
            }
            const name = document.createElement("span");
            name.textContent = item.companyName;
            name.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
            company.append(name);
            details.append(company);
          }
          date.style.fontSize = "10px";
          time.style.fontSize = "13px";
          time.style.fontWeight = "700";
          row.style.gap = "8px";
          row.append(date, time, details);
          list.append(row);
        });
        return list;
      };
      departurePanel.append(
        makeRows(
          (meta?.upcoming ?? []).map((item) => ({
            departureId: item.departureId,
            date: item.date,
            time: item.time,
            place: item.to ? `→ ${item.to}` : null,
            companyName: item.companyName,
            logoUrl: item.logoUrl,
          })),
          "Aucun départ programmé pour le moment.",
        ),
      );
      arrivalPanel.append(
        makeRows(
          (meta?.upcomingArrivals ?? []).map((item) => ({
            departureId: item.departureId,
            date: item.date,
            time: item.time,
            place: item.from ? `← ${item.from}` : null,
            companyName: item.companyName,
            logoUrl: item.logoUrl,
          })),
          "Aucune arrivée prévue connue pour le moment.",
        ),
      );
      // Le bouton suit ce que l'on regardait : la fiche s'ouvre sur les mêmes horaires.
      let showing: "departures" | "arrivals" = "departures";
      const moreLabel = () =>
        showing === "arrivals"
          ? meta?.upcomingArrivals.length
            ? "Voir toutes les arrivées"
            : "Voir la fiche du port"
          : meta?.upcoming.length
            ? "Voir tous les départs"
            : "Voir la fiche du port";
      const activateTab = (arrivals: boolean) => {
        departurePanel.hidden = arrivals;
        arrivalPanel.hidden = !arrivals;
        const setTabState = (button: HTMLButtonElement, active: boolean) => {
          Object.assign(button.style, {
            color: active ? "var(--foreground, #171717)" : "var(--muted-foreground, #737373)",
            background: active ? "var(--background, #fff)" : "transparent",
            boxShadow: active ? "0 1px 3px rgba(0,0,0,.12)" : "none",
          });
          button.setAttribute("aria-pressed", String(active));
        };
        setTabState(departureTab, !arrivals);
        setTabState(arrivalTab, arrivals);
        showing = arrivals ? "arrivals" : "departures";
        more.textContent = moreLabel();
      };
      departureTab.addEventListener("click", () => activateTab(false));
      arrivalTab.addEventListener("click", () => activateTab(true));
      tip.append(departurePanel, arrivalPanel);

      const more = document.createElement("button");
      more.type = "button";
      more.className = "port-tip__more";
      more.textContent = moreLabel();
      more.addEventListener("click", (event) => {
        event.stopPropagation();
        setTipPortId(null);
        try {
          window.sessionStorage.setItem("bledway:port-schedule", showing);
        } catch {
          /* la fiche s'ouvrira sur les départs */
        }
        selectRef.current({ type: "port", id: port.id });
        // Fiche déjà ouverte sur ce port (ordinateur) : elle change d'onglet sans se recharger.
        window.dispatchEvent(new Event("bledway:port-schedule"));
        onOpenPanel?.();
      });
      tip.append(more);
      requestAnimationFrame(() => {
        if (element.dataset["tip"] === "true") positionPortTip(map, marker, tip, tipInset());
      });
    });

    const handleMapMove = () => repositionVisibleTips();
    map.on("move", handleMapMove);
    window.addEventListener("resize", repositionVisibleTips);

    portMarkersRef.current.forEach((marker, id) => {
      if (!ports.some((port) => port.id === id)) {
        marker.remove();
        portMarkersRef.current.delete(id);
      }
    });

    return () => {
      map.off("move", handleMapMove);
      window.removeEventListener("resize", repositionVisibleTips);
    };
  }, [
    ports,
    highlightedPortIds,
    portMeta,
    mapReady,
    selection?.type,
    selection?.id,
    isMobile,
    tipPortId,
  ]);

  // La carte se recentre sur la sélection, dans la zone visible (hors volet et tiroir).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selection) return;

    if (selection.type === "route") {
      const route = routes.find((item) => item.id === selection.id);
      const from = route ? ports.find((port) => port.id === route.departure_port_id) : null;
      const to = route ? ports.find((port) => port.id === route.arrival_port_id) : null;
      if (from && to) {
        map.fitBounds(
          [
            [Math.min(from.longitude, to.longitude), Math.min(from.latitude, to.latitude)],
            [Math.max(from.longitude, to.longitude), Math.max(from.latitude, to.latitude)],
          ],
          { padding: viewPadding(), maxZoom: 6.4, duration: cameraDuration(650) },
        );
      }
    } else if (selection.type === "port") {
      const port = ports.find((item) => item.id === selection.id);
      const connected = routes.filter(
        (route) =>
          route.departure_port_id === selection.id || route.arrival_port_id === selection.id,
      );
      const points = [
        port,
        ...connected.flatMap((route) =>
          [route.departure_port_id, route.arrival_port_id].map((id) =>
            ports.find((item) => item.id === id),
          ),
        ),
      ].filter((item): item is Port => Boolean(item));
      if (port && insetsRef.current.isMobile) {
        // Mobile : la fiche s'ouvre dans le tiroir ; le port se place dans la bande de carte visible.
        const timer = window.setTimeout(() => {
          map.easeTo({
            center: [port.longitude, port.latitude],
            zoom: Math.max(map.getZoom(), 5.5),
            padding: viewPadding(),
            duration: cameraDuration(500),
          });
        }, 120);
        return () => window.clearTimeout(timer);
      }
      if (points.length > 1) {
        const lngs = points.map((item) => item.longitude);
        const lats = points.map((item) => item.latitude);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: viewPadding(), maxZoom: 6.4, duration: cameraDuration(650) },
        );
      } else if (port) {
        map.easeTo({
          center: [port.longitude, port.latitude],
          padding: viewPadding(),
          duration: cameraDuration(650),
        });
      }
    } else if (selection.type === "vessel") {
      // Le navire est amené au centre de la zone dégagée (hors volet, en-tête et tableau de bord).
      const ship = fleetRef.current.find((item) => item.vesselId === selection.id);
      if (ship) {
        const center = ship.live ? projectedPosition(ship.live.position, Date.now()) : ship.lngLat;
        map.easeTo({
          center,
          zoom: Math.max(map.getZoom(), 6),
          padding: viewPadding(),
          duration: cameraDuration(700),
        });
      }
    }
    return undefined;
  }, [selection, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !focusTarget) return;
    const timer = window.setTimeout(() => {
      map.resize();
      map.easeTo({
        center: focusTarget.center,
        zoom: Math.max(map.getZoom(), 6.4),
        padding: viewPadding(),
        duration: cameraDuration(800),
      });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [focusTarget?.key, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !companyFocusShips.length) return;
    const points = companyFocusShips.map((ship) =>
      ship.live
        ? ([ship.live.position.longitude, ship.live.position.latitude] as [number, number])
        : ship.lngLat,
    );
    const first = points[0];
    if (points.length === 1 && first) {
      map.easeTo({
        center: first,
        zoom: Math.max(map.getZoom(), 6),
        padding: viewPadding(),
        duration: cameraDuration(650),
      });
    } else {
      map.fitBounds(
        [
          [
            Math.min(...points.map((point) => point[0])),
            Math.min(...points.map((point) => point[1])),
          ],
          [
            Math.max(...points.map((point) => point[0])),
            Math.max(...points.map((point) => point[1])),
          ],
        ],
        { padding: viewPadding(), maxZoom: 6.5, duration: cameraDuration(650) },
      );
    }
  }, [companyFocusShips.map((ship) => ship.id).join("|"), mapReady]);

  // Fanion de compagnie : petit drapeau planté sur le bord haut-gauche du jeton de chaque navire
  // de la compagnie choisie. Taille fixe, logo dans un cartouche blanc ; il suit le zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !companyFocusShips.length) return undefined;
    const placed = companyFocusShips.map((ship) => {
      const info = vesselCardsRef.current[String(ship.vesselId ?? "")];
      const el = document.createElement("div");
      // Navire debout : le logo se range sous son nom, le dessus du navire reste à la communauté.
      const slug = vesselMapIcon(ship.name);
      el.className = slug ? "bw-pennant bw-pennant--label" : "bw-pennant";
      el.style.pointerEvents = "none";
      const flag = document.createElement("div");
      flag.className = "bw-pennant-flag";
      const initials = (info?.companyName ?? "").slice(0, 3).toUpperCase();
      if (info?.logoUrl) {
        const logo = document.createElement("img");
        logo.src = info.logoUrl;
        logo.alt = info.companyName ?? "";
        logo.onerror = () => {
          logo.remove();
          flag.textContent = initials;
        };
        flag.append(logo);
      } else flag.textContent = initials;
      const mast = document.createElement("div");
      mast.className = "bw-pennant-mast";
      const inner = document.createElement("div");
      inner.className = "bw-pennant-inner";
      inner.append(flag, mast);
      el.append(inner);
      const at = shipAnchor(ship);
      const shift: [number, number] = [ship.dx, ship.dy];
      const marker = new Marker({ element: el, anchor: slug ? "top" : "bottom-left", offset: shift })
        .setLngLat(at)
        .addTo(map);
      return { marker, shift, inner, slug, late: Boolean(ship.delay), ashore: ship.ashore };
    });
    const place = () => {
      const zoom = map.getZoom();
      const r = shipTokenRadius(zoom);
      for (const { marker, shift, inner, slug, late, ashore } of placed) {
        if (!slug) {
          marker.setOffset([shift[0] - r * 0.72, shift[1] - r * 0.72]);
          continue;
        }
        // Sous le libellé : une ligne pour le nom, une de plus pour le retard dès qu'il s'affiche.
        const lines = late && zoom >= 6.5 ? 2 : 1;
        inner.style.scale = zoom < 6 ? "0.75" : "1";
        marker.setOffset([
          shift[0] * dockSpread(zoom),
          shipShiftY(shift[1], ashore, slug, zoom) + 10 + lines * 16,
        ]);
      }
    };
    place();
    map.on("zoom", place);
    return () => {
      map.off("zoom", place);
      placed.forEach(({ marker }) => marker.remove());
    };
  }, [
    companyFocusShips
      .map((ship) => `${ship.id}:${ship.live?.position.longitude ?? ship.lngLat[0]}`)
      .join("|"),
    mapReady,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !mapReady || !portsPulseKey || !container) return;
    if (!portsMode) {
      const limit = map.cameraForBounds(LIMIT_BOUNDS, { padding: viewPadding() });
      if (limit?.zoom !== undefined)
        map.setMinZoom(Math.min(minZoomFloor(), Math.max(2.2, limit.zoom - 0.6)));
    }
    if (portsMode) {
      // Cadre les ports réellement actifs dans la zone visible de la carte.
      // Le minZoom précédent empêchait fitBounds d'inclure la côte algérienne.
      const visiblePorts = ports.filter(
        (port) =>
          port.status === "active" &&
          port.longitude >= -10 &&
          port.longitude <= 16 &&
          port.latitude >= 34 &&
          port.latitude <= 46,
      );
      const lngs = visiblePorts.map((port) => port.longitude);
      const lats = visiblePorts.map((port) => port.latitude);
      map.setMinZoom(2.2);
      const bounds: [[number, number], [number, number]] =
        visiblePorts.length > 1
          ? [
              [Math.min(...lngs) - 0.55, Math.min(...lats) - 0.55],
              [Math.max(...lngs) + 0.55, Math.max(...lats) + 0.55],
            ]
          : OVERVIEW_BOUNDS;
      map.fitBounds(bounds, { padding: viewPadding(), maxZoom: 5, duration: cameraDuration(800) });
    } else if (!isMobile) {
      map.easeTo({
        center: [4, 39],
        zoom: 4.2,
        padding: viewPadding(),
        duration: cameraDuration(800),
      });
      return;
    }
    container.dataset["pulsePorts"] = "true";

    // N'afficher que les noms visibles et suffisamment espacés, sans déplacer la carte.
    const showLabels = () => {
      const bounds = container.getBoundingClientRect();
      const occupied: DOMRect[] = [];
      const rankedPorts = [...ports]
        .filter((port) => port.status === "active")
        .sort((a, b) => (portMeta[b.id]?.routes ?? 0) - (portMeta[a.id]?.routes ?? 0));
      portMarkersRef.current.forEach((marker) => {
        delete marker.getElement().dataset["portFocusLabel"];
      });
      for (const port of rankedPorts) {
        if (occupied.length >= 7) break;
        const element = portMarkersRef.current.get(port.id)?.getElement();
        const label = element?.querySelector<HTMLElement>(".port-marker__label");
        if (!element || !label) continue;
        element.dataset["portFocusLabel"] = "true";
        const rect = label.getBoundingClientRect();
        const outside =
          rect.width === 0 ||
          rect.left < bounds.left + 8 ||
          rect.right > bounds.right - 8 ||
          rect.top < bounds.top + 70 ||
          rect.bottom > bounds.bottom - 8;
        const overlaps = occupied.some(
          (other) =>
            rect.left < other.right + 8 &&
            rect.right > other.left - 8 &&
            rect.top < other.bottom + 6 &&
            rect.bottom > other.top - 6,
        );
        if (outside || overlaps) delete element.dataset["portFocusLabel"];
        else occupied.push(rect);
      }
    };
    const frame = window.requestAnimationFrame(showLabels);
    const clear = () => {
      container.dataset["pulsePorts"] = "false";
      portMarkersRef.current.forEach((marker) => {
        delete marker.getElement().dataset["portFocusLabel"];
      });
      if (!map.getStyle()) return;
      if (map.getLayer("fleet-labels"))
        map.setPaintProperty("fleet-labels", "text-opacity", ["get", "photoOpacity"]);
      if (map.getLayer("fleet-ships"))
        map.setPaintProperty("fleet-ships", "icon-opacity", ["get", "opacity"]);
    };
    const timer = portsMode ? null : window.setTimeout(clear, 3600);
    if (portsMode) map.on("moveend", showLabels);
    else {
      map.on("dragstart", clear);
      map.on("zoomstart", clear);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
      map.off("moveend", showLabels);
      map.off("dragstart", clear);
      map.off("zoomstart", clear);
      clear();
    };
  }, [
    portsPulseKey,
    portsMode,
    mapReady,
    isMobile,
    ports,
    portMeta,
    mobileBottomInset,
    desktopLeftInset,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const portMap = new Map(ports.map((port) => [port.id, port]));
    const visible = new Set(visibleRouteIds);
    const focus = new Set(hoverRouteId ? [hoverRouteId] : focusRouteIds);

    const apply = () => {
      const source = map.getSource("ferry-routes") as GeoJSONSource | undefined;
      if (!source) return;
      const features = routeFeatures(
        routes,
        portMap,
        visible,
        new Set(dateActiveRouteIds),
        focus,
        hoverRouteId ? { type: "route", id: hoverRouteId } : selection,
      );
      routeFeaturesRef.current = features;
      source.setData({ type: "FeatureCollection", features });
      redrawFleetRef.current?.();
    };

    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [
    routes,
    ports,
    visibleRouteIds,
    dateActiveRouteIds,
    focusRouteIds,
    selection,
    hoverRouteId,
    mapReady,
  ]);

  // Positions à leur vitesse réelle ; ne pas relancer le placement des symboles à l'arrêt.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const visible = new Set(fleetVisibleRouteIds);
    const focus = new Set(hoverRouteId ? [hoverRouteId] : focusRouteIds);
    const selectedRouteId = hoverRouteId ?? (selection?.type === "route" ? selection.id : null);
    const routeById = new Map(routes.map((route) => [route.id, route]));
    const portById = new Map(ports.map((port) => [port.id, port]));

    const draw = () => {
      const source = map.getSource("fleet") as GeoJSONSource | undefined;
      if (!source) return;
      const clock = Date.now();
      const sailing = new Set<string>();
      const data: FleetFrame = {
        type: "FeatureCollection",
        features: fleetRef.current.map((ship) => {
          // Un navire choisi depuis le tableau de bord reste pleinement visible, quelle que soit la ligne active.
          const previewing = Boolean(
            hoverRouteId || hoverVesselId || hoverPortId || hoverShipIds.length,
          );
          const previewed = hoverShipIds.length
            ? hoverShipIds.includes(ship.id)
            : hoverVesselId
              ? hoverVesselId === ship.vesselId
              : hoverRouteId === ship.routeId;
          const focused =
            (!previewing &&
              (focusShipId === ship.id ||
                companyFocusShips.some((item) => item.id === ship.id) ||
                (selectedVesselId !== null && selectedVesselId === ship.vesselId) ||
                (selection?.type === "vessel" && selection.id === ship.vesselId) ||
                (selection?.type === "departure" && selection.id === ship.departureId))) ||
            previewed;
          const dimmed =
            !focused &&
            ((previewing && !previewed) ||
              !visible.has(ship.routeId) ||
              (focus.size > 0 && !focus.has(ship.routeId)));
          const selected = previewing ? previewed : selectedRouteId === ship.routeId || focused;
          const live = ship.live;
          // Rangé dans la file d'un port : il reste à sa place, même avec un signal AIS.
          const base = live && !ship.portId ? projectedPosition(live.position, clock) : ship.lngLat;
          // Les navires amarrés sont rangés en file à côté du port : le décalage est en pixels écran.
          let coordinates = base;
          if (ship.dx !== 0 || ship.dy !== 0) {
            const point = map.project(base);
            const zoom = map.getZoom();
            const iconSlug = vesselMapIcon(ship.name);
            const spread = iconSlug ? dockSpread(zoom) : 1;
            // À quai côté mer sans couvrir le point du port ; immobilisé, posé à terre.
            const dy = shipShiftY(ship.dy, ship.ashore, iconSlug, zoom);
            const moved = map.unproject([point.x + ship.dx * spread, point.y + dy]);
            coordinates = [moved.lng, moved.lat];
          }
          const course = live ? (live.position.courseDeg ?? ship.course) : ship.course;
          // Étiquette d'allure : vitesse réelle et destination en mer, port d'attache à quai.
          const route = routeById.get(ship.routeId);
          const fromPort = route ? portById.get(route.departure_port_id) : undefined;
          const toPort = route ? portById.get(route.arrival_port_id) : undefined;
          const toName = toPort?.name;
          const dockName = ship.portId ? portById.get(ship.portId)?.name : undefined;
          const speed = live?.position.speedKnots;
          const physical =
            live && fromPort && toPort
              ? physicalStatus(
                  live.position,
                  fromPort,
                  toPort,
                  live.departure.departure_at,
                  clock,
                  [...portById.values()],
                )
              : null;
          let allure: string;
          if (physical) {
            const speedText = speed != null ? ` · ${Math.round(speed)} kts` : "";
            const atdText = live?.position.atdAt
              ? ` · parti à ${wallTimeInZone(live.position.atdAt, portTimeZone(fromPort))}`
              : "";
            allure = `${physical.label}${speedText}${physical.code === "approaching" && toName ? ` · vers ${toName}` : ""}${atdText}`;
          } else if (ship.state === "sea") {
            const head = live && speed != null ? `● ${Math.round(speed)} kts` : "● En navigation";
            allure = toName ? `${head} · vers ${toName}` : head;
          } else {
            allure = dockName ? `⚓ À quai · ${dockName}` : "⚓ À quai";
          }
          const shipAlert = ship.vesselId ? vesselAlertsRef.current.get(ship.vesselId) : undefined;
          // Le jeton reste affiché tant que l'image n'est pas chargée.
          const slug = vesselMapIcon(ship.name);
          const photoSlug = slug && map.hasImage(vesselImageId(slug, VESSEL_IMAGE_STEPS[0]!.width)) ? slug : null;
          if (photoSlug && wakeLevel(ship.state, live ? speed : null) !== "dock") sailing.add(photoSlug);
          return {
            type: "Feature" as const,
            properties: {
              alert: shipAlert ? 1 : 0,
              // Navire en alerte : sa pastille prend la place du retard sous son nom.
              late: ship.delay && !shipAlert ? `Retardé ${ship.delay}` : "",
              state: ship.state,
              icon: shipIcon(wakeLevel(ship.state, live ? speed : null), course),
              course,
              name: ship.name,
              allure: shipAlert ? `⚠ ${shipAlert.label}` : allure,
              allureColor: shipAlert
                ? "#c81e1e"
                : physical?.tone === "success"
                  ? "#059669"
                  : physical?.tone === "warning"
                    ? "#d97706"
                    : physical?.tone === "info"
                      ? "#1d6fb8"
                      : ship.state === "sea"
                        ? live
                          ? "#059669"
                          : "#1d6fb8"
                        : "#5b6b7a",
              shipId: ship.id,
              priority: focused ? 0 : selected ? 1 : live ? 2 : ship.state === "sea" ? 3 : 4,
              departureId: ship.departureId,
              vesselId: ship.vesselId ?? "",
              // Navire à image : le jeton invisible reste la zone de clic au doigt.
              photo: photoSlug ?? "",
              photoOpacity: dimmed ? 0.35 : 1,
              opacity: photoSlug ? 0 : dimmed ? 0.35 : 1,
              haloColor: selected ? "#0e7a43" : "#1e5b7a",
              haloOpacity: selected && !photoSlug ? 0.18 : 0,
            },
            geometry: { type: "Point" as const, coordinates },
          };
        }),
      };
      vesselImagesRef.current?.setSailing(sailing);
      // Pas de regroupement « 2 » : chaque navire reste visible et nommé, la file indienne et le
      // placement des noms évitent déjà les chevauchements. Seuls des navires pile au même endroit se groupent.
      const groups = fleetGroups(
        data.features.map((feature) => {
          const point = map.project(feature.geometry.coordinates);
          return {
            id: String(feature.properties["shipId"]),
            x: point.x,
            y: point.y,
            priority: Number(feature.properties["priority"]),
          };
        }),
        1,
      );
      for (const feature of data.features)
        Object.assign(feature.properties, groups.get(String(feature.properties["shipId"])));
      const canvasRect = map.getCanvas().getBoundingClientRect();
      // Nom de chaque port : collé à son point, du côté où il ne couvre ni navire, ni phare,
      // ni un autre port. Le côté choisi par l'équipe passe en premier quand il est libre.
      {
        const zoomNow = map.getZoom();
        const tokenSize = shipTokenRadius(zoomNow) * 2;
        const hulls: Box[] = data.features.map((feature) => {
          const point = map.project(feature.geometry.coordinates);
          const photo = String(feature.properties["photo"] ?? "");
          const w = photo ? vesselScreenWidth(zoomNow) : tokenSize;
          const h = photo ? vesselScreenHeight(photo, zoomNow) : tokenSize;
          return photo
            ? { left: point.x - w / 2, right: point.x + w / 2, top: point.y - h, bottom: point.y }
            : { left: point.x - w / 2, right: point.x + w / 2, top: point.y - h / 2, bottom: point.y + h / 2 };
        });
        const near = zoomNow >= 7;
        const dots: Box[] = [];
        const towers: Box[] = [];
        for (const port of portById.values()) {
          const point = map.project([port.longitude, port.latitude]);
          dots.push({ left: point.x - 7, right: point.x + 7, top: point.y - 7, bottom: point.y + 7 });
          if (near)
            towers.push(
              port.country_code === "DZ"
                ? { left: point.x - 12, right: point.x + 12, top: point.y, bottom: point.y + 40 }
                : { left: point.x - 12, right: point.x + 12, top: point.y - 40, bottom: point.y },
            );
        }
        const area = (a: Box, b: Box) =>
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
          Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const taken: Box[] = [];
        for (const port of portById.values()) {
          const label = portMarkersRef.current
            .get(port.id)
            ?.getElement()
            .querySelector<HTMLElement>(".port-marker__label");
          if (!label || !label.offsetWidth) continue;
          const w = label.offsetWidth;
          const h = label.offsetHeight;
          const point = map.project([port.longitude, port.latitude]);
          const gap = 9;
          const boxes: Record<string, Box> = {
            right: { left: point.x + gap, right: point.x + gap + w, top: point.y - h / 2, bottom: point.y + h / 2 },
            left: { left: point.x - gap - w, right: point.x - gap, top: point.y - h / 2, bottom: point.y + h / 2 },
            bottom: { left: point.x - w / 2, right: point.x + w / 2, top: point.y + gap, bottom: point.y + gap + h },
            top: { left: point.x - w / 2, right: point.x + w / 2, top: point.y - gap - h, bottom: point.y - gap },
          };
          const order = [
            ...new Set([port.label_anchor ?? "left", "right", "left", "bottom", "top"]),
          ].filter((side) => side in boxes);
          const others = [...portById.values()]
            .filter((item) => item.id !== port.id)
            .map((item) => map.project([item.longitude, item.latitude]));
          const cost = (box: Box) => {
            // Un nom plus proche d'un autre port que du sien se lit comme le nom de l'autre.
            const cx = (box.left + box.right) / 2;
            const cy = (box.top + box.bottom) / 2;
            const own = Math.hypot(cx - point.x, cy - point.y);
            const misleading = others.some((other) => Math.hypot(cx - other.x, cy - other.y) < own);
            return (
              (misleading ? 1e6 : 0) +
              [...hulls, ...towers].reduce((sum, other) => sum + area(box, other), 0) +
              dots.reduce((sum, other) => sum + area(box, other) * 6, 0) +
              taken.reduce((sum, other) => sum + area(box, other) * 4, 0)
            );
          };
          let side = order[0]!;
          let best = cost(boxes[side]!);
          for (const candidate of order.slice(1)) {
            if (best === 0) break;
            const value = cost(boxes[candidate]!);
            if (value < best) {
              side = candidate;
              best = value;
            }
          }
          taken.push(boxes[side]!);
          if (label.dataset["side"] !== side) {
            label.dataset["side"] = side;
            Object.assign(label.style, PORT_LABEL_SIDES[side]);
          }
        }
      }
      // Le point de chaque port, et son nom tel qu'il est affiché à l'écran.
      const portObstacles = (): Box[] => [
        ...[...portById.values()].map((port) => {
          const point = map.project([port.longitude, port.latitude]);
          return { left: point.x - 10, right: point.x + 10, top: point.y - 10, bottom: point.y + 10 };
        }),
        ...[...portMarkersRef.current.values()].flatMap((marker) => {
          const label = marker.getElement().querySelector(".port-marker__label");
          const rect = label?.getBoundingClientRect();
          if (!rect || !rect.width) return [];
          return [
            {
              left: rect.left - canvasRect.left,
              right: rect.right - canvasRect.left,
              top: rect.top - canvasRect.top,
              bottom: rect.bottom - canvasRect.top,
            },
          ];
        }),
      ];
      // Le nom de chaque navire va à la place libre la plus proche de sa coque.
      const zoom = map.getZoom();
      const size = labelSize(zoom);
      const token = shipTokenRadius(zoom) * 2;
      const spots = placeLabels(
        data.features.map((feature) => {
          const point = map.project(feature.geometry.coordinates);
          const photo = String(feature.properties["photo"] ?? "");
          const late = zoom >= 6.5 ? String(feature.properties["late"] ?? "") : "";
          const name = String(feature.properties["name"] ?? "");
          return {
            id: String(feature.properties["shipId"]),
            x: point.x,
            y: point.y,
            standing: Boolean(photo),
            width: photo ? vesselScreenWidth(zoom) : token,
            height: photo ? vesselScreenHeight(photo, zoom) : token,
            text: late.length > name.length ? late : name,
            lines: late ? 2 : 1,
            priority: Number(feature.properties["priority"]),
          };
        }),
        size,
        // Le point et le nom de chaque port restent dégagés.
        portObstacles(),
      );
      for (const feature of data.features) {
        const spot = spots.get(String(feature.properties["shipId"]));
        if (spot) Object.assign(feature.properties, { labelAnchor: spot.anchor, labelOffset: spot.offset });
      }
      // Les durées des lignes : là où elles ne couvrent ni navire, ni nom, ni port.
      const durations = map.getSource("route-durations") as GeoJSONSource | undefined;
      if (durations) {
        const canvas = map.getCanvas();
        const obstacles: Box[] = [
          ...[...spots.values()].map((spot) => spot.box),
          ...data.features.map((feature) => {
            const point = map.project(feature.geometry.coordinates);
            const photo = String(feature.properties["photo"] ?? "");
            const w = photo ? vesselScreenWidth(zoom) : token;
            const h = photo ? vesselScreenHeight(photo, zoom) : token;
            return photo
              ? { left: point.x - w / 2, right: point.x + w / 2, top: point.y - h, bottom: point.y }
              : { left: point.x - w / 2, right: point.x + w / 2, top: point.y - h / 2, bottom: point.y + h / 2 };
          }),
          ...portObstacles(),
        ];
        const lines = routeFeaturesRef.current
          .filter((feature) => feature && feature.properties.label && !feature.properties.dimmed)
          .map((feature) => ({
            id: String(feature!.properties.id ?? feature!.properties.label),
            text: String(feature!.properties.label),
            points: (feature!.geometry.coordinates as [number, number][]).map((coordinate) => {
              const point = map.project(coordinate);
              return [point.x, point.y] as [number, number];
            }),
            properties: feature!.properties,
          }));
        const placedDurations =
          zoom >= 5
            ? placeAlongLines(lines, DURATION_SIZE, obstacles, {
                left: 0,
                top: 0,
                right: canvas.clientWidth,
                bottom: canvas.clientHeight,
              })
            : new Map();
        const next = JSON.stringify(
          lines.flatMap((line) => {
            const spot = placedDurations.get(line.id);
            if (!spot) return [];
            const at = map.unproject([spot.x, spot.y]);
            return [
              {
                type: "Feature",
                properties: { ...line.properties, label: line.text, angle: spot.angle },
                geometry: { type: "Point", coordinates: [at.lng, at.lat] },
              },
            ];
          }),
        );
        if (next !== lastDurations.current) {
          lastDurations.current = next;
          durations.setData({ type: "FeatureCollection", features: JSON.parse(next) });
        }
      }
      const previous = lastFleetFrame.current;
      const changed =
        !previous ||
        previous.source !== source ||
        previous.data.features.length !== data.features.length ||
        data.features.some((feature, index) => {
          const before = previous.data.features[index];
          if (!before || JSON.stringify(before.properties) !== JSON.stringify(feature.properties))
            return true;
          const a = map.project(before.geometry.coordinates as [number, number]);
          const b = map.project(feature.geometry.coordinates as [number, number]);
          return Math.hypot(a.x - b.x, a.y - b.y) >= 0.3;
        });
      if (changed) {
        source.setData(data);
        lastFleetFrame.current = { source, data };
      }
    };

    // Le sillage anime seulement la texture : les coordonnées gardent leur vitesse réelle.
    redrawFleetRef.current = draw;
    draw();
    const timer = window.setInterval(draw, 1000);
    map.on("moveend", draw);
    return () => {
      window.clearInterval(timer);
      map.off("moveend", draw);
    };
  }, [
    mapReady,
    fleet,
    fleetVisibleRouteIds,
    hoverVesselId,
    hoverShipIds,
    hoverPortId,
    focusRouteIds,
    focusShipId,
    companyFocusShips.map((ship) => ship.id).join("|"),
    selectedVesselId,
    hoverRouteId,
    selection?.type,
    selection?.id,
    routes,
    ports,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.getLayer("ferry-routes-duration")) return;
      // Sur mobile, les durées n'apparaissent que pour la sélection, pour ne pas surcharger l'écran.
      map.setLayoutProperty(
        "ferry-routes-duration",
        "visibility",
        !itineraryPreview && (!isMobile || hasFocus) ? "visible" : "none",
      );
      map.setFilter(
        "ferry-routes-duration",
        isMobile && hasFocus ? ["any", ["get", "selected"], ["get", "focused"]] : null,
      );
    };

    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [isMobile, hasFocus, mapReady, itineraryPreview]);

  return <div ref={containerRef} className="isolate h-full w-full" />;
}
