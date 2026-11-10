import { useEffect, useRef, type RefObject } from "react";
import { Marker, type GeoJSONSource, type LngLatBoundsLike, type Map as MapLibreMap, MercatorCoordinate } from "maplibre-gl";
import {
  boardingBlend,
  filmChips,
  filmFrame,
  filmTimes,
  filmZoom,
  formatMinutes,
  PAUSE_MIN,
  JOURNEY_FILM_EVENT,
  JOURNEY_PICK_EVENT,
  JOURNEY_PICKED_EVENT,
  pausingAt,
  type JourneyFilm,
  type JourneyFilmFrame,
  type LngLat,
  type PickTarget,
} from "@/lib/ferry/journeyFilm";

const SOURCE = "journey-film";
/** Le tracé parcouru, à part : son dégradé (line-progress) demande les mesures de ligne. */
const TRAIL = "journey-film-trail";
/** Le voile posé sur le fond de carte pendant le film : le trajet ressort, le reste s'adoucit. */
const VEIL = "journey-veil";
const VEIL_OPACITY = 0.42;
/** Une carte du carnet reste quelques secondes, puis s'efface jusqu'à l'étape suivante. */
const CARD_MS = 4_200;

type CardContent = { image: string; kicker: string; title: string; detail: string };
const near = (a: LngLat | undefined, b: LngLat) =>
  !!a && Math.abs(a[0] - b[0]) < 0.08 && Math.abs(a[1] - b[1]) < 0.08;
/** Le nom d'un lieu du trajet, quand le film le connaît (l'exemple le connaît, un vrai trajet pas toujours). */
const placeAt = (film: JourneyFilm, point: LngLat | undefined) =>
  film.pins.find((pin) => near(point, pin.point))?.label;

/** Le carnet de voyage : une petite carte illustrée par étape, avec nos cabas. */
function cardFor(film: JourneyFilm, id: string, label: string): CardContent {
  const art = (name: string) => `/cabas/humeurs/${name}.webp`;
  if (id === "done") {
    const town = placeAt(film, film.last.at(-1) ?? film.sea.at(-1));
    return {
      image: art("33_bien_arrive"),
      kicker: town ? `Arrivée à ${town}` : "Arrivée",
      title: "Bien arrivé au bled !",
      detail: `${formatMinutes(filmTimes(film).total)} de porte à porte`,
    };
  }
  if (id.includes("pause"))
    return {
      image: art("22_msemen"),
      kicker: "Pause",
      title: "On souffle un peu",
      detail: `${PAUSE_MIN} min de pause conseillée`,
    };
  if (id === "road") {
    const town = placeAt(film, film.road[0]);
    return {
      image: art("05_yallah"),
      kicker: town ? `Départ de ${town}` : "Le départ",
      title: "Yallah, on prend la route !",
      detail: `${label} jusqu'au port`,
    };
  }
  if (id === "port") {
    const town = placeAt(film, film.road.at(-1));
    return {
      image: art("11_file_attente"),
      kicker: town ? `Port de ${town}` : "Au port",
      title: "Attente et formalités",
      detail: `${formatMinutes(film.boardMin)} avant d'embarquer`,
    };
  }
  if (id === "sea")
    return {
      image: art("17_embarquement"),
      kicker: "La traversée",
      title: "On embarque !",
      detail: `${formatMinutes(film.ferryMin)} de mer`,
    };
  if (id === "disembark") {
    const town = placeAt(film, film.sea.at(-1));
    return {
      image: art("29_douane_ok"),
      kicker: town ? `Arrivée à ${town}` : "L'arrivée",
      title: "Terre en vue !",
      detail: `${formatMinutes(film.disembarkMin)} pour sortir du port`,
    };
  }
  return {
    image: art("10_route_longue"),
    kicker: "Dernière route",
    title: "Direction le bled",
    detail: label,
  };
}
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

/** La surcouche de l'itinéraire : utile à l'arrêt, elle ferait doublon avec le tracé qui se dessine. */
const OVERLAY_LAYERS = [
  "itinerary-alternatives",
  "itinerary-road-casing",
  "itinerary-road",
  "itinerary-estimate",
  "itinerary-ferry-casing",
  "itinerary-ferry",
  "itinerary-ends",
  "itinerary-end-labels",
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
      // Le voile, sous tout le film : le fond de carte s'adoucit et le trajet ressort.
      map.addSource(VEIL, {
        type: "geojson",
        data: {
          type: "Polygon",
          coordinates: [
            [
              [-180, -85],
              [180, -85],
              [180, 85],
              [-180, 85],
              [-180, -85],
            ],
          ],
        },
      });
      map.addLayer({
        id: VEIL,
        type: "fill",
        source: VEIL,
        paint: {
          "fill-color": "#f7f3ea",
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 700, delay: 0 },
        },
      });
      map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(TRAIL, {
        type: "geojson",
        lineMetrics: true,
        data: { type: "FeatureCollection", features: [] },
      });
      const lineLayer = (
        id: string,
        kind: string,
        paint: Record<string, unknown>,
        source: string = SOURCE,
      ) =>
        map.addLayer({
          id,
          type: "line",
          source,
          filter: ["==", ["get", "kind"], kind],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: paint as never,
        });
      // Ce qui reste à parcourir : un pointillé léger, qui annonce le chemin sans le dessiner.
      lineLayer("journey-plan-road", "plan-road", {
        "line-color": "#0e7a43",
        "line-width": 3.2,
        "line-opacity": 0.5,
        "line-dasharray": [0, 2],
      });
      lineLayer("journey-plan-sea", "plan-sea", {
        "line-color": "#1769a8",
        "line-width": 3.2,
        "line-opacity": 0.5,
        "line-dasharray": [0, 2],
      });
      // Le chemin parcouru : une lueur, un liseré blanc, puis un trait qui s'illumine vers le véhicule.
      lineLayer(
        "journey-glow-road",
        "done-road",
        { "line-color": "#22b573", "line-width": 18, "line-blur": 12, "line-opacity": 0.42 },
        TRAIL,
      );
      lineLayer(
        "journey-glow-sea",
        "done-sea",
        { "line-color": "#3aa0e8", "line-width": 18, "line-blur": 12, "line-opacity": 0.42 },
        TRAIL,
      );
      lineLayer("journey-done-road-casing", "done-road", { "line-color": "#ffffff", "line-width": 8 }, TRAIL);
      lineLayer("journey-done-sea-casing", "done-sea", { "line-color": "#ffffff", "line-width": 8 }, TRAIL);
      lineLayer(
        "journey-done-road",
        "done-road",
        {
          "line-width": 4.5,
          "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "#0b6b3a", 0.75, "#12a35e", 1, "#6ff0ad"],
        },
        TRAIL,
      );
      lineLayer(
        "journey-done-sea",
        "done-sea",
        {
          "line-width": 4.5,
          "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "#14598f", 0.75, "#1f86d1", 1, "#8fd3ff"],
        },
        TRAIL,
      );
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

    // Le tracé parcouru va dans sa propre source (dégradé), le reste dans la source du film.
    type FilmFeature = { properties: { kind?: string; label?: string } };
    const publish = (features: FilmFeature[]) => {
      const done = features.filter((feature) => feature.properties.kind?.startsWith("done"));
      const rest = features.filter((feature) => !feature.properties.kind?.startsWith("done"));
      (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: rest,
      } as never);
      (map.getSource(TRAIL) as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: done,
      } as never);
    };
    let veiled = false;
    const veil = (on: boolean) => {
      if (veiled === on || !map.getLayer(VEIL)) return;
      veiled = on;
      map.setPaintProperty(VEIL, "fill-opacity", on ? VEIL_OPACITY : 0);
    };

    let overlayHidden = false;
    const hideOverlay = (hide: boolean) => {
      if (overlayHidden === hide) return;
      overlayHidden = hide;
      for (const id of OVERLAY_LAYERS)
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", hide ? "none" : "visible");
    };

    const vehicle = document.createElement("div");
    vehicle.className = "bw-film-vehicle";
    vehicle.setAttribute("aria-hidden", "true");
    vehicle.innerHTML =
      '<span class="bw-film-shadow"></span>' +
      '<img class="bw-film-car" src="/cabas/persos/voiture_504.webp" alt="">' +
      '<span class="bw-film-ship"><i></i><i></i><i></i><img alt=""></span>' +
      '<div class="bw-film-card"><img alt=""><span><small></small><b></b><em></em></span><i>Exemple</i></div>';
    const card = vehicle.querySelector<HTMLElement>(".bw-film-card")!;
    const cardImage = card.querySelector("img")!;
    const cardKicker = card.querySelector("small")!;
    const cardTitle = card.querySelector("b")!;
    const cardDetail = card.querySelector("em")!;
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
      hideOverlay(false);
      if (!shown) return;
      shown = false;
      marker.remove();
      caption.hidden = true;
      // La légende cachée ne garde aucune trace du film (les boutons de la carte en dépendent).
      caption.dataset["film"] = "";
      delete container.dataset["film"];
      clearRacers();
      clearCard();
      veil(false);
      smoothCamera = null;
      raceKey = "";
      publish([]);
    };

    // Le carnet de voyage : à chaque étape atteinte, une carte illustrée surgit au-dessus du véhicule.
    let milestonesKey = "";
    let milestones: { id: string; at: number; label: string }[] = [];
    let cardId = "";
    let cardTimer: number | undefined;
    const clearCard = () => {
      window.clearTimeout(cardTimer);
      cardId = "";
      card.dataset["show"] = "";
    };
    const syncCard = (frame: JourneyFilmFrame, stage: string, blend: number) => {
      const { film, minute } = frame;
      const key = `${film.key}|${film.road.length}|${film.last.length}`;
      if (milestonesKey !== key) {
        milestonesKey = key;
        milestones = filmChips(film)
          .map((chip) => ({ id: chip.id, at: chip.at, label: chip.label }))
          .sort((a, b) => a.at - b.at);
        clearCard();
      }
      // Vue d'ensemble : pas de carte, le trajet entier parle de lui-même.
      if (blend > 0.5) {
        if (card.dataset["show"]) clearCard();
        return;
      }
      const current =
        stage === "done"
          ? { id: "done", at: Infinity, label: "" }
          : [...milestones].reverse().find((milestone) => minute >= milestone.at);
      if (!current || current.id === cardId) return;
      cardId = current.id;
      const content = cardFor(film, current.id, current.label);
      if (cardImage.getAttribute("src") !== content.image) cardImage.setAttribute("src", content.image);
      cardKicker.textContent = content.kicker;
      cardTitle.textContent = content.title;
      cardDetail.textContent = content.detail;
      card.dataset["demo"] = frame.demo ? "true" : "";
      // L'apparition rejoue à chaque étape.
      card.dataset["show"] = "";
      void card.offsetWidth;
      card.dataset["show"] = "true";
      window.clearTimeout(cardTimer);
      if (current.id !== "done")
        cardTimer = window.setTimeout(() => {
          card.dataset["show"] = "";
        }, CARD_MS);
    };

    // Caméra amortie : elle rejoint sa cible au lieu de sauter d'une étape à l'autre.
    let smoothCamera: { center: [number, number]; zoom: number; pitch: number } | null = null;
    let cameraTime = 0;
    // Inclinaison de la 504 dans le sens de la route, amortie elle aussi.
    let tilt = 0;

    // Le cadrage d'un ensemble de points. Le centre est celui des points : c'est jumpTo qui applique
    // le décalage du volet. Reprendre le centre de cameraForBounds le compterait deux fois.
    const frameAll = (all: [number, number][], margin: number, padding: ReturnType<typeof viewPadding>) => {
      const lngs = all.map((point) => point[0]);
      const lats = all.map((point) => point[1]);
      const west = Math.min(...lngs) - margin;
      const east = Math.max(...lngs) + margin;
      const south = Math.min(...lats) - margin;
      const north = Math.max(...lats) + margin;
      // cameraForBounds ajoute le décalage déjà posé sur la carte : on ne le lui donne qu'une fois.
      map.setPadding(padding);
      const camera = map.cameraForBounds([
        [west, south],
        [east, north],
      ]);
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
      hideOverlay(true);
      container.dataset["film"] = "true";
      const racers = frame.racers ?? [];
      const states = racers.map((racer) => ({ racer, state: filmFrame(racer.film, frame.minute - racer.startMin) }));
      veil(true);
      publish(
        states.flatMap(({ racer, state }) => [
          line("plan-road", racer.film.road),
          line("plan-sea", racer.film.sea),
          line("plan-road", racer.film.last),
          ...(state.roadDone.length > 1 ? [line("done-road", state.roadDone)] : []),
          ...(state.seaDone.length > 1 ? [line("done-sea", state.seaDone)] : []),
          ...(state.lastDone.length > 1 ? [line("done-road", state.lastDone)] : []),
        ]),
      );
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
      veil(true);
      publish([
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
      ]);

      const padding = viewPadding();
      const fingerprint = `${film.key}|${padding.left},${padding.right},${padding.top},${padding.bottom}`;
      if (overviewKey !== fingerprint) {
        overviewKey = fingerprint;
        const camera = frameAll([...film.road, ...film.sea, ...film.last], 0.4, padding);
        overview = camera ? { center: camera.center, zoom: camera.zoom - 0.2 } : null;
      }
      const blend = wide * wide * (3 - 2 * wide);
      hideOverlay(!frame.demo && wide < 0.98);
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
      // Amortissement réglé sur le temps, pas sur le nombre d'images : même douceur à 30 ou 60 images/s.
      const now = performance.now();
      const elapsed = cameraTime ? Math.min(120, now - cameraTime) : 16;
      cameraTime = now;
      const ease = still || !smoothCamera ? 1 : 1 - Math.exp(-elapsed / 260);
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
      syncCard(frame, state.stage, blend);

      // La voiture embarque et ressort : les deux images se relaient au port, sans coupure.
      const aboard = boardingBlend(film, minute);
      car.hidden = aboard >= 1;
      ship.hidden = aboard <= 0;
      ship.style.opacity = String(aboard);
      car.style.opacity = String(1 - aboard);
      car.style.scale = String(1 - 0.55 * aboard);
      vehicle.dataset["boarding"] = aboard > 0 && aboard < 1 ? "true" : "";
      vehicle.dataset["stopped"] = state.stage === "port" || state.stage === "disembark" || pausingAt(film, minute) ? "true" : "";
      if (aboard > 0 && shipImage.getAttribute("src") !== film.shipImage)
        shipImage.setAttribute("src", film.shipImage);
      const scale = 0.62 + 0.38 * (1 - blend);
      vehicle.style.setProperty("--film-scale", scale.toFixed(3));
      const heading = state.roadDone.length > 1 ? state.roadDone.at(-1)![0] - state.roadDone.at(-2)![0] : 0;
      const east = state.stage === "road" && heading > 0.002;
      vehicle.dataset["east"] = east ? "true" : "";
      // Le nez de la 504 suit la pente de la route à l'écran (léger : ±10°).
      const leg = state.stage === "last" ? state.lastDone : state.stage === "road" ? state.roadDone : [];
      let targetTilt = 0;
      if (leg.length > 1 && !vehicle.dataset["stopped"]) {
        const a = map.project(leg.at(-2)!);
        const b = map.project(leg.at(-1)!);
        const dx = Math.abs(b.x - a.x);
        const dy = b.y - a.y;
        if (dx + Math.abs(dy) > 0.5) {
          const angle = (Math.atan2(dy, Math.max(dx, 0.001)) * 180) / Math.PI;
          targetTilt = Math.max(-10, Math.min(10, (east ? 1 : -1) * angle * 0.35));
        }
      }
      tilt += (targetTilt - tilt) * (still ? 1 : 0.12);
      car.style.rotate = `${tilt.toFixed(2)}deg`;
      marker.setLngLat(state.point);
      if (!shown) {
        shown = true;
        marker.addTo(map);
      }
      // La carte du carnet reste entière à l'écran ; sa pointe, elle, reste sur le véhicule.
      if (card.dataset["show"]) {
        const x = map.project(state.point).x;
        const half = card.offsetWidth / 2;
        const margin = 8;
        const room = container.clientWidth;
        let shift = 0;
        if (x - half < margin) shift = margin - (x - half);
        else if (x + half > room - margin) shift = room - margin - (x + half);
        shift = Math.max(-(half - 22), Math.min(half - 22, shift));
        card.style.setProperty("--card-shift", `${Math.round(shift)}px`);
      }
      // Le titre n'est plus affiché pendant le film (le carnet le remplace) ; il reste lu à voix haute.
      caption.dataset["film"] = "true";
      caption.hidden = !frame.caption;
      caption.textContent = frame.caption;
      caption.style.left = `${(padding.left + container.clientWidth - padding.right) / 2}px`;
    };

    const onFrame = (event: Event) => {
      const frame = (event as CustomEvent<JourneyFilmFrame | null>).detail;
      if (frame?.racers) {
        clearCard();
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
      hideOverlay(false);
      clearRacers();
      clearCard();
      veil(false);
      smoothCamera = null;
      cameraTime = 0;
      raceKey = "";
      if (!shown) {
        delete container.dataset["film"];
        publish([]);
      }
      hideFrame();
      caption.dataset["film"] = "";
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
      caption.dataset["film"] = "";
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
      clearCard();
      caption.remove();
      map.off("click", pick);
      // La carte redevient normale : un film interrompu ne laisse pas les boutons masqués.
      delete container.dataset["film"];
      delete container.dataset["picking"];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef, containerRef, ready]);
}
