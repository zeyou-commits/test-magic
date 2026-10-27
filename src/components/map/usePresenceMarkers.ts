import { useEffect, useRef, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import type { FleetShip } from "@/lib/ferry/fleet";
import { avatarFor, presenceQuery } from "@/lib/ferry/presence";
import type { Port, Selection } from "@/lib/ferry/types";

/**
 * Présence des voyageurs BledWay sur la carte : quelques cabas et un nombre, sous le bateau
 * (à bord) ou sous le port (au port). Anonyme : seulement des compteurs.
 * Placées en dessous du point, elles ne recouvrent pas les pastilles de signalement (au-dessus).
 */
export function usePresenceMarkers(
  mapRef: RefObject<MapLibreMap | null>,
  ready: boolean,
  ports: Port[],
  fleet: FleetShip[],
  onSelect: (s: Selection | null) => void,
  onOpen?: () => void,
) {
  const rows = useQuery(presenceQuery).data;
  const callbacks = useRef({ onSelect, onOpen });
  callbacks.current = { onSelect, onOpen };
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !rows?.length) return;
    const byVessel = new Map<string, number>();
    const byPort = new Map<string, number>();
    for (const row of rows) {
      if (row.vessel_id && row.onboard) byVessel.set(row.vessel_id, (byVessel.get(row.vessel_id) ?? 0) + row.onboard);
      if (row.at_port) byPort.set(row.departure_port_id, (byPort.get(row.departure_port_id) ?? 0) + row.at_port);
    }
    const markers: Marker[] = [];
    const pin = (count: number, seed: string, label: string, selection: Selection) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bw-presence-pin";
      button.setAttribute("aria-label", `${label} : ${count} voyageur${count > 1 ? "s" : ""} BledWay`);
      for (let index = 0; index < Math.min(3, count); index += 1) {
        const img = document.createElement("img");
        img.src = avatarFor(seed, index);
        img.alt = "";
        img.width = 20;
        img.height = 20;
        button.append(img);
      }
      const small = document.createElement("small");
      small.textContent = String(count);
      button.append(small);
      button.addEventListener("mousemove", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        callbacks.current.onSelect(selection);
        callbacks.current.onOpen?.();
      });
      return button;
    };
    for (const [vesselId, count] of byVessel) {
      const ship = fleet.find((item) => item.vesselId === vesselId);
      const point: [number, number] | undefined = ship?.live
        ? [ship.live.position.longitude, ship.live.position.latitude]
        : ship?.lngLat;
      if (!ship || !point) continue;
      const shift: [number, number] = ship.live ? [0, 0] : [ship.dx, ship.dy];
      markers.push(
        new Marker({
          element: pin(count, vesselId, `À bord · ${ship.name}`, { type: "vessel", id: vesselId }),
          anchor: "top-left",
          offset: [shift[0] + 6, shift[1] + 10],
        })
          .setLngLat(point)
          .addTo(map),
      );
    }
    for (const [portId, count] of byPort) {
      const port = ports.find((item) => item.id === portId);
      if (!port) continue;
      markers.push(
        new Marker({
          element: pin(count, portId, `Au port · ${port.name}`, { type: "port", id: portId }),
          anchor: "top-right",
          offset: [-6, 10],
        })
          .setLngLat([port.longitude, port.latitude])
          .addTo(map),
      );
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [mapRef, ready, ports, fleet, rows]);
}
