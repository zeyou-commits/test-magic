// Écoute AIS de la flotte : la raison dit pourquoi un navire compte en ce moment.
// En mer, un navire émet souvent : le moindre passage à portée d'une antenne donne une position réelle.

/** Autour du départ prévu : pour capter l'heure réelle de départ (ou le retard à quai). */
export const DEPARTURE_WINDOW = { before: 45 * 60_000, after: 3 * 3600_000 };
/** Autour de l'arrivée prévue : approche finale et heure réelle d'arrivée. */
export const ARRIVAL_WINDOW = { before: 3 * 3600_000, after: 2 * 3600_000 };

type TargetDeparture = {
  vessel_id: string | null;
  departure_at: string;
  arrival_at: string | null;
  duration_minutes: number | null;
  status: string;
};

/**
 * Toute la flotte active est écoutée, planning ou non : un navire peut naviguer hors calendrier,
 * et écouter 15 navires ne coûte pas plus que 4 sur le même flux.
 */
export function fleetTargets(
  planned: Map<number, AisReason>,
  vessels: { mmsi: number | null; status: string }[],
): Map<number, AisReason> {
  const targets = new Map(planned);
  for (const vessel of vessels) {
    if (!vessel.mmsi || vessel.status !== "active") continue;
    const mmsi = Number(vessel.mmsi);
    if (!targets.has(mmsi)) targets.set(mmsi, "fleet");
  }
  return targets;
}

export type AisReason = "departure" | "sea" | "arrival" | "fleet";

/** MMSI liés au planning en ce moment, avec la raison (départ, mer ou arrivée). */
export function aisTargets(
  departures: TargetDeparture[],
  vessels: { id: string; mmsi: number | null; status: string }[],
  now: number,
  /** Navires vus à l'arrêt : en retard, on continue de les écouter jusqu'à l'arrivée prévue. */
  stopped: Set<number> = new Set(),
): Map<number, AisReason> {
  const mmsiOf = new Map(
    vessels.filter((v) => v.mmsi && v.status === "active").map((v) => [v.id, Number(v.mmsi)]),
  );
  const targets = new Map<number, AisReason>();
  for (const d of departures) {
    if (!d.vessel_id || d.status === "cancelled") continue;
    const mmsi = mmsiOf.get(d.vessel_id);
    if (!mmsi) continue;
    const start = Date.parse(d.departure_at);
    const end = d.arrival_at
      ? Date.parse(d.arrival_at)
      : start + (d.duration_minutes ?? 0) * 60_000;
    if (now >= start - DEPARTURE_WINDOW.before && now <= start + DEPARTURE_WINDOW.after) {
      targets.set(mmsi, "departure");
    } else if (now > start && now < end) {
      if (stopped.has(mmsi)) targets.set(mmsi, "departure");
      else if (!targets.has(mmsi)) targets.set(mmsi, "sea");
    } else if (
      end > start &&
      now >= end - ARRIVAL_WINDOW.before &&
      now <= end + ARRIVAL_WINDOW.after
    ) {
      if (!targets.has(mmsi)) targets.set(mmsi, "arrival");
    }
  }
  return targets;
}
