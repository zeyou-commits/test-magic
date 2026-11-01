import { useEffect, useRef, type RefObject } from "react";
import { Marker, type GeoJSONSource, type LngLatBoundsLike, type Map as MapLibreMap, MercatorCoordinate } from "maplibre-gl";
import {
  filmChips,
  filmFrame,
  filmZoom,
  JOURNEY_FILM_EVENT,
  JOURNEY_PICK_EVENT,
  JOURNEY_PICKED_EVENT,
  type JourneyFilmFrame,
  type LngLat,
  type PickTarget,
} from "@/lib/ferry/journeyFilm";

const SOURCE = "journey-film";
/** Ce qui s'efface pendant la démonstration : elle ne doit pas se mêler aux vrais navires. */
const QUIET_LAYERS = [
  "ferry-routes-glow",
  "ferry-routes-casing",
  "ferry-routes-line",
  "ferry-routes-duration",
  "fleet-halo",
  "fleet-ships",
  "fleet-photo-120",
  "fleet-photo-240",
  "fleet-photo-480",
  "fleet-heading",
  "fleet-alert",
  "fleet-labels",
  "fleet-count-bg",
  "fleet-count",
  "fleet-hover-halo",
];

type Padding = { top: number; right: number; bottom: number; left: number };
const line = (kind: string, coordinates: LngLat[]) => ({
  type: "Feature" as const,
  properties: { kind },
  geometry: { type: "LineString" as const, coordinates },
});

/**
 * Le film du trajet sur la carte : le tracé se dessine, la voiture roule, le navire prend la mer,
 * et la caméra suit. Le volet envoie le temps ; rien ici ne décide du calendrier.
 */
export function useJourneyFilm(
  mapRef: RefObject<MapLibreMap | null>,
  containerRef: RefObject<HTMLElement | null>,
  ready: boolean,
  viewPadding: () => Padding,
  limitBounds: LngLatBoundsLike,
  homeView: () => void,
  hasPreview: boolean,
) {
  const previewRef = useRef(hasPreview);
  previewRef.current = hasPreview;
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!ready || !map || !container) return;
    const ensureLayers = () => {
      if (map.getSource(SOURCE)) return;
      map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      const lineLayer = (id: string, kind: string, paint: Record<string, unknown>) =>
        map.addLayer({
          id,
          type: "line",
          source: SOURCE,
          filter: ["==", ["get", "kind"], kind],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: paint as never,
        });
      lineLayer("journey-plan-road", "plan-road", {
        "line-color": "#0e7a43",
        "line-width": 3,
        "line-opacity": 0.35,
      });
      lineLayer("journey-plan-sea", "plan-sea", {
        "line-color": "#1769a8",
        "line-width": 3,
        "line-opacity": 0.45,
        "line-dasharray": [1.5, 2],
      });
      // Une lueur sous le tracé : il se détache du fond de carte comme un trait de lumière.
      lineLayer("journey-glow-road", "done-road", {
        "line-color": "#22b573",
        "line-width": 16,
        "line-blur": 10,
        "line-opacity": 0.5,
      });
      lineLayer("journey-glow-sea", "done-sea", {
        "line-color": "#3aa0e8",
        "line-width": 16,
        "line-blur": 10,
        "line-opacity": 0.5,
      });
      lineLayer("journey-done-road-casing", "done-road", { "line-color": "#ffffff", "line-width": 7 });
      lineLayer("journey-done-sea-casing", "done-sea", { "line-color": "#ffffff", "line-width": 7 });
      lineLayer("journey-done-road", "done-road", { "line-color": "#0e7a43", "line-width": 4 });
      lineLayer("journey-done-sea", "done-sea", { "line-color": "#1769a8", "line-width": 4 });
      map.addLayer({
        id: "journey-pins",
        type: "circle",
        source: SOURCE,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#0e7a43",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
        },
      });
      map.addLayer({
        id: "journey-pin-labels",
        type: "symbol",
        source: SOURCE,
        filter: ["==", ["geometry-type"], "Point"],
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12.5,
          "text-offset": [0, -1.4],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#12303f", "text-halo-color": "#ffffff", "text-halo-width": 2 },
      });
    };
    const quiet = (hide: boolean) => {
      container.dataset["filmQuiet"] = hide ? "true" : "";
      for (const id of QUIET_LAYERS)
        if (map.getLayer(id))
          map.setLayoutProperty(id, "visibility", hide || previewRef.current ? "none" : "visible");
    };

    const vehicle = document.createElement("div");
    vehicle.className = "bw-film-vehicle";
    vehicle.setAttribute("aria-hidden", "true");
    vehicle.innerHTML =
      '<img class="bw-film-car" src="/cabas/persos/voiture_504.webp" alt="">' +
      '<span class="bw-film-ship"><i></i><i></i><i></i><img alt=""></span>';
    const car = vehicle.querySelector<HTMLElement>(".bw-film-car")!;
    const ship = vehicle.querySelector<HTMLElement>(".bw-film-ship")!;
    const shipImage = ship.querySelector("img")!;
    const marker = new Marker({ element: vehicle, anchor: "bottom" }).setLngLat([0, 0]);
    let shown = false;

    const caption = document.createElement("div");
    caption.className = "bw-film-caption";
    caption.setAttribute("role", "status");
    caption.hidden = true;
    container.append(caption);

    const hideFrame = () => {
      if (!shown) return;
      shown = false;
      marker.remove();
      caption.hidden = true;
      delete container.dataset["film"];
      clearRacers();
      clearChips();
      smoothCamera = null;
      raceKey = "";
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: [],
      });
    };

    // Les durées de chaque portion et les pauses, posées sur le trajet.
    let chipsKey = "";
    let chips: { at: number; kind: string; label: string; point: [number, number]; element: HTMLElement; marker: Marker }[] = [];
    const clearChips = () => {
      chips.forEach(({ marker }) => marker.remove());
      chips = [];
      chipsKey = "";
    };
    const syncChips = (frame: JourneyFilmFrame) => {
      if (chipsKey !== frame.film.key) {
        clearChips();
        chipsKey = frame.film.key;
        chips = filmChips(frame.film).map((chip) => {
          const element = document.createElement("div");
          element.className = "bw-film-chip";
          element.dataset["kind"] = chip.kind;
          element.textContent = chip.label;
          element.setAttribute("aria-hidden", "true");
          return {
            at: chip.at,
            kind: chip.kind,
            label: chip.label,
            point: chip.point,
            element,
            // Au port, l'étiquette passe sous le nom de la ville au lieu de le recouvrir.
            marker: new Marker({ element, anchor: "center", offset: [0, chip.kind === "port" ? 24 : 0] })
              .setLngLat(chip.point)
              .addTo(map),
          };
        });
      }
      for (const chip of chips) chip.element.dataset["reached"] = frame.minute >= chip.at ? "true" : "";
      // Deux étiquettes ne se recouvrent jamais : la portion en cours passe d'abord, puis les plus proches d'elle.
      const placed: { x: number; y: number; width: number }[] = [];
      const order = [...chips].sort(
        (a, b) => Math.abs(a.at - frame.minute) - Math.abs(b.at - frame.minute),
      );
      for (const chip of order) {
        const at = map.project(chip.point);
        const box = { x: at.x, y: at.y + (chip.kind === "port" ? 24 : 0), width: chip.label.length * 6.4 + 18 };
        const free = !placed.some(
          (other) => Math.abs(other.x - box.x) < (other.width + box.width) / 2 && Math.abs(other.y - box.y) < 25,
        );
        chip.element.style.visibility = free ? "visible" : "hidden";
        if (free) placed.push(box);
      }
    };
    // Caméra amortie : elle rejoint sa cible au lieu de sauter d'une étape à l'autre.
    let smoothCamera: { center: [number, number]; zoom: number; pitch: number } | null = null;

    // Le cadrage d'un ensemble de points. Le centre est celui des points : c'est jumpTo qui applique
    // le décalage du volet. Reprendre le centre de cameraForBounds le compterait deux fois.
    const frameAll = (all: [number, number][], margin: number, padding: ReturnType<typeof viewPadding>) => {
      const lngs = all.map((point) => point[0]);
      const lats = all.map((point) => point[1]);
      const west = Math.min(...lngs) - margin;
      const east = Math.max(...lngs) + margin;
      const south = Math.min(...lats) - margin;
      const north = Math.max(...lats) + margin;
      const camera = map.cameraForBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding },
      );
      if (!camera) return null;
      const middle = MercatorCoordinate.fromLngLat({ lng: (west + east) / 2, lat: south });
      const top = MercatorCoordinate.fromLngLat({ lng: (west + east) / 2, lat: north });
      const center = new MercatorCoordinate(middle.x, (middle.y + top.y) / 2).toLngLat();
      return { center: [center.lng, center.lat] as [number, number], zoom: camera.zoom ?? 5 };
    };

    // La course : un véhicule par trajet, la caméra reste sur l'ensemble.
    const racerMarkers = new Map<string, { marker: Marker; element: HTMLElement }>();
    const clearRacers = () => {
      racerMarkers.forEach(({ marker }) => marker.remove());
      racerMarkers.clear();
    };
    let raceKey = "";
    const drawRace = (frame: JourneyFilmFrame) => {
      ensureLayers();
      container.dataset["film"] = "true";
      const racers = frame.racers ?? [];
      const states = racers.map((racer) => ({ racer, state: filmFrame(racer.film, frame.minute) }));
      (map.getSource(SOURCE) as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: states.flatMap(({ racer, state }) => [
          line("plan-road", racer.film.road),
          line("plan-sea", racer.film.sea),
          line("plan-road", racer.film.last),
          ...(state.roadDone.length > 1 ? [line("done-road", state.roadDone)] : []),
          ...(state.seaDone.length > 1 ? [line("done-sea", state.seaDone)] : []),
          ...(state.lastDone.length > 1 ? [line("done-road", state.lastDone)] : []),
        ]),
      });
      const padding = viewPadding();
      // Recadré aussi quand le volet change de hauteur.
      const key = `${racers.map((racer) => racer.film.key).join("|")}|${padding.bottom},${padding.left}`;
      if (key !== raceKey) {
        raceKey = key;
        const all = racers.flatMap((racer) => [...racer.film.road, ...racer.film.sea, ...racer.film.last]);
        const camera = frameAll(all, 0.3, padding);
        if (camera) map.jumpTo({ ...camera, pitch: 0, bearing: 0, padding });
      }
      for (const { racer, state } of states) {
        let entry = racerMarkers.get(racer.film.key);
        if (!entry) {
          const element = document.createElement("div");
          element.className = "bw-film-vehicle bw-film-racer";
          element.setAttribute("aria-hidden", "true");
          element.innerHTML = '<span></span><img alt="">';
          entry = { element, marker: new Marker({ element, anchor: "bottom" }).setLngLat(state.point).addTo(map) };
          racerMarkers.set(racer.film.key, entry);
        }
        entry.marker.setLngLat(state.point);
        entry.element.dataset["winner"] = racer.winner ? "true" : "";
        const onSea = state.stage === "sea";
        // Sur la route, ils roulent groupés : leurs noms s'empileraient.
        entry.element.querySelector("span")!.textContent = onSea || racer.winner ? racer.label : "";
        const image = entry.element.querySelector("img")!;
        const src = onSea ? racer.film.shipImage : "/cabas/persos/voiture_504.webp";
        if (image.getAttribute("src") !== src) image.setAttribute("src", src);
        entry.element.dataset["sea"] = onSea ? "true" : "";
      }
    };

    let wasDemo = false;
    let overviewKey = "";
    let overview: { center: [number, number]; zoom: number } | null = null;
    const draw = (frame: JourneyFilmFrame) => {
      ensureLayers();
      const { film, minute, wide } = frame;
      const state = filmFrame(film, minute);
      container.dataset["film"] = "true";
      if (frame.demo !== wasDemo) {
        map.setMaxBounds(frame.demo ? null : map.getMaxBounds());
        quiet(frame.demo);
        wasDemo = frame.demo;
      }
      (map.getSource(SOURCE) as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [
          line("plan-road", film.road),
          line("plan-sea", film.sea),
          line("plan-road", film.last),
          ...(state.roadDone.length > 1 ? [line("done-road", state.roadDone)] : []),
          ...(state.seaDone.length > 1 ? [line("done-sea", state.seaDone)] : []),
          ...(state.lastDone.length > 1 ? [line("done-road", state.lastDone)] : []),
          ...film.pins.map((pin) => ({
            type: "Feature" as const,
            properties: { label: pin.label },
            geometry: { type: "Point" as const, coordinates: pin.point },
          })),
        ],
      });

      const padding = viewPadding();
      const fingerprint = `${film.key}|${padding.left},${padding.right},${padding.top},${padding.bottom}`;
      if (overviewKey !== fingerprint) {
        overviewKey = fingerprint;
        const camera = frameAll([...film.road, ...film.sea, ...film.last], 0.4, padding);
        overview = camera ? { center: camera.center, zoom: camera.zoom - 0.2 } : null;
      }
      const blend = wide * wide * (3 - 2 * wide);
      const followZoom = Math.min(filmZoom(film, minute), frame.maxZoom ?? 24);
      const target = {
        center: (overview
          ? [
              state.point[0] + (overview.center[0] - state.point[0]) * blend,
              state.point[1] + (overview.center[1] - state.point[1]) * blend,
            ]
          : state.point) as [number, number],
        zoom: overview ? followZoom + (overview.zoom - followZoom) * blend : followZoom,
        pitch: (state.stage === "sea" ? 40 : 52) - 30 * blend,
      };
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const ease = still || !smoothCamera ? 1 : 0.14;
      smoothCamera = smoothCamera
        ? {
            center: [
              smoothCamera.center[0] + (target.center[0] - smoothCamera.center[0]) * ease,
              smoothCamera.center[1] + (target.center[1] - smoothCamera.center[1]) * ease,
            ],
            zoom: smoothCamera.zoom + (target.zoom - smoothCamera.zoom) * ease,
            pitch: smoothCamera.pitch + (target.pitch - smoothCamera.pitch) * ease,
          }
        : target;
      map.jumpTo({ ...smoothCamera, bearing: 0, padding });
      syncChips(frame);

      const onSea = state.stage === "sea";
      car.hidden = onSea;
      ship.hidden = !onSea;
      if (onSea && shipImage.getAttribute("src") !== film.shipImage)
        shipImage.setAttribute("src", film.shipImage);
      const scale = 0.62 + 0.38 * (1 - blend);
      vehicle.style.setProperty("--film-scale", scale.toFixed(3));
      const heading = state.roadDone.length > 1 ? state.roadDone.at(-1)![0] - state.roadDone.at(-2)![0] : 0;
      vehicle.dataset["east"] = state.stage === "road" && heading > 0.002 ? "true" : "";
      marker.setLngLat(state.point);
      if (!shown) {
        shown = true;
        marker.addTo(map);
      }
      caption.hidden = !frame.caption;
      caption.textContent = frame.caption;
      caption.style.left = `${(padding.left + container.clientWidth - padding.right) / 2}px`;
    };

    const onFrame = (event: Event) => {
      const frame = (event as CustomEvent<JourneyFilmFrame | null>).detail;
      if (frame?.racers) {
        clearChips();
        smoothCamera = null;
        if (shown) marker.remove();
        shown = false;
        drawRace(frame);
        return;
      }
      if (frame) {
        if (racerMarkers.size) {
          clearRacers();
          raceKey = "";
        }
        draw(frame);
        return;
      }
      clearRacers();
      clearChips();
      smoothCamera = null;
      raceKey = "";
      if (!shown) {
        delete container.dataset["film"];
        (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({
          type: "FeatureCollection",
          features: [],
        });
      }
      hideFrame();
      overviewKey = "";
      if (wasDemo) {
        wasDemo = false;
        quiet(false);
        map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
        map.setMaxBounds(limitBounds);
        if (!previewRef.current) homeView();
      }
    };

    // Placer un point sur la carte : le prochain toucher devient l'adresse.
    let picking: PickTarget | null = null;
    const pick = (event: { lngLat: { lng: number; lat: number } }) => {
      if (!picking) return;
      const target = picking;
      window.dispatchEvent(
        new CustomEvent(JOURNEY_PICKED_EVENT, {
          detail: { target, point: [event.lngLat.lng, event.lngLat.lat] as LngLat },
        }),
      );
      stopPick();
    };
    const stopPick = () => {
      picking = null;
      map.getCanvas().style.cursor = "";
      map.off("click", pick);
      delete container.dataset["picking"];
      quiet(wasDemo);
      caption.hidden = !shown;
    };
    const onPick = (event: Event) => {
      const target = (event as CustomEvent<PickTarget | null>).detail;
      if (!target) {
        if (picking) stopPick();
        return;
      }
      hideFrame();
      picking = target;
      overviewKey = "";
      container.dataset["picking"] = "true";
      quiet(true);
      map.getCanvas().style.cursor = "crosshair";
      map.setPadding(viewPadding());
      map.easeTo({
        center: target === "destination" ? [2.5, 35.6] : [4, 46],
        zoom: target === "destination" ? 5.6 : 5.2,
        pitch: 0,
        duration: 700,
      });
      caption.textContent =
        target === "destination"
          ? "Touchez votre destination sur la carte"
          : "Touchez votre départ sur la carte";
      caption.style.left = `${(viewPadding().left + container.clientWidth - viewPadding().right) / 2}px`;
      caption.hidden = false;
      map.once("click", pick);
    };
    window.addEventListener(JOURNEY_FILM_EVENT, onFrame);
    window.addEventListener(JOURNEY_PICK_EVENT, onPick);
    return () => {
      window.removeEventListener(JOURNEY_FILM_EVENT, onFrame);
      window.removeEventListener(JOURNEY_PICK_EVENT, onPick);
      marker.remove();
      clearRacers();
      clearChips();
      caption.remove();
      map.off("click", pick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef, containerRef, ready]);
}
