import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
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

setWorkerUrl(workerUrl);

export interface PortMeta {
  routes: number;
  companies: string[];
  vessels: string[];
  nextDeparture: string | null;
  nextTo: string | null;
  upcoming: { label: string; to: string | null }[];
  hasMore: boolean;
}

interface FerryMapProps {
  ports: Port[];
  routes: RouteLine[];
  visibleRouteIds: string[];
  focusRouteIds: string[];
  selection: Selection | null;
  highlightedPortIds: string[];
  portMeta: Record<string, PortMeta>;
  onSelect: (selection: Selection | null) => void;
}

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

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

function routeFeatures(routes: RouteLine[], ports: Map<string, Port>, visible: Set<string>, focus: Set<string>, selectedRouteId: string | null) {
  return routes.filter((route) => visible.has(route.id)).map((route) => {
    const from = ports.get(route.departure_port_id);
    const to = ports.get(route.arrival_port_id);
    if (!from || !to) return null;
    const dimmed = focus.size > 0 && !focus.has(route.id);
    return {
      type: "Feature" as const,
      properties: {
        id: route.id,
        color: routeColor(route.color, from.slug),
        label: route.typical_duration_minutes ? formatDuration(route.typical_duration_minutes) : "",
        selected: selectedRouteId === route.id,
        focused: focus.size > 0 && focus.has(route.id),
        dimmed,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]],
      },
    };
  }).filter((feature): feature is NonNullable<typeof feature> => feature !== null);
}

const anchorStyles: Record<string, Partial<CSSStyleDeclaration>> = {
  left: { right: "12px", top: "-9px" },
  right: { left: "12px", top: "-9px" },
  top: { transform: "translateX(-50%)", left: "0", bottom: "12px" },
  bottom: { transform: "translateX(-50%)", left: "0", top: "12px" },
};

function getPortLabelStyle(port: Port): Partial<CSSStyleDeclaration> {
  const base = anchorStyles[port.label_anchor] ?? anchorStyles.left;
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

export default function FerryMap({ ports, routes, visibleRouteIds, focusRouteIds, selection, highlightedPortIds, portMeta, onSelect }: FerryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const portMarkersRef = useRef<Map<string, Marker>>(new Map());
  const selectRef = useRef(onSelect);
  const [mapReady, setMapReady] = useState(false);
  selectRef.current = onSelect;
  const isMobile = useIsMobile();
  const hasFocus = focusRouteIds.length > 0;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = new MapLibreMap({
      container,
      style: MAP_STYLE,
      center: [2.6, 39.4],
      zoom: 3.7,
      pitch: 30,
      bearing: 0,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const resize = () => requestAnimationFrame(() => mapRef.current?.resize());
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    window.addEventListener("resize", resize);

    map.on("error", (e) => console.error("MAP ERROR", e.error?.message ?? e.error));

    map.on("load", () => {
      ["label_other", "label_village", "label_town", "label_city", "label_city_capital", "label_country_1", "label_country_2", "label_country_3"].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
      });

      map.addSource("algeria-highlight", { type: "geojson", data: algeriaGeoJson });
      map.addLayer({ id: "algeria-highlight-fill", type: "fill", source: "algeria-highlight", paint: { "fill-color": mapColor("--map-country-highlight"), "fill-opacity": 0.28 } });
      map.addLayer({ id: "algeria-highlight-outline", type: "line", source: "algeria-highlight", paint: { "line-color": mapColor("--map-country-outline"), "line-width": 1.5, "line-opacity": 0.7 } });
      map.addSource("ferry-routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "ferry-routes-casing", type: "line", source: "ferry-routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": mapColor("--map-route-casing"), "line-width": ["case", ["get", "selected"], 7, 5], "line-opacity": ["case", ["get", "dimmed"], 0.1, 0.8] } });
      map.addLayer({ id: "ferry-routes-line", type: "line", source: "ferry-routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "selected"], 4.5, 3], "line-opacity": ["case", ["get", "dimmed"], 0.16, 1] } });
      map.addLayer({
        id: "ferry-routes-duration",
        type: "symbol",
        source: "ferry-routes",
        minzoom: 3.4,
        layout: { "symbol-placement": "line-center", "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-letter-spacing": 0.04, "text-rotation-alignment": "map", "text-pitch-alignment": "viewport", "text-keep-upright": true, "text-offset": [0, -0.9], "text-allow-overlap": true, "text-ignore-placement": true },
        paint: { "text-color": ["get", "color"], "text-halo-color": mapColor("--map-route-casing"), "text-halo-width": 1.6, "text-opacity": ["case", ["get", "dimmed"], 0.2, 1] },
      });

      const pickRoute = (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.["id"];
        if (typeof id === "string") selectRef.current({ type: "route", id });
      };
      map.on("click", "ferry-routes-line", pickRoute);
      map.on("click", "ferry-routes-duration", pickRoute);
      map.on("mouseenter", "ferry-routes-line", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "ferry-routes-line", () => { map.getCanvas().style.cursor = ""; });
      map.on("click", (event: MapMouseEvent) => {
        const hits = map.queryRenderedFeatures(event.point, { layers: ["ferry-routes-line", "ferry-routes-duration"] });
        if (hits.length === 0) selectRef.current(null);
      });

      readyRef.current = true;
      setMapReady(true);
      requestAnimationFrame(() => map.resize());
    });

    return () => {
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const activeIds = new Set(highlightedPortIds);
    const dimming = highlightedPortIds.length > 0;

    ports.forEach((port) => {
      const existing = portMarkersRef.current.get(port.id);
      let marker: Marker;
      if (existing) marker = existing;
      else {
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
        const tip = document.createElement("div");
        tip.className = "port-tip";
        el.append(dot, label, tip);
        const select = (event: Event) => { event.stopPropagation(); selectRef.current({ type: "port", id: port.id }); };
        dot.addEventListener("click", select);
        label.addEventListener("click", select);
        marker = new Marker({ element: el }).setLngLat([port.longitude, port.latitude]).addTo(map);
        portMarkersRef.current.set(port.id, marker);
      }

      const element = marker.getElement();
      const label = element.querySelector<HTMLSpanElement>(".port-marker__label");
      const meta = portMeta[port.id];
      const routeCount = meta?.routes ?? 0;
      const singleLineAlgerianSlugs = new Set(["ghazaouet", "mostaganem", "skikda", "annaba"]);
      const isSingleLineAlgerianPort = singleLineAlgerianSlugs.has((port.slug ?? "").toLowerCase());
      if (label) {
        Object.assign(label.style, getPortLabelStyle(port));
        label.style.fontSize = isSingleLineAlgerianPort ? "6px" : "12px";
        label.style.fontWeight = isSingleLineAlgerianPort ? "500" : "700";
      }
      element.dataset["active"] = String(activeIds.has(port.id));
      element.dataset["dimmed"] = String(dimming && !activeIds.has(port.id));
      element.dataset["closed"] = String(port.status === "inactive");
      marker.setLngLat([port.longitude, port.latitude]);

      const tip = element.querySelector<HTMLDivElement>(".port-tip");
      if (!tip) return;
      tip.textContent = "";
      const title = document.createElement("p");
      title.className = "port-tip__title";
      title.textContent = port.name;
      const place = document.createElement("p");
      place.className = "port-tip__meta";
      place.textContent = [port.city, port.country_name].filter(Boolean).join(" · ");
      tip.append(title, place);
      if (port.status === "inactive") {
        const closed = document.createElement("p");
        closed.className = "port-tip__closed";
        closed.textContent = "Temporairement fermé";
        tip.append(closed);
      }
      const lines = document.createElement("p");
      lines.className = "port-tip__meta";
      lines.textContent = routeCount === 0 ? "Aucune ligne visible" : routeCount === 1 ? "1 ligne" : `${routeCount} lignes`;
      tip.append(lines);
      if (meta?.companies?.length) {
        const companies = document.createElement("p");
        companies.className = "port-tip__meta";
        companies.textContent = `Compagnies : ${meta.companies.slice(0, 3).join(", ")}${meta.companies.length > 3 ? ` +${meta.companies.length - 3}` : ""}`;
        tip.append(companies);
      }
      if (meta?.vessels?.length) {
        const vessels = document.createElement("p");
        vessels.className = "port-tip__meta";
        vessels.textContent = `Navires : ${meta.vessels.slice(0, 3).join(", ")}${meta.vessels.length > 3 ? ` +${meta.vessels.length - 3}` : ""}`;
        tip.append(vessels);
      }
      if (meta?.upcoming?.length) {
        const heading = document.createElement("p");
        heading.className = "port-tip__meta port-tip__departures-title";
        heading.textContent = "Prochains départs";
        tip.append(heading);
        const list = document.createElement("ul");
        list.className = "port-tip__departures";
        meta.upcoming.forEach((item) => {
          const row = document.createElement("li");
          row.textContent = `${item.label}${item.to ? ` → ${item.to}` : ""}`;
          list.append(row);
        });
        tip.append(list);
        if (meta.hasMore) {
          const more = document.createElement("button");
          more.type = "button";
          more.className = "port-tip__more";
          more.textContent = "Voir plus →";
          more.addEventListener("click", (event) => { event.stopPropagation(); selectRef.current({ type: "port", id: port.id }); });
          tip.append(more);
        }
      } else {
        const next = document.createElement("p");
        next.className = "port-tip__next";
        next.textContent = "Prochain départ non connu";
        tip.append(next);
      }
    });

    portMarkersRef.current.forEach((marker, id) => {
      if (!ports.some((port) => port.id === id)) {
        marker.remove();
        portMarkersRef.current.delete(id);
      }
    });
  }, [ports, highlightedPortIds, portMeta, mapReady]);

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
      source.setData({ type: "FeatureCollection", features: routeFeatures(routes, portMap, visible, focus, selectedRouteId) });
    };
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [routes, ports, visibleRouteIds, focusRouteIds, selection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer("ferry-routes-duration")) return;
      const showMobileDurations = !isMobile || hasFocus;
      map.setLayoutProperty("ferry-routes-duration", "visibility", showMobileDurations ? "visible" : "none");
      map.setFilter("ferry-routes-duration", isMobile && hasFocus ? ["any", ["get", "selected"], ["get", "focused"]] : null);
      map.setLayoutProperty("ferry-routes-duration", "text-size", isMobile ? 13 : 11);
      map.setLayoutProperty("ferry-routes-duration", "text-allow-overlap", !isMobile);
      map.setLayoutProperty("ferry-routes-duration", "text-ignore-placement", !isMobile);
      map.setLayoutProperty("ferry-routes-duration", "text-padding", isMobile ? 6 : 2);
    };
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [isMobile, hasFocus]);

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
        map.fitBounds([[Math.min(from.longitude, to.longitude), Math.min(from.latitude, to.latitude)], [Math.max(from.longitude, to.longitude), Math.max(from.latitude, to.latitude)]], { padding: 90, duration: 600, maxZoom: 7 });
      }
    }
  }, [selection, ports, routes]);

  return <div ref={containerRef} className="h-full w-full" />;
}
