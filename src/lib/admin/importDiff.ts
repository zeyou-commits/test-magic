/**
 * Comparaison d'un fichier de saison avec ce qui est déjà publié, sur le même périmètre
 * (compagnies du fichier, ou une seule compagnie, entre la première et la dernière date).
 * Fonction pure : l'écran d'import l'utilise avant toute écriture en base.
 */

export type ImportedDeparture = {
  /** Ligne du fichier (pour l'afficher). */
  line: number;
  route_id: string;
  company_id: string;
  vessel_id: string | null;
  departure_at: string;
  arrival_at: string;
  duration_minutes: number;
  status: "scheduled" | "modified" | "cancelled";
};

export type PublishedDeparture = {
  id: string;
  route_id: string;
  company_id: string;
  vessel_id: string | null;
  departure_at: string;
  arrival_at: string | null;
  duration_minutes: number | null;
  status: string;
  source_name?: string | null;
};

export type ChangedField = "time" | "vessel" | "duration" | "status";

export type ImportDiff = {
  added: ImportedDeparture[];
  changed: { before: PublishedDeparture; after: ImportedDeparture; fields: ChangedField[] }[];
  unchanged: { before: PublishedDeparture; after: ImportedDeparture }[];
  /** Publiés sur le périmètre mais absents du fichier. */
  missing: PublishedDeparture[];
  /** Lignes du fichier en double (même liaison, compagnie et heure). */
  repeated: ImportedDeparture[];
};

/** Un horaire publié aussi proche du fichier est considéré comme le même départ, déplacé. */
export const MOVED_WINDOW_MINUTES = 180;

const at = (value: string) => Date.parse(value);

export function diffImport(
  file: ImportedDeparture[],
  published: PublishedDeparture[],
  scope: { companyIds: string[]; from: string; to: string },
): ImportDiff {
  const inScope = published.filter(
    (d) =>
      scope.companyIds.includes(d.company_id) &&
      at(d.departure_at) >= at(scope.from) &&
      at(d.departure_at) <= at(scope.to),
  );
  const used = new Set<string>();
  const diff: ImportDiff = { added: [], changed: [], unchanged: [], missing: [], repeated: [] };
  const seen = new Set<string>();
  const pending: ImportedDeparture[] = [];

  // 1. Même liaison, même compagnie, même heure exacte.
  for (const row of [...file].sort((a, b) => at(a.departure_at) - at(b.departure_at))) {
    const key = `${row.route_id}|${row.company_id}|${at(row.departure_at)}`;
    if (seen.has(key)) {
      diff.repeated.push(row);
      continue;
    }
    seen.add(key);
    const exact = inScope.find(
      (d) =>
        !used.has(d.id) &&
        d.route_id === row.route_id &&
        d.company_id === row.company_id &&
        at(d.departure_at) === at(row.departure_at),
    );
    if (!exact) {
      pending.push(row);
      continue;
    }
    used.add(exact.id);
    const fields = changedFields(exact, row);
    if (fields.length) diff.changed.push({ before: exact, after: row, fields });
    else diff.unchanged.push({ before: exact, after: row });
  }

  // 2. Même liaison et compagnie, le même jour, à moins de 3 h : horaire déplacé.
  for (const row of pending) {
    const near = inScope
      .filter(
        (d) =>
          !used.has(d.id) &&
          d.route_id === row.route_id &&
          d.company_id === row.company_id &&
          Math.abs(at(d.departure_at) - at(row.departure_at)) <= MOVED_WINDOW_MINUTES * 60_000,
      )
      .sort(
        (a, b) =>
          Math.abs(at(a.departure_at) - at(row.departure_at)) -
          Math.abs(at(b.departure_at) - at(row.departure_at)),
      )[0];
    if (!near) {
      diff.added.push(row);
      continue;
    }
    used.add(near.id);
    diff.changed.push({ before: near, after: row, fields: ["time", ...changedFields(near, row)] });
  }

  diff.missing = inScope.filter((d) => !used.has(d.id) && d.status !== "cancelled");
  return diff;
}

function changedFields(before: PublishedDeparture, after: ImportedDeparture): ChangedField[] {
  const fields: ChangedField[] = [];
  // Un fichier sans navire ne retire pas le bateau déjà connu.
  if (after.vessel_id && after.vessel_id !== before.vessel_id) fields.push("vessel");
  if (before.duration_minutes !== null && before.duration_minutes !== after.duration_minutes)
    fields.push("duration");
  if (
    before.status !== after.status &&
    !(before.status === "modified" && after.status === "scheduled")
  )
    fields.push("status");
  return fields;
}
