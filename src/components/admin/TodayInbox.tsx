import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarRange, CheckCircle2, Copy, Radio, Ship } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  adminPortsQuery,
  adminRoutesQuery,
  companiesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import {
  assignVessels,
  findConsistencyIssues,
  findPlanningIssues,
  mergeDepartures,
  parisKey,
  planningDeparturesQuery,
  programmeEnds,
  verificationLinks,
  type PlanningDeparture,
  type PlanningIssue,
} from "@/lib/admin/planning";
import { runAutoAssign, visibleSuggestions } from "@/lib/admin/autoAssign";
import { fixChanges, isOverlap, proposeFix, type FixProposal } from "@/lib/admin/fixProposals";
import { incidentContradiction, incidentsQuery } from "@/lib/ferry/incidents";
import { vesselElsewhere } from "@/lib/ferry/tracking";
import {
  aisHealthQuery,
  ageLabel,
  COLLECTOR_STALE_MINUTES,
  SILENT_HOURS,
} from "@/lib/admin/aisHealth";
import { assignConfigQuery, assignDb, scheduleVesselsQuery } from "@/lib/admin/assignQueries";

const IGNORED_KEY = "bw-admin-ignored-issues";

function readIgnored(): string[] {
  try {
    return JSON.parse(localStorage.getItem(IGNORED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

const dayLabel = (value: string, options: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    ...options,
  }).format(new Date(value));

type IssueGroup = {
  key: string;
  kind: PlanningIssue["kind"];
  issues: PlanningIssue[];
};

/**
 * « Aujourd'hui » : la liste des points à régler, classés par urgence, avec l'action
 * directement sur la carte. Les séries (même doublon chaque semaine) se règlent en une fois.
 */
export function TodayInbox({
  view = "today",
  onOpenPlanning,
  onOpenVessel,
  onImport,
}: {
  /** « health » : la page Santé technique, séparée de la file du matin. */
  view?: "today" | "health";
  onOpenPlanning: (date?: string, filter?: "unassigned" | "issues") => void;
  onOpenVessel: (id: string) => void;
  onImport: () => void;
}) {
  const queryClient = useQueryClient();
  const departuresQuery = useQuery(planningDeparturesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: routes = [] } = useQuery(adminRoutesQuery);
  const { data: ports = [] } = useQuery(adminPortsQuery);
  const [ignored, setIgnored] = useState<string[]>(readIgnored);

  const now = Date.now();
  const departures = departuresQuery.data ?? [];
  const upcoming = departures.filter((d) => Date.parse(d.departure_at) >= now);
  const portName = (id: string) => ports.find((p) => p.id === id)?.name ?? "?";
  const routeLabel = (id: string) => {
    const route = routes.find((r) => r.id === id);
    return route
      ? `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`
      : "Liaison";
  };
  const vesselName = (id: string | null) => vessels.find((v) => v.id === id)?.name ?? "sans bateau";
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "Compagnie";
  const verify = (d: PlanningDeparture) => {
    const route = routes.find((r) => r.id === d.route_id);
    if (!route) return null;
    const links = verificationLinks({
      from: portName(route.departure_port_id),
      to: portName(route.arrival_port_id),
      company: companyName(d.company_id),
      departureAt: d.departure_at,
    });
    return <VerifyLinks directFerries={links.directFerries} search={links.search} />;
  };

  // Problèmes à venir, regroupés en séries : même ligne, même navire, même jour de semaine.
  const issues = findPlanningIssues(departures).filter(
    (issue) => Date.parse(issue.first.departure_at) >= now && !ignored.includes(issue.key),
  );
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const { weekday } = parisKey(issue.first.departure_at);
    const key =
      issue.kind === "duplicate"
        ? `d|${issue.first.route_id}|${issue.first.vessel_id ?? issue.first.company_id}|${weekday}`
        : `c|${issue.first.vessel_id}`;
    const group = groups.get(key) ?? { key, kind: issue.kind, issues: [] };
    group.issues.push(issue);
    groups.set(key, group);
  }
  const duplicateGroups = [...groups.values()].filter((g) => g.kind === "duplicate");
  const conflictGroups = [...groups.values()].filter((g) => g.kind === "conflict");

  const config = useQuery(assignConfigQuery).data;
  const scheduleVessels = useQuery(scheduleVesselsQuery).data;
  const suggestions = config
    ? visibleSuggestions(departures, vessels, config, scheduleVessels ?? new Map(), now)
    : [];
  const unassigned = upcoming.filter((d) => !d.vessel_id && d.status !== "cancelled");
  const suggestionByCompany = new Map<string, number>();
  for (const s of suggestions) {
    const d = departures.find((item) => item.id === s.departureId);
    if (d) suggestionByCompany.set(d.company_id, (suggestionByCompany.get(d.company_id) ?? 0) + 1);
  }

  const withoutMmsi = vessels.filter((v) => v.status === "active" && !v.mmsi);
  const aisHealth = useQuery(aisHealthQuery).data;
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const staffReports = useQuery({
    queryKey: ["admin", "staff-reports"],
    queryFn: async () => {
      const { data } = await assignDb
        .from("reports")
        .select("target_type")
        .in("target_type", ["vessel", "company"])
        .eq("status", "new");
      const rows = (data ?? []) as { target_type: string }[];
      return {
        vessel: rows.filter((r) => r.target_type === "vessel").length,
        company: rows.filter((r) => r.target_type === "company").length,
      };
    },
  }).data ?? { vessel: 0, company: 0 };
  const ends = [...programmeEnds(upcoming).entries()]
    .filter(([, last]) => Date.parse(last) < now + 120 * 86_400_000)
    .sort((a, b) => a[1].localeCompare(b[1]));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["departures"] });
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  };

  // Compagnies en « Automatique » : leurs propositions sont appliquées dès l'ouverture,
  // une fois par visite, avec un bouton pour annuler le passage.
  const autoRan = useRef(false);
  useEffect(() => {
    if (
      view !== "today" ||
      autoRan.current ||
      !config?.installed ||
      !departuresQuery.data ||
      !vessels.length ||
      !scheduleVessels
    )
      return;
    if (![...config.modes.values()].includes("auto")) return;
    autoRan.current = true;
    void runAutoAssign(assignDb, {
      departures: departuresQuery.data,
      vessels,
      config,
      scheduleVessel: scheduleVessels,
      source: "admin",
    })
      .then(({ count, logId }) => {
        if (!count) return;
        refresh();
        toast.success(
          `${count} traversée${count > 1 ? "s" : ""} affectée${count > 1 ? "s" : ""} automatiquement.`,
          {
            duration: 15_000,
            description: "Compagnies réglées en « Automatique » dans Affectation auto.",
            ...(logId
              ? {
                  action: {
                    label: "Annuler",
                    onClick: () =>
                      void assignDb
                        .rpc("bw_admin_undo_assign", { p_log: logId })
                        .then(({ error }) =>
                          error
                            ? toast.error(error.message)
                            : (toast.success("Affectation annulée."), refresh()),
                        ),
                  },
                }
              : {}),
          },
        );
      })
      .catch((error: Error) => toast.error(`Affectation automatique : ${error.message}`));
    // refresh ne dépend que du client de requêtes, stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, departuresQuery.data, vessels, scheduleVessels]);

  const ignore = (keys: string[]) => {
    const next = [...new Set([...ignored, ...keys])];
    setIgnored(next);
    try {
      localStorage.setItem(IGNORED_KEY, JSON.stringify(next));
    } catch {
      /* stockage indisponible : l'écart vaut pour cette visite */
    }
  };

  const accept = useMutation({
    mutationFn: () => assignVessels(suggestions),
    onSuccess: (count) => {
      toast.success(`${count} traversée${count > 1 ? "s" : ""} affectée${count > 1 ? "s" : ""}.`, {
        description: "Chaque navire peut encore être changé depuis le planning.",
      });
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const merge = useMutation({
    mutationFn: async ({ group, keep }: { group: IssueGroup; keep: "first" | "second" }) => {
      let done = 0;
      for (const issue of group.issues) {
        const [kept, removed] =
          keep === "first" ? [issue.first, issue.second] : [issue.second, issue.first];
        await mergeDepartures(kept.id, removed.id);
        done += 1;
      }
      return done;
    },
    onSuccess: (count) => {
      toast.success(`${count} doublon${count > 1 ? "s" : ""} fusionné${count > 1 ? "s" : ""}.`, {
        description: "Les voyageurs qui suivaient l'horaire retiré suivent désormais celui gardé.",
      });
      refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh();
    },
  });

  // Corrections proposées : appliquées d'un clic, et annulables tout de suite.
  const writeChanges = async (rows: { id: string; values: Record<string, unknown> }[]) => {
    for (const row of rows) {
      const { error } = await assignDb.from("departures").update(row.values).eq("id", row.id);
      if (error) throw new Error(error.message);
    }
  };
  const applyFixes = useMutation({
    mutationFn: async (fixes: FixProposal[]) => {
      const changes = fixes.map(fixChanges);
      await writeChanges(changes.map((c) => ({ id: c.id, values: c.apply })));
      return changes;
    },
    onSuccess: (changes) => {
      refresh();
      toast.success(`${changes.length} correction${changes.length > 1 ? "s" : ""} appliquée${changes.length > 1 ? "s" : ""}.`, {
        duration: 20_000,
        action: {
          label: "Annuler",
          onClick: () =>
            void writeChanges(changes.map((c) => ({ id: c.id, values: c.undo })))
              .then(() => {
                refresh();
                toast.success("Corrections annulées.");
              })
              .catch((error: Error) => toast.error(error.message)),
        },
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh();
    },
  });

  if (departuresQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Analyse du planning…</p>;
  }
  if (departuresQuery.error) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
      >
        Planning illisible : {departuresQuery.error.message}
      </p>
    );
  }

  const describeTimes = (d: PlanningDeparture) => {
    const { time } = parisKey(d.departure_at);
    return `${time}${d.source_name ? ` (${d.source_name})` : ""}`;
  };

  const cards: ReactNode[] = [];
  const health: ReactNode[] = [];

  for (const group of duplicateGroups) {
    const sample = group.issues[0]!;
    const count = group.issues.length;
    const weekday = dayLabel(sample.first.departure_at, {
      weekday: "long",
      day: undefined,
      month: undefined,
    });
    cards.push(
      <InboxCard
        key={group.key}
        tone="danger"
        icon={<Copy className="size-5" aria-hidden />}
        kind={count > 1 ? `Doublon répété ${count} fois` : "Doublon probable"}
        title={`${
          sample.first.vessel_id
            ? vesselName(sample.first.vessel_id)
            : companyName(sample.first.company_id)
        } : deux départs ${routeLabel(sample.first.route_id)} le même jour`}
        detail={
          count > 1
            ? `Chaque ${weekday} à partir du ${dayLabel(sample.first.departure_at, { weekday: undefined })} : ${describeTimes(sample.first)} et ${describeTimes(sample.second)}. Probablement deux programmes qui se superposent.`
            : `Le ${dayLabel(sample.first.departure_at)} : ${describeTimes(sample.first)} et ${describeTimes(sample.second)}.`
        }
        links={verify(sample.first)}
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => onOpenPlanning(parisKey(sample.first.departure_at).day, "issues")}
        >
          Comparer
        </Button>
        <Button size="sm" variant="ghost" onClick={() => ignore(group.issues.map((i) => i.key))}>
          Ce sont deux départs
        </Button>
        <Button
          size="sm"
          disabled={merge.isPending}
          onClick={() => {
            if (
              window.confirm(
                `Garder le départ de ${parisKey(sample.first.departure_at).time} et fusionner ${count} doublon(s) ? Les suivis des voyageurs sont transférés.`,
              )
            )
              merge.mutate({ group, keep: "first" });
          }}
        >
          Garder {parisKey(sample.first.departure_at).time}
        </Button>
        <Button
          size="sm"
          disabled={merge.isPending}
          onClick={() => {
            if (
              window.confirm(
                `Garder le départ de ${parisKey(sample.second.departure_at).time} et fusionner ${count} doublon(s) ? Les suivis des voyageurs sont transférés.`,
              )
            )
              merge.mutate({ group, keep: "second" });
          }}
        >
          Garder {parisKey(sample.second.departure_at).time}
        </Button>
      </InboxCard>,
    );
  }

  for (const group of conflictGroups) {
    const sample = group.issues[0]!;
    const count = group.issues.length;
    const overlaps = group.issues.some(isOverlap);
    // Un même départ peut être en cause dans deux conflits : une seule correction par départ.
    const fixes = [
      ...new Map(
        group.issues.flatMap((issue) => {
          const fix = proposeFix(issue, departures);
          return fix ? [[fix.departure.id, fix] as const] : [];
        }),
      ).values(),
    ];
    const describe = (fix: FixProposal) => {
      const when = `${routeLabel(fix.departure.route_id)} du ${dayLabel(fix.departure.departure_at, { weekday: undefined })}`;
      return fix.kind === "shift"
        ? `${when} : passer le départ de ${parisKey(fix.departure.departure_at).time} à ${fix.toTime}`
        : `${when} : retirer ce navire, le départ reste publié avec « navire à choisir »`;
    };
    const covered = group.issues.filter((issue) => proposeFix(issue, departures)).length;
    cards.push(
      <InboxCard
        key={group.key}
        tone={overlaps ? "danger" : "warn"}
        icon={<AlertTriangle className="size-5" aria-hidden />}
        kind={`${overlaps ? "Conflit de navire" : "Escale courte"}${count > 1 ? ` · ${count} cas` : ""}`}
        title={
          overlaps
            ? `${vesselName(sample.first.vessel_id)} est prévu à deux endroits en même temps`
            : `${vesselName(sample.first.vessel_id)} repart moins de 3 h après son arrivée`
        }
        detail={`Premier cas : ${routeLabel(sample.first.route_id)} le ${dayLabel(sample.first.departure_at)} à ${parisKey(sample.first.departure_at).time}, puis ${routeLabel(sample.second.route_id)} à ${parisKey(sample.second.departure_at).time} le ${dayLabel(sample.second.departure_at, { weekday: undefined })}.`}
        links={
          <>
            {fixes.length ? (
              <div className="mt-2 rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-950">
                <p className="font-semibold">
                  Correction proposée{fixes.length > 1 ? `s (${fixes.length})` : ""}
                </p>
                <ul className="mt-1 grid gap-0.5">
                  {fixes.slice(0, 3).map((fix) => (
                    <li key={fix.departure.id}>{describe(fix)}</li>
                  ))}
                  {fixes.length > 3 ? <li>et {fixes.length - 3} autre(s)</li> : null}
                </ul>
                <p className="mt-1 text-xs">Preuve : {fixes[0]!.evidence}</p>
                <p className="mt-1 text-xs text-emerald-900/80">
                  Déduit des données de BledWay, pas d'un horaire publié par la compagnie.
                </p>
              </div>
            ) : null}
            {covered < count ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {fixes.length ? `${count - covered} cas sans proposition : ` : ""}
                Rien dans les données ne permet de trancher, et aucun programme officiel n'est
                enregistré pour cette période. Seule la compagnie peut confirmer.
              </p>
            ) : null}
            {verify(sample.first)}
          </>
        }
      >
        <Button size="sm" variant="ghost" onClick={() => ignore(group.issues.map((i) => i.key))}>
          {overlaps ? "Ignorer" : "Escale acceptée"}
        </Button>
        <Button
          size="sm"
          variant={fixes.length ? "outline" : "default"}
          onClick={() => onOpenPlanning(parisKey(sample.first.departure_at).day, "issues")}
        >
          Voir dans le planning
        </Button>
        {fixes.length ? (
          <Button
            size="sm"
            disabled={applyFixes.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Appliquer ${fixes.length} correction(s) ?\n\n${fixes.map(describe).join("\n")}\n\nLes voyageurs qui suivent ces départs verront la mise à jour. Vous pourrez annuler juste après.`,
                )
              )
                applyFixes.mutate(fixes);
            }}
          >
            Appliquer {fixes.length > 1 ? `les ${fixes.length}` : "la correction"}
          </Button>
        ) : null}
      </InboxCard>,
    );
  }

  const consistency = findConsistencyIssues(
    upcoming,
    vessels,
    routes.map((route) => ({ id: route.id, company_ids: route.company_ids ?? [] })),
  ).filter((issue) => !ignored.includes(issue.key));
  for (const issue of consistency) {
    cards.push(
      <InboxCard
        key={issue.key}
        tone="warn"
        icon={<AlertTriangle className="size-5" aria-hidden />}
        kind={issue.kind === "foreign-vessel" ? "Navire d'une autre compagnie" : "Compagnie absente de la ligne"}
        title={
          issue.kind === "foreign-vessel"
            ? `${vesselName(issue.vesselId)} est affecté à ${issue.count} départ${issue.count > 1 ? "s" : ""} ${companyName(issue.companyId)}`
            : `${companyName(issue.companyId)} a ${issue.count} départ${issue.count > 1 ? "s" : ""} sur une ligne où elle n'est pas indiquée`
        }
        detail={`${routeLabel(issue.routeId)}, à partir du ${dayLabel(issue.first.departure_at)}.`}
        links={verify(issue.first)}
      >
        <Button size="sm" variant="ghost" onClick={() => ignore([issue.key])}>
          Ignorer
        </Button>
        <Button size="sm" onClick={() => onOpenPlanning(parisKey(issue.first.departure_at).day)}>
          Ouvrir dans le planning
        </Button>
      </InboxCard>,
    );
  }

  if (suggestions.length) {
    const breakdown = [...suggestionByCompany.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${n} chez ${companyName(id)}`)
      .join(", ");
    cards.push(
      <InboxCard
        key="suggestions"
        tone="success"
        icon={<Ship className="size-5" aria-hidden />}
        kind="Affectation proposée"
        title={`${suggestions.length} traversée${suggestions.length > 1 ? "s" : ""} sans navire ont une proposition sûre`}
        detail={`${breakdown}. Proposé quand la compagnie n'a qu'un navire ou quand le même navire fait toujours ce créneau, et jamais s'il est déjà pris à cette heure-là.${
          unassigned.length > suggestions.length
            ? ` Les ${unassigned.length - suggestions.length} autres restent à choisir.`
            : ""
        }`}
      >
        <Button size="sm" variant="outline" onClick={() => onOpenPlanning(undefined, "unassigned")}>
          Voir une par une
        </Button>
        <Button
          size="sm"
          disabled={accept.isPending}
          onClick={() => {
            if (window.confirm(`Affecter les ${suggestions.length} navires proposés ?`))
              accept.mutate();
          }}
        >
          {accept.isPending ? "Affectation…" : `Accepter les ${suggestions.length}`}
        </Button>
      </InboxCard>,
    );
  } else if (unassigned.length) {
    cards.push(
      <InboxCard
        key="unassigned"
        tone="warn"
        icon={<Ship className="size-5" aria-hidden />}
        kind="Bateau à choisir"
        title={`${unassigned.length} traversée${unassigned.length > 1 ? "s" : ""} à venir sans bateau`}
        detail="Aucune proposition sûre : choisissez le navire dans le planning, les navires indisponibles y sont grisés."
      >
        <Button size="sm" onClick={() => onOpenPlanning(undefined, "unassigned")}>
          Ouvrir le planning
        </Button>
      </InboxCard>,
    );
  }

  // Santé du signal AIS : collecteur permanent, puis navires muets.
  if (aisHealth) {
    const seen = aisHealth.collectorSeen;
    if (!seen || now - Date.parse(seen) > COLLECTOR_STALE_MINUTES * 60_000) {
      health.push(
        <InboxCard
          key="ais-collector"
          tone="warn"
          icon={<Radio className="size-5" aria-hidden />}
          kind="Suivi en direct"
          title={
            seen
              ? `L'écoute des navires ne passe plus (dernier passage ${ageLabel(seen, now)})`
              : "L'écoute des navires n'est pas encore programmée"
          }
          detail="Sans elle, les positions ne bougent que lorsqu'un visiteur ouvre la carte. Le réglage se fait dans l'éditeur Supabase."
        >
          <Button size="sm" variant="outline" asChild>
            <a
              href="https://supabase.com/dashboard/project/lwyjhgyuqyflaanrbgkq/sql/new"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ouvrir l'éditeur SQL
            </a>
          </Button>
        </InboxCard>,
      );
    }
    // Signalements de voyageurs à vérifier vite : navire immobilisé, contact de compagnie périmé.
    if (staffReports.vessel + staffReports.company > 0) {
      cards.unshift(
        <InboxCard
          key="staff-reports"
          tone="danger"
          icon={<AlertTriangle className="size-5" aria-hidden />}
          kind="Signalement à vérifier"
          title={`${staffReports.vessel} navire(s) et ${staffReports.company} contact(s) de compagnie signalés`}
          detail="Rien n'est public sans votre validation."
        >
          <Button size="sm" asChild>
            <a href={staffReports.vessel ? "/admin?tab=incidents" : "/admin?tab=reports"}>Vérifier</a>
          </Button>
        </InboxCard>,
      );
    }
    // Le signal AIS contredit un dossier public : à revoir, le dossier n'est jamais levé seul.
    for (const incident of incidents) {
      const vessel = vessels.find((v) => v.id === incident.vessel_id);
      const conflict = vessel?.mmsi
        ? incidentContradiction(incident, aisHealth.positions.get(Number(vessel.mmsi)), ports)
        : null;
      if (!conflict) continue;
      cards.unshift(
        <InboxCard
          key={`incident-ais-${incident.id}`}
          tone="danger"
          icon={<AlertTriangle className="size-5" aria-hidden />}
          kind="Dossier à revoir"
          title={`${vessel?.name} : le signal AIS contredit le dossier`}
          detail={
            conflict === "moving"
              ? "Le navire semble en mouvement alors qu'il est annoncé immobilisé."
              : "Le navire semble ailleurs que dans le port du dossier."
          }
        >
          <Button size="sm" asChild>
            <a href="/admin?tab=incidents">Revoir le dossier</a>
          </Button>
        </InboxCard>,
      );
    }
    // Navire à quai dans un autre port que son prochain départ : retard probable ou mauvais bateau.
    for (const d of upcoming) {
      if (!d.vessel_id || Date.parse(d.departure_at) > now + 12 * 3_600_000) continue;
      const vessel = vessels.find((v) => v.id === d.vessel_id);
      const position = vessel?.mmsi ? aisHealth.positions.get(Number(vessel.mmsi)) : undefined;
      const elsewhere = position ? vesselElsewhere(d, position, routes, now, ports) : null;
      if (!vessel || !elsewhere) continue;
      cards.push(
        <InboxCard
          key={`elsewhere-${d.id}`}
          tone="danger"
          icon={<Ship className="size-5" aria-hidden />}
          kind="Navire au mauvais port"
          title={`${vessel.name} est à ${portName(elsewhere.portId)}, mais il est prévu au départ de ${routeLabel(d.route_id)} ${dayLabel(d.departure_at)} à ${parisKey(d.departure_at).time}`}
          detail={`Signal AIS ${ageLabel(elsewhere.reportedAt, now)}. Soit le départ sera retardé, soit un autre navire fera la traversée : vérifiez auprès de la compagnie, puis corrigez le navire ou l'horaire. Les voyageurs voient déjà « ${vessel.name} est encore à ${portName(elsewhere.portId)} ».`}
          links={verify(d)}
        >
          <Button size="sm" onClick={() => onOpenPlanning(parisKey(d.departure_at).day)}>
            Ouvrir dans le planning
          </Button>
        </InboxCard>,
      );
    }

    const silent = vessels.filter((v) => {
      if (v.status !== "active" || !v.mmsi) return false;
      const last = aisHealth.lastSignal.get(Number(v.mmsi));
      return !last || now - Date.parse(last) > SILENT_HOURS * 3_600_000;
    });
    if (silent.length) {
      health.push(
        <InboxCard
          key="ais-silent"
          tone="info"
          icon={<Radio className="size-5" aria-hidden />}
          kind="Signal des navires"
          title={`${silent.length} navire(s) sans signal depuis plus de ${SILENT_HOURS} h`}
          detail={`${silent
            .map((v) => `${v.name} (${ageLabel(aisHealth.lastSignal.get(Number(v.mmsi)), now)})`)
            .join(
              ", ",
            )}. Un navire jamais reçu a souvent un identifiant faux. Les autres peuvent être en arrêt technique ou hors de portée des antennes.`}
        >
          <Button size="sm" variant="outline" onClick={() => onOpenVessel(silent[0]!.id)}>
            Vérifier la fiche
          </Button>
        </InboxCard>,
      );
    }
  }

  for (const vessel of withoutMmsi) {
    health.push(
      <InboxCard
        key={`mmsi-${vessel.id}`}
        tone="info"
        icon={<Radio className="size-5" aria-hidden />}
        kind="Fiche incomplète"
        title={`${vessel.name} n'a pas d'identifiant : sa position n'apparaît pas sur la carte`}
        detail="L'identifiant (MMSI, 9 chiffres) se trouve sur MarineTraffic ou VesselFinder."
      >
        <Button size="sm" onClick={() => onOpenVessel(vessel.id)}>
          Ajouter l'identifiant
        </Button>
      </InboxCard>,
    );
  }

  if (ends.length) {
    cards.push(
      <InboxCard
        key="ends"
        tone="warn"
        icon={<CalendarRange className="size-5" aria-hidden />}
        kind="Fin de programme"
        title="Des programmes publiés s'arrêtent bientôt"
        detail={`${ends
          .map(
            ([id, last]) => `${companyName(id)} jusqu'au ${dayLabel(last, { weekday: undefined })}`,
          )
          .join(
            " · ",
          )}. Au-delà, les voyageurs ne trouvent rien : importez la saison suivante dès qu'elle est publiée.`}
      >
        <Button size="sm" onClick={onImport}>
          Importer une saison
        </Button>
      </InboxCard>,
    );
  }

  if (view === "health")
    return health.length ? (
      <div className="grid gap-3">{health}</div>
    ) : (
      <p className="flex items-center gap-2 rounded-xl border border-border bg-white p-4 text-sm">
        <CheckCircle2 className="size-5 text-primary" aria-hidden /> Tout fonctionne normalement.
      </p>
    );

  return (
    <section aria-labelledby="today-title" className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-title" className="text-lg font-semibold">
          {cards.length ? `${cards.length} point${cards.length > 1 ? "s" : ""} à régler` : "À régler"}
        </h2>
      </div>
      {cards.length ? (
        <div className="grid gap-3">{cards}</div>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-border bg-white p-4 text-sm">
          <CheckCircle2 className="size-5 text-primary" aria-hidden /> Tout est à jour dans le
          planning.
        </p>
      )}
      {ignored.length > 0 && (
        <button
          type="button"
          className="mt-2 text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => {
            setIgnored([]);
            try {
              localStorage.removeItem(IGNORED_KEY);
            } catch {
              /* rien à faire */
            }
          }}
        >
          Réafficher les {ignored.length} point(s) écarté(s)
        </button>
      )}
    </section>
  );
}

const tones = {
  danger: "bg-red-50 text-red-700",
  warn: "bg-amber-50 text-amber-800",
  success: "bg-emerald-50 text-emerald-700",
  info: "bg-blue-50 text-blue-700",
};

function InboxCard({
  tone,
  icon,
  kind,
  title,
  detail,
  links,
  children,
}: {
  tone: keyof typeof tones;
  icon: ReactNode;
  kind: string;
  title: string;
  detail: string;
  links?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-white p-4">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
        {icon}
      </span>
      <div className="min-w-[16rem] flex-[999_1_20rem]">
        <p
          className={`text-[11px] font-semibold uppercase tracking-wide ${tones[tone].split(" ")[1]}`}
        >
          {kind}
        </p>
        <p className="mt-0.5 text-sm font-semibold leading-snug">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{detail}</p>
        {links}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </article>
  );
}

/** Vérifier l'horaire ailleurs avant de trancher : page de la ligne et recherche datée. */
export function VerifyLinks({ directFerries, search }: { directFerries: string; search: string }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold">
      <span className="font-normal text-muted-foreground">Vérifier en ligne :</span>
      <a
        href={directFerries}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2"
      >
        Direct Ferries ↗
      </a>
      <a
        href={search}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2"
      >
        Recherche Google (date du départ) ↗
      </a>
    </p>
  );
}
