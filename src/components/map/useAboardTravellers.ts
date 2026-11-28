import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { shipAnchor, type FleetShip } from "@/lib/ferry/fleet";
import { presenceQuery } from "@/lib/ferry/presence";
import { vesselMapIcon } from "@/lib/ferry/vesselVisuals";
import { avatarsQuery } from "@/lib/community/avatars";
import {
  avatarColors,
  openTravellerProfile,
  tripTravellersQuery,
  type TripTraveller,
} from "@/lib/community/travellers";
import { illustrationUrl } from "@/lib/illustrations/store";
import { photoUrl } from "@/lib/photos/photos";
import { useAuth } from "@/hooks/useAuth";
import { tr } from "@/lib/i18n";
import {
  dockSpread,
  shipShiftY,
  shipTokenRadius,
  vesselScreenHeight,
  vesselScreenWidth,
} from "./shipIcons";

/** Zoom à partir duquel les passagers visibles se posent autour du navire (assez gros pour eux). */
export const ABOARD_MIN_ZOOM = 8;
/** Au-delà, un « +n » : le cercle reste lisible. */
const MAX_AROUND = 8;
/**
 * Places sur le bord du halo, en degrés depuis le haut, dans le sens des aiguilles d'une montre :
 * en alternant droite et gauche. Le haut reste libre (« Mon bateau », compteur, humeur).
 */
const ANGLES = [62, -62, 92, -92, 122, -122, 152, -152, 180];

/** Rayon du halo et centre de la coque, en pixels écran, comme le halo de « Mon bateau ». */
export function haloGeometry(ship: FleetShip, zoom: number) {
  const slug = vesselMapIcon(ship.name);
  if (!slug) {
    const r = shipTokenRadius(zoom);
    return { radius: r * 1.5, center: [ship.dx, ship.dy] as [number, number] };
  }
  const x = ship.dx * dockSpread(zoom);
  const bottom = shipShiftY(ship.dy, ship.ashore, slug, zoom);
  const height = vesselScreenHeight(slug, zoom);
  return {
    radius: (vesselScreenWidth(zoom) * 1.25) / 2,
    center: [x, bottom - height / 2] as [number, number],
  };
}

/** Position d'une place sur le cercle (angle en degrés depuis le haut). */
export function aroundOffset(center: [number, number], radius: number, angle: number): [number, number] {
  const rad = (angle * Math.PI) / 180;
  return [center[0] + radius * Math.sin(rad), center[1] - radius * Math.cos(rad)];
}

/**
 * Voyageurs BledWay à bord, de près : leurs avatars se posent en cercle sur le bord du halo du
 * navire, à partir de ABOARD_MIN_ZOOM. Seuls ceux qui acceptent d'apparaître (bw_trip_travellers) ;
 * un toucher ouvre leur fiche, avec le salon de la traversée et les autres passagers.
 */
export function useAboardTravellers(
  mapRef: RefObject<MapLibreMap | null>,
  ready: boolean,
  fleet: FleetShip[],
) {
  const { user } = useAuth();
  const rows = useQuery(presenceQuery).data;
  const avatars = useQuery(avatarsQuery).data?.rows;
  const [near, setNear] = useState(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const update = () => setNear(map.getZoom() >= ABOARD_MIN_ZOOM);
    update();
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [mapRef, ready]);
  // Navires dont la traversée en cours compte des voyageurs à bord (pas celle d'hier).
  const ships = useMemo(() => {
    const crossingOf = new Map(fleet.map((ship) => [ship.vesselId, ship.departureId]));
    const ids = new Set<string>();
    for (const row of rows ?? [])
      if (row.vessel_id && row.onboard && crossingOf.get(row.vessel_id) === row.departure_id)
        ids.add(row.departure_id);
    return fleet.filter((ship) => ship.departureId && ids.has(ship.departureId)).slice(0, 6);
  }, [rows, fleet]);
  // La liste nominative n'est demandée que de près.
  const lists = useQueries({
    queries: ships.map((ship) => ({
      ...tripTravellersQuery(ship.departureId!, user?.id),
      enabled: near,
    })),
  });
  const aboard = ships.map((ship, index) => ({
    ship,
    travellers: (lists[index]?.data?.travellers ?? []).filter((t) => t.step === "onboard"),
  }));
  const key = aboard
    .map(({ ship, travellers }) => `${ship.departureId}:${travellers.map((t) => t.handle).join(",")}`)
    .join("|");
  const latest = useRef(aboard);
  latest.current = aboard;

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !near || !key) return;
    const imageOf = (traveller: TripTraveller) =>
      traveller.photo
        ? photoUrl(traveller.photo)
        : illustrationUrl(
            avatars?.find((row) => row.id === traveller.avatar)?.image ??
              `/cabas/persos/${traveller.avatar}.webp`,
          );
    const placed: { marker: Marker; ship: FleetShip; angle: number }[] = [];
    for (const { ship, travellers } of latest.current) {
      const point = shipAnchor(ship);
      if (!point || !travellers.length || !ship.departureId) continue;
      const departureId = ship.departureId;
      const shown = travellers.slice(0, travellers.length > MAX_AROUND ? MAX_AROUND - 1 : MAX_AROUND);
      shown.forEach((traveller, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "bw-aboard-avatar";
        button.style.background = avatarColors[traveller.color] ?? "#eef3ef";
        button.setAttribute(
          "aria-label",
          tr("ui.aboardTravellers.profil", {
            pseudo: traveller.me ? tr("ui.aboardTravellers.vous") : traveller.pseudo,
            ship: ship.name,
          }),
        );
        button.title = traveller.me ? tr("ui.aboardTravellers.vous") : traveller.pseudo;
        const img = document.createElement("img");
        img.src = imageOf(traveller);
        img.alt = "";
        img.width = 34;
        img.height = 34;
        img.loading = "lazy";
        if (traveller.photo) img.className = "is-photo";
        button.append(img);
        button.addEventListener("mousemove", (event) => event.stopPropagation());
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          openTravellerProfile(traveller.handle, departureId);
        });
        const marker = new Marker({ element: button, anchor: "center" }).setLngLat(point).addTo(map);
        placed.push({ marker, ship, angle: ANGLES[index]! });
      });
      const rest = travellers.length - shown.length;
      if (rest > 0) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "bw-aboard-avatar bw-aboard-avatar--more";
        more.textContent = `+${rest}`;
        more.setAttribute("aria-label", tr("ui.aboardTravellers.autres", { n: rest, ship: ship.name }));
        more.addEventListener("mousemove", (event) => event.stopPropagation());
        // La fiche du premier passager liste tous les autres.
        more.addEventListener("click", (event) => {
          event.stopPropagation();
          openTravellerProfile(travellers[0]!.handle, departureId);
        });
        const marker = new Marker({ element: more, anchor: "center" }).setLngLat(point).addTo(map);
        placed.push({ marker, ship, angle: ANGLES[shown.length]! });
      }
    }
    const place = () => {
      const zoom = map.getZoom();
      const hidden = zoom < ABOARD_MIN_ZOOM;
      for (const { marker, ship, angle } of placed) {
        const { center, radius } = haloGeometry(ship, zoom);
        marker.setOffset(aroundOffset(center, radius, angle));
        marker.getElement().classList.toggle("is-hidden", hidden);
      }
    };
    place();
    map.on("zoom", place);
    return () => {
      map.off("zoom", place);
      placed.forEach(({ marker }) => marker.remove());
    };
  }, [mapRef, ready, near, key, avatars, fleet]);
}
