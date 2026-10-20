// Combinaisons aller-retour : le retour peut partir d'un autre port du même pays
// (Valence → Alger | Oran → Alicante) tant que la chronologie reste réaliste.
import { diffDays } from "./schoolCalendar";
import type { Sailing } from "./trips";

export interface RoundTrip {
  out: Sailing;
  back: Sailing;
  /** Nombre de nuits sur place (jour d'arrivée → jour de retour). */
  stayDays: number;
  /** Même port à l'aller et au retour, dans les deux sens. */
  mirror: boolean;
}

export interface RoundTripQuery {
  fromIds: string[];
  toIds: string[];
  companyId: string | null;
  vesselId: string | null;
  date: string | null;
  returnDate: string | null;
  flexDays: number;
}

/** Temps minimum à terre entre l'arrivée de l'aller et le départ du retour. */
const MIN_STAY_MS = 24 * 3600 * 1000;

const arrivalMs = (sailing: Sailing) =>
  sailing.departure.arrival_at
    ? Date.parse(sailing.departure.arrival_at)
    : Date.parse(sailing.departure.departure_at) + (sailing.durationMin ?? 0) * 60000;

/** Débarquement estimé après l'arrivée (formalités, sortie véhicule). */
export const DISEMBARK_MIN = 90;
/** Présentation au port estimée avant le départ du retour. */
export const BOARDING_MIN = 180;

/** Temps réellement disponible à terre, en minutes (estimation, jamais négatif). */
export function estimateStayMinutes(trip: Pick<RoundTrip, "out" | "back">) {
  const free = Date.parse(trip.back.departure.departure_at) - BOARDING_MIN * 60000;
  const landed = arrivalMs(trip.out) + DISEMBARK_MIN * 60000;
  return Math.max(0, Math.round((free - landed) / 60000));
}

/** « 20 h », « 1 j 4 h », « 6 j ». */
export function formatStay(minutes: number) {
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest >= 2 && days < 4 ? `${days} j ${rest} h` : `${days} j`;
}

const matches = (ids: string[], id: string) => ids.length === 0 || ids.includes(id);

function withinDate(day: string, target: string | null, flex: number) {
  return !target || Math.abs(diffDays(target, day)) <= flex;
}

/**
 * Construit les couples aller-retour.
 * - `main` : aller et retour respectent les ports choisis (dans les deux sens).
 * - `alternatives` : mêmes pays, autres ports d'arrivée / de retour.
 */
export function buildRoundTrips(
  all: Sailing[],
  query: RoundTripQuery,
  limits = { main: 6, alternatives: 8 },
): { main: RoundTrip[]; alternatives: RoundTrip[] } {
  const brandOk = (sailing: Sailing) =>
    (!query.companyId || sailing.departure.company_id === query.companyId) &&
    (!query.vesselId || sailing.departure.vessel_id === query.vesselId);

  const hasPorts = query.fromIds.length > 0 || query.toIds.length > 0;
  const fromCountries = new Set(
    all.filter((s) => query.fromIds.includes(s.from.id)).map((s) => s.from.country_code),
  );
  const toCountries = new Set(
    all.filter((s) => query.toIds.includes(s.to.id)).map((s) => s.to.country_code),
  );

  // Allers possibles : ports choisis, ou à défaut même pays (pour les alternatives).
  const outs = all.filter(
    (s) =>
      brandOk(s) &&
      withinDate(s.dayKey, query.date, query.flexDays) &&
      (fromCountries.size === 0 || fromCountries.has(s.from.country_code)) &&
      (toCountries.size === 0 || toCountries.has(s.to.country_code)),
  );

  const best = new Map<string, RoundTrip & { score: number; exact: boolean }>();

  outs.forEach((out) => {
    const earliest = arrivalMs(out) + MIN_STAY_MS;
    all.forEach((back) => {
      if (!brandOk(back)) return;
      if (back.from.country_code !== out.to.country_code) return;
      if (back.to.country_code !== out.from.country_code) return;
      if (Date.parse(back.departure.departure_at) < earliest) return;
      if (!withinDate(back.dayKey, query.returnDate, query.flexDays)) return;

      const exact =
        matches(query.fromIds, out.from.id) &&
        matches(query.toIds, out.to.id) &&
        matches(query.toIds, back.from.id) &&
        matches(query.fromIds, back.to.id);
      const mirror = back.from.id === out.to.id && back.to.id === out.from.id;
      const stayDays = Math.max(0, diffDays(out.dayKey, back.dayKey));
      // Sans date de retour : on privilégie le premier retour possible.
      const score =
        (query.returnDate ? Math.abs(diffDays(query.returnDate, back.dayKey)) * 10 : stayDays) +
        (query.date ? Math.abs(diffDays(query.date, out.dayKey)) * 10 : 0) +
        (mirror ? 0 : 3);
      // Un seul couple par combinaison de ports (le mieux daté).
      const key = `${out.from.id}>${out.to.id}|${back.from.id}>${back.to.id}`;
      const current = best.get(key);
      if (!current || score < current.score)
        best.set(key, { out, back, stayDays, mirror, score, exact: hasPorts ? exact : true });
    });
  });

  const sorted = [...best.values()].sort(
    (a, b) =>
      Number(b.mirror) - Number(a.mirror) ||
      a.score - b.score ||
      a.out.departure.departure_at.localeCompare(b.out.departure.departure_at),
  );
  const strip = ({ out, back, stayDays, mirror }: RoundTrip) => ({ out, back, stayDays, mirror });
  if (!hasPorts) {
    return {
      main: sorted.filter((t) => t.mirror).slice(0, limits.main).map(strip),
      alternatives: sorted.filter((t) => !t.mirror).slice(0, limits.alternatives).map(strip),
    };
  }
  return {
    main: sorted.filter((t) => t.exact).slice(0, limits.main).map(strip),
    alternatives: sorted.filter((t) => !t.exact).slice(0, limits.alternatives).map(strip),
  };
}
