import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { companiesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { planningDeparturesQuery, suggestVessels, type AssignRules } from "@/lib/admin/planning";
import { runAutoAssign, type AssignMode } from "@/lib/admin/autoAssign";
import { assignConfigQuery, assignDb, scheduleVesselsQuery } from "@/lib/admin/assignQueries";

const SQL_HINT =
  "Exécutez d'abord le script SQL « affectation_auto » (supabase/migrations/20261110150000_affectation_auto.sql) dans Supabase.";

const RULES: {
  key: keyof AssignRules;
  reason: string;
  title: string;
  text: string;
  level: string;
}[] = [
  {
    key: "onlyVessel",
    reason: "only-vessel",
    title: "Seul navire de la compagnie",
    text: "Si la compagnie n'a qu'un navire actif, c'est lui.",
    level: "Sûre",
  },
  {
    key: "schedule",
    reason: "schedule",
    title: "Bateau prévu par le programme",
    text: "Le calendrier récurrent qui a créé la traversée indique un bateau par défaut.",
    level: "Sûre",
  },
  {
    key: "usualSlot",
    reason: "usual-slot",
    title: "Même créneau que d'habitude",
    text: "Même liaison, même jour de la semaine, même heure : toujours le même bateau jusqu'ici.",
    level: "Probable",
  },
];

type LogRow = {
  id: string;
  source: "admin" | "cron" | "import";
  items: { departure_id: string }[];
  created_at: string;
  undone_at: string | null;
};

/**
 * Affectation automatique : les règles, puis compagnie par compagnie « Automatique »,
 * « Proposer » ou « Manuel ». Un navire déjà pris à cette heure-là n'est jamais affecté.
 */
export function AssignSettings() {
  const queryClient = useQueryClient();
  const configQuery = useQuery(assignConfigQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: departures = [] } = useQuery(planningDeparturesQuery);
  const { data: scheduleVessels } = useQuery(scheduleVesselsQuery);
  const logQuery = useQuery({
    queryKey: ["admin", "assign-log"],
    queryFn: async () => {
      const { data, error } = await assignDb
        .from("bw_assign_log")
        .select("id, source, items, created_at, undone_at")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw new Error(error.message);
      return (data ?? []) as LogRow[];
    },
    retry: false,
  });
  const config = configQuery.data;
  const installed = config?.installed ?? false;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
    void queryClient.invalidateQueries({ queryKey: ["departures"] });
  };

  const now = Date.now();
  const allRulesOn = { onlyVessel: true, schedule: true, usualSlot: true };
  // Ce que chaque règle produirait aujourd'hui (toutes règles actives, pour comparer).
  const preview = suggestVessels(
    departures,
    vessels,
    now,
    allRulesOn,
    scheduleVessels ?? new Map(),
  );
  const current = config
    ? suggestVessels(departures, vessels, now, config.rules, scheduleVessels ?? new Map())
    : [];
  const companyOf = new Map(departures.map((d) => [d.id, d.company_id]));

  const saveRules = useMutation({
    mutationFn: async (rules: AssignRules) => {
      const { error } = await assignDb
        .from("bw_admin_settings")
        .upsert({ key: "assign_rules", value: rules, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Règles enregistrées.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveMode = useMutation({
    mutationFn: async ({ companyId, mode }: { companyId: string; mode: AssignMode }) => {
      const { error } = await assignDb
        .from("bw_assign_settings")
        .upsert({ company_id: companyId, mode, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, { mode }) => {
      toast.success(
        mode === "auto"
          ? "Automatique : les bateaux sûrs seront affectés seuls (chaque matin et à l'ouverture de l'espace équipe)."
          : mode === "suggest"
            ? "Proposer : les bateaux sûrs attendent votre clic dans « Aujourd'hui »."
            : "Manuel : plus aucune proposition pour cette compagnie.",
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const applyNow = useMutation({
    mutationFn: async () => {
      if (!config || !scheduleVessels) throw new Error("Réglages encore en chargement.");
      return runAutoAssign(assignDb, {
        departures,
        vessels,
        config,
        scheduleVessel: scheduleVessels,
        source: "admin",
      });
    },
    onSuccess: ({ count }) => {
      toast.success(
        count
          ? `${count} traversée(s) affectée(s).`
          : "Rien à affecter pour les compagnies en Automatique.",
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const undo = useMutation({
    mutationFn: async (logId: string) => {
      const { data, error } = await assignDb.rpc("bw_admin_undo_assign", { p_log: logId });
      if (error) throw new Error(error.message);
      return data as number;
    },
    onSuccess: (count) => {
      toast.success(`${count} bateau(x) retiré(s) : ces traversées sont de nouveau « à choisir ».`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const autoPending = current.filter(
    (s) => config?.modes.get(companyOf.get(s.departureId) ?? "") === "auto",
  ).length;

  return (
    <div className="grid max-w-5xl gap-5">
      {configQuery.isSuccess && !installed && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {SQL_HINT} En attendant, toutes les compagnies restent en « Proposer » avec toutes les
          règles actives.
        </p>
      )}

      <section className="bw-admin-surface grid gap-3 p-5">
        <h2 className="text-base font-semibold">Les règles, de la plus sûre à la moins sûre</h2>
        {RULES.map((rule, index) => {
          const on = config?.rules[rule.key] ?? true;
          const count = preview.filter((s) => s.reason === rule.reason).length;
          return (
            <div
              key={rule.key}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
            >
              <span className="grid size-8 place-items-center rounded-full bg-foreground text-sm font-bold text-background">
                {index + 1}
              </span>
              <div className="min-w-60 flex-1">
                <p className="text-sm font-semibold">{rule.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {rule.text} Aujourd'hui : {count} traversée(s) concernée(s).
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  rule.level === "Sûre"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-blue-50 text-blue-700"
                }`}
              >
                {rule.level}
              </span>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!installed || saveRules.isPending}
                  onChange={(event) =>
                    config &&
                    saveRules.mutate({ ...config.rules, [rule.key]: event.target.checked })
                  }
                />
                Active
              </label>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Garde-fou permanent : un navire n'est jamais proposé s'il fait déjà une autre traversée à
          cette heure-là (durée et escale d'une heure comprises).
        </p>
      </section>

      <section className="bw-admin-surface grid gap-1 p-5">
        <h2 className="mb-2 text-base font-semibold">Par compagnie</h2>
        {companies.map((company) => {
          const mode: AssignMode = config?.modes.get(company.id) ?? "suggest";
          const unassigned = departures.filter(
            (d) =>
              d.company_id === company.id &&
              !d.vessel_id &&
              d.status !== "cancelled" &&
              Date.parse(d.departure_at) >= now,
          ).length;
          const sure = current.filter((s) => companyOf.get(s.departureId) === company.id).length;
          const fleet = vessels.filter(
            (v) => v.company_id === company.id && v.status === "active",
          ).length;
          return (
            <div
              key={company.id}
              className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-0"
            >
              <div className="min-w-60 flex-1">
                <p className="text-sm font-semibold">{company.name}</p>
                <p className="text-xs text-muted-foreground">
                  {fleet} navire(s) ·{" "}
                  {unassigned
                    ? `${unassigned} traversée(s) sans bateau, dont ${sure} avec une proposition sûre`
                    : "toutes les traversées ont un bateau"}
                </p>
              </div>
              <div
                className="inline-flex overflow-hidden rounded-md border border-border"
                role="group"
                aria-label={`Mode pour ${company.name}`}
              >
                {(
                  [
                    ["auto", "Automatique"],
                    ["suggest", "Proposer"],
                    ["manual", "Manuel"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    disabled={!installed || saveMode.isPending}
                    onClick={() => saveMode.mutate({ companyId: company.id, mode: value })}
                    className={`min-h-9 border-l border-border px-3 text-xs font-semibold first:border-l-0 disabled:opacity-50 ${
                      mode === value ? "bg-foreground text-background" : "bg-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Automatique</strong> : affecté seul chaque matin et à
          l'ouverture de l'espace équipe, inscrit au journal et annulable.{" "}
          <strong className="text-foreground">Proposer</strong> : la proposition attend votre clic
          dans « Aujourd'hui » et le planning. <strong className="text-foreground">Manuel</strong> :
          aucune proposition.
        </p>
        <div className="mt-3">
          <Button
            disabled={!installed || applyNow.isPending || !autoPending}
            onClick={() => applyNow.mutate()}
          >
            {autoPending
              ? `Appliquer maintenant (${autoPending} traversée(s))`
              : "Rien à appliquer maintenant"}
          </Button>
        </div>
      </section>

      {(logQuery.data?.length ?? 0) > 0 && (
        <section className="bw-admin-surface p-5">
          <h2 className="text-base font-semibold">Journal des affectations automatiques</h2>
          <ul className="mt-2 divide-y divide-border">
            {logQuery.data!.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="flex-1">
                  {log.items.length} traversée(s) ·{" "}
                  {log.source === "cron"
                    ? "passage du matin"
                    : log.source === "import"
                      ? "après un import"
                      : "espace équipe"}
                  <span className="block text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("fr-FR")}
                    {log.undone_at ? " · annulé" : ""}
                  </span>
                </span>
                {!log.undone_at && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={undo.isPending}
                    onClick={() => undo.mutate(log.id)}
                  >
                    <RotateCcw className="size-4" /> Annuler
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
