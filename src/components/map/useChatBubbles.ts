import { useEffect, useRef, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { personaImage } from "@/lib/community/travellers";
import { enterRoom } from "@/lib/ferry/chat";
import {
  bubbleMessages,
  chatDemoQuery,
  CHAT_INVITE_EVENT,
  OPEN_ROOM_PICKER_EVENT,
  recentChatQuery,
  shortBody,
  type RecentMessage,
} from "@/lib/ferry/chatDemo";
import { shipAnchor, type FleetShip } from "@/lib/ferry/fleet";
import type { Port, RouteLine, Selection } from "@/lib/ferry/types";
import { vesselMapIcon } from "@/lib/ferry/vesselVisuals";
import { dockSpread, shipShiftY, vesselScreenHeight } from "./shipIcons";

/** Une bulle visible 5 s, puis 2,5 s de calme avant la suivante. */
const SHOW_MS = 5_000;
const GAP_MS = 2_500;
/** Après un geste sur la carte, les bulles attendent un peu avant de revenir. */
const RESUME_MS = 4_000;
/** Toutes les 3 bulles, le bouton Salons invite à partager. */
const INVITE_EVERY = 3;

type Spot = { at: [number, number]; offset: [number, number] };

/**
 * La carte qui vit : une seule bulle à la fois sort du navire ou du port d'un salon, avec le prénom
 * et le début du message. Elle s'efface dès qu'on touche la carte ou qu'une fiche est ouverte.
 */
export function useChatBubbles(
  mapRef: RefObject<MapLibreMap | null>,
  ready: boolean,
  fleet: FleetShip[],
  ports: Port[],
  routes: RouteLine[],
  paused: boolean,
  onSelect: (selection: Selection | null) => void,
) {
  const real = useQuery(recentChatQuery).data ?? [];
  const demos = useQuery(chatDemoQuery).data;
  const latest = useRef({ fleet, ports, routes, onSelect, messages: [] as RecentMessage[] });
  latest.current = { fleet, ports, routes, onSelect, messages: bubbleMessages(real, demos) };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || paused) return;
    let marker: Marker | null = null;
    let timer = 0;
    let index = 0;
    let shown = 0;
    let busy = false;

    const portSpot = (portId: string | null | undefined): Spot | null => {
      const port = latest.current.ports.find((item) => item.id === portId);
      return port ? { at: [port.longitude, port.latitude], offset: [0, -14] } : null;
    };
    const shipSpot = (ship: FleetShip): Spot => {
      const zoom = map.getZoom();
      const slug = vesselMapIcon(ship.name);
      const x = ship.dx * (slug ? dockSpread(zoom) : 1);
      const y = shipShiftY(ship.dy, ship.ashore, slug, zoom);
      return {
        at: shipAnchor(ship),
        offset: [x, y - (slug ? vesselScreenHeight(slug, zoom) : 12) - 6],
      };
    };
    // D'où sort la bulle : le navire du salon, sinon le navire de la ligne, sinon son port.
    const spotOf = (message: RecentMessage): Spot | null => {
      const { fleet, routes } = latest.current;
      if (message.kind === "port") return portSpot(message.room);
      if (message.room) {
        const ship = fleet.find((item) => item.departureId === message.room);
        return ship ? shipSpot(ship) : null;
      }
      if (message.portId) return portSpot(message.portId);
      const route =
        routes.find((item) => item.id === message.routeId) ??
        routes.find((item) => {
          const from = latest.current.ports.find((port) => port.id === item.departure_port_id);
          const to = latest.current.ports.find((port) => port.id === item.arrival_port_id);
          return Boolean(from && to && message.label === `${from.name} → ${to.name}`);
        });
      if (!route) {
        const port = latest.current.ports.find((item) => message.label === `Port de ${item.name}`);
        return port ? portSpot(port.id) : null;
      }
      // Un navire à quai ailleurs prêterait à confusion : seulement s'il est en mer sur cette ligne.
      const ship = fleet.find((item) => item.routeId === route.id && item.state === "sea");
      return ship ? shipSpot(ship) : portSpot(route.departure_port_id);
    };

    const hide = () => {
      const element = marker?.getElement();
      if (!element) return;
      element.dataset["leaving"] = "true";
      const old = marker;
      marker = null;
      window.setTimeout(() => old?.remove(), 300);
    };
    const open = (message: RecentMessage) => {
      if (message.demo || !message.room) {
        window.dispatchEvent(new Event(OPEN_ROOM_PICKER_EVENT));
        return;
      }
      latest.current.onSelect(
        message.kind === "crossing"
          ? { type: "departure", id: message.room }
          : { type: "port", id: message.room },
      );
      enterRoom(message.kind, message.room);
    };
    const build = (message: RecentMessage) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "bw-map-bubble";
      const avatar = document.createElement("img");
      avatar.alt = "";
      avatar.src = message.author.official
        ? "/pwa-icon-192.png"
        : personaImage(message.author.avatar ?? "maman");
      const text = document.createElement("span");
      const who = document.createElement("small");
      who.textContent = `${message.author.pseudo}${message.label ? ` · ${message.label}` : ""}`;
      // Un exemple le dit discrètement, en fin de ligne : le prénom reste en premier.
      if (message.demo) {
        const note = document.createElement("em");
        note.textContent = "illustration";
        who.append(" ", note);
      }
      const body = document.createElement("strong");
      body.textContent = shortBody(message.body, 60) || "…";
      text.append(who, body);
      element.append(avatar, text);
      if (message.demo) element.title = "Message d'illustration au lancement";
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        open(message);
      });
      return element;
    };
    const next = () => {
      window.clearTimeout(timer);
      if (busy) return;
      const messages = latest.current.messages;
      if (!messages.length) {
        timer = window.setTimeout(next, 10_000);
        return;
      }
      const bounds = map.getBounds();
      // Le prochain message dont le navire ou le port est à l'écran.
      for (let tries = 0; tries < messages.length; tries++) {
        const message = messages[index % messages.length]!;
        index++;
        const spot = spotOf(message);
        if (!spot || !bounds.contains(spot.at)) continue;
        marker = new Marker({ element: build(message), anchor: "bottom", offset: spot.offset })
          .setLngLat(spot.at)
          .addTo(map);
        shown++;
        if (shown % INVITE_EVERY === 0) window.dispatchEvent(new Event(CHAT_INVITE_EVENT));
        timer = window.setTimeout(() => {
          hide();
          timer = window.setTimeout(next, GAP_MS);
        }, SHOW_MS);
        return;
      }
      timer = window.setTimeout(next, GAP_MS * 2);
    };
    // La bulle cède la place dès qu'on manipule la carte, et revient quand on la lâche.
    const pause = () => {
      busy = true;
      window.clearTimeout(timer);
      hide();
    };
    const resume = () => {
      busy = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(next, RESUME_MS);
    };
    map.on("movestart", pause);
    map.on("moveend", resume);
    timer = window.setTimeout(next, 2_000);
    return () => {
      window.clearTimeout(timer);
      map.off("movestart", pause);
      map.off("moveend", resume);
      marker?.remove();
    };
  }, [mapRef, ready, paused]);
}
