import { endOf, parisKey, TURNAROUND_MINUTES, type PlanningDeparture, type PlanningIssue } from "./planning";

const MINUTE = 60_000;
/** Une heure ne remplace une autre que si elle est au moins deux fois plus fréquente. */
const MIN_USUAL_COUNT = 3;

export type FixProposal =
  | {
      kind: "shift";
      departure: PlanningDeparture;
      /** Nouvelle heure de départ, à Paris, et écart à appliquer. */
      toTime: string;
      deltaMinutes: number;
      evidence: string;
    }
  | { kind: "remove-vessel"; departure: PlanningDeparture; keptSource: string; evidence: string };

export const isOverlap = (issue: PlanningIssue) =>
  Date.parse(issue.second.departure_at) < endOf(issue.first);

/** Un programme nommé pèse plus qu'un import de fichier, dont l'origine n'est pas connue. */
const isImport = (source?: string | null) => !source || /import|excel|\.xlsx?|\.csv/i.test(source);

function usualTime(target: PlanningDeparture, departures: PlanningDeparture[]) {
  const key = parisKey(target.departure_at);
  const counts = new Map<string, number>();
  for (const d of departures) {
    if (d.route_id !== target.route_id || d.company_id !== target.company_id) continue;
    if (d.status === "cancelled") continue;
    const other = parisKey(d.departure_at);
    if (other.weekday === key.weekday) counts.set(other.time, (counts.get(other.time) ?? 0) + 1);
  }
  const own = counts.get(key.time) ?? 0;
  const [time, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!time || !count || time === key.time || count < MIN_USUAL_COUNT || count < own * 2) return null;
  const [h, m] = time.split(":").map(Number) as [number, number];
  const [oh, om] = key.time.split(":").map(Number) as [number, number];
  return { time, count, own, deltaMinutes: h * 60 + m - (oh * 60 + om) };
}

/**
 * Propose une correction pour un conflit de navire, ou null si rien ne permet de trancher.
 * Les preuves viennent des données de BledWay : une proposition n'affirme jamais qu'une compagnie
 * a publié cet horaire, et l'équipe la valide.
 */
export function proposeFix(
  issue: PlanningIssue,
  departures: PlanningDeparture[],
): FixProposal | null {
  const { first, second } = issue;
  if (isImport(first.source_name) !== isImport(second.source_name) && isOverlap(issue)) {
    const [suspect, kept] = isImport(first.source_name) ? [first, second] : [second, first];
    return {
      kind: "remove-vessel",
      departure: suspect,
      keptSource: kept.source_name ?? "",
      evidence: `« ${kept.source_name} » prévoit ce navire ailleurs, alors que ce départ vient d'un fichier importé.`,
    };
  }
  const margin = TURNAROUND_MINUTES * MINUTE;
  const fixesFirst = (delta: number) =>
    endOf(first) + delta * MINUTE + margin <= Date.parse(second.departure_at);
  const fixesSecond = (delta: number) =>
    Date.parse(second.departure_at) + delta * MINUTE >= endOf(first) + margin;
  for (const [target, solves] of [
    [first, fixesFirst],
    [second, fixesSecond],
  ] as const) {
    const usual = usualTime(target, departures);
    if (usual && solves(usual.deltaMinutes))
      return {
        kind: "shift",
        departure: target,
        toTime: usual.time,
        deltaMinutes: usual.deltaMinutes,
        evidence: `${usual.count} départs de cette compagnie sur cette ligne, le même jour de semaine, sont à ${usual.time} (heure de Paris), contre ${usual.own} à l'heure actuelle.`,
      };
  }
  return null;
}

/** Les champs à écrire pour appliquer une proposition, et ceux qui permettent de l'annuler. */
export function fixChanges(fix: FixProposal) {
  const { departure: d } = fix;
  if (fix.kind === "remove-vessel")
    return { id: d.id, apply: { vessel_id: null }, undo: { vessel_id: d.vessel_id } };
  const move = (iso: string | null) =>
    iso ? new Date(Date.parse(iso) + fix.deltaMinutes * MINUTE).toISOString() : null;
  return {
    id: d.id,
    apply: { departure_at: move(d.departure_at), arrival_at: move(d.arrival_at) },
    undo: { departure_at: d.departure_at, arrival_at: d.arrival_at },
  };
}
