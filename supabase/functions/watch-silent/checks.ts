// Navires muets : qui chercher maintenant, et ce qu'un indice trouvé sur le web doit prouver pour être déposé.
// Sans navire à contrôler, l'agent s'arrête : aucune recherche pour rien.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Laisse au navire le temps d'émettre après l'heure prévue. */
export const CHECK_AFTER_MS = 30 * MINUTE;
/** Au-delà, on arrête de chercher : un départ peut glisser de plusieurs heures, pas davantage. */
export const CHECK_UNTIL_MS = 6 * HOUR;
/** Un signal reçu peu avant l'heure prévue suffit : le navire est à portée, inutile de chercher. */
export const SIGNAL_BEFORE_MS = 2 * HOUR;
/** Sans traversée prévue, un navire n'est recherché qu'après ce silence, et une fois par jour. */
export const LONG_SILENCE_MS = 48 * HOUR;
/** Recherches par passage, pour rester discret auprès des sites. */
export const MAX_CHECKS = 5;
/** Un indice plus ancien ne renseigne plus sur la situation du navire. */
export const MAX_CLUE_AGE_MS = 7 * 24 * HOUR;

export type Phase = "departure" | "arrival" | "silence";

export interface SilentVessel {
  id: string;
  name: string;
  mmsi: number | null;
  imo?: string | number | null;
  status: string;
}
export interface PlannedCrossing {
  id: string;
  vessel_id: string | null;
  departure_at: string;
  arrival_at: string | null;
  status: string;
  from_port: string | null;
  to_port: string | null;
}
export interface SilentCheck {
  key: string;
  phase: Phase;
  vessel_id: string;
  vessel: string;
  mmsi: number;
  imo: string | number | null;
  last_signal_at: string | null;
  departure_id: string | null;
  port: string | null;
  planned_at: string | null;
}

export function silentChecks(input: {
  vessels: SilentVessel[];
  crossings: PlannedCrossing[];
  /** Dernier signal AIS par MMSI. */
  signals: Map<number, string | null>;
  /** Navires déjà couverts par un incident confirmé : la veille d'actualité s'en charge. */
  incidents: Set<string>;
  /** Clés déjà déposées : le même contrôle ne repart pas une fois l'indice trouvé. */
  known: Set<string>;
  now: number;
}): SilentCheck[] {
  const { vessels, crossings, signals, incidents, known, now } = input;
  const checks: SilentCheck[] = [];
  const planned = new Set<string>();
  const eligible = new Map(
    vessels
      .filter((v) => v.status === "active" && v.mmsi && !incidents.has(v.id))
      .map((v) => [v.id, v]),
  );
  const lastSignal = (vessel: SilentVessel) => signals.get(Number(vessel.mmsi)) ?? null;
  const silentSince = (vessel: SilentVessel, at: number) => {
    const last = lastSignal(vessel);
    return !last || Date.parse(last) < at - SIGNAL_BEFORE_MS;
  };

  for (const crossing of crossings) {
    if (!crossing.vessel_id || crossing.status === "cancelled") continue;
    const vessel = eligible.get(crossing.vessel_id);
    if (!vessel) continue;
    const phases: [Exclude<Phase, "silence">, string | null, string | null][] = [
      ["departure", crossing.departure_at, crossing.from_port],
      ["arrival", crossing.arrival_at, crossing.to_port],
    ];
    for (const [phase, plannedAt, port] of phases) {
      if (!plannedAt) continue;
      const at = Date.parse(plannedAt);
      if (now < at - CHECK_UNTIL_MS || now > at + CHECK_UNTIL_MS) continue;
      // Une traversée proche compte comme prévue, même si son heure de contrôle n'est pas encore venue.
      planned.add(vessel.id);
      if (now < at + CHECK_AFTER_MS || !silentSince(vessel, at)) continue;
      const key = `${crossing.id}:${phase}`;
      if (known.has(key)) continue;
      checks.push({
        key,
        phase,
        vessel_id: vessel.id,
        vessel: vessel.name,
        mmsi: Number(vessel.mmsi),
        imo: vessel.imo ?? null,
        last_signal_at: lastSignal(vessel),
        departure_id: crossing.id,
        port,
        planned_at: plannedAt,
      });
    }
  }
  checks.sort((a, b) => Date.parse(b.planned_at ?? "") - Date.parse(a.planned_at ?? ""));

  // Silence sans traversée : chaque navire a son heure dans la journée, pour étaler les recherches.
  const hour = Math.floor(now / HOUR);
  for (const vessel of eligible.values()) {
    if (planned.has(vessel.id) || Number(vessel.mmsi) % 24 !== hour % 24) continue;
    const last = lastSignal(vessel);
    if (last && Date.parse(last) > now - LONG_SILENCE_MS) continue;
    const key = `${vessel.id}:silence:${new Date(now).toISOString().slice(0, 10)}`;
    if (known.has(key)) continue;
    checks.push({
      key,
      phase: "silence",
      vessel_id: vessel.id,
      vessel: vessel.name,
      mmsi: Number(vessel.mmsi),
      imo: vessel.imo ?? null,
      last_signal_at: last,
      departure_id: null,
      port: null,
      planned_at: null,
    });
  }
  return checks.slice(0, MAX_CHECKS);
}

export interface Clue {
  key: string;
  check: SilentCheck;
  event: "departure" | "arrival";
  port: string;
  event_at: string;
  source_name: string;
  /** Le lien porte l'événement : le même indice retrouvé plus tard ne crée pas de doublon. */
  url: string;
  title: string;
  summary: string;
  confidence: "medium" | "low";
}

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const EVENT_LABEL = { departure: "départ de", arrival: "arrivée à" } as const;

/**
 * Le titre et le résumé sont écrits ici, jamais par l'agent : un indice reste présenté comme un indice.
 * Renvoie null si l'indice ne prouve rien : navire hors liste, date absente ou future, lien non sûr.
 */
export function parseClue(raw: unknown, checks: SilentCheck[], now: number): Clue | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Partial<
    Record<
      "key" | "event" | "port" | "source_name" | "evidence" | "event_at" | "source_url",
      unknown
    >
  >;
  const check = checks.find((c) => c.key === entry.key);
  if (!check) return null;
  const event = entry.event;
  if (event !== "departure" && event !== "arrival") return null;
  const port = clean(entry.port, 60);
  const sourceName = clean(entry.source_name, 60);
  const evidence = clean(entry.evidence, 160);
  if (port.length < 2 || sourceName.length < 2) return null;

  const eventAt = Date.parse(String(entry.event_at ?? ""));
  if (!Number.isFinite(eventAt) || eventAt > now + 5 * MINUTE || eventAt < now - MAX_CLUE_AGE_MS)
    return null;

  let url: URL;
  try {
    url = new URL(String(entry.source_url ?? ""));
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const iso = new Date(eventAt).toISOString();
  url.hash = `${check.mmsi}-${event}-${iso}`;
  const when = `${iso.slice(8, 10)}/${iso.slice(5, 7)} à ${iso.slice(11, 16)} UTC`;
  const samePort = !!check.port && port.toLowerCase() === check.port.toLowerCase();
  const signal = check.last_signal_at
    ? `Dernier signal AIS reçu : ${check.last_signal_at.slice(0, 16).replace("T", " ")} UTC.`
    : "Aucun signal AIS reçu.";
  return {
    key: check.key,
    check,
    event,
    port,
    event_at: iso,
    source_name: sourceName,
    url: url.toString(),
    title: `${check.vessel} : ${EVENT_LABEL[event]} ${port} signalé par ${sourceName}`.slice(
      0,
      160,
    ),
    summary: `Indice à confirmer, le ${when}. ${signal}${evidence ? ` ${evidence}` : ""}`.slice(
      0,
      400,
    ),
    // Ces sites lisent le même AIS : une concordance n'est jamais une confirmation indépendante.
    confidence: check.phase !== "silence" && samePort && check.phase === event ? "medium" : "low",
  };
}
