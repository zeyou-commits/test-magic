import { useEffect, useRef } from "react";
import {
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { tr } from "@/lib/i18n";
import { KIND_COLOR, type BledRoute, type Stop } from "@/lib/routesDuBled/data";

setWorkerUrl(workerUrl);
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/**
 * Carte des routes du bled : toutes les routes en fond, la route choisie en avant,
 * ses haltes en pastilles colorées par type. Toucher une pastille ouvre sa fiche.
 */
export default function RoutesMap({
  routes,
  selectedId,
  stops,
  selectedStopId,
  onSelectRoute,
  onSelectStop,
  picking = false,
  onPick,
}: {
  routes: BledRoute[];
  selectedId: string;
  stops: Stop[];
  selectedStopId: string | null;
  onSelectRoute: (id: string) => void;
  onSelectStop: (id: string) => void;
  /** Mode « placer la halte » : le prochain toucher sur la carte donne la position. */
  picking?: boolean;
  onPick?: (lon: number, lat: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false);
  const draw = useRef<() => void>(() => {});
  const handlers = useRef({ onSelectRoute, onSelectStop, onPick, picking });
  handlers.current = { onSelectRoute, onSelectStop, onPick, picking };
  const lastFit = useRef<string | null>(null);

  draw.current = () => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource("rdb-lines") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: routes.map((r) => ({
        type: "Feature" as const,
        properties: { id: r.id, selected: r.id === selectedId ? 1 : 0 },
        geometry: {
          type: "LineString" as const,
          coordinates: r.line.map(([lon, lat]) => [lon, lat]),
        },
      })),
    });
    (map.getSource("rdb-stops") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: stops.map((s) => ({
        type: "Feature" as const,
        properties: {
          id: s.id,
          color: KIND_COLOR[s.k],
          selected: s.id === selectedStopId ? 1 : 0,
          community: s.src === "osm" ? 0 : 1,
        },
        geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
      })),
    });
    const route = routes.find((r) => r.id === selectedId);
    if (route && lastFit.current !== route.id) {
      lastFit.current = route.id;
      const first = route.line[0]!;
      const bounds = route.line.reduce(
        (all, [lon, lat]) => all.extend([lon, lat]),
        new LngLatBounds([first[0], first[1]], [first[0], first[1]]),
      );
      map.fitBounds(bounds, { padding: 40, maxZoom: 9, duration: 700 });
    }
    if (selectedStopId) {
      const stop = stops.find((s) => s.id === selectedStopId);
      if (stop)
        map.easeTo({
          center: [stop.lon, stop.lat],
          zoom: Math.max(map.getZoom(), 9),
          duration: 600,
        });
    }
  };

  useEffect(() => {
    if (!box.current) return;
    const map = new MapLibreMap({
      container: box.current,
      style: MAP_STYLE,
      center: [2, 40],
      zoom: 4.2,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.scrollZoom.disable();
    mapRef.current = map;
    map.on("load", () => {
      map.addSource("rdb-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("rdb-stops", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "rdb-lines-halo",
        type: "line",
        source: "rdb-lines",
        filter: ["==", ["get", "selected"], 1],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f2b33d", "line-width": 12, "line-opacity": 0.28 },
      });
      map.addLayer({
        id: "rdb-lines",
        type: "line",
        source: "rdb-lines",
        layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["get", "selected"] },
        paint: {
          "line-color": ["case", ["==", ["get", "selected"], 1], "#d9861c", "#6f9db5"],
          "line-width": ["case", ["==", ["get", "selected"], 1], 4.5, 2],
          "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.6],
        },
      });
      map.addLayer({
        id: "rdb-stops",
        type: "circle",
        source: "rdb-stops",
        paint: {
          // Le zoom doit rester au premier niveau de l'expression.
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            ["case", ["==", ["get", "selected"], 1], 9, 5],
            9,
            ["case", ["==", ["get", "selected"], 1], 12, 8],
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-color": ["case", ["==", ["get", "community"], 1], "#0e7a43", "#ffffff"],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "selected"], 1],
            3,
            ["==", ["get", "community"], 1],
            2.5,
            1.5,
          ],
        },
      });
      map.on("click", (e) => {
        if (handlers.current.picking)
          handlers.current.onPick?.(+e.lngLat.lng.toFixed(5), +e.lngLat.lat.toFixed(5));
      });
      map.on("click", "rdb-stops", (e: MapLayerMouseEvent) => {
        if (handlers.current.picking) return;
        const id = e.features?.[0]?.properties?.["id"];
        if (typeof id === "string") handlers.current.onSelectStop(id);
      });
      map.on("click", "rdb-lines", (e: MapLayerMouseEvent) => {
        if (handlers.current.picking) return;
        if (map.queryRenderedFeatures(e.point, { layers: ["rdb-stops"] }).length) return;
        const id = e.features?.[0]?.properties?.["id"];
        if (typeof id === "string") handlers.current.onSelectRoute(id);
      });
      for (const layer of ["rdb-stops", "rdb-lines"]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
      loaded.current = true;
      draw.current();
    });
    return () => {
      loaded.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    draw.current();
  }, [routes, selectedId, stops, selectedStopId]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = picking ? "crosshair" : "";
  }, [picking]);

  return (
    <div
      ref={box}
      className="h-full w-full"
      role="img"
      aria-label={tr("ui.pageRoutesDuBled.carteAria")}
    />
  );
}
