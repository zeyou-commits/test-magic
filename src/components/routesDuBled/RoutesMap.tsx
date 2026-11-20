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
import { KIND_COLOR, type StopKind } from "@/lib/routesDuBled/data";

setWorkerUrl(workerUrl);
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export type MapLine = { id: string; coords: [number, number][]; active: boolean };
export type MapPin = {
  id: string;
  lat: number;
  lon: number;
  k: StopKind;
  /** Numéro de l'étape, écrit dans la pastille. */
  label?: string;
  main: boolean;
};

/**
 * Carte du trajet : le trajet choisi en avant, les autres routes en fond, et seulement les haltes
 * retenues pour les étapes. Elle suit l'étape regardée.
 */
export default function RoutesMap({
  lines,
  pins,
  focus,
  fitKey,
  onSelectPin,
  picking = false,
  onPick,
}: {
  lines: MapLine[];
  pins: MapPin[];
  /** Point à centrer (étape regardée). */
  focus: { lat: number; lon: number } | null;
  /** Change quand le trajet change : la carte se recadre sur lui. */
  fitKey: string;
  onSelectPin: (id: string) => void;
  picking?: boolean;
  onPick?: (lon: number, lat: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false);
  const draw = useRef<() => void>(() => {});
  const handlers = useRef({ onSelectPin, onPick, picking });
  handlers.current = { onSelectPin, onPick, picking };
  const lastFit = useRef<string | null>(null);
  const lastFocus = useRef<string | null>(null);
  const lastBounds = useRef<LngLatBounds | null>(null);

  draw.current = () => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource("rdb-lines") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: lines.map((l) => ({
        type: "Feature" as const,
        properties: { id: l.id, active: l.active ? 1 : 0 },
        geometry: { type: "LineString" as const, coordinates: l.coords },
      })),
    });
    (map.getSource("rdb-stops") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: pins.map((p) => ({
        type: "Feature" as const,
        properties: {
          id: p.id,
          color: KIND_COLOR[p.k],
          main: p.main ? 1 : 0,
          label: p.label ?? "",
        },
        geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
      })),
    });
    const active = lines.filter((l) => l.active).flatMap((l) => l.coords);
    if (active.length && lastFit.current !== fitKey) {
      lastFit.current = fitKey;
      lastFocus.current = null;
      const first = active[0]!;
      const bounds = active.reduce((all, c) => all.extend(c), new LngLatBounds(first, first));
      lastBounds.current = bounds;
      map.fitBounds(bounds, { padding: 36, maxZoom: 9, duration: 700 });
    }
    const key = focus ? `${focus.lat},${focus.lon}` : null;
    if (focus && key !== lastFocus.current) {
      lastFocus.current = key;
      map.easeTo({
        center: [focus.lon, focus.lat],
        zoom: Math.max(map.getZoom(), 8.5),
        duration: 600,
      });
    }
  };

  useEffect(() => {
    if (!box.current) return;
    const map = new MapLibreMap({
      container: box.current,
      style: MAP_STYLE,
      center: [2, 41],
      zoom: 4.4,
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
        filter: ["==", ["get", "active"], 1],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f2b33d", "line-width": 12, "line-opacity": 0.3 },
      });
      map.addLayer({
        id: "rdb-lines",
        type: "line",
        source: "rdb-lines",
        layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["get", "active"] },
        paint: {
          "line-color": ["case", ["==", ["get", "active"], 1], "#d9861c", "#8fb3c6"],
          "line-width": ["case", ["==", ["get", "active"], 1], 4.5, 1.5],
          "line-opacity": ["case", ["==", ["get", "active"], 1], 1, 0.45],
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
            ["case", ["==", ["get", "main"], 1], 9, 4],
            9,
            ["case", ["==", ["get", "main"], 1], 13, 7],
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["case", ["==", ["get", "main"], 1], 2.5, 1.5],
        },
      });
      map.addLayer({
        id: "rdb-stops-label",
        type: "symbol",
        source: "rdb-stops",
        filter: ["all", ["==", ["get", "main"], 1], ["!=", ["get", "label"], ""]],
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-font": ["Noto Sans Bold"],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#ffffff" },
      });
      map.on("click", (e) => {
        if (handlers.current.picking)
          handlers.current.onPick?.(+e.lngLat.lng.toFixed(5), +e.lngLat.lat.toFixed(5));
      });
      map.on("click", "rdb-stops", (e: MapLayerMouseEvent) => {
        if (handlers.current.picking) return;
        const id = e.features?.[0]?.properties?.["id"];
        if (typeof id === "string") handlers.current.onSelectPin(id);
      });
      map.on("mouseenter", "rdb-stops", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "rdb-stops", () => (map.getCanvas().style.cursor = ""));
      loaded.current = true;
      draw.current();
    });
    // La carte peut être dépliée ou repliée : elle reprend sa taille.
    // Si elle n'avait pas encore sa taille au premier cadrage, on recadre sur le trajet.
    const obs = new ResizeObserver(() => {
      map.resize();
      if (lastBounds.current && !lastFocus.current)
        map.fitBounds(lastBounds.current, { padding: 36, maxZoom: 9, duration: 0 });
    });
    obs.observe(box.current);
    return () => {
      obs.disconnect();
      loaded.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    draw.current();
  }, [lines, pins, focus, fitKey]);

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
