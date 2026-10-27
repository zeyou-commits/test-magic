import { createElement, useEffect, useRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useQuery } from "@tanstack/react-query";
import { Marker, Popup, type Map as MapLibreMap } from "maplibre-gl";
import { useAuth } from "@/hooks/useAuth";
import {
  activeAlerts,
  alertLabel,
  communityQuery,
  isPublicAlert,
  onSiteCount,
  situationOf,
  useSignalCatalog,
  type TravelAlert,
} from "@/lib/ferry/community";
import type { FleetShip } from "@/lib/ferry/fleet";
import type { MapPreview } from "@/lib/ferry/mapPresentation";
import { formatAge } from "@/lib/ferry/tracking";
import type { Port, Selection } from "@/lib/ferry/types";
import { FLASH_PREVIEW_EVENT } from "@/components/panel/FlashFeed";
import { SituationIcon } from "@/components/panel/SituationIcon";

// Pictos et couleurs : les mêmes que dans la saisie et les fiches (catalogue unique).
function iconInto(host: HTMLElement, category: TravelAlert["category"], size: number, roots: Root[]) {
  host.style.setProperty("--situation-color", situationOf(category).color);
  const root = createRoot(host);
  root.render(createElement(SituationIcon, { category, size }));
  roots.push(root);
}
// Démonter après le rendu en cours (React refuse un démontage synchrone pendant un rendu).
const unmountLater = (roots: Root[]) => {
  const list = roots.splice(0);
  window.setTimeout(() => list.forEach((root) => root.unmount()), 0);
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
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
const voyageurs = (n: number) => `${n} voyageur${n > 1 ? "s" : ""}`;

/**
 * Signalements voyageurs sur la carte, façon Waze : une pastille par port ou navire,
 * pointée vers sa cible (ports à gauche, navires à droite, pour ne pas se recouvrir).
 * Survol : la pastille et sa cible sont mises en évidence. Clic : une bulle résume
 * les signalements ; toucher la bulle ouvre la fiche.
 */
export function useTravelMarkers(
  mapRef: RefObject<MapLibreMap | null>,
  ready: boolean,
  ports: Port[],
  fleet: FleetShip[],
  onSelect: (s: Selection | null) => void,
  onOpen?: () => void,
  onMarkerHover?: () => void,
) {
  const { user } = useAuth();
  const feed = useQuery(communityQuery(undefined, undefined, false, user?.id));
  // Catalogue (libellés, couleurs, pictos) : les pastilles sont redessinées dès qu'il est chargé.
  const { ready: catalogReady } = useSignalCatalog();
  const callbacks = useRef({ onSelect, onOpen, onMarkerHover });
  callbacks.current = { onSelect, onOpen, onMarkerHover };
  // Bulle ouverte : conservée quand la flotte se met à jour (les pastilles sont recréées).
  const openKey = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !feed.data) return;
    const groups = new Map<string, TravelAlert[]>();
    for (const alert of activeAlerts(feed.data.alerts)) {
      // Situation dite terminée par la majorité, ou impactante pas encore confirmée : pas sur la carte.
      if (!isPublicAlert(alert)) continue;
      const key = `${alert.target_kind}:${alert.target_id}`;
      groups.set(key, [...(groups.get(key) ?? []), alert]);
    }
    const markers: Marker[] = [];
    const roots: Root[] = [];
    const bubbleRoots: Root[] = [];
    const bubble = new Popup({
      closeButton: false,
      closeOnClick: true,
      // Toujours au-dessus de la pastille : en dessous, le volet mobile la cacherait.
      anchor: "bottom",
      maxWidth: "290px",
      className: "bw-signal-bubble",
    });
    let disposed = false;
    bubble.on("close", () => {
      if (!disposed) openKey.current = null;
    });
    const showers = new Map<string, () => void>();
    const preview = (detail: MapPreview | null) =>
      window.dispatchEvent(new CustomEvent(FLASH_PREVIEW_EVENT, { detail }));
    for (const [key, alerts] of groups) {
      const alert = alerts[0]!;
      const isPort = alert.target_kind === "port";
      const port = isPort ? ports.find((p) => p.id === alert.target_id) : undefined;
      const ship = !isPort ? fleet.find((s) => s.vesselId === alert.target_id) : undefined;
      const point: [number, number] | undefined = port
        ? [port.longitude, port.latitude]
        : ship?.live
          ? [ship.live.position.longitude, ship.live.position.latitude]
          : ship?.lngLat;
      if (!point) continue;
      const name = port?.name ?? ship?.name ?? "";
      const travelers = alerts.reduce((sum, item) => sum + 1 + item.confirmations, 0);
      const good = alerts.every((item) => item.category === "fluid");
      const onSite = alerts.reduce((sum, item) => sum + onSiteCount(item), 0);
      // Les navires amarrés sont décalés en pixels à côté du port : la pastille suit le navire.
      const shift: [number, number] = ship && !ship.live ? [ship.dx, ship.dy] : [0, 0];

      const button = el("button", "bw-signal-pin");
      button.type = "button";
      button.dataset["side"] = isPort ? "port" : "vessel";
      button.dataset["tone"] = good ? "good" : "warn";
      if (onSite) button.dataset["onsite"] = "true";
      button.style.setProperty("--situation-color", situationOf(alert.category).color);
      button.setAttribute(
        "aria-label",
        `${name} : ${alerts.map(alertLabel).join(", ")}. ${voyageurs(travelers)}${onSite ? `, dont ${onSite} sur place` : ""}. Afficher le détail`,
      );
      // Le contenu est dans un bloc à part : MapLibre positionne le bouton par transform.
      const body = el("span", "bw-signal-pin__body");
      const badge = el("span", "bw-signal-pin__icon");
      iconInto(badge, alert.category, 15, roots);
      body.append(badge);
      const crowd = el("span", "bw-signal-pin__crowd");
      for (let index = 0; index < Math.min(2, travelers); index += 1)
        crowd.append(face(FACE_COLORS[index % FACE_COLORS.length] ?? "#f6c99a"));
      if (travelers > 1) crowd.append(el("small", "", String(travelers)));
      if (alerts.length > 1) crowd.append(el("small", "bw-signal-pin__more", `+${alerts.length - 1}`));
      body.append(crowd);
      button.append(body);

      // Survol : la carte ne réagit plus au navire dessous (pas de fiche de survol parasite).
      button.addEventListener("mousemove", (event) => event.stopPropagation());
      button.addEventListener("mouseenter", () => {
        callbacks.current.onMarkerHover?.();
        button.parentElement?.classList.add("bw-signal-pins--focus");
        preview(isPort ? { portId: alert.target_id } : { vesselId: alert.target_id });
      });
      button.addEventListener("mouseleave", () => {
        button.parentElement?.classList.remove("bw-signal-pins--focus");
        preview(null);
      });

      const open = () => {
        bubble.remove();
        callbacks.current.onSelect({ type: alert.target_kind, id: alert.target_id });
        callbacks.current.onOpen?.();
      };
      const show = () => {
        unmountLater(bubbleRoots);
        const card = el("button", "bw-signal-bubble__card");
        card.type = "button";
        card.setAttribute("aria-label", `Ouvrir la fiche ${name}`);
        const head = el("span", "bw-signal-bubble__head");
        head.append(
          el("small", "", isPort ? "Port · infos voyageurs" : "Navire · infos voyageurs"),
          el("strong", "", name),
        );
        card.append(head);
        const list = el("ul", "bw-signal-bubble__list");
        for (const item of alerts) {
          const row = el("li", "");
          row.dataset["tone"] = item.category === "fluid" ? "good" : "warn";
          const mark = el("span", "bw-signal-bubble__icon");
          iconInto(mark, item.category, 14, bubbleRoots);
          const text = el("span", "");
          const age = Math.max(0, (Date.now() - Date.parse(item.created_at)) / 60_000);
          text.append(
            el("strong", "", alertLabel(item)),
            el(
              "small",
              "",
              `${formatAge(age)} · ${voyageurs(1 + item.confirmations)}${onSiteCount(item) ? ` · ${onSiteCount(item)} sur place` : ""}`,
            ),
          );
          row.append(mark, text);
          list.append(row);
        }
        card.append(list);
        card.append(el("span", "bw-signal-bubble__cta", "Ouvrir la fiche ›"));
        card.addEventListener("click", open);
        const lift = isPort ? -22 : 22;
        // Pas assez de place au-dessus : la carte glisse vers le bas le temps de lire la bulle.
        const room = map.project(point).y + shift[1] - 46;
        const needed = 70 + 64 * alerts.length + 40;
        if (room < needed) map.panBy([0, room - needed], { duration: 250 });
        bubble
          .setLngLat(point)
          .setDOMContent(card)
          .setOffset([shift[0] + lift, shift[1] - 46])
          .addTo(map);
        openKey.current = key;
      };
      showers.set(key, show);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        callbacks.current.onMarkerHover?.();
        show();
      });
      markers.push(
        new Marker({
          element: button,
          anchor: isPort ? "bottom-right" : "bottom-left",
          offset: [shift[0] + (isPort ? 4 : -4), shift[1] - 8],
        })
          .setLngLat(point)
          .addTo(map),
      );
    }
    if (openKey.current) showers.get(openKey.current)?.();
    return () => {
      disposed = true;
      bubble.remove();
      unmountLater(roots);
      unmountLater(bubbleRoots);
      markers.forEach((marker) => marker.remove());
    };
  }, [mapRef, ready, ports, fleet, feed.data, catalogReady]);
}
