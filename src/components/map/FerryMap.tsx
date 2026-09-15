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

function routeFeatures(routes: RouteLine[], ports: Map<string, Port>, visible: Set<string>, focus: Set<string>, selection: Selection | null) {
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
  
  return visibleRoutes.map((route) => {
    const from = ports.get(route.departure_port_id);
    const to = ports.get(route.arrival_port_id);
    if (!from || !to) return null;
    
    const pairKey = [route.departure_port_id, route.arrival_port_id].sort().join("::");
    const group = pairGroups.get(pairKey) ?? [route];
    const displayRoute = group.slice().sort((a, b) => a.id.localeCompare(b.id))[0];
    const isDisplayRoute = route.id === displayRoute.id;
    const focusedPair = group.some((item) => focus.has(item.id));
    
    let durationMinutes: number | null = null;
    if (selectedRouteId) durationMinutes = group.find((item) => item.id === selectedRouteId)?.typical_duration_minutes ?? null;
    else if (selectedPortId) durationMinutes = group.filter((item) => item.departure_port_id === selectedPortId).map((item) => item.typical_duration_minutes).filter((value): value is number => value != null).sort((a, b) => b - a)[0] ?? null;
    else durationMinutes = group.map((item) => item.typical_duration_minutes).filter((value): value is number => value != null).sort((a, b) => b - a)[0] ?? null;
    
    const dimmed = focus.size > 0 && !focus.has(route.id) && !(isDisplayRoute && focusedPair);
    
    return { 
      type: "Feature" as const, 
      properties: { 
        id: route.id, 
        color: routeColor(route.color, from.slug), 
        label: isDisplayRoute && durationMinutes ? formatDuration(durationMinutes) : "", 
        selected: selectedRouteId === route.id, 
        focused: focus.has(route.id) || (isDisplayRoute && focusedPair), 
        dimmed 
      }, 
      geometry: { 
        type: "LineString" as const, 
        coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]] 
      } 
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
  const base: Partial<CSSStyleDeclaration> = anchorStyles[port.label_anchor] ?? anchorStyles["left"] ?? {};
  const x = Number(port.label_offset_x) || 0;
  const y = Number(port.label_offset_y) || 0;
  const baseTransform = base.transform ?? "";
  return { left: base.left ?? "", right: base.right ?? "", top: base.top ?? "", bottom: base.bottom ?? "", transform: `${baseTransform}${baseTransform ? " " : ""}translate(${x}px, ${y}px)` };
}

function positionPortTip(map: MapLibreMap, marker: Marker, tip: HTMLDivElement) {
  const container = map.getContainer();
  const mapRect = container.getBoundingClientRect();
  const markerRect = marker.getElement().getBoundingClientRect();
  const gap = 14;
  const padding = 10;
  const availableWidth = Math.max(0, mapRect.width - padding * 2);
  
  tip.style.maxWidth = `${Math.min(240, availableWidth)}px`;
  
  const tipRect = tip.getBoundingClientRect();
  const markerX = markerRect.left + markerRect.width / 2;
  const markerY = markerRect.top + markerRect.height / 2;
  const tipWidth = tipRect.width;
  const tipHeight = tipRect.height;
  
  let left = markerRect.right + gap;
  if (left + tipWidth > mapRect.right - padding) left = markerRect.left - tipWidth - gap;
  if (left < mapRect.left + padding) left = Math.max(mapRect.left + padding, markerX - tipWidth / 2);
  
  let top = markerY - tipHeight / 2;
  if (top < mapRect.top + padding) top = mapRect.top + padding;
  if (top + tipHeight > mapRect.bottom - padding) top = mapRect.bottom - padding - tipHeight;
  
  tip.style.left = `${left - markerRect.left}px`;
  tip.style.top = `${top - markerRect.top}px`;
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
      // Ici, on centre plus au Sud sur mobile (37.5) pour faire remonter la carte visuellement
      center: isMobile ? [4.0, 37.5] : [6.5, 39.0], 
      zoom: isMobile ? 4.0 : 5.0,
      pitch: isMobile ? 0 : 30,
      bearing: 0,
      attributionControl: false,
      fadeDuration: 0
    });
    
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right"); 
    
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
      map.addLayer({ id: "ferry-routes-line", type: "line", source: "ferry-routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "selected"], 4, 2.5], "line-opacity": ["case", ["get", "dimmed"], 0.16, 1] } });
      map.addLayer({ id: "ferry-routes-duration", type: "symbol", source: "ferry-routes", minzoom: 3.4, layout: { "symbol-placement": "line-center", "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-letter-spacing": 0.04, "text-rotation-alignment": "map", "text-pitch-alignment": "viewport", "text-keep-upright": true, "text-offset": [0, -0.9], "text-allow-overlap": true, "text-ignore-placement": true }, paint: { "text-color": ["get", "color"], "text-halo-color": mapColor("--map-route-casing"), "text-halo-width": 1.6, "text-opacity": ["case", ["get", "dimmed"], 0.2, 1] } });
      
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
    if (!map) return;
    
    // Modification dynamique des coordonnées au redimensionnement
    map.setCenter(isMobile ? [4.0, 37.5] : [6.5, 39.0]);
    map.setZoom(isMobile ? 4.0 : 5.0);
    map.setPitch(isMobile ? 0 : 30);
  }, [isMobile]);

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
        const visible = element.matches(":hover, [data-active=\"true\"]") || element.matches(":focus-within"); 
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
        dot.setAttribute("aria-label", port.name);
        
        const label = document.createElement("span"); 
        label.className = "port-marker__label"; 
        label.textContent = port.name;
        
        const tip = document.createElement("div"); 
        tip.className = "port-tip";
        
        el.append(dot, label, tip);
        
        const select = (event: Event) => { 
          event.stopPropagation(); 
          selectRef.current({ type: "port", id: port.id }); 
          requestAnimationFrame(() => positionPortTip(map, marker, tip)); 
        };
        
        dot.addEventListener("click", select); 
        label.addEventListener("click", select);
        el.addEventListener("mouseenter", () => requestAnimationFrame(() => positionPortTip(map, marker, tip)));
        
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
        label.style.fontSize = isSingleLineAlgerianPort ? `${Math.max(6, Math.min(12, 6 + (map.getZoom() - 4.8) * 2))}px` : "12px"; 
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
      const country = port.country_name ? `, ${port.country_name}` : ""; 
      const lineLabel = routeCount === 0 ? "aucune ligne visible" : routeCount === 1 ? "1 ligne" : `${routeCount} lignes`; 
      title.textContent = `${port.name}${country}, ${lineLabel}`; 
      tip.append(title);
      
      if (port.status === "inactive") { 
        const closed = document.createElement("p"); 
        closed.className = "port-tip__closed"; 
        closed.textContent = "Temporairement fermé"; 
        tip.append(closed); 
      }
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
          more.addEventListener("click", (event) => { 
            event.stopPropagation(); 
            selectRef.current({ type: "port", id: port.id }); 
          }); 
          tip.append(more); 
        }
      } else { 
        const next = document.createElement("p"); 
        next.className = "port-tip__next"; 
        next.textContent = "Prochain départ non connu"; 
        tip.append(next); 
      }
      requestAnimationFrame(() => { 
        if (element.matches(":hover, [data-active=\"true\"]") || element.matches(":focus-within")) positionPortTip(map, marker, tip); 
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

  useEffect(() => {
    const map = mapRef.current; 
    if (!map || !mapReady) return;
    
    const singleLineAlgerianSlugs = new Set(["ghazaouet", "mostaganem", "skikda", "annaba"]);
    const updateAlgerianLabelSizes = () => { 
      const zoom = map.getZoom(); 
      const fontSize = Math.max(6, Math.min(12, 6 + (zoom - 4.8) * 3)); 
      ports.forEach((port) => { 
        if (!singleLineAlgerianSlugs.has((port.slug ?? "").toLowerCase())) return; 
        const marker = portMarkersRef.current.get(port.id); 
        const label = marker?.getElement().querySelector<HTMLSpanElement>(".port-marker__label"); 
        if (label) label.style.fontSize = `${fontSize}px`; 
      }); 
    };
    
    updateAlgerianLabelSizes(); 
    map.on("zoom", updateAlgerianLabelSizes); 
    
    return () => { map.off("zoom", updateAlgerianLabelSizes); };
  }, [ports, mapReady]);

  useEffect(() => {
    const map = mapRef.current; 
    if (!map) return;
    
    const portMap = new Map(ports.map((port) => [port.id, port])); 
    const visible = new Set(visibleRouteIds); 
    const focus = new Set(focusRouteIds);
    
    const apply = () => { 
      const source = map.getSource("ferry-routes") as GeoJSONSource | undefined; 
      if (!source) return; 
      source.setData({ type: "FeatureCollection", features: routeFeatures(routes, portMap, visible, focus, selection) }); 
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
      map.setLayoutProperty("ferry-routes-duration", "text-allow-overlap", false); 
      map.setLayoutProperty("ferry-routes-duration", "text-ignore-placement", !isMobile); 
      map.setLayoutProperty("ferry-routes-duration", "text-padding", isMobile ? 6 : 2); 
    };
    
    if (readyRef.current) apply(); 
    else map.once("load", apply);
  }, [isMobile, hasFocus]);

  return <div ref={containerRef} className="h-full w-full" />;
}
