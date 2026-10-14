// Détection des incohérences de calendrier par navire (aucune modification automatique).
export interface ConflictLeg {
  id: string;
  vesselId: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  start: number;
  end: number;
}

export interface PlanningConflict {
  kind: "overlap" | "continuity" | "ais";
  severity: "high" | "medium";
  vesselId: string;
  departureIds: string[];
  message: string;
}

/** Temps minimal à quai entre deux traversées d'un même navire. */
const MIN_TURNAROUND = 60 * 60_000;

/** Traversées en conflit : deux départs physiquement incompatibles pour le même navire. */
export function detectVesselConflicts(legs: ConflictLeg[]): PlanningConflict[] {
  const byVessel = new Map<string, ConflictLeg[]>();
  legs.forEach((leg) => {
    const list = byVessel.get(leg.vesselId) ?? [];
    list.push(leg);
    byVessel.set(leg.vesselId, list);
  });
  const out: PlanningConflict[] = [];
  byVessel.forEach((list, vesselId) => {
    list.sort((a, b) => a.start - b.start);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (b.start < a.end + (a.toId === b.fromId ? 0 : MIN_TURNAROUND) && b.start < a.end) {
        out.push({
          kind: "overlap",
          severity: "high",
          vesselId,
          departureIds: [a.id, b.id],
          message: `Chevauchement : ${a.fromName} → ${a.toName} n'est pas terminé quand ${b.fromName} → ${b.toName} doit partir.`,
        });
      } else if (a.toId !== b.fromId) {
        out.push({
          kind: "continuity",
          severity: "medium",
          vesselId,
          departureIds: [a.id, b.id],
          message: `Escale incohérente : arrive à ${a.toName} puis repart de ${b.fromName} sans traversée entre les deux.`,
        });
      }
    }
  });
  return out;
}

/** Ids de départs impliqués dans un chevauchement (non fiables pour placer un navire en mer). */
export function overlappingDepartureIds(legs: ConflictLeg[]): Set<string> {
  const ids = new Set<string>();
  detectVesselConflicts(legs)
    .filter((c) => c.kind === "overlap")
    .forEach((c) => c.departureIds.forEach((id) => ids.add(id)));
  return ids;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "");

/** La destination AIS déclarée correspond-elle au port ? (tolérant aux abréviations) */
export function aisDestinationMatches(destination: string, portName: string, city?: string | null) {
  const d = norm(destination);
  if (!d) return true;
  return [portName, city ?? ""].map(norm).filter((n) => n.length >= 3).some((n) => d.includes(n.slice(0, 4)));
}
