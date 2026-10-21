import { useTravelMarkers } from "./useTravelMarkers";
import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  Popup,
  NavigationControl,
  AttributionControl,
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
import type { FleetShip } from "@/lib/ferry/fleet";
import { addShipImages } from "./shipIcons";
import { physicalStatus, projectedPosition } from "@/lib/ferry/tracking";
import { portTimeZone, wallTimeInZone } from "@/lib/ferry/time";
import { useIsMobile } from "@/hooks/use-mobile";

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
    date: string;
    time: string;
    to: string | null;
    companyName: string | null;
    logoUrl: string | null;
  }[];
  /** Prochaines arrivées prévues dans ce port, en heure locale. */
  upcomingArrivals: {
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
  dateActiveRouteIds: string[];
  focusRouteIds: string[];
  selection: Selection | null;
  highlightedPortIds: string[];
  /** Flotte : un navire par traversée en cours ou à venir (position déduite des horaires ou réelle si suivie). */
  fleet?: FleetShip[];
  /** Ligne survolée ou dépliée dans le volet : mise en évidence sans déplacer la carte. */
  hoverRouteId?: string | null;
  /** Ports à cadrer quand rien n'est sélectionné (trajet cherché). */
  fitPortIds?: string[];
  portMeta: Record<string, PortMeta>;
  onSelect: (selection: Selection | null) => void;
  onOpenPanel?: () => void;
  onMapInteract?: (kind?: "port" | "vessel") => void;
  /** Hauteur (px) masquée par le tiroir mobile et la barre d'onglets. */
  mobileBottomInset?: number;
  /** Largeur (px) masquée par le volet ordinateur. */
  desktopLeftInset?: number;
  /** Navire à amener au centre de la zone visible (clé changeante = nouveau cadrage). */
  focusTarget?: { center: [number, number]; key: number } | null;
  /** Clé changeante : vue globale + clignotement des ports. */
  portsPulseKey?: number;
  /** Navire choisi depuis le tableau de bord : jamais estompé, même si une ligne est sélectionnée. */
  focusShipId?: string | null;
}

// Limite de dézoom : on ne peut pas s'éloigner plus que « toute la Méditerranée occidentale visible »
// (plancher relevé selon la largeur d'écran pour empêcher une vue planisphère).
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
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
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

  // Le nombre de liaisons au départ donne un poids visuel à chaque ligne.
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
  dateActiveRouteIds,
  focusRouteIds,
  selection,
  highlightedPortIds,
  fitPortIds = [],
  hoverRouteId = null,
  fleet = [],
  portMeta,
  onSelect,
  onOpenPanel,
  onMapInteract,
  mobileBottomInset = 0,
  desktopLeftInset = 420,
  focusTarget = null,
  portsPulseKey = 0,
  focusShipId = null,
}: FerryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const portMarkersRef = useRef<Map<string, Marker>>(new Map());
  const selectRef = useRef(onSelect);
  const interactRef = useRef(onMapInteract);
  const dismissedPortIdsRef = useRef<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);
  const vesselPopupRef = useRef<Popup | null>(null);
  const fleetRef = useRef<FleetShip[]>(fleet);
  fleetRef.current = fleet;

  selectRef.current = onSelect;
  interactRef.current = onMapInteract;
  useTravelMarkers(mapRef, mapReady, ports, fleet, onSelect, onOpenPanel);
  const isMobile = useIsMobile();
  // Mobile : un tap sur un port n'ouvre que la bulle ; le volet s'ouvre via « Voir la fiche du port ».
  const [tipPortId, setTipPortId] = useState<string | null>(null);
  const hasFocus = focusRouteIds.length > 0;

  // Zone utile de la carte : ce qui n'est caché ni par le volet, ni par le tiroir, ni par l'en-tête.
  const insetsRef = useRef({ isMobile, mobileBottomInset, desktopLeftInset });
  insetsRef.current = { isMobile, mobileBottomInset, desktopLeftInset };
  const viewPadding = () => {
    const {
      isMobile: mobile,
      mobileBottomInset: bottom,
      desktopLeftInset: left,
    } = insetsRef.current;
    if (mobile) return { top: 88, right: 16, bottom: bottom + 12, left: 16 };
    // Sur ordinateur, la zone utile commence après le volet. Sur une fenêtre étroite, on garde
    // au moins 45 % de la largeur pour la carte afin que le trajet reste lisible.
    const width = containerRef.current?.clientWidth ?? 1200;
    return { top: 120, right: 60, bottom: 60, left: Math.min(left + 36, Math.round(width * 0.56)) };
  };

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
      // Carte à plat : une vue inclinée déforme les distances et gêne la lecture des lignes.
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      attributionControl: false,
      fadeDuration: 0,
      cooperativeGestures: false,
      dragPan: true,
      touchPitch: false,
      scrollZoom: true,
    });
    map.touchZoomRotate.disableRotation();

    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    const attribution = map
      .getContainer()
      .querySelector<HTMLDetailsElement>("details.maplibregl-ctrl-attrib");
    if (attribution) {
      attribution.open = false;
      attribution.classList.remove("maplibregl-compact-show");
    }
    map.once("idle", () => {
      if (attribution) {
        attribution.open = false;
        attribution.classList.remove("maplibregl-compact-show");
      }
    });

    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    const resize = () => requestAnimationFrame(() => mapRef.current?.resize());
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    window.addEventListener("resize", resize);

    const handleMapInteraction = () => interactRef.current?.();
    map.on("dragstart", handleMapInteraction);
    // À faible zoom, les libellés des petits ports se masquent pour éviter les chevauchements.
    const updateZoomState = () => {
      container.dataset["lowZoom"] = String(map.getZoom() < 5.2);
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
          /hillshade|landcover|landuse|building|road|bridge|tunnel|aeroway|poi|railway|peak/.test(
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
      // Les ports sont étiquetés par Batogo ; on masque les villes du fond de carte pour éviter les doublons.
      ["label_other", "label_village", "label_town", "label_city", "label_city_capital"].forEach(
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
          "line-width": [
            "case",
            ["get", "selected"],
            6,
            ["interpolate", ["linear"], ["get", "lineCount"], 1, 3, 5, 3.6, 20, 4.6],
          ],
          "line-opacity": ["case", ["get", "dateDimmed"], 0.25, ["get", "dimmed"], 0.15, 0.85],
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
            "case",
            ["get", "selected"],
            4,
            ["get", "focused"],
            3.2,
            ["interpolate", ["linear"], ["get", "lineCount"], 1, 1.4, 5, 1.8, 10, 2.2, 20, 2.8],
          ],
          "line-opacity": ["case", ["get", "dateDimmed"], 0.45, ["get", "dimmed"], 0.18, 1],
          // Seules les lignes sans départ à la date choisie sont en pointillés (voir la légende).
          "line-dasharray": [
            "case",
            ["get", "dateDimmed"],
            ["literal", [2, 2]],
            ["literal", [1, 0]],
          ],
        },
      });
      map.addLayer({
        id: "ferry-routes-duration",
        type: "symbol",
        source: "ferry-routes",
        minzoom: 5,
        layout: {
          "symbol-placement": "line-center",
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 9,
          // Les durées suivent l’orientation réelle des lignes pour rester discrètes et lisibles.
          "text-rotation-alignment": "map",
          "text-keep-upright": true,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-padding": 4,
          "symbol-sort-key": ["case", ["get", "selected"], 0, ["get", "focused"], 1, 2],
        },
        paint: {
          "text-color": "#1e3a4c",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2.2,
          "text-opacity": ["case", ["get", "dimmed"], 0, 1],
        },
      });

      // Flotte : de vrais ferrys vus du dessus, orientés selon leur cap.
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
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 12, 6, 18, 9, 25],
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
          // Perspective constante : la flèche dans l'icône porte le cap.
          "icon-rotation-alignment": "viewport",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.44, 5, 0.54, 7, 0.64, 9, 0.72],
        },
        paint: { "icon-opacity": ["get", "opacity"] },
      });
      map.addLayer({
        id: "fleet-label",
        type: "symbol",
        source: "fleet",
        layout: {
          // A single name at rest; the status belongs to the hover card.
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 3, 7.5, 6, 9.5, 9, 12],
          "text-offset": [0, 2.2],
          "text-anchor": "top",
          "text-optional": true,
          "text-padding": 2,
        },
        paint: {
          "text-color": "#0b3a6e",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.6,
          "text-opacity": ["get", "opacity"],
        },
      });
      // The hover card stays readable above the map, without enlarged text or rocking.
      const NO_SHIP = ["==", ["get", "shipId"], "__aucun__"] as never;
      map.addLayer({
        id: "fleet-hover-halo",
        type: "circle",
        source: "fleet",
        filter: NO_SHIP,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 18, 6, 27, 9, 40],
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
      const setHoveredShip = (id: string | null) => {
        hoveredShip = id;
        map.setFilter("fleet-hover-halo", id ? (["==", ["get", "shipId"], id] as never) : NO_SHIP);
        map.setFilter("fleet-label", id ? (["!=", ["get", "shipId"], id] as never) : null);
        if (!id) hoverTip.remove();
      };
      map.on("mousemove", "fleet-ships", (event) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.["shipId"];
        if (!feature || feature.geometry.type !== "Point" || typeof id !== "string") {
          setHoveredShip(null);
          return;
        }
        const coordinates = feature.geometry.coordinates as [number, number];
        if (id !== hoveredShip) {
          setHoveredShip(id);
          const card = document.createElement("div");
          card.setAttribute("role", "tooltip");
          const name = document.createElement("strong");
          name.textContent = String(feature.properties["name"] ?? "Navire");
          const status = document.createElement("p");
          status.textContent = String(feature.properties["allure"] ?? "");
          card.append(name, status);
          hoverTip.setLngLat(coordinates).setDOMContent(card).addTo(map);
        } else hoverTip.setLngLat(coordinates);
      });
      map.on("mouseleave", "fleet-ships", () => setHoveredShip(null));
      map.on("dragstart", () => setHoveredShip(null));
      map.on("zoomstart", () => setHoveredShip(null));

      map.on("click", "fleet-ships", (event) => {
        setHoveredShip(null);
        const props = event.features?.[0]?.properties;
        const vesselId = props?.["vesselId"];
        const departureId = props?.["departureId"];
        interactRef.current?.("vessel");
        // Un navire connu ouvre sa fiche ; sans navire renseigné, on ouvre sa traversée.
        if (typeof vesselId === "string" && vesselId)
          selectRef.current({ type: "vessel", id: vesselId });
        else if (typeof departureId === "string")
          selectRef.current({ type: "departure", id: departureId });
      });
      map.on("mouseenter", "fleet-ships", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "fleet-ships", () => {
        map.getCanvas().style.cursor = "";
      });

      const pickRoute = (event: MapLayerMouseEvent) => {
        // Un navire posé sur la ligne a la priorité : le clic ouvre le navire, pas la ligne.
        if (map.queryRenderedFeatures(event.point, { layers: ["fleet-ships"] }).length > 0) return;
        const id = event.features?.[0]?.properties?.["id"];
        if (typeof id !== "string") return;
        interactRef.current?.();
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
          layers: ["ferry-routes-line", "ferry-routes-duration", "fleet-ships"],
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
      vesselPopupRef.current = null;
      readyRef.current = false;
      setMapReady(false);
      portMarkersRef.current.forEach((marker) => marker.remove());
      portMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Recadrage quand on passe de mobile à ordinateur, ou que le tiroir change de hauteur sans sélection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || selection) return;
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
      // On utilise un point central "Espagne - Algérie" (~ longitude 0, latitude 39)
      map.easeTo({
        center: [4, 39],
        zoom: !isMobile ? 4.2 : 3.6, // Ajustez ce zoom selon ce que vous voulez voir
        padding: viewPadding(), // Le padding décale magiquement le centre vers la droite !
        duration: cameraDuration(600),
      });
    }
  }, [isMobile, mapReady, mobileBottomInset, desktopLeftInset, fitPortIds.join("|"), ports.length]);

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
          dismissedPortIdsRef.current.delete(port.id);
          interactRef.current?.(insetsRef.current.isMobile ? "port" : undefined);
          if (insetsRef.current.isMobile) {
            setTipPortId(port.id);
            // Le port se place au centre de la zone visible, au-dessus du tiroir.
            map.easeTo({
              center: [port.longitude, port.latitude],
              offset: [0, -insetsRef.current.mobileBottomInset / 2 + 40],
              duration: cameraDuration(350),
            });
          } else {
            // Cliquer un port le sélectionne, sans modifier les filtres de recherche.
            selectRef.current({ type: "port", id: port.id });
          }
          requestAnimationFrame(() => positionPortTip(map, marker, tip, tipInset()));
        };

        dot.addEventListener("click", select);
        label.addEventListener("click", select);

        marker = new Marker({ element: el }).setLngLat([port.longitude, port.latitude]).addTo(map);
        portMarkersRef.current.set(port.id, marker);
      }

      const element = marker.getElement();
      const label = element.querySelector<HTMLSpanElement>(".port-marker__label");
      const meta = portMeta[port.id];
      const routeCount = meta?.routes ?? 0;

      if (label) Object.assign(label.style, getPortLabelStyle(port));

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
      // Les ports secondaires (une seule liaison, éventuellement dans les deux sens) ont un libellé plus discret, mais toujours lisible.
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
        padding: "4px",
        margin: "10px 0 8px",
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
          minHeight: "34px",
          border: "0",
          borderRadius: "3px",
          padding: "6px 8px",
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
            date: item.date,
            time: item.time,
            place: item.from ? `← ${item.from}` : null,
            companyName: item.companyName,
            logoUrl: item.logoUrl,
          })),
          "Aucune arrivée prévue connue pour le moment.",
        ),
      );
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
      };
      departureTab.addEventListener("click", () => activateTab(false));
      arrivalTab.addEventListener("click", () => activateTab(true));
      tip.append(departurePanel, arrivalPanel);

      const more = document.createElement("button");
      more.type = "button";
      more.className = "port-tip__more";
      more.textContent = "Voir la fiche du port";
      more.addEventListener("click", (event) => {
        event.stopPropagation();
        setTipPortId(null);
        selectRef.current({ type: "port", id: port.id });
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
  }, [selection, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !focusTarget) return;
    const timer = window.setTimeout(() => {
      map.easeTo({
        center: focusTarget.center,
        zoom: Math.max(map.getZoom(), 7),
        padding: viewPadding(),
        duration: cameraDuration(800),
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusTarget?.key, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !mapReady || !portsPulseKey || !container) return;

    map.stop();
    map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });

    // Remplacement du fitBounds par le centrage fixe
    map.easeTo({
      center: [4, 39],
      zoom: typeof window !== "undefined" && window.innerWidth >= 768 ? 4.2 : 3.2,
      padding: viewPadding(),
      duration: cameraDuration(800),
    });

    container.dataset["pulsePorts"] = "false";
    void container.offsetWidth;
    container.dataset["pulsePorts"] = "true";
    const timer = window.setTimeout(() => (container.dataset["pulsePorts"] = "false"), 3600);
    return () => window.clearTimeout(timer);
  }, [portsPulseKey, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const portMap = new Map(ports.map((port) => [port.id, port]));
    const visible = new Set(visibleRouteIds);
    const focus = new Set(focusRouteIds);

    const apply = () => {
      const source = map.getSource("ferry-routes") as GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: routeFeatures(
          routes,
          portMap,
          visible,
          new Set(dateActiveRouteIds),
          focus,
          hoverRouteId ? { type: "route", id: hoverRouteId } : selection,
        ),
      });
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

  // Flotte : mise à jour chaque seconde (un navire avance très lentement : inutile d'animer plus vite).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const visible = new Set(visibleRouteIds);
    const focus = new Set(focusRouteIds);
    const selectedRouteId = hoverRouteId ?? (selection?.type === "route" ? selection.id : null);
    const routeById = new Map(routes.map((route) => [route.id, route]));
    const portById = new Map(ports.map((port) => [port.id, port]));

    const draw = () => {
      const source = map.getSource("fleet") as GeoJSONSource | undefined;
      if (!source) return;
      const clock = Date.now();
      source.setData({
        type: "FeatureCollection",
        features: fleetRef.current.map((ship) => {
          // Un navire choisi depuis le tableau de bord reste pleinement visible, quelle que soit la ligne active.
          const focused = focusShipId === ship.id;
          const dimmed =
            !focused &&
            (!visible.has(ship.routeId) || (focus.size > 0 && !focus.has(ship.routeId)));
          const selected = selectedRouteId === ship.routeId || focused;
          const live = ship.live;
          const base = live ? projectedPosition(live.position, clock) : ship.lngLat;
          // Les navires amarrés sont rangés en file à côté du port : le décalage est en pixels écran.
          let coordinates = base;
          if (ship.dx !== 0 || ship.dy !== 0) {
            const point = map.project(base);
            const moved = map.unproject([point.x + ship.dx, point.y + ship.dy]);
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
          return {
            type: "Feature" as const,
            properties: {
              state: ship.state,
              icon:
                ship.state === "sea"
                  ? `ship-sea-${Math.round((((course % 360) + 360) % 360) / 45) % 8}`
                  : "ship-dock",
              course,
              name: ship.name,
              allure,
              allureColor:
                physical?.tone === "success"
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
              departureId: ship.departureId,
              vesselId: ship.vesselId ?? "",
              opacity: 1,
              haloColor: selected ? "#0e7a43" : "#1e5b7a",
              haloOpacity: selected ? 0.24 : live ? 0.15 : 0.08,
            },
            geometry: { type: "Point" as const, coordinates },
          };
        }),
      });
    };

    // Les positions se mettent à jour, sans animation décorative continue du sillage.
    draw();
    const timer = window.setInterval(draw, 1000);
    map.on("zoomend", draw);
    return () => {
      window.clearInterval(timer);
      map.off("zoomend", draw);
    };
  }, [
    mapReady,
    fleet,
    visibleRouteIds,
    focusRouteIds,
    focusShipId,
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
        !isMobile || hasFocus ? "visible" : "none",
      );
      map.setFilter(
        "ferry-routes-duration",
        isMobile && hasFocus ? ["any", ["get", "selected"], ["get", "focused"]] : null,
      );
    };

    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [isMobile, hasFocus, mapReady]);

  return <div ref={containerRef} className="h-full w-full" />;
}
