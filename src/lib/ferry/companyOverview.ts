import type { Company, Departure, RouteLine, Vessel } from "./types";

/** Fenêtre de calcul des rotations : les 8 prochaines semaines. */
export const ROTATION_WEEKS = 8;
const WEEK_MS = 7 * 24 * 3600_000;

export type CompanyLine = {
  route: RouteLine;
  /** Départs par semaine en moyenne sur la fenêtre (0 si aucun programme publié). */
  perWeek: number;
  next: string | null;
};

export type CompanyOverview = {
  fleet: Vessel[];
  averageAge: number | null;
  oldest: Vessel | null;
  youngest: Vessel | null;
  flagship: Vessel | null;
  passengersMax: number | null;
  carsTotal: number;
  lines: CompanyLine[];
  perWeek: number;
  upcoming: number;
  next: Departure | null;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * La compagnie en chiffres : flotte en service, âge moyen, lignes et rotations hebdomadaires
 * calculées sur les programmes publiés (rien n'est inventé : sans programme, 0 rotation).
 */
export function companyOverview(
  company: Pick<Company, "id">,
  vessels: Vessel[],
  routes: RouteLine[],
  departures: Departure[],
  now = Date.now(),
  year = new Date(now).getFullYear(),
): CompanyOverview {
  const fleet = vessels.filter((v) => v.company_id === company.id && v.status === "active");
  const built = fleet.filter((v) => v.build_year);
  const byYear = [...built].sort((a, b) => (a.build_year ?? 0) - (b.build_year ?? 0));
  const flagship =
    [...fleet].sort((a, b) => (b.passenger_capacity ?? 0) - (a.passenger_capacity ?? 0))[0] ?? null;
  const horizon = now + ROTATION_WEEKS * WEEK_MS;
  const mine = departures
    .filter((d) => d.company_id === company.id && d.status !== "cancelled")
    .filter((d) => Date.parse(d.departure_at) >= now)
    .sort((a, b) => a.departure_at.localeCompare(b.departure_at));
  const inWindow = mine.filter((d) => Date.parse(d.departure_at) < horizon);
  const scheduled = new Set(mine.map((d) => d.route_id));
  const lines = routes
    .filter((r) => r.company_ids.includes(company.id) || scheduled.has(r.id))
    .map((route) => ({
      route,
      perWeek: round1(inWindow.filter((d) => d.route_id === route.id).length / ROTATION_WEEKS),
      next: mine.find((d) => d.route_id === route.id)?.departure_at ?? null,
    }))
    .sort((a, b) => b.perWeek - a.perWeek);
  return {
    fleet,
    averageAge: built.length
      ? Math.round(
          built.reduce((total, v) => total + (year - (v.build_year ?? year)), 0) / built.length,
        )
      : null,
    oldest: byYear[0] ?? null,
    youngest: byYear[byYear.length - 1] ?? null,
    flagship,
    passengersMax: flagship?.passenger_capacity ?? null,
    carsTotal: fleet.reduce((total, v) => total + (v.car_capacity ?? 0), 0),
    lines,
    perWeek: round1(inWindow.length / ROTATION_WEEKS),
    upcoming: mine.length,
    next: mine[0] ?? null,
  };
}
