import data from "../../../public/data/routes-du-bled.json";
import type { BledRoute, RoutesData, StopKind } from "./data";

/**
 * Pages publiques des routes du bled : une adresse par route, seulement quand le relevé est assez
 * riche pour être utile (une page presque vide ferait du tort à la route comme au site). Les autres
 * restent sur la carte de /routes-du-bled et gagneront leur page dès que leurs haltes seront relevées.
 */
export const MIN_STOPS_FOR_PAGE = 10;

const SLUGS: Record<string, string> = {
  E1: "paris-lyon-marseille",
  E2: "lyon-le-perthus-barcelone",
  E3: "barcelone-valence-alicante",
  E4: "alicante-murcie-almeria",
  E5: "paris-bordeaux-irun-madrid",
  E6: "madrid-albacete-alicante",
  E7: "madrid-grenade-almeria",
  E8: "montpellier-sete",
  A1: "ghazaouet-maghnia-tlemcen",
  A2: "oran-sidi-bel-abbes-tlemcen",
  A3: "oran-chlef-alger",
  A4: "mostaganem-relizane-mascara",
  A5: "alger-tizi-ouzou",
  A6: "alger-bouira-setif-constantine",
  A7: "bejaia-kherrata-setif",
  A8: "skikda-constantine",
  A9: "annaba-guelma-constantine",
};

export const routesData = data as unknown as RoutesData;

export type BledRoutePage = { slug: string; route: BledRoute };

export const bledRoutePages: BledRoutePage[] = routesData.routes
  .filter((route) => SLUGS[route.id] && route.stops.length >= MIN_STOPS_FOR_PAGE)
  .map((route) => ({ slug: SLUGS[route.id]!, route }));

export const bledRoutePage = (slug: string) => bledRoutePages.find((page) => page.slug === slug);

/** Nom de lieu sans le « Port de » d'un point d'arrivée. */
export const placeOf = (via: string) => via.replace(/^Port (de |d'|du )/i, "");

/** Port d'embarquement en bout de route (côté Europe), s'il y en a un. */
export const endPort = (route: BledRoute) => {
  const last = route.via.at(-1) ?? "";
  return /^Port /i.test(last) ? placeOf(last) : null;
};

export function stopCounts(route: BledRoute) {
  const counts = { carburant: 0, aire: 0, manger: 0, priere: 0, dormir: 0 } as Record<StopKind, number>;
  for (const stop of route.stops) counts[stop.k] = (counts[stop.k] ?? 0) + 1;
  return {
    carburant: counts.carburant ?? 0,
    aire: counts.aire ?? 0,
    manger: counts.manger ?? 0,
    priere: counts.priere ?? 0,
    dormir: counts.dormir ?? 0,
    halal: route.stops.filter((s) => s.f.includes("halal")).length,
    h24: route.stops.filter((s) => s.f.includes("h24")).length,
  };
}
