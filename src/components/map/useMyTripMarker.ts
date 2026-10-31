import { useEffect, useRef, type RefObject } from "react";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import type { FleetShip } from "@/lib/ferry/fleet";
import { useMyTrip } from "@/lib/ferry/myTrip";
import type { Selection } from "@/lib/ferry/types";
import { vesselMapIcon } from "@/lib/ferry/vesselVisuals";
import { dockSpread, shipTokenRadius, vesselScreenHeight, vesselScreenWidth } from "./shipIcons";

/**
 * Mon bateau sur la carte : un fanion vert « Moi » planté à l'avant du navire, qui flotte vers
 * l'extérieur pour laisser le dessus à la communauté. Un toucher ouvre « Ma traversée ».
 */
export function useMyTripMarker(
  mapRef: RefObject<MapLibreMap | null>,
  ready: boolean,
  fleet: FleetShip[],
  onSelect: (s: Selection | null) => void,
  onOpen?: () => void,
) {
  const { trip } = useMyTrip();
  const callbacks = useRef({ onSelect, onOpen });
  callbacks.current = { onSelect, onOpen };
  const departureId = trip?.departure.id;
  const vesselId = trip?.departure.vessel_id;
  const vesselName = trip?.vessel?.name ?? "Mon bateau";
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
    const slug = vesselMapIcon(ship.name);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bw-mytrip-flag";
    button.setAttribute("aria-label", `Ma traversée : ${vesselName}`);
    const flag = document.createElement("span");
    flag.className = "bw-mytrip-flag__cloth";
    flag.textContent = "Moi";
    const mast = document.createElement("span");
    mast.className = "bw-mytrip-flag__mast";
    button.append(flag, mast);
    button.addEventListener("mousemove", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      callbacks.current.onSelect({ type: "departure", id: departureId });
      callbacks.current.onOpen?.();
    });
    const marker = new Marker({ element: button, anchor: "bottom-right", offset: shift })
      .setLngLat(point)
      .addTo(map);
    const place = () => {
      const zoom = map.getZoom();
      button.style.setProperty("--flag-scale", zoom < 5.5 ? "0.72" : zoom < 8 ? "0.86" : "1");
      if (!slug) {
        const r = shipTokenRadius(zoom);
        marker.setOffset([shift[0] - r * 0.6, shift[1] - r * 0.6]);
        return;
      }
      marker.setOffset([
        shift[0] * dockSpread(zoom) - vesselScreenWidth(zoom) * 0.38,
        shift[1] - vesselScreenHeight(slug, zoom) * 0.3,
      ]);
    };
    place();
    map.on("zoom", place);
    return () => {
      map.off("zoom", place);
      marker.remove();
    };
  }, [mapRef, ready, fleet, departureId, vesselId, vesselName]);
}
