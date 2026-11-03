import { useEffect, useRef, type RefObject } from "react";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { shipAnchor, type FleetShip } from "@/lib/ferry/fleet";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { projectedPosition } from "@/lib/ferry/tracking";
import type { Selection } from "@/lib/ferry/types";
import { vesselMapIcon } from "@/lib/ferry/vesselVisuals";
import {
  dockSpread,
  shipShiftY,
  shipTokenRadius,
  vesselScreenHeight,
  vesselScreenWidth,
} from "./shipIcons";

/** Hauteur de l'étiquette « Mon bateau » et son écart à la coque : les bulles du salon passent au-dessus. */
export const MY_TRIP_TAG_SPACE = 26;

/**
 * Mon bateau sur la carte : une étiquette « Mon bateau » centrée au-dessus de la coque (le nom et le
 * fanion de la compagnie sont dessous), et un halo doux qui pulse, centré sur le navire.
 * Un toucher ouvre « Ma traversée ».
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
    const anchor = ship ? shipAnchor(ship) : undefined;
    if (!ship || !anchor) return;
    // En mer, le navire de la carte avance à l'estime entre deux signaux : le repère le suit.
    const live = ship.live && !ship.portId ? ship.live.position : null;
    const point = () => (live ? projectedPosition(live, Date.now()) : anchor);
    const shift: [number, number] = [ship.dx, ship.dy];
    const slug = vesselMapIcon(ship.name);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bw-mytrip-tag";
    button.setAttribute("aria-label", `Ma traversée : ${vesselName}`);
    const dot = document.createElement("span");
    dot.className = "bw-mytrip-tag__dot";
    dot.setAttribute("aria-hidden", "true");
    button.append(dot, "Mon bateau");
    button.addEventListener("mousemove", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      callbacks.current.onSelect({ type: "departure", id: departureId });
      callbacks.current.onOpen?.();
    });
    const marker = new Marker({ element: button, anchor: "bottom", offset: shift })
      .setLngLat(point())
      .addTo(map);
    // Le halo se pose sous le navire, centré sur la coque ; il ne capte aucun clic.
    const glow = document.createElement("span");
    glow.className = "bw-mytrip-glow";
    glow.setAttribute("aria-hidden", "true");
    // L'anneau animé est à l'intérieur : MapLibre place le support par sa propre transformation.
    const ring = document.createElement("span");
    ring.className = "bw-mytrip-glow__ring";
    glow.append(ring);
    const halo = new Marker({ element: glow, anchor: "center", offset: shift })
      .setLngLat(point())
      .addTo(map);
    const place = () => {
      const zoom = map.getZoom();
      button.dataset["size"] = zoom < 5.5 ? "s" : "m";
      if (!slug) {
        const r = shipTokenRadius(zoom);
        glow.style.setProperty("--glow-size", `${Math.round(r * 3)}px`);
        halo.setOffset(shift);
        marker.setOffset([shift[0], shift[1] - r - 4]);
        return;
      }
      // Le navire est posé par le bas de son image : son centre est une demi-hauteur plus haut.
      const x = shift[0] * dockSpread(zoom);
      const bottom = shipShiftY(shift[1], ship.ashore, slug, zoom);
      const height = vesselScreenHeight(slug, zoom);
      glow.style.setProperty("--glow-size", `${Math.round(vesselScreenWidth(zoom) * 1.25)}px`);
      halo.setOffset([x, bottom - height / 2]);
      marker.setOffset([x, bottom - height - 4]);
    };
    const follow = () => {
      marker.setLngLat(point());
      halo.setLngLat(point());
    };
    place();
    map.on("zoom", place);
    const timer = live ? window.setInterval(follow, 5000) : 0;
    return () => {
      window.clearInterval(timer);
      map.off("zoom", place);
      marker.remove();
      halo.remove();
    };
  }, [mapRef, ready, fleet, departureId, vesselId, vesselName]);
}
