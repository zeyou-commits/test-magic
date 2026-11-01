// Navires muets : qui contrôler maintenant, et ce qu'une fiche VesselFinder doit montrer pour être déposée.
// Sans navire à contrôler, l'agent s'arrête : aucune lecture pour rien.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Laisse au navire le temps d'émettre après l'heure de départ prévue. */
export const CHECK_AFTER_MS = 30 * MINUTE;
/** Une arrivée peut glisser de plusieurs heures : le contrôle continue après l'heure prévue. */
export const CHECK_UNTIL_MS = 6 * HOUR;
/** Un navire qui a émis récemment est à portée de notre écoute : inutile de lire sa fiche. */
export const SIGNAL_FRESH_MS = 2 * HOUR;
/** Une traversée sans heure d'arrivée connue n'est pas suivie plus longtemps. */
const CROSSING_MAX_MS = 2 * DAY;
/** Sans traversée prévue, un navire n'est contrôlé qu'après ce silence, et une fois par jour. */
export const LONG_SILENCE_MS = 48 * HOUR;
/** Après un indice, la même traversée n'est relue qu'au bout de ce délai. */
export const RECHECK_MS = 3 * HOUR;
/** Lectures par passage, pour rester discret auprès du site. */
export const MAX_CHECKS = 5;
const MAX_PAST_MS = 7 * DAY;
const MAX_ETA_MS = 3 * DAY;

export type Phase = "crossing" | "silence";

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
  /** La seule page que l'agent peut lire : elle est donnée par le serveur, pas choisie par lui. */
  page: string;
  last_signal_at: string | null;
  departure_id: string | null;
  from_port: string | null;
  to_port: string | null;
  planned_departure_at: string | null;
  planned_arrival_at: string | null;
}

const pageOf = (vessel: SilentVessel) =>
  `https://www.vesselfinder.com/fr/vessels/details/${vessel.imo ?? vessel.mmsi}`;

export function silentChecks(input: {
  vessels: SilentVessel[];
  crossings: PlannedCrossing[];
  /** Dernier signal AIS par MMSI. */
  signals: Map<number, string | null>;
  /** Navires déjà couverts par un incident en cours : la veille d'actualité s'en charge. */
  incidents: Set<string>;
  /** Clés déjà déposées : le même contrôle ne repart pas tout de suite une fois l'indice trouvé. */
  known: Set<string>;
  now: number;
}): SilentCheck[] {
  const { vessels, crossings, signals, incidents, known, now } = input;
  const eligible = new Map(
    vessels
      .filter((v) => v.status === "active" && v.mmsi && !incidents.has(v.id))
      .map((v) => [v.id, v]),
  );
  const lastSignal = (vessel: SilentVessel) => signals.get(Number(vessel.mmsi)) ?? null;
  const base = (vessel: SilentVessel) => ({
    vessel_id: vessel.id,
    vessel: vessel.name,
    mmsi: Number(vessel.mmsi),
    page: pageOf(vessel),
    last_signal_at: lastSignal(vessel),
  });
  const planned = new Set<string>();
  const byVessel = new Map<string, SilentCheck>();
  const bucket = Math.floor(now / RECHECK_MS);

  for (const crossing of crossings) {
    if (!crossing.vessel_id || crossing.status === "cancelled") continue;
    const vessel = eligible.get(crossing.vessel_id);
    if (!vessel) continue;
    const start = Date.parse(crossing.departure_at);
    const end = crossing.arrival_at
      ? Date.parse(crossing.arrival_at) + CHECK_UNTIL_MS
      : start + CROSSING_MAX_MS;
    if (now < start - CHECK_UNTIL_MS || now > end) continue;
    // Une traversée proche compte comme prévue, même si son contrôle n'a pas encore commencé.
    planned.add(vessel.id);
    if (now < start + CHECK_AFTER_MS) continue;
    const last = lastSignal(vessel);
    if (last && Date.parse(last) > now - SIGNAL_FRESH_MS) continue;
    const key = `${crossing.id}:crossing:${bucket}`;
    if (known.has(key)) continue;
    // Deux traversées se chevauchent parfois dans le planning : seule la plus récente compte.
    const current = byVessel.get(vessel.id);
    if (current && Date.parse(current.planned_departure_at ?? "") > start) continue;
    byVessel.set(vessel.id, {
      ...base(vessel),
      key,
      phase: "crossing",
      departure_id: crossing.id,
      from_port: crossing.from_port,
      to_port: crossing.to_port,
      planned_departure_at: crossing.departure_at,
      planned_arrival_at: crossing.arrival_at,
    });
  }
  const checks = [...byVessel.values()].sort(
    (a, b) => Date.parse(b.planned_departure_at ?? "") - Date.parse(a.planned_departure_at ?? ""),
  );

  // Silence sans traversée : chaque navire a son heure dans la journée, pour étaler les lectures.
  const hour = Math.floor(now / HOUR) % 24;
  for (const vessel of eligible.values()) {
    if (planned.has(vessel.id) || Number(vessel.mmsi) % 24 !== hour) continue;
    const last = lastSignal(vessel);
    if (last && Date.parse(last) > now - LONG_SILENCE_MS) continue;
    const key = `${vessel.id}:silence:${new Date(now).toISOString().slice(0, 10)}`;
    if (known.has(key)) continue;
    checks.push({
      ...base(vessel),
      key,
      phase: "silence",
      departure_id: null,
      from_port: null,
      to_port: null,
      planned_departure_at: null,
      planned_arrival_at: null,
    });
  }
  return checks.slice(0, MAX_CHECKS);
}

/**
 * Lit une date de fiche. Ces fiches omettent souvent l'année (« MM-JJTHH:mm ») :
 * elle est alors déduite, et seule l'année la plus proche d'aujourd'hui est retenue.
 */
export function clueDate(value: unknown, now: number): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/^\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    const year = new Date(now).getUTCFullYear();
    const dates = [year - 1, year, year + 1]
      .map((y) => Date.parse(`${y}-${text}:00Z`))
      .filter(Number.isFinite);
    if (!dates.length) return null;
    return dates.reduce((a, b) => (Math.abs(a - now) <= Math.abs(b - now) ? a : b));
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface Clue {
  key: string;
  check: SilentCheck;
  /** Date principale de l'indice : ce qui a été constaté, sinon l'arrivée estimée. */
  event_at: string;
  /** Le lien porte le contenu : la même information relue plus tard ne crée pas de doublon. */
  url: string;
  title: string;
  summary: string;
  confidence: "medium" | "low";
}

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const samePort = (a: string, b: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

const when = (at: number) => {
  const iso = new Date(at).toISOString();
  return `le ${iso.slice(8, 10)}/${iso.slice(5, 7)} à ${iso.slice(11, 16)} UTC`;
};

/**
 * Le titre, le résumé et le lien sont écrits ici, jamais par l'agent : un indice reste présenté comme un indice.
 * Renvoie null si la fiche n'apprend rien de daté : navire hors liste, dates absentes ou invraisemblables.
 */
export function parseClue(raw: unknown, checks: SilentCheck[], now: number): Clue | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Partial<
    Record<
      | "key"
      | "last_port"
      | "departed_at"
      | "current_port"
      | "arrived_at"
      | "destination"
      | "eta"
      | "position_age_minutes",
      unknown
    >
  >;
  const check = checks.find((c) => c.key === entry.key);
  if (!check) return null;

  const past = (value: unknown) => {
    const at = clueDate(value, now);
    return at !== null && at <= now + 5 * MINUTE && at >= now - MAX_PAST_MS ? at : null;
  };
  const lastPort = clean(entry.last_port, 60);
  const currentPort = clean(entry.current_port, 60);
  const destination = clean(entry.destination, 60);
  const departed = lastPort ? past(entry.departed_at) : null;
  const arrived = currentPort ? past(entry.arrived_at) : null;
  const etaAt = destination ? clueDate(entry.eta, now) : null;
  const eta = etaAt !== null && etaAt >= now - DAY && etaAt <= now + MAX_ETA_MS ? etaAt : null;
  const main = arrived ?? departed ?? eta;
  if (main === null) return null;

  const facts = [
    arrived !== null ? `à ${currentPort} depuis ${when(arrived)}` : null,
    departed !== null ? `parti de ${lastPort} ${when(departed)}` : null,
    arrived === null && eta !== null ? `attendu à ${destination} ${when(eta)}` : null,
  ].filter(Boolean);

  const age = typeof entry.position_age_minutes === "number" ? entry.position_age_minutes : NaN;
  const seen =
    Number.isFinite(age) && age >= 0 && age <= 7 * 24 * 60
      ? `Position vue il y a ${Math.round(age)} min par VesselFinder. `
      : "";
  const signal = check.last_signal_at
    ? `Dernier signal reçu par BledWay : ${check.last_signal_at.slice(0, 16).replace("T", " ")} UTC.`
    : "Aucun signal reçu par BledWay.";
  const planned = check.planned_arrival_at
    ? ` Arrivée au planning : ${when(Date.parse(check.planned_arrival_at))}.`
    : "";

  const url = new URL(check.page);
  url.hash = [check.mmsi, currentPort, arrived, lastPort, departed, destination, eta]
    .map((part) => part ?? "")
    .join("-")
    .replace(/\s+/g, "_");
  return {
    key: check.key,
    check,
    event_at: new Date(main).toISOString(),
    url: url.toString(),
    title: `${check.vessel} : ${facts.join(", ")}`.slice(0, 160),
    summary: `Indice à confirmer, source VesselFinder. ${seen}${signal}${planned}`.slice(0, 400),
    // Une fiche publique n'est pas un horaire de compagnie : la confiance ne monte jamais plus haut.
    confidence:
      samePort(lastPort, check.from_port) || samePort(destination, check.to_port)
        ? "medium"
        : "low",
  };
}
