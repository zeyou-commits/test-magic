import { useEffect, useRef, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { useAuth } from "@/hooks/useAuth";
import type { FleetShip } from "@/lib/ferry/fleet";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { mergeTripSteps, myTripStatusQuery, tripStepsQuery } from "@/lib/ferry/presence";
import type { Selection } from "@/lib/ferry/types";
import { shipTokenRadius } from "./shipIcons";

/** L'étiquette « Ma traversée » ne se montre d'elle-même qu'une fois par visite. */
const HINT_KEY = "bledway:mytrip-hint";

/**
 * Mon bateau sur la carte : un petit badge avec mon cabas (celui de mon étape), collé en haut à
 * droite du jeton du navire, pour ne jamais le cacher. Il grossit avec le zoom sans dépasser 40 %
 * du jeton ; en vue très large, un anneau jaune pulse autour du navire.
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
    // Badge collé en haut à droite du jeton du bateau, à une taille qui ne le cache jamais.
    const place = () => {
      const zoom = map.getZoom();
      if (zoom < 5.5) {
        button.classList.add("is-halo");
        marker.setOffset(shift);
        return;
      }
      button.classList.remove("is-halo");
      const r = shipTokenRadius(zoom);
      const size = Math.round(Math.min(26, Math.max(14, r * 0.62)));
      button.style.setProperty("--pin", `${size}px`);
      marker.setOffset([shift[0] + r * 0.78, shift[1] - r * 0.78]);
    };
    place();
    map.on("zoom", place);
    return () => {
      window.clearTimeout(hintTimer);
      map.off("zoom", place);
      marker.remove();
    };
  }, [mapRef, ready, fleet, departureId, vesselId, vesselName, image]);
}
