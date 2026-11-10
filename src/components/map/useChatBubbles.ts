import { createElement, useEffect, useRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SituationIcon } from "@/components/panel/SituationIcon";
import { formatAge } from "@/lib/ferry/tracking";
import { useQuery } from "@tanstack/react-query";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { personaImage } from "@/lib/community/travellers";
import { avatarsQuery } from "@/lib/community/avatars";
import { enterRoom } from "@/lib/ferry/chat";
import {
  bubbleMessages,
  chatDemoQuery,
  chatDemoSettingQuery,
  CHAT_INVITE_EVENT,
  OPEN_ROOM_PICKER_EVENT,
  recentChatQuery,
  shortBody,
  type RecentMessage,
} from "@/lib/ferry/chatDemo";
import { shipAnchor, type FleetShip } from "@/lib/ferry/fleet";
import { useAuth } from "@/hooks/useAuth";
import { useMyTrip } from "@/lib/ferry/myTrip";
import {
  activeAlerts,
  alertLabel,
  communityQuery,
  isPublicAlert,
  situationOf,
  type TravelAlert,
} from "@/lib/ferry/community";
import { requestSignalFocus } from "@/components/panel/LivePulse";
import { QUICK_REPORT_EVENT } from "./QuickReport";
import { demoReports, isDemoReport } from "@/lib/ferry/reportDemo";
import type { Port, RouteLine, Selection } from "@/lib/ferry/types";
import { vesselMapIcon } from "@/lib/ferry/vesselVisuals";
import { dockSpread, shipShiftY, vesselScreenHeight } from "./shipIcons";
import { MY_TRIP_TAG_SPACE } from "./useMyTripMarker";

/** Une bulle visible 5 s, puis 2,5 s de calme avant la suivante. */
const SHOW_MS = 5_000;
const GAP_MS = 2_500;
/** Après un geste sur la carte, les bulles attendent un peu avant de revenir. */
const RESUME_MS = 4_000;
/** Toutes les 3 bulles, le bouton Salons invite à partager. */
const INVITE_EVERY = 3;

/** at : le lieu ; offset : où pointe la bulle ; source : où naît l'onde (le navire, le port). */
type Spot = { at: [number, number]; offset: [number, number]; source: [number, number] };
/** La pointe de la bulle : à 24 px du bord gauche, 9 px sous la bulle (voir .bw-map-bubble::after). */
const TIP_X = 24;
const TIP_Y = 9;
/** Marge gardée entre une bulle et le bord de la carte. */
const EDGE = 8;
const CAR = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h-1a1 1 0 0 1-1-1v-4l2.4-5.2A2 2 0 0 1 7.2 5.6h9.6a2 2 0 0 1 1.8 1.2L21 12v4a1 1 0 0 1-1 1h-1"/><path d="M3 12h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/></svg>`;
/** Une bulle : un message de salon, ou un signalement de voyageurs. */
type Bubble = RecentMessage & { report?: TravelAlert };
/** Un signalement s'invite toutes les 2 bulles de messages. */
const REPORT_EVERY = 2;


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
  const setting = useQuery(chatDemoSettingQuery).data;
  const publicAlerts = activeAlerts(community?.alerts ?? []).filter(isPublicAlert);
  // Pas encore de vrais signalements : des exemples marqués « Exemple » (même réglage que les salons).
  const withDemos = [
    ...publicAlerts,
    ...(community && setting ? demoReports(ports, publicAlerts.length, setting) : []),
  ];
  const reports: Bubble[] = withDemos
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 4)
    .map((alert) => ({
      id: `report-${alert.id}`,
      ...(isDemoReport(alert) ? { demo: true } : {}),
      kind: alert.target_kind === "port" ? "port" : "crossing",
      room: "",
      body: alertLabel(alert),
      created_at: alert.created_at,
      label: null,
      author: { pseudo: "Signalement" },
      report: alert,
    }));
  // Charge la liste des avatars : personaImage() y trouve l'image des humeurs et des ajouts.
  useQuery(avatarsQuery);
  const messages: Bubble[] = bubbleMessages(real, demos, setting);
  const mixed: Bubble[] = [];
  let next = 0;
  messages.forEach((message, position) => {
    mixed.push(message);
    if ((position + 1) % REPORT_EVERY === 0 && next < reports.length) mixed.push(reports[next++]!);
  });
  mixed.push(...reports.slice(next));
  // Mon bateau porte une étiquette au-dessus de la coque : ses bulles sortent au-dessus d'elle.
  const myDepartureId = useMyTrip().trip?.departure.id;
  const latest = useRef({ fleet, ports, routes, onSelect, messages: [] as Bubble[], myDepartureId });
  latest.current = { fleet, ports, routes, onSelect, messages: mixed, myDepartureId };

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
      return port
        ? { at: [port.longitude, port.latitude], offset: [0, -12], source: [0, 0] }
        : null;
    };
    const shipSpot = (ship: FleetShip): Spot => {
      const zoom = map.getZoom();
      const slug = vesselMapIcon(ship.name);
      const x = ship.dx * (slug ? dockSpread(zoom) : 1);
      const y = shipShiftY(ship.dy, ship.ashore, slug, zoom);
      const tag = ship.departureId && ship.departureId === latest.current.myDepartureId;
      const height = slug ? vesselScreenHeight(slug, zoom) : 12;
      return {
        at: shipAnchor(ship),
        offset: [x, y - height - 4 - (tag ? MY_TRIP_TAG_SPACE : 0)],
        // L'onde naît au milieu de la coque.
        source: [x, y - height / 2],
      };
    };
    // D'où sort la bulle : le navire du salon, sinon le navire de la ligne, sinon son port.
    const spotOf = (message: Bubble): Spot | null => {
      const { fleet, routes } = latest.current;
      if (message.at) return { at: message.at, offset: [0, -16], source: [0, 0] };
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
      if (ship) return shipSpot(ship);
      // Un exemple « à bord » (mer, restaurant…) ne sort jamais d'un port : sans navire en mer, il attend.
      return message.demo ? null : portSpot(route.departure_port_id);
    };

    let iconRoot: Root | null = null;
    let source: Marker | null = null;
    const hide = () => {
      const origin = source;
      source = null;
      if (origin) {
        origin.getElement().querySelector<HTMLElement>(".bw-map-bubble-source")!.dataset["leaving"] = "true";
        window.setTimeout(() => origin.remove(), 300);
      }
      // MapLibre place le marqueur par transform : les effets vivent sur l'élément intérieur.
      const element = marker?.getElement().querySelector<HTMLElement>(".bw-map-bubble");
      if (!element) return;
      element.dataset["leaving"] = "true";
      const old = marker;
      const oldRoot = iconRoot;
      marker = null;
      iconRoot = null;
      window.setTimeout(() => {
        old?.remove();
        oldRoot?.unmount();
      }, 300);
    };
    const open = (message: Bubble) => {
      if (message.report && isDemoReport(message.report)) {
        window.dispatchEvent(
          new CustomEvent(QUICK_REPORT_EVENT, {
            detail: { type: "port", id: message.report.target_id },
          }),
        );
        return;
      }
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
    // Une petite carte : l'avatar (ou le picto du signalement), qui et où, puis le message sur
    // deux lignes. Un signalement se reconnaît tout de suite : pastille colorée et mot « Signalement ».
    const build = (message: Bubble) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "bw-map-bubble";
      const face = document.createElement("i");
      face.className = "bw-map-bubble__face";
      const text = document.createElement("span");
      text.className = "bw-map-bubble__text";
      const top = document.createElement("span");
      top.className = "bw-map-bubble__top";
      const msg = document.createElement("span");
      msg.className = "bw-map-bubble__msg";
      if (message.report) {
        const { report } = message;
        element.dataset["report"] = "true";
        element.style.setProperty("--situation-color", situationOf(report.category).color);
        iconRoot = createRoot(face);
        iconRoot.render(createElement(SituationIcon, { category: report.category, size: 17 }));
        const kind = document.createElement("b");
        kind.textContent = "Signalement";
        const age = Math.max(0, (Date.now() - Date.parse(report.created_at)) / 60_000);
        const meta = document.createElement("small");
        meta.textContent = `${formatAge(age)}${report.confirmations ? ` · ✓ ${report.confirmations}` : ""}`;
        top.append(kind, meta);
        msg.textContent = shortBody(message.body, 80);
        element.title = "Signalement de voyageurs : toucher pour le détail";
      } else {
        const avatar = document.createElement("img");
        avatar.alt = "";
        avatar.src = message.author.official
          ? "/pwa-icon-192.png"
          : personaImage(message.author.avatar ?? "maman");
        face.append(avatar);
        const name = document.createElement("b");
        name.textContent = message.author.pseudo;
        top.append(name);
        if (message.label) {
          const where = document.createElement("small");
          where.textContent = message.label;
          top.append(where);
        }
        msg.textContent = shortBody(message.body, 90) || "…";
      }
      // Un exemple le dit clairement, sans alourdir : une petite étiquette en tête.
      if (message.demo) {
        const note = document.createElement("em");
        note.textContent = "Exemple";
        top.append(note);
        element.title = "Message d'illustration au lancement : toucher pour ouvrir les salons";
      }
      text.append(top, msg);
      element.append(face, text);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        open(message);
      });
      return element;
    };
    // Une bulle près du bord sortirait de l'écran : on la décale vers l'intérieur (sa pointe,
    // elle, reste sur le navire ou le port), et sans place au-dessus, elle s'ouvre en dessous.
    const keepInside = (bubbleMarker: Marker, spot: Spot) => {
      const box = bubbleMarker.getElement();
      const bubble = box.firstElementChild as HTMLElement | null;
      if (!bubble) return;
      const area = map.getContainer().getBoundingClientRect();
      // Taille et place réelles (la bulle grandit depuis sa pointe : on mesure la boîte, pas l'animation).
      let rect = box.getBoundingClientRect();
      let below = false;
      if (rect.top < area.top + EDGE) {
        below = true;
        bubble.dataset["below"] = "true";
        // Ancrée par le bas : on descend le bas de la bulle d'une hauteur, plus la place de la pointe.
        bubbleMarker.setOffset([spot.offset[0] - TIP_X, spot.source[1] + 16 + rect.height]);
        rect = box.getBoundingClientRect();
      }
      let shift = 0;
      if (rect.right > area.right - EDGE) shift = area.right - EDGE - rect.right;
      if (rect.left + shift < area.left + EDGE) shift = area.left + EDGE - rect.left;
      // La pointe ne quitte pas les coins arrondis de la bulle.
      shift = Math.max(shift, -(rect.width - 2 * TIP_X));
      if (!shift && !below) return;
      const offset = bubbleMarker.getOffset();
      bubbleMarker.setOffset([offset.x + shift, offset.y]);
      bubble.style.setProperty("--bubble-tip", `${TIP_X - shift}px`);
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
        // D'abord une onde sur le navire, le port ou la route ; la bulle en sort juste après,
        // sa pointe posée sur l'endroit d'où vient le message.
        const origin = document.createElement("span");
        origin.className = "bw-map-bubble-source";
        if (message.road) {
          origin.dataset["road"] = "true";
          origin.innerHTML = CAR;
        }
        if (message.report)
          origin.style.setProperty("--source-color", situationOf(message.report.category).color);
        const originBox = document.createElement("div");
        originBox.append(origin);
        source = new Marker({ element: originBox, anchor: "center", offset: spot.source })
          .setLngLat(spot.at)
          .addTo(map);
        source.getElement().style.zIndex = "99999";
        const box = document.createElement("div");
        box.append(build(message));
        marker = new Marker({
          element: box,
          anchor: "bottom-left",
          offset: [spot.offset[0] - TIP_X, spot.offset[1] - TIP_Y],
        })
          .setLngLat(spot.at)
          .addTo(map);
        // Au-dessus des noms de ports et des pastilles, même mis en avant au survol.
        marker.getElement().style.zIndex = "100000";
        keepInside(marker, spot);
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
      source?.remove();
      const root = iconRoot;
      if (root) window.setTimeout(() => root.unmount(), 0);
    };
  }, [mapRef, ready, paused]);
}
