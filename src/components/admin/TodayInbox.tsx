import { useState, type ReactNode } from "react";
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
  findPlanningIssues,
  mergeDepartures,
  parisKey,
  planningDeparturesQuery,
  programmeEnds,
  suggestVessels,
  verificationLinks,
  type PlanningDeparture,
  type PlanningIssue,
} from "@/lib/admin/planning";

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
  onOpenPlanning,
  onOpenVessel,
  onImport,
}: {
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

  // Problèmes à venir, regroupés en séries : même liaison, même bateau, même jour de semaine.
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

  const suggestions = suggestVessels(departures, vessels, now);
  const unassigned = upcoming.filter((d) => !d.vessel_id && d.status !== "cancelled");
  const suggestionByCompany = new Map<string, number>();
  for (const s of suggestions) {
    const d = departures.find((item) => item.id === s.departureId);
    if (d) suggestionByCompany.set(d.company_id, (suggestionByCompany.get(d.company_id) ?? 0) + 1);
  }

  const withoutMmsi = vessels.filter((v) => v.status === "active" && !v.mmsi);
  const ends = [...programmeEnds(upcoming).entries()]
    .filter(([, last]) => Date.parse(last) < now + 120 * 86_400_000)
    .sort((a, b) => a[1].localeCompare(b[1]));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["departures"] });
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  };
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
        description: "Chaque bateau peut encore être changé depuis le planning.",
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
    cards.push(
      <InboxCard
        key={group.key}
        tone="danger"
        icon={<AlertTriangle className="size-5" aria-hidden />}
        kind={count > 1 ? `Conflit de bateau · ${count} cas` : "Conflit de bateau"}
        title={`${vesselName(sample.first.vessel_id)} repart avant d'être arrivé`}
        detail={`Premier cas : ${routeLabel(sample.first.route_id)} le ${dayLabel(sample.first.departure_at)} à ${parisKey(sample.first.departure_at).time}, puis ${routeLabel(sample.second.route_id)} à ${parisKey(sample.second.departure_at).time} le ${dayLabel(sample.second.departure_at, { weekday: undefined })}. Une durée ou un bateau est sans doute faux.`}
        links={verify(sample.first)}
      >
        <Button size="sm" variant="ghost" onClick={() => ignore(group.issues.map((i) => i.key))}>
          Ignorer
        </Button>
        <Button
          size="sm"
          onClick={() => onOpenPlanning(parisKey(sample.first.departure_at).day, "issues")}
        >
          Corriger dans le planning
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
        title={`${suggestions.length} traversée${suggestions.length > 1 ? "s" : ""} sans bateau ont une proposition sûre`}
        detail={`${breakdown}. Proposé quand la compagnie n'a qu'un navire ou quand le même bateau fait toujours ce créneau, et jamais s'il est déjà pris à cette heure-là.${
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
            if (window.confirm(`Affecter les ${suggestions.length} bateaux proposés ?`))
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
        detail="Aucune proposition sûre : choisissez le bateau dans le planning, les navires indisponibles y sont grisés."
      >
        <Button size="sm" onClick={() => onOpenPlanning(undefined, "unassigned")}>
          Ouvrir le planning
        </Button>
      </InboxCard>,
    );
  }

  for (const vessel of withoutMmsi) {
    cards.push(
      <InboxCard
        key={`mmsi-${vessel.id}`}
        tone="info"
        icon={<Radio className="size-5" aria-hidden />}
        kind="Fiche incomplète"
        title={`${vessel.name} n'a pas de MMSI : sa position n'apparaît pas sur la carte`}
        detail="Le MMSI (9 chiffres) se trouve sur MarineTraffic ou VesselFinder."
      >
        <Button size="sm" onClick={() => onOpenVessel(vessel.id)}>
          Ajouter le MMSI
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

  return (
    <section aria-labelledby="today-title" className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-title" className="text-lg font-semibold">
          À régler
        </h2>
        <span className="text-sm text-muted-foreground">
          {upcoming.length} traversées à venir · {unassigned.length} sans bateau
        </span>
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

/** Vérifier l'horaire ailleurs avant de trancher : page de la liaison et recherche datée. */
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
