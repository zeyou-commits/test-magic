import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/ferry/format";
import {
  aisDestinationMatches,
  detectVesselConflicts,
  type ConflictLeg,
  type PlanningConflict,
} from "@/lib/ferry/conflicts";

const DAY = 86_400_000;

async function loadAlerts() {
  const since = new Date(Date.now() - 2 * DAY).toISOString();
  const [deps, routes, ports, vessels, positions] = await Promise.all([
    supabase
      .from("departures")
      .select("id, route_id, vessel_id, departure_at, arrival_at, duration_minutes, status")
      .gte("departure_at", since)
      .neq("status", "cancelled")
      .not("vessel_id", "is", null)
      .order("departure_at")
      .limit(2000),
    supabase.from("routes").select("id, departure_port_id, arrival_port_id, typical_duration_minutes"),
    supabase.from("ports").select("id, name, city"),
    supabase.from("vessels").select("id, name, mmsi"),
    supabase.from("vessel_positions").select("mmsi, destination, eta, speed_knots, reported_at"),
  ]);
  const err = deps.error ?? routes.error ?? ports.error ?? vessels.error;
  if (err) throw err;
  const routeById = new Map((routes.data ?? []).map((r) => [r.id, r]));
  const portById = new Map((ports.data ?? []).map((p) => [p.id, p]));
  const depById = new Map((deps.data ?? []).map((d) => [d.id, d]));
  const legs: ConflictLeg[] = [];
  (deps.data ?? []).forEach((d) => {
    const r = routeById.get(d.route_id);
    if (!r || !d.vessel_id) return;
    const start = Date.parse(d.departure_at);
    const minutes = d.duration_minutes ?? r.typical_duration_minutes ?? 24 * 60;
    const end = d.arrival_at ? Date.parse(d.arrival_at) : start + minutes * 60_000;
    legs.push({
      id: d.id,
      vesselId: d.vessel_id,
      fromId: r.departure_port_id,
      toId: r.arrival_port_id,
      fromName: portById.get(r.departure_port_id)?.name ?? "?",
      toName: portById.get(r.arrival_port_id)?.name ?? "?",
      start,
      end,
    });
  });
  const conflicts: PlanningConflict[] = detectVesselConflicts(legs);

  // Comparaison avec la destination AIS déclarée (signal de moins de 24 h).
  const now = Date.now();
  const posByMmsi = new Map((positions.data ?? []).map((p) => [Number(p.mmsi), p]));
  (vessels.data ?? []).forEach((v) => {
    const pos = v.mmsi ? posByMmsi.get(Number(v.mmsi)) : undefined;
    if (!pos?.destination || !pos.reported_at || now - Date.parse(pos.reported_at) > DAY) return;
    const own = legs.filter((l) => l.vesselId === v.id && l.end >= now).sort((a, b) => a.start - b.start);
    const next = own[0];
    if (!next) return;
    const to = portById.get(next.toId);
    const from = portById.get(next.fromId);
    const matchesTo = to && aisDestinationMatches(pos.destination, to.name, to.city);
    const matchesFrom = from && aisDestinationMatches(pos.destination, from.name, from.city);
    if (!matchesTo && !matchesFrom) {
      conflicts.push({
        kind: "ais",
        severity: "medium",
        vesselId: v.id,
        departureIds: [next.id],
        message: `AIS déclare « ${pos.destination} »${pos.eta ? ` (ETA ${pos.eta})` : ""}, mais le planning prévoit ${next.fromName} → ${next.toName}.`,
      });
    }
  });

  const vesselName = new Map((vessels.data ?? []).map((v) => [v.id, v.name]));
  return conflicts
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1))
    .map((c) => ({
      ...c,
      vesselName: vesselName.get(c.vesselId) ?? "Navire",
      departures: c.departureIds.map((id) => {
        const d = depById.get(id);
        const leg = legs.find((l) => l.id === id);
        return { id, label: leg ? `${leg.fromName} → ${leg.toName}` : id, at: d?.departure_at ?? "" };
      }),
    }));
}

export function usePlanningAlerts() {
  return useQuery({ queryKey: ["admin", "planning-alerts"], queryFn: loadAlerts, staleTime: 5 * 60_000 });
}

const kindLabel = { overlap: "Chevauchement", continuity: "Escale incohérente", ais: "Écart AIS" } as const;

export function PlanningAlerts() {
  const { data = [], isLoading, error } = usePlanningAlerts();
  if (isLoading) return <p className="py-6 text-sm text-muted-foreground">Analyse des calendriers…</p>;
  if (error) return <p className="py-6 text-sm text-destructive">Analyse impossible : {String((error as Error).message)}</p>;
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Incohérences détectées par navire entre les départs saisis et le signal AIS. Rien n'est modifié
        automatiquement : corrigez le départ concerné dans l'onglet Départs.
      </p>
      {data.length === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm">
          <CheckCircle2 className="h-4 w-4 text-primary" /> Aucune incohérence détectée.
        </div>
      )}
      {data.map((a, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            {a.kind === "ais" ? (
              <Radio className="h-4 w-4 text-muted-foreground" />
            ) : (
              <AlertTriangle className={`h-4 w-4 ${a.severity === "high" ? "text-destructive" : "text-muted-foreground"}`} />
            )}
            <span className="font-semibold">{a.vesselName}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{kindLabel[a.kind]}</span>
          </div>
          <p className="mt-2 text-sm">{a.message}</p>
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {a.departures.map((d) => (
              <li key={d.id}>
                {d.label} · {d.at ? formatDateTime(d.at) : ""}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
