import type { Vessel } from "./types";
import { tr } from "@/lib/i18n/translate";
import { intlLocale } from "@/lib/i18n";

/** Nombre d'avis publiés à partir duquel une note a un sens. */
export const MIN_REVIEWS = 5;

export type FactKey =
  | "rated"
  | "doyen"
  | "longest"
  | "imposing"
  | "cars"
  | "passengers"
  | "cabins"
  | "youngest"
  | "regular"
  | "freight"
  | "intimate";

const age = (year: number) => new Date().getFullYear() - year;
const record = () => tr("ui.libFerryVesselFacts.recordDeLaFlotte");
const placed = (rank: number) => tr("ui.libFerryVesselFacts.deLaFlotte", { rank });

type Stats = { upcoming: number; rating: number | null };

/** Dans l'ordre où un titre est mis en avant sur la photo. Les comparaisons se font sur `value`. */
const FACTS: {
  key: FactKey;
  podium: string;
  title: string;
  ranked: (rank: number) => string;
  order: "desc" | "asc";
  value: (vessel: Vessel, stats: Stats) => number | null | undefined;
  show: (value: number) => string;
}[] = [
  {
    key: "rated",
    get podium() { return tr("ui.libFerryVesselFacts.lesMieuxNotes"); },
    get title() { return tr("ui.libFerryVesselFacts.leMieuxNote"); },
    ranked: (r) => tr("ui.libFerryVesselFacts.mieuxNote", { r }),
    order: "desc",
    value: (_, s) => s.rating,
    show: (n) => `${n.toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} / 5`,
  },
  {
    key: "doyen",
    get podium() { return tr("ui.libFerryVesselFacts.lesDoyens"); },
    get title() { return tr("ui.libFerryVesselFacts.leDoyenDeLaFlotte"); },
    ranked: (r) => tr("ui.libFerryVesselFacts.plusAncien", { r }),
    order: "asc",
    value: (v) => v.build_year,
    show: (n) => tr("ui.libFerryVesselFacts.ans", { v: age(n) }),
  },
  {
    key: "longest",
    get podium() { return tr("ui.libFerryVesselFacts.lesPlusLongs"); },
    get title() { return tr("ui.libFerryVesselFacts.lePlusLong"); },
    ranked: (r) => tr("ui.libFerryVesselFacts.plusLong", { r }),
    order: "desc",
    value: (v) => v.length_meters,
    show: (n) => `${n.toLocaleString(intlLocale())} m`,
  },
  {
    key: "imposing",
    get podium() { return tr("ui.libFerryVesselFacts.lesPlusImposants"); },
    get title() { return tr("ui.libFerryVesselFacts.lePlusImposant"); },
    ranked: (r) => tr("ui.libFerryVesselFacts.plusImposant", { r }),
    order: "desc",
    value: (v) => v.gross_tonnage,
    show: (n) => `${n.toLocaleString(intlLocale())} t`,
  },
  {
    key: "cars",
    get podium() { return tr("ui.libFerryVesselFacts.lePlusDeVehicules"); },
    get title() { return record(); },
    ranked: placed,
    order: "desc",
    value: (v) => v.car_capacity,
    show: (n) => tr("ui.libFerryVesselFacts.vehicules", { v: n.toLocaleString(intlLocale()) }),
  },
  {
    key: "passengers",
    get podium() { return tr("ui.libFerryVesselFacts.lePlusDePassagers"); },
    get title() { return record(); },
    ranked: placed,
    order: "desc",
    value: (v) => v.passenger_capacity,
    show: (n) => tr("ui.libFerryVesselFacts.passagersN", { v: n.toLocaleString(intlLocale()) }),
  },
  {
    key: "cabins",
    get podium() { return tr("ui.libFerryVesselFacts.lePlusDeCabines"); },
    get title() { return record(); },
    ranked: placed,
    order: "desc",
    value: (v) => v.cabin_capacity,
    show: (n) => tr("ui.libFerryVesselFacts.cabinesN", { v: n.toLocaleString(intlLocale()) }),
  },
  {
    key: "youngest",
    get podium() { return tr("ui.libFerryVesselFacts.lesPlusRecents"); },
    get title() { return tr("ui.libFerryVesselFacts.lePlusRecent"); },
    ranked: (r) => tr("ui.libFerryVesselFacts.plusRecent", { r }),
    order: "desc",
    value: (v) => v.build_year,
    show: (n) => tr("ui.libFerryVesselFacts.ans", { v: age(n) }),
  },
  {
    key: "regular",
    get podium() { return tr("ui.libFerryVesselFacts.lePlusDeTraverseesA"); },
    get title() { return record(); },
    ranked: placed,
    order: "desc",
    value: (_, s) => s.upcoming,
    show: (n) => tr("ui.libFerryVesselFacts.traverseesAVenir", { n }),
  },
  {
    key: "freight",
    get podium() { return tr("ui.libFerryVesselFacts.lePlusDeFret"); },
    get title() { return record(); },
    ranked: placed,
    order: "desc",
    value: (v) => v.freight_lane_meters,
    show: (n) => tr("ui.libFerryVesselFacts.mDeFret", { v: n.toLocaleString(intlLocale()) }),
  },
  {
    key: "intimate",
    get podium() { return tr("ui.libFerryVesselFacts.lesPlusIntimistes"); },
    get title() { return tr("ui.libFerryVesselFacts.lePlusIntimiste"); },
    ranked: (r) => tr("ui.libFerryVesselFacts.plusIntimiste", { r }),
    order: "asc",
    value: (v) => v.passenger_capacity,
    show: (n) => tr("ui.libFerryVesselFacts.passagersN", { v: n.toLocaleString(intlLocale()) }),
  },
];

/** La flotte en chiffres : les navires actifs qui ont au moins un départ à venir. */
export function fleetOverview(
  vessels: Vessel[],
  upcomingByVessel: Map<string, number>,
  year = new Date().getFullYear(),
) {
  const fleet = vessels.filter(
    (vessel) => vessel.status === "active" && (upcomingByVessel.get(vessel.id) ?? 0) > 0,
  );
  const years = fleet.flatMap((vessel) => (vessel.build_year ? [vessel.build_year] : []));
  const sum = (pick: (vessel: Vessel) => number | null | undefined) =>
    fleet.reduce((total, vessel) => total + (pick(vessel) ?? 0), 0);
  return {
    fleet,
    vessels: fleet.length,
    companies: new Set(fleet.map((vessel) => vessel.company_id).filter(Boolean)).size,
    averageAge: years.length
      ? Math.round(years.reduce((total, built) => total + (year - built), 0) / years.length)
      : null,
    passengers: sum((vessel) => vessel.passenger_capacity),
    cars: sum((vessel) => vessel.car_capacity),
    crossings: fleet.reduce((total, vessel) => total + (upcomingByVessel.get(vessel.id) ?? 0), 0),
  };
}

export type VesselFact = { key: FactKey; rank: number; label: string; value: string };
export type Podium = {
  key: FactKey;
  title: string;
  places: { vesselId: string; name: string; rank: number; value: string }[];
};
export type VesselFacts = {
  podiums: Podium[];
  /** Pour un navire en service : ses faits, du plus marquant au moins marquant. */
  byVessel: Map<string, VesselFact[]>;
};

/**
 * Palmarès de la flotte en service : seuls comptent les navires actifs qui ont un départ à venir.
 * Deux valeurs égales partagent le même rang. Une note exige au moins MIN_REVIEWS avis.
 */
export function computeVesselFacts(
  vessels: Vessel[],
  upcomingByVessel: Map<string, number>,
  reviews: Map<string, { count: number; average: number | null }> = new Map(),
): VesselFacts {
  const fleet = vessels.filter(
    (vessel) => vessel.status === "active" && (upcomingByVessel.get(vessel.id) ?? 0) > 0,
  );
  const statsOf = (vessel: Vessel): Stats => {
    const review = reviews.get(vessel.id);
    return {
      upcoming: upcomingByVessel.get(vessel.id) ?? 0,
      rating: review && review.count >= MIN_REVIEWS ? review.average : null,
    };
  };
  const byVessel = new Map<string, VesselFact[]>(fleet.map((vessel) => [vessel.id, []]));
  const podiums: Podium[] = [];
  for (const fact of FACTS) {
    const known = fleet.flatMap((vessel) => {
      const value = fact.value(vessel, statsOf(vessel));
      return value === null || value === undefined ? [] : [{ vessel, value }];
    });
    const sign = fact.order === "desc" ? -1 : 1;
    const sorted = [...known].sort((a, b) => sign * (a.value - b.value));
    const ranked = sorted.map(({ vessel, value }) => ({
      vessel,
      value,
      rank: 1 + sorted.filter((other) => sign * (other.value - value) < 0).length,
    }));
    for (const { vessel, value, rank } of ranked)
      byVessel.get(vessel.id)!.push({
        key: fact.key,
        rank,
        label: rank === 1 ? fact.title : fact.ranked(rank),
        value: fact.show(value),
      });
    if (ranked.length)
      podiums.push({
        key: fact.key,
        title: fact.podium,
        places: ranked
          .filter((place) => place.rank <= 3)
          .map(({ vessel, value, rank }) => ({
            vesselId: vessel.id,
            name: vessel.name,
            rank,
            value: fact.show(value),
          })),
      });
  }
  // Le meilleur rang d'abord ; à rang égal, l'ordre de FACTS, déjà préservé par le tri stable.
  for (const facts of byVessel.values()) facts.sort((a, b) => a.rank - b.rank);
  return { podiums, byVessel };
}
