import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { VerifyLinks } from "@/components/admin/TodayInbox";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  adminPortsQuery,
  adminRoutesQuery,
  companiesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { dateKeyInZone, portTimeZone, wallTimeInZone } from "@/lib/ferry/time";
import {
  findPlanningIssues,
  mergeDepartures,
  parisKey,
  planningDeparturesQuery,
  vesselBlocker,
  verificationLinks,
  type PlanningDeparture,
} from "@/lib/admin/planning";
import { visibleSuggestions } from "@/lib/admin/autoAssign";
import { assignConfigQuery, scheduleVesselsQuery } from "@/lib/admin/assignQueries";

type Filter = "all" | "unassigned" | "issues";

/** Lundi (AAAA-MM-JJ) de la semaine qui contient `day`. */
function mondayOf(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
function addDays(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const shortDay = (day: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
const longDay = (day: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));

/**
 * Planning de la semaine : une ligne par ligne, une colonne par jour (heure locale du port
 * de départ, celle imprimée sur les billets). Un clic ouvre la traversée à droite.
 */
export function PlanningBoard({
  initialDate,
  initialFilter,
  renderEditor,
}: {
  initialDate?: string | undefined;
  initialFilter?: "unassigned" | "issues" | undefined;
  renderEditor: (departureId: string, onDone: () => void) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const departuresQuery = useQuery(planningDeparturesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const departures = departuresQuery.data ?? [];
  const assignConfig = useQuery(assignConfigQuery).data;
  const scheduleVessels = useQuery(scheduleVesselsQuery).data;

  const today = parisKey(new Date().toISOString()).day;
  const [week, setWeek] = useState(() => mondayOf(initialDate ?? today));
  const [filter, setFilter] = useState<Filter>(initialFilter ?? "all");
  const [company, setCompany] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const portOf = (id: string) => ports.find((p) => p.id === id);
  const routeOf = (id: string) => routes.find((r) => r.id === id);
  const zoneOf = (d: PlanningDeparture) =>
    portTimeZone(portOf(routeOf(d.route_id)?.departure_port_id ?? ""));
  const localDay = (d: PlanningDeparture) => dateKeyInZone(d.departure_at, zoneOf(d));
  const localTime = (d: PlanningDeparture) => wallTimeInZone(d.departure_at, zoneOf(d)).slice(0, 5);
  const routeLabel = (id: string) => {
    const route = routeOf(id);
    return route
      ? `${portOf(route.departure_port_id)?.name ?? "?"} → ${portOf(route.arrival_port_id)?.name ?? "?"}`
      : "Liaison";
  };
  const vesselName = (id: string | null) => vessels.find((v) => v.id === id)?.name ?? null;
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "Compagnie";

  const issues = findPlanningIssues(departures);
  const issueOf = new Map<string, { kind: "duplicate" | "conflict"; other: PlanningDeparture }>();
  for (const issue of issues) {
    issueOf.set(issue.first.id, { kind: issue.kind, other: issue.second });
    issueOf.set(issue.second.id, { kind: issue.kind, other: issue.first });
  }
  const suggestionOf = new Map(
    (assignConfig
      ? visibleSuggestions(departures, vessels, assignConfig, scheduleVessels ?? new Map())
      : []
    ).map((s) => [s.departureId, s] as const),
  );

  const inWeek = departures.filter((d) => {
    const day = localDay(d);
    return day >= days[0]! && day <= days[6]!;
  });
  const visible = inWeek.filter(
    (d) =>
      (company === "all" || d.company_id === company) &&
      (filter === "all" ||
        (filter === "unassigned" && !d.vessel_id && d.status !== "cancelled") ||
        (filter === "issues" && issueOf.has(d.id))),
  );
  const rowIds = [...new Set(visible.map((d) => d.route_id))].sort((a, b) =>
    routeLabel(a).localeCompare(routeLabel(b), "fr"),
  );
  const counts = {
    all: inWeek.length,
    unassigned: inWeek.filter((d) => !d.vessel_id && d.status !== "cancelled").length,
    issues: inWeek.filter((d) => issueOf.has(d.id)).length,
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["departures"] });
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  };
  const assign = useMutation({
    mutationFn: async ({ id, vesselId }: { id: string; vesselId: string | null }) => {
      const { error } = await supabase
        .from("departures")
        .update({ vessel_id: vesselId })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, { vesselId }) => {
      toast.success(vesselId ? `Bateau affecté : ${vesselName(vesselId)}.` : "Bateau retiré.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const merge = useMutation({
    mutationFn: ({ keep, remove }: { keep: string; remove: string }) =>
      mergeDepartures(keep, remove),
    onSuccess: () => {
      toast.success("Doublon fusionné : les suivis des voyageurs sont transférés.");
      setOpenId(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const open = departures.find((d) => d.id === openId) ?? null;
  const openIssue = open ? issueOf.get(open.id) : undefined;
  const fleet = open
    ? vessels
        .filter((v) => v.company_id === open.company_id && v.status === "active")
        .map((v) => {
          const blocker = vesselBlocker(v.id, open, departures);
          return { vessel: v, blocker, suggested: suggestionOf.get(open.id)?.vesselId === v.id };
        })
        .sort(
          (a, b) =>
            Number(b.suggested) - Number(a.suggested) || Number(!!a.blocker) - Number(!!b.blocker),
        )
    : [];

  const chipClass = (d: PlanningDeparture) => {
    if (d.status === "cancelled")
      return "border-border bg-muted text-muted-foreground line-through";
    if (issueOf.has(d.id)) return "border-red-300 bg-red-50 text-red-800";
    if (!d.vessel_id) return "border-dashed border-amber-500 bg-amber-50 text-amber-900";
    return "border-blue-200 bg-blue-50 text-blue-900";
  };

  return (
    <div className="grid gap-4">
      <div className="bw-admin-surface flex flex-wrap items-center gap-2 p-3">
        <Button
          size="sm"
          variant="outline"
          aria-label="Semaine précédente"
          onClick={() => setWeek(addDays(week, -7))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <strong className="px-1 text-sm">
          Semaine du {longDay(days[0]!)} au {longDay(days[6]!)}
        </strong>
        <Button
          size="sm"
          variant="outline"
          aria-label="Semaine suivante"
          onClick={() => setWeek(addDays(week, 7))}
        >
          <ChevronRight className="size-4" />
        </Button>
        {week !== mondayOf(today) && (
          <Button size="sm" variant="ghost" onClick={() => setWeek(mondayOf(today))}>
            Cette semaine
          </Button>
        )}
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        {(
          [
            ["all", `Toutes (${counts.all})`],
            ["unassigned", `Sans navire (${counts.unassigned})`],
            ["issues", `Conflits et doublons (${counts.issues})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${
              filter === id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-white"
            }`}
          >
            {label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Compagnie
          <select
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="all">Toutes</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {departuresQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Chargement du planning…</p>
      ) : (
        <div className="bw-admin-surface overflow-x-auto">
          <div className="min-w-[56rem]">
            <div className="grid grid-cols-[11rem_repeat(7,minmax(0,1fr))] border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
              <span className="px-3 py-2">Ligne</span>
              {days.map((day) => (
                <span
                  key={day}
                  className={`border-l border-border px-2 py-2 ${day === today ? "text-primary" : ""}`}
                >
                  {shortDay(day)}
                </span>
              ))}
            </div>
            {rowIds.map((routeId) => (
              <div
                key={routeId}
                className="grid grid-cols-[11rem_repeat(7,minmax(0,1fr))] border-b border-border/70 last:border-0"
              >
                <span className="px-3 py-3 text-xs font-semibold leading-snug">
                  {routeLabel(routeId)}
                </span>
                {days.map((day) => (
                  <div key={day} className="flex flex-col gap-1.5 border-l border-border/70 p-1.5">
                    {visible
                      .filter((d) => d.route_id === routeId && localDay(d) === day)
                      .map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setOpenId(d.id);
                            setEditing(false);
                          }}
                          className={`min-h-11 rounded-lg border px-2 py-1 text-left text-[11px] leading-tight ${chipClass(d)}`}
                        >
                          <span className="block font-bold tabular-nums">
                            {localTime(d)} · {companyName(d.company_id)}
                          </span>
                          <span className="block truncate">
                            {vesselName(d.vessel_id) ??
                              (suggestionOf.has(d.id)
                                ? "Proposé : " + vesselName(suggestionOf.get(d.id)!.vesselId)
                                : "Bateau à choisir")}
                          </span>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            ))}
            {rowIds.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {filter === "all"
                  ? "Aucune traversée cette semaine."
                  : "Rien à signaler cette semaine avec ce filtre."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <Legend className="border-blue-200 bg-blue-50">Navire affecté</Legend>
            <Legend className="border-dashed border-amber-500 bg-amber-50">Navire à choisir</Legend>
            <Legend className="border-red-300 bg-red-50">Conflit ou doublon</Legend>
            <span>Heures locales du port de départ.</span>
          </div>
        </div>
      )}

      {open ? (
        <AdminDrawer
          open
          onOpenChange={(next) => !next && setOpenId(null)}
          title={routeLabel(open.route_id)}
          description={`${longDay(localDay(open))} à ${localTime(open)} · ${companyName(open.company_id)}${
            open.status === "cancelled" ? " · annulée" : ""
          }`}
        >
          <div className="grid gap-5">
            {openIssue && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <p className="font-semibold">
                  {openIssue.kind === "duplicate" ? "Doublon probable" : "Conflit de bateau"}
                </p>
                <p className="mt-1 leading-relaxed">
                  {openIssue.kind === "duplicate"
                    ? `Même ligne, même jour : un autre départ à ${localTime(openIssue.other)}${
                        openIssue.other.source_name ? ` (${openIssue.other.source_name})` : ""
                      }. Celui-ci vient de : ${open.source_name ?? "source inconnue"}.`
                    : `${vesselName(open.vessel_id)} fait aussi ${routeLabel(openIssue.other.route_id)} le ${longDay(localDay(openIssue.other))} à ${localTime(openIssue.other)} : les deux trajets se chevauchent.`}
                </p>
                {(() => {
                  const route = routeOf(open.route_id);
                  if (!route) return null;
                  const links = verificationLinks({
                    from: portOf(route.departure_port_id)?.name ?? "",
                    to: portOf(route.arrival_port_id)?.name ?? "",
                    company: companyName(open.company_id),
                    departureAt: open.departure_at,
                  });
                  return <VerifyLinks directFerries={links.directFerries} search={links.search} />;
                })()}
                {openIssue.kind === "duplicate" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={merge.isPending}
                      onClick={() => merge.mutate({ keep: open.id, remove: openIssue.other.id })}
                    >
                      Garder celui-ci ({localTime(open)})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={merge.isPending}
                      onClick={() => merge.mutate({ keep: openIssue.other.id, remove: open.id })}
                    >
                      Garder {localTime(openIssue.other)}
                    </Button>
                  </div>
                )}
              </div>
            )}

            <section>
              <h3 className="text-sm font-semibold">Navire</h3>
              <ul className="mt-2 grid gap-2">
                {fleet.map(({ vessel, blocker, suggested }) => {
                  const current = open.vessel_id === vessel.id;
                  return (
                    <li
                      key={vessel.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${
                        current
                          ? "border-primary"
                          : blocker
                            ? "border-border bg-muted/40"
                            : "border-border"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{vessel.name}</p>
                        <p
                          className={`text-xs ${blocker && !current ? "text-muted-foreground" : "text-foreground/70"}`}
                        >
                          {current
                            ? "Bateau actuel de cette traversée."
                            : blocker
                              ? `Indisponible : ${routeLabel(blocker.route_id)} le ${longDay(localDay(blocker))} à ${localTime(blocker)}.`
                              : suggested
                                ? "Proposition sûre pour ce créneau."
                                : "Disponible à cette heure-là."}
                        </p>
                      </div>
                      {current ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={assign.isPending}
                          onClick={() => assign.mutate({ id: open.id, vesselId: null })}
                        >
                          Retirer
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={suggested ? "default" : "outline"}
                          disabled={assign.isPending || !!blocker}
                          onClick={() => assign.mutate({ id: open.id, vesselId: vessel.id })}
                        >
                          {suggested ? "Accepter" : "Affecter"}
                        </Button>
                      )}
                    </li>
                  );
                })}
                {fleet.length === 0 && (
                  <li className="text-sm text-muted-foreground">
                    Aucun navire actif pour cette compagnie : ajoutez-le dans « Navires ».
                  </li>
                )}
              </ul>
            </section>

            <section className="grid gap-2">
              <h3 className="text-sm font-semibold">Horaire, durée, statut</h3>
              {editing ? (
                renderEditor(open.id, () => {
                  setEditing(false);
                  refresh();
                })
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-self-start"
                  onClick={() => setEditing(true)}
                >
                  Modifier l'horaire ou la durée
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Source : {open.source_name ?? "non renseignée"}
                {open.schedule_id ? " · générée par un calendrier récurrent" : ""}
              </p>
            </section>
          </div>
        </AdminDrawer>
      ) : null}
    </div>
  );
}

function Legend({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-3 rounded border ${className}`} aria-hidden />
      {children}
    </span>
  );
}
