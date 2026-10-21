import { useEffect, useRef, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { useAuth } from "@/hooks/useAuth";
import { activeAlerts, alertLabel, communityQuery, type TravelAlert } from "@/lib/ferry/community";
import type { FleetShip } from "@/lib/ferry/fleet";
import type { Port, Selection } from "@/lib/ferry/types";

const paths = {
  delay: ["M12 8v4l3 2", "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0"],
  boarding: ["M4 16l8 4 8-4v-5l-8-4-8 4v5Z", "M12 7V3M8 7V5h8v2M12 7v13"],
  queue: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M20 21v-2a4 4 0 0 0-3-3.87M17 3.13a4 4 0 0 1 0 7.75",
  ],
  access: ["m12 3 10 18H2L12 3Z", "M12 9v4M12 17h.01"],
};
export function useTravelMarkers(
  mapRef: RefObject<MapLibreMap | null>,
  ready: boolean,
  ports: Port[],
  fleet: FleetShip[],
  onSelect: (s: Selection | null) => void,
  onOpen?: () => void,
) {
  const { user } = useAuth();
  const feed = useQuery(communityQuery(undefined, undefined, false, user?.id));
  const callbacks = useRef({ onSelect, onOpen });
  callbacks.current = { onSelect, onOpen };
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !feed.data) return;
    const groups = new Map<string, TravelAlert[]>();
    for (const alert of activeAlerts(feed.data.alerts)) {
      const key = `${alert.target_kind}:${alert.target_id}`;
      groups.set(key, [...(groups.get(key) ?? []), alert]);
    }
    const markers: Marker[] = [];
    for (const alerts of groups.values()) {
      const alert = alerts[0]!;
      const port =
        alert.target_kind === "port" ? ports.find((p) => p.id === alert.target_id) : undefined;
      const ship =
        alert.target_kind === "vessel"
          ? fleet.find((s) => s.vesselId === alert.target_id)
          : undefined;
      const point: [number, number] | undefined = port
        ? [port.longitude, port.latitude]
        : ship?.live
          ? [ship.live.position.longitude, ship.live.position.latitude]
          : ship?.lngLat;
      if (!point) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bw-travel-marker";
      const description = `${port?.name ?? ship?.name} : ${alerts.map(alertLabel).join(", ")}. Informations voyageurs`;
      button.setAttribute("aria-label", description);
      button.title = description;
      const badge = document.createElement("span");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      for (const [name, value] of Object.entries({
        viewBox: "0 0 24 24",
        width: "15",
        height: "15",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "1.8",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "aria-hidden": "true",
      }))
        svg.setAttribute(name, value);
      for (const d of paths[alert.category]) {
        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute("d", d);
        svg.append(path);
      }
      badge.append(svg);
      button.append(badge);
      if (alerts.length > 1) {
        const count = document.createElement("small");
        count.textContent = String(alerts.length);
        button.append(count);
      }
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        callbacks.current.onSelect({ type: alert.target_kind, id: alert.target_id });
        callbacks.current.onOpen?.();
      });
      markers.push(new Marker({ element: button, offset: [18, -19] }).setLngLat(point).addTo(map));
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [mapRef, ready, ports, fleet, feed.data]);
}
