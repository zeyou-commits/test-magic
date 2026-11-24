import type { Company, Departure, RouteLine as Route } from "@/lib/ferry/types";
import { intlLocale } from "@/lib/i18n";

/**
 * Un départ « estimé » vient d'un calendrier récurrent (rotation habituelle du navire) et n'a pas
 * été confirmé : c'est le calendrier théorique. Tout le reste a été publié par la compagnie
 * (calendrier commercial).
 */
export function isEstimatedDeparture(departure: Pick<Departure, "schedule_id" | "reliability">) {
  return Boolean(departure.schedule_id) && departure.reliability !== "verified";
}

export interface CompanyCalendar {
  companyId: string;
  name: string;
  /** Dernier jour mis en vente (AAAA-MM-JJ), ou null si la compagnie n'a rien publié ici. */
  commercialUntil: string | null;
  /** Dernier jour du calendrier théorique, s'il va plus loin. */
  estimatedUntil: string | null;
  /** Les dates cherchées sont-elles toutes dans le calendrier commercial ? */
  coversDates: boolean;
}

/**
 * Calendriers des compagnies qui desservent les ports cherchés (dans un sens ou l'autre pour un
 * aller-retour) : jusqu'où chacune a mis en vente, et si les dates demandées y sont.
 */
export function companyCalendars(input: {
  departures: Departure[];
  routes: Route[];
  companies: Company[];
  fromIds: string[];
  toIds: string[];
  roundTrip: boolean;
  /** Dates cherchées ; la plus tardive compte. */
  dates: (string | null | undefined)[];
}): CompanyCalendar[] {
  const from = new Set(input.fromIds);
  const to = new Set(input.toIds);
  const byRoute = new Map(input.routes.map((route) => [route.id, route]));
  const last = (input.dates.filter(Boolean) as string[]).sort().at(-1) ?? null;
  const per = new Map<string, { commercial: string; estimated: string }>();
  for (const departure of input.departures) {
    if (departure.status === "cancelled" || departure.is_demo) continue;
    const route = byRoute.get(departure.route_id);
    if (!route) continue;
    const out =
      (!from.size || from.has(route.departure_port_id)) && (!to.size || to.has(route.arrival_port_id));
    const back =
      input.roundTrip &&
      (!to.size || to.has(route.departure_port_id)) &&
      (!from.size || from.has(route.arrival_port_id));
    if (!out && !back) continue;
    const day = departure.departure_at.slice(0, 10);
    const entry = per.get(departure.company_id) ?? { commercial: "", estimated: "" };
    if (isEstimatedDeparture(departure)) {
      if (day > entry.estimated) entry.estimated = day;
    } else if (day > entry.commercial) entry.commercial = day;
    per.set(departure.company_id, entry);
  }
  return [...per.entries()]
    .map(([companyId, entry]) => ({
      companyId,
      name: input.companies.find((company) => company.id === companyId)?.name ?? "Compagnie",
      commercialUntil: entry.commercial || null,
      estimatedUntil: entry.estimated && entry.estimated > entry.commercial ? entry.estimated : null,
      coversDates: Boolean(last && entry.commercial && last <= entry.commercial),
    }))
    .sort((a, b) => (a.commercialUntil ?? "").localeCompare(b.commercialUntil ?? "") || a.name.localeCompare(b.name));
}

export function longDay(key: string) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(intlLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
