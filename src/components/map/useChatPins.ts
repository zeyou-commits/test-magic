import { useEffect, useRef, type RefObject } from "react";
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
  shortBody,
  type RecentMessage,
} from "@/lib/ferry/chatDemo";
import {
  countLabel,
  groupPins,
  isFresh,
  mapRoomsQuery,
  type MapMessage,
  type PinGroup,
} from "@/lib/ferry/chatMap";
import { formatAge } from "@/lib/ferry/tracking";
import { shipAnchor, type FleetShip } from "@/lib/ferry/fleet";
import { useMyTrip } from "@/lib/ferry/myTrip";
import type { Port, RouteLine, Selection } from "@/lib/ferry/types";
import { vesselMapIcon } from "@/lib/ferry/vesselVisuals";
import { dockSpread, shipShiftY, vesselScreenHeight } from "./shipIcons";
import { MY_TRIP_TAG_SPACE } from "./useMyTripMarker";

/** À partir de ce zoom, chaque pastille montre son dernier message sur une ligne. */
export const PEEK_ZOOM = 6.6;
const ICON = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>`;

type Place = { key: string; at: [number, number]; offset: [number, number]; vesselId?: string | null; portId?: string };

/**
 * Les salons sur la carte, l'icône d'abord : une pastille par navire ou port avec le nombre de
 * messages des dernières 24 h ; au zoom, le dernier message sur une ligne ; au toucher, le fil du
 * lieu (3 derniers messages) et l'accès au salon. Les signalements gardent leurs propres pictos.
 */
export function useChatPins(
  mapRef: RefObject<MapLibreMap | null>,
  ready: boolean,
  fleet: FleetShip[],
  ports: Port[],
  routes: RouteLine[],
  paused: boolean,
  onSelect: (selection: Selection | null) => void,
  /** Téléphone : hauteur du tiroir qui couvre le bas de la carte ; le fil se pose au-dessus. */
  bottomInset = 0,
) {
  const rooms = useQuery(mapRoomsQuery).data ?? [];
  const demosAdmin = useQuery(chatDemoQuery).data;
  const setting = useQuery(chatDemoSettingQuery).data;
  // Charge la liste des avatars : personaImage() y trouve l'image des humeurs et des ajouts.
  useQuery(avatarsQuery);
  const myDepartureId = useMyTrip().trip?.departure.id;
  // Mêmes règles qu'avant pour les exemples du lancement : seulement tant que les salons sont calmes.
  const realCount = rooms.reduce((sum, room) => sum + room.count, 0);
  const demos = bubbleMessages(
    Array.from({ length: realCount }, () => ({}) as RecentMessage),
    demosAdmin,
    setting,
  ).filter((message) => message.demo);
  const latest = useRef({ fleet, ports, routes, rooms, demos, onSelect, myDepartureId });
  latest.current = { fleet, ports, routes, rooms, demos, onSelect, myDepartureId };
  const signature = [
    rooms.map((r) => `${r.room}:${r.count}:${r.last_at}`).join(","),
    demos.length,
    fleet.map((s) => `${s.departureId}:${s.state}:${s.lngLat[0].toFixed(3)},${s.lngLat[1].toFixed(3)}`).join(","),
    ports.length,
    routes.length,
    myDepartureId ?? "",
  ].join("|");
  const sync = useRef<() => void>(() => undefined);
  const close = useRef<() => void>(() => undefined);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = new Map<string, { marker: Marker; el: HTMLButtonElement; sig: string }>();
    let sheet: HTMLDivElement | null = null;
    let sheetKey: string | null = null;
    let invited = false;

    const portPlace = (portId: string | null | undefined): Place | null => {
      const port = latest.current.ports.find((item) => item.id === portId);
      if (!port) return null;
      return { key: `p:${port.id}`, at: [port.longitude, port.latitude], offset: [0, portLift(port)], portId: port.id };
    };
    // Le phare et le nom du port restent lisibles : la pastille se pose juste au-dessus des deux.
    const portLift = (port: Port) => {
      const dot = [...map.getContainer().querySelectorAll<HTMLElement>(".port-marker__dot")].find(
        (item) => item.getAttribute("aria-label") === `Port de ${port.name}`,
      );
      const box = dot?.closest<HTMLElement>(".port-marker");
      if (!box) return -14;
      const point = map.project([port.longitude, port.latitude]);
      const origin = map.getContainer().getBoundingClientRect();
      const tops = [...box.querySelectorAll<HTMLElement>(".port-marker__dot, .port-marker__label")]
        .map((item) => item.getBoundingClientRect())
        .filter((rect) => rect.width > 0)
        .map((rect) => rect.top - origin.top);
      return tops.length ? Math.min(-14, Math.round(Math.min(...tops) - point.y - 3)) : -14;
    };
    const shipPlace = (ship: FleetShip): Place => {
      const zoom = map.getZoom();
      const slug = vesselMapIcon(ship.name);
      const x = ship.dx * (slug ? dockSpread(zoom) : 1);
      const y = shipShiftY(ship.dy, ship.ashore, slug, zoom);
      const tag = ship.departureId && ship.departureId === latest.current.myDepartureId;
      const height = slug ? vesselScreenHeight(slug, zoom) : 12;
      return {
        key: `d:${ship.departureId}`,
        at: shipAnchor(ship),
        offset: [x, y - height - 4 - (tag ? MY_TRIP_TAG_SPACE : 0)],
        vesselId: ship.vesselId,
      };
    };
    // Où se pose un exemple : son port, ou le navire en mer de sa ligne, ou un point de la route.
    const demoPlace = (message: RecentMessage): Place | null => {
      const { fleet, routes, ports } = latest.current;
      if (message.at)
        return { key: `at:${message.at.join(",")}`, at: message.at, offset: [0, -10] };
      if (message.portId) return portPlace(message.portId);
      const route =
        routes.find((item) => item.id === message.routeId) ??
        routes.find((item) => {
          const from = ports.find((port) => port.id === item.departure_port_id);
          const to = ports.find((port) => port.id === item.arrival_port_id);
          return Boolean(from && to && message.label === `${from.name} → ${to.name}`);
        });
      if (!route) {
        const port = ports.find((item) => message.label === `Port de ${item.name}`);
        return port ? portPlace(port.id) : null;
      }
      const ship = fleet.find((item) => item.routeId === route.id && item.state === "sea");
      return ship?.departureId ? shipPlace(ship) : null;
    };
    const placeOfGroup = (group: PinGroup, demoPlaces: Map<string, Place>): Place | null => {
      if (group.room?.kind === "port") return portPlace(group.room.id);
      if (group.room?.kind === "crossing") {
        const ship = latest.current.fleet.find((item) => item.departureId === group.room!.id);
        return ship ? shipPlace(ship) : null;
      }
      return demoPlaces.get(group.key) ?? null;
    };

    const closeSheet = () => {
      sheet?.remove();
      sheet = null;
      sheetKey = null;
      markers.forEach(({ el }) => delete el.dataset["active"]);
    };
    const openRoom = (group: PinGroup) => {
      closeSheet();
      if (!group.room) {
        window.dispatchEvent(new Event(OPEN_ROOM_PICKER_EVENT));
        return;
      }
      latest.current.onSelect(
        group.room.kind === "crossing"
          ? { type: "departure", id: group.room.id }
          : { type: "port", id: group.room.id },
      );
      enterRoom(group.room.kind, group.room.id);
    };
    const messageRow = (message: MapMessage) => {
      const li = document.createElement("li");
      const face = document.createElement("img");
      face.alt = "";
      face.src = message.author.official ? "/pwa-icon-192.png" : personaImage(message.author.avatar ?? "maman");
      const text = document.createElement("span");
      const who = document.createElement("b");
      who.textContent = message.author.pseudo;
      const meta = document.createElement("small");
      if (message.demo) meta.textContent = "Exemple";
      else {
        const age = Math.max(0, (Date.now() - Date.parse(message.created_at)) / 60_000);
        meta.textContent = formatAge(age);
      }
      const body = document.createElement("span");
      body.textContent = shortBody(message.body, 140) || "…";
      text.append(who, meta, body);
      li.append(face, text);
      return li;
    };
    // Le fil du lieu, dans un petit volet en bas de la carte (au-dessus du tiroir sur téléphone).
    const openSheet = (group: PinGroup, place: Place) => {
      closeSheet();
      sheetKey = group.key;
      markers.get(group.key)?.el.setAttribute("data-active", "true");
      const box = document.createElement("div");
      box.className = "bw-pin-sheet";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-label", "Messages de ce lieu");
      box.addEventListener("click", (event) => event.stopPropagation());
      const head = document.createElement("div");
      head.className = "bw-pin-sheet__head";
      const title = document.createElement("p");
      const ship = place.vesselId
        ? latest.current.fleet.find((item) => item.vesselId === place.vesselId)
        : null;
      const port = place.portId ? latest.current.ports.find((item) => item.id === place.portId) : null;
      const name = document.createElement("b");
      name.textContent = ship?.name ?? (port ? `Port de ${port.name}` : (group.label ?? "Sur la route"));
      const sub = document.createElement("small");
      sub.textContent = `${ship && group.label ? `${group.label} · ` : ""}${group.count} message${group.count > 1 ? "s" : ""}${group.room ? " sur 24 h" : ""}`;
      title.append(name, sub);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "bw-pin-sheet__close";
      close.setAttribute("aria-label", "Fermer");
      close.textContent = "✕";
      close.addEventListener("click", closeSheet);
      head.append(title, close);
      const list = document.createElement("ul");
      group.messages.slice(0, 3).forEach((message) => list.append(messageRow(message)));
      const actions = document.createElement("div");
      actions.className = "bw-pin-sheet__actions";
      const main = document.createElement("button");
      main.type = "button";
      main.className = "bw-pin-sheet__main";
      main.textContent = group.room ? "Ouvrir le salon" : "Voir les salons";
      main.addEventListener("click", () => openRoom(group));
      actions.append(main);
      if (ship?.vesselId || port) {
        const second = document.createElement("button");
        second.type = "button";
        second.className = "bw-pin-sheet__second";
        second.textContent = ship ? "Fiche du navire" : "Fiche du port";
        second.addEventListener("click", () => {
          closeSheet();
          latest.current.onSelect(
            ship?.vesselId ? { type: "vessel", id: ship.vesselId } : { type: "port", id: port!.id },
          );
        });
        actions.append(second);
      }
      box.append(head, list, actions);
      map.getContainer().append(box);
      sheet = box;
    };

    const render = (el: HTMLButtonElement, group: PinGroup, peek: boolean) => {
      el.replaceChildren();
      const icon = document.createElement("span");
      icon.className = "bw-chat-pin__icon";
      icon.innerHTML = ICON;
      el.append(icon);
      if (peek && group.messages[0]) {
        const text = document.createElement("span");
        text.className = "bw-chat-pin__peek";
        const who = document.createElement("b");
        who.textContent = group.messages[0].author.pseudo;
        text.append(who, ` ${shortBody(group.messages[0].body, 60)}`);
        el.append(text);
      }
      const count = document.createElement("span");
      count.className = "bw-chat-pin__count";
      count.textContent = countLabel(group.count);
      el.append(count);
      el.dataset["peek"] = peek ? "true" : "false";
      if (isFresh(group.last_at, Date.now())) el.dataset["fresh"] = "true";
      else delete el.dataset["fresh"];
      if (group.demo) el.dataset["demo"] = "true";
      if (group.road) el.dataset["road"] = "true";
      const first = group.messages[0];
      el.setAttribute(
        "aria-label",
        `${group.count} message${group.count > 1 ? "s" : ""}${first ? `, dernier de ${first.author.pseudo} : ${shortBody(first.body, 60)}` : ""}`,
      );
    };

    sync.current = () => {
      const demoPlaces = new Map<string, Place>();
      const groups = groupPins(latest.current.rooms, latest.current.demos, (message) => {
        const place = demoPlace(message);
        if (!place) return null;
        demoPlaces.set(place.key, place);
        return place.key;
      });
      const peek = map.getZoom() >= PEEK_ZOOM;
      const seen = new Set<string>();
      for (const group of groups) {
        const place = placeOfGroup(group, demoPlaces);
        if (!place) continue;
        seen.add(group.key);
        const sig = `${group.count}:${group.last_at}:${group.messages[0]?.id ?? ""}:${peek}`;
        let entry = markers.get(group.key);
        if (!entry) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "bw-chat-pin";
          const box = document.createElement("div");
          box.append(el);
          const marker = new Marker({ element: box, anchor: "bottom-left", offset: [place.offset[0] - 14, place.offset[1]] })
            .setLngLat(place.at)
            .addTo(map);
          // Au-dessus des navires et des noms de ports, mais toujours sous une fiche ouverte
          // (fiche navire 20, info-bulles 100 et plus).
          marker.getElement().style.zIndex = "8";
          entry = { marker, el, sig: "" };
          markers.set(group.key, entry);
        }
        const current = entry;
        current.marker.setLngLat(place.at);
        current.marker.setOffset([place.offset[0] - 14, place.offset[1]]);
        if (current.sig !== sig) {
          render(current.el, group, peek);
          current.sig = sig;
        }
        current.el.onclick = (event) => {
          event.stopPropagation();
          if (sheetKey === group.key) closeSheet();
          else openSheet(group, place);
        };
      }
      markers.forEach((entry, key) => {
        if (seen.has(key)) return;
        entry.marker.remove();
        markers.delete(key);
        if (sheetKey === key) closeSheet();
      });
      // Une fois par visite, le bouton Salons invite à partager quand la carte a des messages.
      if (!invited && markers.size) {
        invited = true;
        window.setTimeout(() => window.dispatchEvent(new Event(CHAT_INVITE_EVENT)), 8_000);
      }
    };
    close.current = closeSheet;
    const onZoom = () => sync.current();
    map.on("zoomend", onZoom);
    // Les noms des ports se replacent après chaque mouvement : les pastilles suivent.
    map.on("idle", onZoom);
    map.on("click", closeSheet);
    sync.current();
    return () => {
      map.off("zoomend", onZoom);
      map.off("idle", onZoom);
      map.off("click", closeSheet);
      closeSheet();
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      sync.current = () => undefined;
      close.current = () => undefined;
    };
  }, [mapRef, ready]);

  useEffect(() => {
    sync.current();
  }, [signature]);

  useEffect(() => {
    mapRef.current?.getContainer().style.setProperty("--bw-pin-sheet-inset", `${Math.round(bottomInset)}px`);
  }, [bottomInset, mapRef, ready]);

  // Une fiche ou un trajet occupe l'écran : le fil se referme, les pastilles restent.
  useEffect(() => {
    if (paused) close.current();
  }, [paused]);
}
