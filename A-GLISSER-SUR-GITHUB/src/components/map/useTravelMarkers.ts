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
  disembarking: ["M4 16l8 4 8-4v-5l-8-4-8 4v5Z", "M12 13V3M8 7l4-4 4 4"],
  parking: ["M4 4h16v16H4z", "M9 17V7h4a3 3 0 0 1 0 6H9"],
  fluid: ["M5 12l4 4 10-10", "M3 20h18"],
};

// Avatars génériques façon Waze (aucune photo, aucune donnée personnelle).
const FACE_COLORS = ["#f6c99a", "#a8d8c8", "#b9c8f2", "#f2b8c6"];
function face(color: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<circle cx="10" cy="10" r="9.25" fill="${color}" stroke="#ffffff" stroke-width="1.5"/><circle cx="7.2" cy="8.6" r="1.1" fill="#24313f"/><circle cx="12.8" cy="8.6" r="1.1" fill="#24313f"/><path d="M6.8 12.1c1.7 1.9 4.7 1.9 6.4 0" fill="none" stroke="#24313f" stroke-width="1.3" stroke-linecap="round"/>`;
  return svg;
}
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
      // Une situation que la majorité dit terminée n'est plus affichée sur la carte.
      if ((alert.denials ?? 0) > alert.confirmations) continue;
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
      const people = alerts.reduce((sum, item) => sum + 1 + item.confirmations, 0);
      const description = `${port?.name ?? ship?.name} : ${alerts.map(alertLabel).join(", ")}. ${people} voyageur${people > 1 ? "s" : ""} · informations voyageurs`;
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
      // Voyageurs concernés : auteurs + confirmations, en avatars empilés et compteur.
      const travelers = alerts.reduce((sum, item) => sum + 1 + item.confirmations, 0);
      const crowd = document.createElement("span");
      crowd.className = "bw-travel-marker__crowd";
      for (let index = 0; index < Math.min(3, travelers); index += 1)
        crowd.append(face(FACE_COLORS[index % FACE_COLORS.length] ?? "#f6c99a"));
      if (travelers > 1) {
        const count = document.createElement("small");
        count.textContent = String(travelers);
        crowd.append(count);
      }
      button.append(crowd);
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
