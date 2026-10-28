import { useEffect, useRef, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { useAuth } from "@/hooks/useAuth";
import type { FleetShip } from "@/lib/ferry/fleet";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { mergeTripSteps, myTripStatusQuery, tripStepsQuery } from "@/lib/ferry/presence";
import type { Selection } from "@/lib/ferry/types";

/** L'étiquette « Ma traversée » ne se montre d'elle-même qu'une fois par visite. */
const HINT_KEY = "bledway:mytrip-hint";

/** Taille du bateau dessiné (suit l'« icon-size » de la couche des navires). */
function shipScale(zoom: number) {
  const steps: [number, number][] = [
    [3, 0.68],
    [5, 0.82],
    [7, 0.96],
    [9, 1.08],
    [11, 1.55],
    [13, 2.1],
    [15, 2.4],
  ];
  if (zoom <= steps[0]![0]) return steps[0]![1];
  for (let i = 1; i < steps.length; i++) {
    const [z1, s1] = steps[i]!;
    const [z0, s0] = steps[i - 1]!;
    if (zoom <= z1) return s0 + ((zoom - z0) / (z1 - z0)) * (s1 - s0);
  }
  return steps.at(-1)![1];
}
/** Demi-longueur et demi-largeur de la coque à l'échelle 1, en pixels écran. */
const HALF_LENGTH = 17.5;
const HALF_BEAM = 10.5;

/**
 * Mon bateau sur la carte : un petit badge avec mon cabas (celui de mon étape), collé à l'arrière
 * du navire, côté haut de l'écran, pour ne jamais cacher le bateau. Il grossit avec le zoom sans
 * dépasser 40 % de la longueur du bateau ; en vue très large, un halo jaune pulse autour du navire.
 * L'étiquette « Ma traversée » apparaît au survol, et 3 secondes au premier affichage.
 * Un toucher ouvre « Ma traversée ».
 */
export function useMyTripMarker(
  mapRef: RefObject<MapLibreMap | null>,
  ready: boolean,
  fleet: FleetShip[],
  onSelect: (s: Selection | null) => void,
  onOpen?: () => void,
) {
  const { user } = useAuth();
  const { trip } = useMyTrip();
  const steps = mergeTripSteps(useQuery(tripStepsQuery).data);
  const status = useQuery(myTripStatusQuery(trip?.departure.id ?? "", user?.id)).data ?? null;
  const callbacks = useRef({ onSelect, onOpen });
  callbacks.current = { onSelect, onOpen };
  const departureId = trip?.departure.id;
  const vesselId = trip?.departure.vessel_id;
  const vesselName = trip?.vessel?.name ?? "Mon bateau";
  const image = steps.find((step) => step.id === status)?.image ?? steps[2]!.image;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !departureId || !vesselId) return;
    const ship =
      fleet.find((item) => item.vesselId === vesselId && item.departureId === departureId) ??
      fleet.find((item) => item.vesselId === vesselId);
    const point: [number, number] | undefined = ship?.live
      ? [ship.live.position.longitude, ship.live.position.latitude]
      : ship?.lngLat;
    if (!ship || !point) return;
    const shift: [number, number] = ship.live ? [0, 0] : [ship.dx, ship.dy];
    const course = ship.live?.position.courseDeg ?? ship.course ?? 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bw-mytrip-pin";
    button.setAttribute("aria-label", `Ma traversée : ${vesselName}`);
    const img = document.createElement("img");
    img.src = image;
    img.alt = "";
    img.width = 34;
    img.height = 34;
    const label = document.createElement("small");
    label.textContent = "Ma traversée";
    button.append(img, label);
    button.addEventListener("mousemove", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      callbacks.current.onSelect({ type: "departure", id: departureId });
      callbacks.current.onOpen?.();
    });
    let hintTimer: number | undefined;
    let hinted = true;
    try {
      hinted = window.sessionStorage.getItem(HINT_KEY) === "1";
      window.sessionStorage.setItem(HINT_KEY, "1");
    } catch {
      hinted = false;
    }
    if (!hinted) {
      button.classList.add("is-hinting");
      hintTimer = window.setTimeout(() => button.classList.remove("is-hinting"), 3000);
    }
    const marker = new Marker({ element: button, anchor: "center", offset: shift })
      .setLngLat(point)
      .addTo(map);
    // Position à l'arrière du bateau, recalculée au zoom et à la rotation de la carte.
    const place = () => {
      const zoom = map.getZoom();
      if (zoom < 5.5) {
        button.classList.add("is-halo");
        marker.setOffset(shift);
        return;
      }
      button.classList.remove("is-halo");
      const scale = shipScale(zoom);
      const size = Math.round(Math.min(30, Math.max(14, 0.4 * 2 * HALF_LENGTH * scale)));
      button.style.setProperty("--pin", `${size}px`);
      const angle = ((course - map.getBearing()) * Math.PI) / 180;
      const bow: [number, number] = [Math.sin(angle), -Math.cos(angle)];
      // Des deux flancs, celui tourné vers le haut de l'écran (le nom du bateau est dessous).
      const right: [number, number] = [Math.cos(angle), Math.sin(angle)];
      const side: [number, number] = right[1] <= 0 ? right : [-right[0], -right[1]];
      const back = HALF_LENGTH * scale * 0.75;
      const lateral = HALF_BEAM * scale + size * 0.35;
      marker.setOffset([
        shift[0] - bow[0] * back + side[0] * lateral,
        shift[1] - bow[1] * back + side[1] * lateral,
      ]);
    };
    place();
    map.on("zoom", place);
    map.on("rotate", place);
    return () => {
      window.clearTimeout(hintTimer);
      map.off("zoom", place);
      map.off("rotate", place);
      marker.remove();
    };
  }, [mapRef, ready, fleet, departureId, vesselId, vesselName, image]);
}
