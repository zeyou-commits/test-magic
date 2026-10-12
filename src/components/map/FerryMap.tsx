import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
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
import { portColor, routeColor } from "@/lib/ferry/colors";
import { algeriaGeoJson } from "@/lib/ferry/algeriaGeoJson";
import { useIsMobile } from "@/hooks/use-mobile";

// En production, MapLibre v6 a besoin que son « worker » soit fourni explicitement.
// En développement, ce fichier injecté par Vite plante (« document is not defined ») et la carte
// reste vide : on laisse alors MapLibre utiliser son worker intégré.
if (!import.meta.env.DEV) setWorkerUrl(workerUrl);

export interface PortMeta {
  /** Nombre de lignes actives qui touchent le port (départ ou arrivée). */
  routes: number;
  companies: string[];
  /** Prochains départs depuis ce port, déjà formatés en heure locale du port. */
  upcoming: { date: string; time: string; to: string | null }[];
}

interface FerryMapProps {
  ports: Port[];
  routes: RouteLine[];
  visibleRouteIds: string[];
  dateActiveRouteIds: string[];
  focusRouteIds: string[];
  selection: Selection | null;
  highlightedPortIds: string[];
  portMeta: Record<string, PortMeta>;
  onSelect: (selection: Selection | null) => void;
  onOpenPanel?: () => void;
  onMapInteract?: () => void;
  /** Hauteur (px) masquée par le tiroir mobile et la barre d'onglets. */
  mobileBottomInset?: number;
  /** Largeur (px) masquée par le volet ordinateur. */
  desktopLeftInset?: number;
}

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
// Vue d'ensemble : toute la Méditerranée occidentale, de l'Espagne à l'Italie et toute la côte algérienne.
const OVERVIEW_BOUNDS: [[number, number], [number, number]] = [
  [-5.5, 35.2],
  [16.5, 44.6],
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
          color: routeColor(route.color, from.slug),
          lineCount: departureLineCounts.get(route.departure_port_id) ?? 1,
          label,
          selected: selectedRouteId === route.id,
          focused: focus.has(route.id) || (isDisplayRoute && focusedPair),
          dimmed: focusDimmed,
          dateDimmed,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [from.longitude, from.latitude],
            [to.longitude, to.latitude],
          ],
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

function positionPortTip(map: MapLibreMap, marker: Marker, tip: HTMLDivElement) {
  const container = map.getContainer();
  const mapRect = container.getBoundingClientRect();
  const markerRect = marker.getElement().getBoundingClientRect();
  const gap = 14;
  const padding = 10;
  const availableWidth = Math.max(0, mapRect.width - padding * 2);

  tip.style.maxWidth = `${Math.min(300, availableWidth)}px`;

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
  const topSafe = 84;
  let top = markerY - tipHeight / 2;
  if (top < mapRect.top + topSafe) top = mapRect.top + topSafe;
  if (top + tipHeight > mapRect.bottom - padding) top = mapRect.bottom - padding - tipHeight;

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
  portMeta,
  onSelect,
  onOpenPanel,
  onMapInteract,
  mobileBottomInset = 0,
  desktopLeftInset = 420,
}: FerryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const portMarkersRef = useRef<Map<string, Marker>>(new Map());
  const selectRef = useRef(onSelect);
  const interactRef = useRef(onMapInteract);
  const dismissedPortIdsRef = useRef<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);

  selectRef.current = onSelect;
  interactRef.current = onMapInteract;
  const isMobile = useIsMobile();
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
    return mobile
      ? { top: 110, right: 28, bottom: bottom + 20, left: 28 }
      : { top: 130, right: 80, bottom: 60, left };
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = new MapLibreMap({
      container,
      style: MAP_STYLE,
      bounds: OVERVIEW_BOUNDS,
      fitBoundsOptions: { padding: viewPadding() },
      // Carte à plat : une vue inclinée déforme les distances et gêne la lecture des lignes.
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    map.touchZoomRotate.disableRotation();

    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");

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
            "#9aa5a9",
            ["get", "color"],
          ],
          "line-width": [
            "case",
            ["get", "selected"],
            3.4,
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
        minzoom: 4,
        layout: {
          "symbol-placement": "line-center",
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-rotation-alignment": "viewport",
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

      const pickRoute = (event: MapLayerMouseEvent) => {
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
        const hits = map.queryRenderedFeatures(event.point, {
          layers: ["ferry-routes-line", "ferry-routes-duration"],
        });
        if (hits.length === 0) selectRef.current(null);
      });

      readyRef.current = true;
      setMapReady(true);
      requestAnimationFrame(() => map.resize());
    });

    return () => {
      map.off("dragstart", handleMapInteraction);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
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
    map.fitBounds(OVERVIEW_BOUNDS, { padding: viewPadding(), duration: 400 });
  }, [isMobile, mapReady, mobileBottomInset, desktopLeftInset]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const activeIds = new Set(highlightedPortIds);
    const dimming = highlightedPortIds.length > 0;

    const repositionVisibleTips = () => {
      portMarkersRef.current.forEach((marker) => {
        const element = marker.getElement();
        const tip = element.querySelector<HTMLDivElement>(".port-tip");
        if (!tip) return;
        const visible = isMobile
          ? element.dataset["active"] === "true"
          : element.matches(':hover, [data-active="true"]') || element.matches(":focus-within");
        if (visible) positionPortTip(map, marker, tip);
      });
    };

    ports.forEach((port) => {
      const existing = portMarkersRef.current.get(port.id);
      let marker: Marker;
      if (existing) {
        marker = existing;
      } else {
        const el = document.createElement("div");
        el.className = "port-marker";
        el.style.setProperty("--port-color", portColor(port.slug));

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
        close.addEventListener("pointerdown", (event) => {
          event.stopPropagation();
          event.preventDefault();
          dismissedPortIdsRef.current.add(port.id);
          selectRef.current(null);
          el.dataset["active"] = "false";
          (document.activeElement as HTMLElement | null)?.blur?.();
          close.blur();
          dot.blur();
        });
        close.addEventListener("click", (event) => {
          event.stopPropagation();
        });
        tip.append(close);

        el.append(dot, label, tip);

        const select = (event: Event) => {
          event.stopPropagation();
          dismissedPortIdsRef.current.delete(port.id);
          interactRef.current?.();
          // Cliquer un port le sélectionne, sans modifier les filtres de recherche.
          selectRef.current({ type: "port", id: port.id });
          requestAnimationFrame(() => positionPortTip(map, marker, tip));
        };

        dot.addEventListener("click", select);
        label.addEventListener("click", select);
        el.addEventListener("mouseenter", () =>
          requestAnimationFrame(() => positionPortTip(map, marker, tip)),
        );

        marker = new Marker({ element: el }).setLngLat([port.longitude, port.latitude]).addTo(map);
        portMarkersRef.current.set(port.id, marker);
      }

      const element = marker.getElement();
      const label = element.querySelector<HTMLSpanElement>(".port-marker__label");
      const meta = portMeta[port.id];
      const routeCount = meta?.routes ?? 0;

      if (label) Object.assign(label.style, getPortLabelStyle(port));

      element.dataset["active"] = String(
        activeIds.has(port.id) && !dismissedPortIdsRef.current.has(port.id),
      );
      element.dataset["dimmed"] = String(dimming && !activeIds.has(port.id));
      element.dataset["closed"] = String(port.status === "inactive");
      // Les ports secondaires (une seule liaison, éventuellement dans les deux sens) ont un libellé plus discret, mais toujours lisible.
      element.dataset["minor"] = String(routeCount <= 2);
      marker.setLngLat([port.longitude, port.latitude]);

      const tip = element.querySelector<HTMLDivElement>(".port-tip");
      if (!tip) return;
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

      const heading = document.createElement("p");
      heading.className = "port-tip__departures-title";
      heading.textContent = "Prochains départs · heure locale";
      tip.append(heading);

      if (meta?.upcoming?.length) {
        const list = document.createElement("ul");
        list.className = "port-tip__departures";

        meta.upcoming.slice(0, isMobile ? 2 : 3).forEach((item) => {
          const row = document.createElement("li");
          row.className = "port-tip__departure";

          const date = document.createElement("span");
          date.className = "port-tip__departure-date";
          date.textContent = item.date;

          const time = document.createElement("span");
          time.className = "port-tip__departure-time";
          time.textContent = item.time;

          const destination = document.createElement("span");
          destination.className = "port-tip__departure-destination";
          destination.textContent = item.to ? `→ ${item.to}` : "";

          row.append(date, time, destination);
          list.append(row);
        });

        tip.append(list);
      } else {
        const next = document.createElement("p");
        next.className = "port-tip__next";
        next.textContent = "Aucun départ à venir renseigné.";
        tip.append(next);
      }

      const more = document.createElement("button");
      more.type = "button";
      more.className = "port-tip__more";
      more.textContent = "Voir la fiche du port";
      more.addEventListener("click", (event) => {
        event.stopPropagation();
        selectRef.current({ type: "port", id: port.id });
        onOpenPanel?.();
      });
      tip.append(more);
      requestAnimationFrame(() => {
        if (
          (isMobile && element.dataset["active"] === "true") ||
          (!isMobile &&
            (element.matches(':hover, [data-active="true"]') || element.matches(":focus-within")))
        )
          positionPortTip(map, marker, tip);
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
  }, [ports, highlightedPortIds, portMeta, mapReady]);

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
          { padding: viewPadding(), maxZoom: 6.4, duration: 650 },
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
          { padding: viewPadding(), maxZoom: 6.4, duration: 650 },
        );
      } else if (port) {
        map.easeTo({
          center: [port.longitude, port.latitude],
          padding: viewPadding(),
          duration: 650,
        });
      }
    }
  }, [selection, mapReady]);

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
          selection,
        ),
      });
    };

    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [routes, ports, visibleRouteIds, dateActiveRouteIds, focusRouteIds, selection, mapReady]);

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
