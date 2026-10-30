import { portTimeZone, zonedTimeToUtc } from "@/lib/ferry/time";
import type { ImportedDeparture } from "./importDiff";

/**
 * Lecture d'un fichier de saison (Excel ou CSV) et conversion de ses lignes en départs.
 * Les heures sont celles des billets : heure locale du port de départ, puis du port d'arrivée.
 */

export const TEMPLATE_COLUMNS = [
  ["date", "Date du départ : AAAA-MM-JJ ou JJ/MM/AAAA"],
  ["heure", "Heure de départ, HH:MM sur 24 h, heure locale du port de départ"],
  ["heure_arrivee", "Heure d'arrivée, heure locale du port d'arrivée (le lendemain est déduit)"],
  ["port_depart", "Port de départ (ex. Alger)"],
  ["port_arrivee", "Port d'arrivée (ex. Marseille)"],
  ["compagnie", "Compagnie (inutile dans un modèle de compagnie)"],
  ["navire", "Facultatif : nom du navire"],
  ["duree_minutes", "Facultatif : durée, utilisée si l'heure d'arrivée manque"],
  ["statut", "Facultatif : prevu, modifie ou annule"],
] as const;

export type RawImportRow = {
  line: number;
  date: string;
  time: string;
  arrivalTime: string;
  from: string;
  to: string;
  company: string;
  vessel: string;
  durationMinutes: number | null;
  status: ImportedDeparture["status"];
};

const plain = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

const STATUS: Record<string, ImportedDeparture["status"]> = {
  "": "scheduled",
  prevu: "scheduled",
  scheduled: "scheduled",
  modifie: "modified",
  modified: "modified",
  annule: "cancelled",
  cancelled: "cancelled",
};

/** AAAA-MM-JJ, JJ/MM/AAAA ou JJ-MM-AAAA → AAAA-MM-JJ (sinon chaîne vide). */
export function parseDay(value: unknown) {
  const text = String(value ?? "").trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (match) return `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}`;
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (match) {
    const year = match[3]!.length === 2 ? `20${match[3]}` : match[3]!;
    return `${year}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  }
  return "";
}

/** « 9h30 », « 09:30 », « 9.30 » → « 09:30 » (sinon chaîne vide). */
export function parseTime(value: unknown) {
  const match = /^(\d{1,2})\s*[:hH.]\s*(\d{2})/.exec(String(value ?? "").trim());
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

/** Lignes d'une feuille (objets clé → valeur) → lignes brutes, colonnes reconnues sans accents. */
export function readRows(entries: Record<string, unknown>[]): RawImportRow[] {
  return entries.map((entry, index) => {
    const get = (key: string) => {
      const column = Object.keys(entry).find((name) => plain(name).replace(/\s+/g, "_") === key);
      return column ? entry[column] : undefined;
    };
    const duration = Number(String(get("duree_minutes") ?? "").replace(",", "."));
    return {
      line: index + 2,
      date: parseDay(get("date")),
      time: parseTime(get("heure")),
      arrivalTime: parseTime(get("heure_arrivee")),
      from: String(get("port_depart") ?? "").trim(),
      to: String(get("port_arrivee") ?? "").trim(),
      company: String(get("compagnie") ?? "").trim(),
      vessel: String(get("navire") ?? "").trim(),
      durationMinutes: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
      status: STATUS[plain(get("statut"))] ?? "scheduled",
    };
  });
}

type PortLike = { id: string; country_code: string };

/** Ligne brute + fiches retrouvées → départ prêt à comparer, ou la raison du refus. */
export function toDeparture(
  row: RawImportRow,
  ids: {
    fromPort?: PortLike | undefined;
    toPort?: PortLike | undefined;
    routeId?: string | undefined;
    companyId?: string | undefined;
    vesselId?: string | null | undefined;
  },
  typicalDuration: number | null,
): { departure: ImportedDeparture } | { error: string } {
  if (!row.date) return { error: "Date illisible" };
  if (!row.time) return { error: "Heure de départ illisible" };
  if (!ids.fromPort || !ids.toPort) return { error: "Port inconnu" };
  if (ids.fromPort.id === ids.toPort.id)
    return { error: "Ports de départ et d'arrivée identiques" };
  if (!ids.companyId) return { error: "Compagnie inconnue" };
  if (!ids.routeId) return { error: "Liaison inexistante" };
  const start = zonedTimeToUtc(row.date, row.time, portTimeZone(ids.fromPort));
  if (Number.isNaN(start.getTime())) return { error: "Date et heure illisibles" };
  let duration: number | null = null;
  if (row.arrivalTime) {
    // L'heure d'arrivée est locale au port d'arrivée : premier jour qui donne une durée positive.
    for (const offset of [0, 1, 2]) {
      const day = new Date(Date.parse(`${row.date}T12:00:00Z`) + offset * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const end = zonedTimeToUtc(day, row.arrivalTime, portTimeZone(ids.toPort));
      const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
      if (minutes > 0) {
        duration = minutes;
        break;
      }
    }
  }
  duration ??= row.durationMinutes ?? typicalDuration;
  if (!duration || duration <= 0 || duration > 72 * 60)
    return { error: "Durée impossible à calculer" };
  return {
    departure: {
      line: row.line,
      route_id: ids.routeId,
      company_id: ids.companyId,
      vessel_id: ids.vesselId ?? null,
      departure_at: start.toISOString(),
      arrival_at: new Date(start.getTime() + duration * 60_000).toISOString(),
      duration_minutes: duration,
      status: row.status,
    },
  };
}
