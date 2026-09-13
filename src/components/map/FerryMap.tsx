import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Port, RouteLine, Selection } from "@/lib/ferry/types";
import { formatDuration } from "@/lib/ferry/format";
import { portColor, routeColor } from "@/lib/ferry/colors";
import { algeriaGeoJson } from "@/lib/ferry/algeriaGeoJson";

interface FerryMapProps {
  ports: Port[];
  routes: RouteLine[];
  visibleRouteIds: string[];
  /** Lignes mises en avant : les autres sont grisées. Vide = toutes au même niveau. */
  focusRouteIds: string[];
  selection: Selection | null;
  highlightedPortIds: string[];
  onSelect: (selection: Selection | null) => void;
}

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

function mapColor(token: string) {
  const cssColor = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return "rgb(0, 91, 134)";
  context.fillStyle = cssColor;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${red}, ${green}, ${blue})`;
}

function routeFeatures(
  routes: RouteLine[],
  ports: Map<string, Port>,
  visible: Set<string>,
  focus: Set<string>,
  selectedRouteId: string | null,
) {
  return routes
    .filter((route) => visible.has(route.id))
    .map((route) => {
      const from = ports.get(route.departure_port_id);
      const to = ports.get(route.arrival_port_id);
      if (!from || !to) return null;
      const dimmed = focus.size > 0 && !focus.has(route.id);
      return {
        type: "Feature" as const,
        properties: {
          id: route.id,
          color: routeColor(route.color, from.slug),
          label: route.typical_duration_minutes
            ? formatDuration(route.typical_duration_minutes)
            : "",
          selected: selectedRouteId === route.id,
          dimmed,
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

const portLabelPlacements: Record<string, Partial<CSSStyleDeclaration>> = {
  Marseille: { left: "12px", top: "-24px" },
  Sète: { right: "12px", top: "2px" },
  Alger: { transform: "translateX(-50%)", left: "0", top: "12px" },
  Béjaïa: { transform: "translateX(-50%)", left: "0", top: "12px" },
  Skikda: { right: "12px", top: "-24px" },
  Annaba: { left: "12px", top: "6px" },
};

export default function FerryMap({
  ports,
  routes,
  visibleRouteIds,
  focusRouteIds,
  selection,
  highlightedPortIds,
  onSelect,
}: FerryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const portMarkersRef = useRef<Map<string, Marker>>(new Map());
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [2.6, 39.4],
      zoom: 4.6,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      [
        "label_other",
        "label_village",
        "label_town",
        "label_city",
        "label_city_capital",
        "label_country_1",
        "label_country_2",
        "label_country_3",
      ].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
      });

      map.addSource("algeria-highlight", {
        type: "geojson",
        data: algeriaGeoJson,
      });
      map.addLayer({
        id: "algeria-highlight-fill",
        type: "fill",
        source: "algeria-highlight",
        paint: {
          "fill-color": mapColor("--map-country-highlight"),
          "fill-opacity": 0.28,
        },
      });
      map.addLayer({
        id: "algeria-highlight-outline",
        type: "line",
        source: "algeria-highlight",
        paint: {
          "line-color": mapColor("--map-country-outline"),
          "line-width": 1.5,
          "line-opacity": 0.7,
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
          "line-color": mapColor("--map-route-casing"),
          "line-width": ["case", ["get", "selected"], 7, 5],
          "line-opacity": ["case", ["get", "dimmed"], 0.1, 0.8],
        },
      });
      map.addLayer({
        id: "ferry-routes-line",
        type: "line",
        source: "ferry-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["case", ["get", "selected"], 4.5, 3],
          "line-opacity": ["case", ["get", "dimmed"], 0.16, 1],
        },
      });
      // Durée écrite le long de la ligne, sans pastille.
      map.addLayer({
        id: "ferry-routes-duration",
        type: "symbol",
        source: "ferry-routes",
        minzoom: 4.2,
        layout: {
          "symbol-placement": "line-center",
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-letter-spacing": 0.04,
          "text-rotation-alignment": "map",
          "text-pitch-alignment": "viewport",
          "text-keep-upright": true,
          "text-offset": [0, -0.8],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": ["get", "color"],
          "text-halo-color": mapColor("--map-route-casing"),
          "text-halo-width": 1.2,
          "text-opacity": ["case", ["get", "dimmed"], 0.2, 1],
        },
      });
      const pickRoute = (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.["id"];
        if (typeof id === "string") selectRef.current({ type: "route", id });
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
      map.resize();
    });

    return () => {
      readyRef.current = false;
      portMarkersRef.current.forEach((marker) => marker.remove());
      portMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Port markers: GPS position comes from the data, label placement is separate.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const activeIds = new Set(highlightedPortIds);
    const dimming = highlightedPortIds.length > 0;

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
        dot.setAttribute("aria-label", port.name);
        const label = document.createElement("span");
        label.className = "port-marker__label";
        label.textContent = port.name;
        el.append(dot, label);
        const select = (event: Event) => {
          event.stopPropagation();
          selectRef.current({ type: "port", id: port.id });
        };
        dot.addEventListener("click", select);
        label.addEventListener("click", select);

        Object.assign(
          label.style,
          portLabelPlacements[port.name] ?? anchorStyles[port.label_anchor] ?? anchorStyles["left"],
        );

        marker = new Marker({ element: el })
          .setLngLat([port.longitude, port.latitude])
          .addTo(map);
        portMarkersRef.current.set(port.id, marker);
      }
      const element = marker.getElement();
      element.dataset["active"] = String(activeIds.has(port.id));
      element.dataset["dimmed"] = String(dimming && !activeIds.has(port.id));
      // Port temporairement fermé : marqueur neutre, sans couleur de port.
      element.dataset["closed"] = String(port.status === "inactive");
    });

    portMarkersRef.current.forEach((marker, id) => {
      if (!ports.some((port) => port.id === id)) {
        marker.remove();
        portMarkersRef.current.delete(id);
      }
    });
  }, [ports, highlightedPortIds]);

  // Route lines + durations along each line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const portMap = new Map(ports.map((port) => [port.id, port]));
    const visible = new Set(visibleRouteIds);
    const focus = new Set(focusRouteIds);
    const selectedRouteId = selection?.type === "route" ? selection.id : null;

    const apply = () => {
      const source = map.getSource("ferry-routes") as GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: routeFeatures(routes, portMap, visible, focus, selectedRouteId),
      });
    };

    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [routes, ports, visibleRouteIds, focusRouteIds, selection]);

  // Recentre on the selection without hiding the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selection) return;
    if (selection.type === "port") {
      const port = ports.find((item) => item.id === selection.id);
      if (port) map.easeTo({ center: [port.longitude, port.latitude], duration: 600 });
      return;
    }
    if (selection.type === "route") {
      const route = routes.find((item) => item.id === selection.id);
      const from = ports.find((item) => item.id === route?.departure_port_id);
      const to = ports.find((item) => item.id === route?.arrival_port_id);
      if (from && to) {
        map.fitBounds(
          [
            [Math.min(from.longitude, to.longitude), Math.min(from.latitude, to.latitude)],
            [Math.max(from.longitude, to.longitude), Math.max(from.latitude, to.latitude)],
          ],
          { padding: 90, duration: 600, maxZoom: 7 },
        );
      }
    }
  }, [selection, ports, routes]);

  // NB : maplibre-gl.css force `position: relative` sur `.maplibregl-map`,
  // donc on dimensionne le conteneur en h/w plutôt qu'avec inset-0.
  return <div ref={containerRef} className="h-full w-full" />;
}
