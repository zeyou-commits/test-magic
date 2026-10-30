import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Contrôles du planning pour l'espace équipe : conflits de bateau, doublons probables et
 * propositions d'affectation. Fonctions pures, testées sans base de données.
 */

export type PlanningDeparture = {
  id: string;
  route_id: string;
  company_id: string;
  vessel_id: string | null;
  departure_at: string;
  arrival_at: string | null;
  duration_minutes: number | null;
  status: string;
  /** Origine du départ (programme récurrent, import Excel…), utile pour choisir le bon doublon. */
  source_name?: string | null;
  schedule_id?: string | null;
};

export type PlanningVessel = {
  id: string;
  name: string;
  company_id: string | null;
  status: string;
};

/** Temps minimal à quai entre une arrivée et le départ suivant du même bateau. */
export const TURNAROUND_MINUTES = 60;
/** Deux départs de la même liaison et de la même compagnie aussi proches sont suspects. */
export const DUPLICATE_WINDOW_MINUTES = 180;

const MINUTE = 60_000;
const startOf = (d: PlanningDeparture) => Date.parse(d.departure_at);
export const endOf = (d: PlanningDeparture) =>
  d.arrival_at ? Date.parse(d.arrival_at) : startOf(d) + (d.duration_minutes ?? 0) * MINUTE;
const active = (d: PlanningDeparture) => d.status !== "cancelled";

/** Jour calendaire (AAAA-MM-JJ) et heure HH:MM à Paris : la clé de lecture de l'équipe. */
export function parisKey(value: string) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    weekday: get("weekday"),
  };
}

export type PlanningIssue = {
  kind: "duplicate" | "conflict";
  /** Clé stable de la paire, pour pouvoir l'écarter (« ce sont deux départs »). */
  key: string;
  first: PlanningDeparture;
  second: PlanningDeparture;
};

/**
 * Doublons probables : même liaison, même compagnie, même jour, à moins de 3 h d'écart,
 * avec le même bateau (ou au moins un sans bateau, à moins d'une heure).
 * Conflits : un même bateau sur deux départs qui se chevauchent (escale comprise).
 */
export function findPlanningIssues(departures: PlanningDeparture[]): PlanningIssue[] {
  const list = departures.filter(active).sort((a, b) => startOf(a) - startOf(b));
  const issues: PlanningIssue[] = [];
  const seen = new Set<string>();
  const push = (
    kind: PlanningIssue["kind"],
    first: PlanningDeparture,
    second: PlanningDeparture,
  ) => {
    const key = [first.id, second.id].sort().join(":");
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ kind, key, first, second });
  };

  const byLine = new Map<string, PlanningDeparture[]>();
  for (const d of list) {
    const key = `${d.route_id}|${d.company_id}`;
    byLine.set(key, [...(byLine.get(key) ?? []), d]);
  }
  for (const group of byLine.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]!;
        const b = group[j]!;
        const gap = (startOf(b) - startOf(a)) / MINUTE;
        if (gap > DUPLICATE_WINDOW_MINUTES) break;
        if (parisKey(a.departure_at).day !== parisKey(b.departure_at).day) continue;
        const sameVessel = a.vessel_id && a.vessel_id === b.vessel_id;
        const looseVessel = (!a.vessel_id || !b.vessel_id) && gap <= 60;
        if (sameVessel || looseVessel) push("duplicate", a, b);
      }
    }
  }

  const byVessel = new Map<string, PlanningDeparture[]>();
  for (const d of list) {
    if (!d.vessel_id) continue;
    byVessel.set(d.vessel_id, [...(byVessel.get(d.vessel_id) ?? []), d]);
  }
  for (const group of byVessel.values()) {
    for (let i = 1; i < group.length; i += 1) {
      const previous = group[i - 1]!;
      const next = group[i]!;
      if (startOf(next) < endOf(previous) + TURNAROUND_MINUTES * MINUTE)
        push("conflict", previous, next);
    }
  }
  return issues.sort((a, b) => startOf(a.first) - startOf(b.first));
}

/** Le départ qui empêche ce bateau de prendre `target`, ou null s'il est libre. */
export function vesselBlocker(
  vesselId: string,
  target: Pick<PlanningDeparture, "id" | "departure_at" | "arrival_at" | "duration_minutes">,
  departures: PlanningDeparture[],
): PlanningDeparture | null {
  const start = Date.parse(target.departure_at);
  const end = endOf(target as PlanningDeparture);
  const margin = TURNAROUND_MINUTES * MINUTE;
  return (
    departures.find(
      (d) =>
        d.id !== target.id &&
        d.vessel_id === vesselId &&
        active(d) &&
        startOf(d) < end + margin &&
        endOf(d) + margin > start,
    ) ?? null
  );
}

export type VesselSuggestion = {
  departureId: string;
  vesselId: string;
  reason: "only-vessel" | "schedule" | "usual-slot";
};

export type AssignRules = { onlyVessel: boolean; schedule: boolean; usualSlot: boolean };
export const DEFAULT_RULES: AssignRules = { onlyVessel: true, schedule: true, usualSlot: true };

/**
 * Propositions sûres pour les départs à venir sans bateau, dans l'ordre des règles :
 * 1. la compagnie n'a qu'un navire actif ; 2. le calendrier récurrent qui a créé le départ
 * prévoit un bateau ; 3. même liaison, même jour de semaine, même heure, toujours le même bateau.
 * Un bateau déjà pris à cette heure-là n'est jamais proposé.
 */
export function suggestVessels(
  departures: PlanningDeparture[],
  vessels: PlanningVessel[],
  now = Date.now(),
  rules: AssignRules = DEFAULT_RULES,
  scheduleVessel: Map<string, string | null> = new Map(),
): VesselSuggestion[] {
  const fleet = new Map<string, PlanningVessel[]>();
  for (const v of vessels) {
    if (!v.company_id || v.status !== "active") continue;
    fleet.set(v.company_id, [...(fleet.get(v.company_id) ?? []), v]);
  }
  const slotKey = (d: PlanningDeparture) => {
    const { weekday, time } = parisKey(d.departure_at);
    return `${d.route_id}|${d.company_id}|${weekday}|${time}`;
  };
  const usual = new Map<string, Set<string>>();
  for (const d of departures) {
    if (!d.vessel_id || !active(d)) continue;
    const key = slotKey(d);
    usual.set(key, (usual.get(key) ?? new Set()).add(d.vessel_id));
  }
  // Les propositions déjà faites occupent le bateau, comme une affectation réelle.
  const occupied = departures.map((d) => ({ ...d }));
  const suggestions: VesselSuggestion[] = [];
  for (const d of occupied) {
    if (d.vessel_id || !active(d) || startOf(d) < now) continue;
    const own = fleet.get(d.company_id) ?? [];
    const slot = usual.get(slotKey(d));
    const planned = d.schedule_id ? scheduleVessel.get(d.schedule_id) : null;
    let candidate: VesselSuggestion | null = null;
    if (rules.onlyVessel && own.length === 1)
      candidate = { departureId: d.id, vesselId: own[0]!.id, reason: "only-vessel" };
    else if (rules.schedule && planned && own.some((v) => v.id === planned))
      candidate = { departureId: d.id, vesselId: planned, reason: "schedule" };
    else if (rules.usualSlot && slot?.size === 1) {
      const [vesselId] = [...slot];
      if (own.some((v) => v.id === vesselId))
        candidate = { departureId: d.id, vesselId: vesselId!, reason: "usual-slot" };
    }
    if (!candidate || vesselBlocker(candidate.vesselId, d, occupied)) continue;
    d.vessel_id = candidate.vesselId;
    suggestions.push(candidate);
  }
  return suggestions;
}

const urlSlug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/**
 * Liens pour vérifier un horaire sur le web : la page Direct Ferries de la liaison
 * (elle n'existe pas pour toutes les liaisons) et une recherche avec compagnie, liaison et date.
 */
export function verificationLinks(input: {
  from: string;
  to: string;
  company: string;
  departureAt: string;
}) {
  const day = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(input.departureAt));
  const query = `${input.company} ferry ${input.from} ${input.to} horaires ${day}`;
  return {
    directFerries: `https://www.directferries.fr/${urlSlug(input.from)}_${urlSlug(input.to)}_ferry.htm`,
    search: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  };
}

/** Dernier jour programmé par compagnie (départs non annulés). */
export function programmeEnds(departures: PlanningDeparture[]) {
  const last = new Map<string, string>();
  for (const d of departures) {
    if (!active(d)) continue;
    const current = last.get(d.company_id);
    if (!current || d.departure_at > current) last.set(d.company_id, d.departure_at);
  }
  return last;
}

/** Départs de J-16 à J+240, lus par paquets (la base renvoie 1 000 lignes au plus). */
export const planningDeparturesQuery = queryOptions({
  queryKey: ["departures", "planning"],
  queryFn: async (): Promise<PlanningDeparture[]> => {
    // Deux semaines en arrière : la semaine en cours s'affiche en entier dans le planning.
    const from = new Date(Date.now() - 16 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 240 * 86_400_000).toISOString();
    const rows: PlanningDeparture[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("departures")
        .select(
          "id, route_id, company_id, vessel_id, departure_at, arrival_at, duration_minutes, status, source_name, schedule_id",
        )
        .gte("departure_at", from)
        .lte("departure_at", to)
        .order("departure_at")
        .range(offset, offset + 999);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as PlanningDeparture[]));
      if (!data || data.length < 1000) break;
    }
    return rows;
  },
  staleTime: 30_000,
});

/** Affecte des bateaux en lot, sans écraser un bateau choisi entre-temps par quelqu'un d'autre. */
export async function assignVessels(items: { departureId: string; vesselId: string }[]) {
  const byVessel = new Map<string, string[]>();
  for (const item of items)
    byVessel.set(item.vesselId, [...(byVessel.get(item.vesselId) ?? []), item.departureId]);
  let updated = 0;
  for (const [vesselId, ids] of byVessel) {
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase
        .from("departures")
        .update({ vessel_id: vesselId })
        .in("id", ids.slice(i, i + 200))
        .is("vessel_id", null)
        .select("id");
      if (error) throw new Error(error.message);
      updated += data?.length ?? 0;
    }
  }
  return updated;
}

/** Fusionne un doublon dans le départ gardé (suivis, signalements… sont transférés). */
export async function mergeDepartures(keepId: string, removeId: string) {
  const { error } = await (
    supabase.rpc as unknown as (
      name: string,
      args: Record<string, string>,
    ) => Promise<{ error: { message: string } | null }>
  )("bw_admin_merge_departures", { p_keep: keepId, p_remove: removeId });
  if (error) {
    throw new Error(
      /function|does not exist|schema cache/i.test(error.message)
        ? "La fusion n'est pas encore installée : exécutez le script SQL « admin_fusion_departs » dans Supabase."
        : error.message,
    );
  }
}
