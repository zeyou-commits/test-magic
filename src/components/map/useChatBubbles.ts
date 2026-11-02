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
import { useAuth } from "@/hooks/useAuth";
import {
  activeAlerts,
  alertLabel,
  communityQuery,
  isPublicAlert,
  situationOf,
  type TravelAlert,
} from "@/lib/ferry/community";
import { requestSignalFocus } from "@/components/panel/LivePulse";
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
/** Une bulle : un message de salon, ou un signalement de voyageurs. */
type Bubble = RecentMessage & { report?: TravelAlert };
/** Un signalement s'invite toutes les 2 bulles de messages. */
const REPORT_EVERY = 2;

const MEGAPHONE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>`;

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
  const { user } = useAuth();
  const real = useQuery(recentChatQuery).data ?? [];
  const demos = useQuery(chatDemoQuery).data;
  const community = useQuery(communityQuery(undefined, undefined, false, user?.id)).data;
  // Les signalements publics en cours, les plus récents d'abord, mêlés aux messages.
  const reports: Bubble[] = activeAlerts(community?.alerts ?? [])
    .filter(isPublicAlert)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 4)
    .map((alert) => ({
      id: `report-${alert.id}`,
      kind: alert.target_kind === "port" ? "port" : "crossing",
      room: "",
      body: alertLabel(alert),
      created_at: alert.created_at,
      label: null,
      author: { pseudo: "Signalement" },
      report: alert,
    }));
  const messages: Bubble[] = bubbleMessages(real, demos);
  const mixed: Bubble[] = [];
  let next = 0;
  messages.forEach((message, position) => {
    mixed.push(message);
    if ((position + 1) % REPORT_EVERY === 0 && next < reports.length) mixed.push(reports[next++]!);
  });
  mixed.push(...reports.slice(next));
  const latest = useRef({ fleet, ports, routes, onSelect, messages: [] as Bubble[] });
  latest.current = { fleet, ports, routes, onSelect, messages: mixed };

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
    const spotOf = (message: Bubble): Spot | null => {
      const { fleet, routes } = latest.current;
      if (message.report) {
        if (message.report.target_kind === "port") return portSpot(message.report.target_id);
        const ship = fleet.find((item) => item.vesselId === message.report!.target_id);
        return ship ? shipSpot(ship) : null;
      }
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
    const open = (message: Bubble) => {
      if (message.report) {
        latest.current.onSelect({
          type: message.report.target_kind === "port" ? "port" : "vessel",
          id: message.report.target_id,
        });
        requestSignalFocus(message.report.id);
        return;
      }
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
    const build = (message: Bubble) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "bw-map-bubble";
      if (message.report) {
        // Un signalement : le mégaphone de « Signaler », la situation et ses confirmations.
        const { report } = message;
        const place =
          report.target_kind === "port"
            ? `Port de ${latest.current.ports.find((port) => port.id === report.target_id)?.name ?? "—"}`
            : (latest.current.fleet.find((ship) => ship.vesselId === report.target_id)?.name ?? "Navire");
        element.dataset["report"] = "true";
        element.style.setProperty("--situation-color", situationOf(report.category).color);
        const icon = document.createElement("i");
        icon.innerHTML = MEGAPHONE;
        const text = document.createElement("span");
        const who = document.createElement("small");
        who.textContent = `Signalement · ${place}`;
        const body = document.createElement("strong");
        body.textContent = `${message.body}${report.confirmations ? ` · confirmé par ${report.confirmations}` : ""}`;
        text.append(who, body);
        element.append(icon, text);
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          open(message);
        });
        return element;
      }
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
        // Au-dessus des noms de ports et des pastilles, même mis en avant au survol.
        marker.getElement().style.zIndex = "100000";
        shown++;
        if (!message.report && shown % INVITE_EVERY === 0)
          window.dispatchEvent(new Event(CHAT_INVITE_EVENT));
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
