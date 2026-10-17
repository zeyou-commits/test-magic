// Liens « Réserver » : lien profond pré-rempli quand la compagnie le permet,
// sinon site officiel. Un futur partenaire (aferry, Direct Ferries) se branche ici.
import type { Sailing } from "./trips";
import type { TripProfileValue, VehicleKind } from "@/components/panel/TripProfile";
import { safeExternalUrl } from "@/components/panel/shared";

const CORSICA_VEHICLE: Record<VehicleKind, string | null> = {
  none: null,
  city: "CAR",
  sedan: "CAR",
  suv: "CAR",
  van: "VAN",
  utility: "VAN",
};

function corsicaRoute(sailing: Sailing): string {
  const codes = [sailing.from.country_code, sailing.to.country_code].map((c) => c?.toUpperCase());
  if (codes.includes("DZ")) return "CONTINENT_ALGERIE";
  if (codes.includes("TN")) return "CONTINENT_TUNISIE";
  return "CONTINENT_CORSE";
}

function passengerList(profile: TripProfileValue): string {
  const p = profile.passengers;
  const list = [
    ...Array(p.adults).fill("ADULT"),
    ...Array(p.seniors).fill("SENIOR"),
    ...Array(p.children).fill("CHILD"),
    ...Array(p.babies).fill("BABY"),
  ];
  return (list.length ? list : ["ADULT"]).join(",");
}

/** Agrégateur utilisé quand aucun lien direct n'existe (ou aller/retour sur deux compagnies). */
export const AGGREGATOR = { name: "Direct Ferries", url: "https://www.directferries.fr/" };

/** URL de réservation pour un aller simple ou un aller-retour : jamais nulle. */
export function bookingUrl(
  out: Sailing,
  profile: TripProfileValue,
  back?: Sailing,
): string {
  const company = out.company;
  const mixed = Boolean(back && back.company?.id !== company?.id);
  if (!company || mixed) return AGGREGATOR.url;

  if (company.slug === "corsica-linea") {
    const params = new URLSearchParams({ route: corsicaRoute(out), outwardDate: out.dayKey });
    if (back) params.set("returnDate", back.dayKey);
    const vehicle = CORSICA_VEHICLE[profile.vehicle];
    if (vehicle) params.set("vehicles", vehicle);
    params.set("passengers", passengerList(profile));
    return `https://www.corsicalinea.com/tsw/search/departure/crossing?${params.toString().replace(/%2C/g, ",")}`;
  }
  return safeExternalUrl(company.website_url) ?? AGGREGATOR.url;
}

/** Nom du site ouvert par le bouton « Réserver ». */
export function bookingSite(out: Sailing, back?: Sailing): string {
  const company = out.company;
  if (!company || (back && back.company?.id !== company.id)) return AGGREGATOR.name;
  if (company.slug === "corsica-linea" || safeExternalUrl(company.website_url)) return company.name;
  return AGGREGATOR.name;
}
