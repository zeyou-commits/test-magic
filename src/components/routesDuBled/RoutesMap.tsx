import { useEffect, useRef } from "react";
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
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
const ROUTE = "#d9861c";
const SEA = "#4f86b5";
const INK = "#0d3043";
// Place en haut pour la 504 et son étiquette, posées au-dessus de leur point.
const FIT_PAD = { top: 96, bottom: 48, left: 48, right: 48 };

/**
 * fond : les autres routes du bled ; autre : un chemin proposé non choisi (cliquable) ;
 * choisi : le chemin choisi ; approche : de la maison à l'autoroute, ou de la route au village ;
 * trou : bout du chemin sans bon plan relevé ; mer : la traversée.
 */
export type LineKind = "fond" | "autre" | "choisi" | "approche" | "trou" | "mer";
export type MapLine = { id: string; coords: [number, number][]; kind: LineKind };
export type MapPin = {
  id: string;
  lat: number;
  lon: number;
  k: StopKind;
  /** Numéro de l'étape, posé dans une petite pastille. */
  label?: string;
  /** Étape du trajet (grosse pastille) ou halte voisine (petite, au zoom). */
  main: boolean;
};
export type MapPlace = { lon: number; lat: number; label: string };

// Pictos : tracés des icônes lucide déjà utilisées dans le site (licence ISC).
const GLYPH: Record<StopKind, string> = {
  carburant:
    '<path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5"/><path d="M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16"/><path d="M2 21h13"/><path d="M3 9h11"/>',
  aire: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  manger:
    '<path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/>',
  priere:
    '<path d="M18 5h4"/><path d="M20 3v4"/><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  dormir:
    '<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/>',
  garage:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>',
  billets:
    '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  port: '<path d="M12 10.189V14"/><path d="M12 2v3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76"/><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  autre:
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
};
const HOUSE =
  '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';

/** Pastille dessinée en SVG (2× pour les écrans nets), avec une ombre douce. */
function pastille(
  size: number,
  fill: string,
  ring: string,
  ringW: number,
  glyph: string,
  ink: string,
  g: number,
) {
  const c = size / 2;
  const r = c - 4;
  const s = g / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs><filter id="o" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#0d3043" flood-opacity=".28"/></filter></defs>
<circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="${ring}" stroke-width="${ringW}" filter="url(#o)"/>
<g transform="translate(${c - g / 2} ${c - g / 2}) scale(${s})" fill="none" stroke="${ink}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
}
function badge() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="14" fill="#fff" stroke="${INK}" stroke-width="3"/></svg>`;
}
async function addSvg(map: MapLibreMap, name: string, svg: string) {
  if (map.hasImage(name)) return;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  if (!map.hasImage(name)) map.addImage(name, img, { pixelRatio: 2 });
}
async function addIcons(map: MapLibreMap) {
  const jobs: Promise<void>[] = [addSvg(map, "rdb-badge", badge())];
  for (const k of Object.keys(GLYPH) as StopKind[]) {
    const color = KIND_COLOR[k];
    jobs.push(
      addSvg(map, `rdb-e-${k}`, pastille(68, color, "#ffffff", 4, GLYPH[k], "#ffffff", 30)),
    );
    jobs.push(addSvg(map, `rdb-h-${k}`, pastille(48, "#ffffff", color, 3, GLYPH[k], color, 22)));
  }
  await Promise.all(jobs);
}

function placeEl(kind: "start" | "end", label: string) {
  const el = document.createElement("div");
  el.className = `rdb-mk rdb-mk--${kind}`;
  const icon =
    kind === "start"
      ? '<img src="/cabas/persos/voiture_504.webp" alt="" width="46" height="46">'
      : `<span class="rdb-mk__pin"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${HOUSE}</svg></span>`;
  el.innerHTML = `${icon}<span class="rdb-mk__label"></span>`;
  el.querySelector(".rdb-mk__label")!.textContent = label;
  return el;
}

/**
 * Carte du porte à porte : le chemin choisi en avant, les autres chemins proposés en léger,
 * les étapes en pastilles à picto, les haltes voisines au zoom. La 504 marque le départ.
 */
export default function RoutesMap({
  lines,
  pins,
  start,
  end,
  ports = [],
  focus,
  fitKey,
  onSelectPin,
  onSelectLine,
  picking = false,
  onPick,
}: {
  lines: MapLine[];
  pins: MapPin[];
  start?: MapPlace | null;
  end?: MapPlace | null;
  ports?: MapPlace[];
  /** Point à centrer (étape regardée). */
  focus: { lat: number; lon: number } | null;
  /** Change quand le trajet change : la carte se recadre sur lui. */
  fitKey: string;
  onSelectPin: (id: string) => void;
  onSelectLine?: (id: string) => void;
  picking?: boolean;
  onPick?: (lon: number, lat: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loaded = useRef(false);
  const draw = useRef<() => void>(() => {});
  const handlers = useRef({ onSelectPin, onSelectLine, onPick, picking });
  handlers.current = { onSelectPin, onSelectLine, onPick, picking };
  const lastFit = useRef<string | null>(null);
  const lastFocus = useRef<string | null>(null);
  const lastBounds = useRef<LngLatBounds | null>(null);
  type Placed = { key: string; marker: Marker } | null;
  const markers = useRef<{ start: Placed; end: Placed }>({ start: null, end: null });

  draw.current = () => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    (map.getSource("rdb-lines") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: lines.map((l) => ({
        type: "Feature" as const,
        properties: { id: l.id, kind: l.kind },
        geometry: { type: "LineString" as const, coordinates: l.coords },
      })),
    });
    (map.getSource("rdb-stops") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: [
        ...pins.map((p) => ({
          type: "Feature" as const,
          properties: {
            id: p.id,
            icon: `rdb-${p.main ? "e" : "h"}-${p.k}`,
            main: p.main ? 1 : 0,
            label: p.label ?? "",
          },
          geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
        })),
        ...ports.map((p, i) => ({
          type: "Feature" as const,
          properties: { id: `port-${i}`, icon: "rdb-e-port", main: 1, label: "", name: p.label },
          geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
        })),
      ],
    });
    // La 504 et l'épingle ne sont recréées que si le lieu change.
    for (const kind of ["start", "end"] as const) {
      const place = kind === "start" ? start : end;
      const key = place ? `${place.lon},${place.lat},${place.label}` : "";
      const cur = markers.current[kind];
      if (cur?.key === key) continue;
      cur?.marker.remove();
      markers.current[kind] = place
        ? {
            key,
            marker: new Marker({ element: placeEl(kind, place.label), anchor: "bottom" })
              .setLngLat([place.lon, place.lat])
              .addTo(map),
          }
        : null;
    }
    if (lastFit.current !== fitKey) {
      lastFit.current = fitKey;
      lastFocus.current = null;
      const pts: [number, number][] = lines
        .filter((l) => l.kind !== "fond")
        .flatMap((l) => l.coords);
      if (start) pts.push([start.lon, start.lat]);
      if (end) pts.push([end.lon, end.lat]);
      const all = pts.length
        ? pts
        : ([
            [-6, 34.5],
            [9, 51],
          ] as [number, number][]);
      const first = all[0]!;
      const bounds = all.reduce((b, c) => b.extend(c), new LngLatBounds(first, first));
      lastBounds.current = bounds;
      map.fitBounds(bounds, { padding: FIT_PAD, maxZoom: 9, duration: 700 });
    }
    const key = focus ? `${focus.lat},${focus.lon}` : null;
    if (focus && key !== lastFocus.current) {
      lastFocus.current = key;
      map.easeTo({
        center: [focus.lon, focus.lat],
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
      center: [2, 42],
      zoom: 4.2,
      attributionControl: { compact: true },
      cooperativeGestures: true,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": tr("ui.pageRoutesDuBled.carteZoomPc"),
        "CooperativeGesturesHandler.MacHelpText": tr("ui.pageRoutesDuBled.carteZoomMac"),
        "CooperativeGesturesHandler.MobileHelpText": tr("ui.pageRoutesDuBled.carteZoomMobile"),
      },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;
    map.on("load", async () => {
      await addIcons(map);
      map.addSource("rdb-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("rdb-stops", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      const line = (id: string, kind: LineKind, paint: Record<string, unknown>, round = true) =>
        map.addLayer({
          id,
          type: "line",
          source: "rdb-lines",
          filter: ["==", ["get", "kind"], kind],
          layout: { "line-cap": round ? "round" : "butt", "line-join": "round" },
          paint: paint as never,
        });
      line("rdb-fond", "fond", {
        "line-color": "#8fb3c6",
        "line-width": 1.6,
        "line-opacity": 0.45,
      });
      line("rdb-autre", "autre", { "line-color": ROUTE, "line-width": 3.5, "line-opacity": 0.38 });
      line(
        "rdb-mer",
        "mer",
        { "line-color": SEA, "line-width": 2.4, "line-dasharray": [2, 2.2] },
        false,
      );
      map.addLayer({
        id: "rdb-choisi-halo",
        type: "line",
        source: "rdb-lines",
        filter: ["==", ["get", "kind"], "choisi"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.9 },
      });
      line("rdb-choisi", "choisi", { "line-color": ROUTE, "line-width": 5 });
      // Sans bon plan relevé : des tirets clairs sur le trait du chemin.
      line(
        "rdb-trou",
        "trou",
        { "line-color": "#fff4e2", "line-width": 2.2, "line-dasharray": [1.6, 2] },
        false,
      );
      line("rdb-approche", "approche", {
        "line-color": ROUTE,
        "line-width": 4,
        "line-dasharray": [0.1, 1.9],
      });
      map.addLayer({
        id: "rdb-haltes",
        type: "symbol",
        source: "rdb-stops",
        minzoom: 6.5,
        filter: ["==", ["get", "main"], 0],
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 6.5, 0.75, 10, 1],
          "icon-allow-overlap": false,
        },
      });
      map.addLayer({
        id: "rdb-etapes",
        type: "symbol",
        source: "rdb-stops",
        filter: ["==", ["get", "main"], 1],
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.78, 9, 1],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["coalesce", ["get", "name"], ""],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-offset": [0, 1.7],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: { "text-color": INK, "text-halo-color": "#ffffff", "text-halo-width": 1.6 },
      });
      map.addLayer({
        id: "rdb-etapes-n",
        type: "symbol",
        source: "rdb-stops",
        filter: ["all", ["==", ["get", "main"], 1], ["!=", ["get", "label"], ""]],
        layout: {
          "icon-image": "rdb-badge",
          "icon-offset": [15, -15],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 4, 0.78, 9, 1],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 10,
          "text-offset": [1.15, -1.15],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": INK },
      });
      map.on("click", (e) => {
        if (handlers.current.picking)
          handlers.current.onPick?.(+e.lngLat.lng.toFixed(5), +e.lngLat.lat.toFixed(5));
      });
      for (const layer of ["rdb-etapes", "rdb-haltes"]) {
        map.on("click", layer, (e: MapLayerMouseEvent) => {
          if (handlers.current.picking) return;
          const id = e.features?.[0]?.properties?.["id"];
          if (typeof id === "string" && !id.startsWith("port-")) handlers.current.onSelectPin(id);
        });
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
      map.on("click", "rdb-autre", (e: MapLayerMouseEvent) => {
        if (handlers.current.picking) return;
        // Une pastille posée sur le trait passe avant le trait.
        if (map.queryRenderedFeatures(e.point, { layers: ["rdb-etapes", "rdb-haltes"] }).length)
          return;
        const id = e.features?.[0]?.properties?.["id"];
        if (typeof id === "string") handlers.current.onSelectLine?.(id);
      });
      map.on("mouseenter", "rdb-autre", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "rdb-autre", () => (map.getCanvas().style.cursor = ""));
      loaded.current = true;
      draw.current();
    });
    // La carte peut changer de taille : elle reprend sa taille et son cadrage.
    const obs = new ResizeObserver(() => {
      map.resize();
      if (lastBounds.current && !lastFocus.current)
        map.fitBounds(lastBounds.current, { padding: FIT_PAD, maxZoom: 9, duration: 0 });
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
  }, [lines, pins, start, end, ports, focus, fitKey]);

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
