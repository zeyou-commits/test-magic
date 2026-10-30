import type { Vessel } from "./types";

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
    podium: "Les mieux notés",
    title: "Le mieux noté",
    ranked: (r) => `${r}ᵉ mieux noté`,
    order: "desc",
    value: (_, s) => s.rating,
    show: (n) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / 5`,
  },
  {
    key: "doyen",
    podium: "Les doyens",
    title: "Le doyen de la flotte",
    ranked: (r) => `${r}ᵉ doyen de la flotte`,
    order: "asc",
    value: (v) => v.build_year,
    show: String,
  },
  {
    key: "longest",
    podium: "Les plus longs",
    title: "Le plus long",
    ranked: (r) => `${r}ᵉ plus long`,
    order: "desc",
    value: (v) => v.length_meters,
    show: (n) => `${n.toLocaleString("fr-FR")} m`,
  },
  {
    key: "imposing",
    podium: "Les plus imposants",
    title: "Le plus imposant",
    ranked: (r) => `${r}ᵉ plus imposant`,
    order: "desc",
    value: (v) => v.gross_tonnage,
    show: (n) => `${n.toLocaleString("fr-FR")} t de jauge`,
  },
  {
    key: "cars",
    podium: "Le plus de véhicules",
    title: "Le plus de véhicules",
    ranked: (r) => `${r}ᵉ pour les véhicules`,
    order: "desc",
    value: (v) => v.car_capacity,
    show: (n) => `${n.toLocaleString("fr-FR")} véhicules`,
  },
  {
    key: "passengers",
    podium: "Le plus de passagers",
    title: "Le plus de passagers",
    ranked: (r) => `${r}ᵉ pour les passagers`,
    order: "desc",
    value: (v) => v.passenger_capacity,
    show: (n) => `${n.toLocaleString("fr-FR")} passagers`,
  },
  {
    key: "cabins",
    podium: "Le plus de cabines",
    title: "Le plus de cabines",
    ranked: (r) => `${r}ᵉ pour les cabines`,
    order: "desc",
    value: (v) => v.cabin_capacity,
    show: (n) => `${n.toLocaleString("fr-FR")} cabines`,
  },
  {
    key: "youngest",
    podium: "Les benjamins",
    title: "Le benjamin de la flotte",
    ranked: (r) => `${r}ᵉ benjamin de la flotte`,
    order: "desc",
    value: (v) => v.build_year,
    show: String,
  },
  {
    key: "regular",
    podium: "Les plus assidus",
    title: "Le plus assidu",
    ranked: (r) => `${r}ᵉ plus assidu`,
    order: "desc",
    value: (_, s) => s.upcoming,
    show: (n) => `${n} départs à venir`,
  },
  {
    key: "freight",
    podium: "Le plus de fret",
    title: "Le plus de fret",
    ranked: (r) => `${r}ᵉ pour le fret`,
    order: "desc",
    value: (v) => v.freight_lane_meters,
    show: (n) => `${n.toLocaleString("fr-FR")} m linéaires`,
  },
  {
    key: "intimate",
    podium: "Les plus intimistes",
    title: "Le plus intimiste",
    ranked: (r) => `${r}ᵉ plus intimiste`,
    order: "asc",
    value: (v) => v.passenger_capacity,
    show: (n) => `${n.toLocaleString("fr-FR")} passagers`,
  },
];

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
