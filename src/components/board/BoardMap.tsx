import { useEffect, useRef } from "react";
import {
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { routeArc } from "@/lib/ferry/geo";
import type { Port, RouteLine } from "@/lib/ferry/types";

setWorkerUrl(workerUrl);
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/** Carte du tableau : les lignes filtrées, et le trajet choisi mis en avant. */
export default function BoardMap({
  routes,
  ports,
  routeIds,
  selectedRouteId,
  selectedAlert,
}: {
  routes: RouteLine[];
  ports: Port[];
  routeIds: string[];
  selectedRouteId: string | null;
  selectedAlert: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false);
  const draw = useRef<() => void>(() => {});

  draw.current = () => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    const portById = new Map(ports.map((port) => [port.id, port]));
    const shown = new Set(routeIds);
    if (selectedRouteId) shown.add(selectedRouteId);
    const usedPorts = new Set<string>();
    const features = routes.flatMap((route) => {
      if (!shown.has(route.id)) return [];
      const from = portById.get(route.departure_port_id);
      const to = portById.get(route.arrival_port_id);
      if (!from || !to) return [];
      usedPorts.add(from.id);
      usedPorts.add(to.id);
      return [
        {
          type: "Feature" as const,
          properties: { selected: route.id === selectedRouteId ? 1 : 0 },
          geometry: { type: "LineString" as const, coordinates: routeArc(from, to) },
        },
      ];
    });
    (map.getSource("board-lines") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features,
    });
    (map.getSource("board-ports") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: ports
        .filter((port) => usedPorts.has(port.id))
        .map((port) => ({
          type: "Feature" as const,
          properties: { name: port.name },
          geometry: { type: "Point" as const, coordinates: [port.longitude, port.latitude] },
        })),
    });
    map.setPaintProperty("board-lines", "line-color", [
      "case",
      ["==", ["get", "selected"], 1],
      selectedAlert ? "#c81e1e" : "#0e7a43",
      "#6f9db5",
    ]);
    const focus = features.filter((f) => f.properties.selected === 1);
    const coords = (focus.length ? focus : features).flatMap((f) => f.geometry.coordinates);
    if (coords.length) {
      const bounds = coords.reduce(
        (all, point) => all.extend(point as [number, number]),
        new LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]),
      );
      map.fitBounds(bounds, { padding: 50, maxZoom: 7, duration: 700 });
    }
  };

  useEffect(() => {
    if (!box.current) return;
    const map = new MapLibreMap({
      container: box.current,
      style: MAP_STYLE,
      center: [3, 39],
      zoom: 4.4,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.scrollZoom.disable();
    mapRef.current = map;
    map.on("load", () => {
      map.addSource("board-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("board-ports", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "board-lines",
        type: "line",
        source: "board-lines",
        layout: { "line-cap": "round", "line-sort-key": ["get", "selected"] },
        paint: {
          "line-color": "#6f9db5",
          "line-width": ["case", ["==", ["get", "selected"], 1], 4.5, 1.6],
          "line-color-transition": { duration: 300 },
        },
      });
      map.addLayer({
        id: "board-ports",
        type: "circle",
        source: "board-ports",
        paint: {
          "circle-radius": 5,
          "circle-color": "#0e7a43",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "board-port-names",
        type: "symbol",
        source: "board-ports",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-font": ["Noto Sans Bold"],
        },
        paint: { "text-color": "#16324a", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      });
      loaded.current = true;
      draw.current();
    });
    return () => {
      loaded.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  const signature = `${routeIds.join(",")}|${selectedRouteId}|${selectedAlert}`;
  useEffect(() => {
    draw.current();
  }, [signature, routes, ports]);

  return (
    <div ref={box} className="h-full w-full" aria-label="Carte des lignes affichées" role="img" />
  );
}
