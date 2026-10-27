import { useEffect, useRef, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { useAuth } from "@/hooks/useAuth";
import type { FleetShip } from "@/lib/ferry/fleet";
import { useMyTrip } from "@/lib/ferry/myTrip";
import { mergeTripSteps, myTripStatusQuery, tripStepsQuery } from "@/lib/ferry/presence";
import type { Selection } from "@/lib/ferry/types";

/**
 * Mon bateau sur la carte : mon cabas (celui de mon étape) au-dessus du navire, avec un halo.
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
    img.width = 44;
    img.height = 44;
    const label = document.createElement("small");
    label.textContent = "Ma traversée";
    button.append(img, label);
    button.addEventListener("mousemove", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      callbacks.current.onSelect({ type: "departure", id: departureId });
      callbacks.current.onOpen?.();
    });
    const marker = new Marker({ element: button, anchor: "bottom", offset: [shift[0], shift[1] - 14] })
      .setLngLat(point)
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [mapRef, ready, fleet, departureId, vesselId, vesselName, image]);
}
