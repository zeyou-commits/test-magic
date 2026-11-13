import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, BellRing, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  approveReferenceUpdate,
  checkReferenceUpdate,
  referenceStatus,
  rejectReferenceUpdate,
  type ReferenceStatus,
} from "@/lib/reference/reference.functions";
import type { ReferenceKey } from "@/lib/reference/sources";

const longDate = (day: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${day.slice(0, 10)}T12:00:00`),
  );

const SOURCES: Record<ReferenceKey, string> = {
  vacances:
    "Ministère de l'Éducation nationale (France, par zone) et OpenHolidays (Belgique, Luxembourg, Suisse, Allemagne, Pays-Bas, Autriche, Portugal).",
  consulats:
    "Ministère algérien des Affaires étrangères, « Représentations à l'étranger » (14 pays d'Europe).",
};

function useReferenceStatus() {
  const fetchStatus = useServerFn(referenceStatus);
  return useQuery({
    queryKey: ["admin", "reference-status"],
    queryFn: () => fetchStatus(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * « Données de référence » : le rappel quand un relevé est à refaire, le relevé lancé par
 * l'admin, ce qui change pays par pays, puis l'approbation (ou non) avant la mise en service.
 */
export function ReferenceDataAdmin() {
  const { data, isLoading, error } = useReferenceStatus();
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Le site s'appuie sur deux relevés faits aux sources officielles ou ouvertes. Quand un relevé
        est à refaire, un rappel s'affiche ici et dans « Aujourd'hui ». Lancez la mise à jour : le
        relevé est fait tout de suite et comparé à la version en service. Rien ne change sur le site
        tant que vous n'avez pas approuvé.
      </p>
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Chargement…
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {(error as Error).message}
        </p>
      ) : null}
      {data?.map((item) => (
        <ReferenceCard key={item.key} item={item} />
      ))}
    </div>
  );
}

function ReferenceCard({ item }: { item: ReferenceStatus }) {
  const queryClient = useQueryClient();
  const check = useServerFn(checkReferenceUpdate);
  const approve = useServerFn(approveReferenceUpdate);
  const reject = useServerFn(rejectReferenceUpdate);
  const [showAll, setShowAll] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "reference-status"] });

  const run = useMutation({
    mutationFn: () => check({ data: { key: item.key } }),
    onSuccess: (summary) => {
      toast.success(
        summary.changed
          ? `Relevé fait : ${summary.changed} pays à revoir avant d'approuver.`
          : "Relevé fait : aucun changement par rapport à la version en service.",
      );
      void refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const ok = useMutation({
    mutationFn: () => approve({ data: { key: item.key } }),
    onSuccess: () => {
      toast.success("Approuvé : le site utilise ce relevé dès le prochain chargement.");
      void refresh();
      void queryClient.invalidateQueries({ queryKey: ["reference-data"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const no = useMutation({
    mutationFn: () => reject({ data: { key: item.key } }),
    onSuccess: () => {
      toast.success("Relevé écarté : la version en service ne change pas.");
      void refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const pending = item.pending;
  const lines = pending
    ? [...pending.summary.lines].sort((a, b) => Number(b.changed) - Number(a.changed))
    : [];
  const visible = showAll ? lines : lines.filter((l) => l.changed);
  const busy = run.isPending || ok.isPending || no.isPending;

  return (
    <section className="rounded-2xl border bg-card p-4 md:p-5" aria-labelledby={`ref-${item.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h3 id={`ref-${item.key}`} className="text-base font-bold">
            {item.label}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            En service : relevé du {longDate(item.checked)}
            {item.fromRepository ? " (version du dépôt)" : ""}
            {item.approvedAt ? `, approuvé le ${longDate(item.approvedAt)}` : ""}.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Source : {SOURCES[item.key]}</p>
        </div>
        {pending ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
            À approuver
          </span>
        ) : item.due ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
            Mise à jour à lancer
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="size-3.5" aria-hidden /> À jour
          </span>
        )}
      </div>

      {item.due && !pending ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <BellRing className="mt-0.5 size-4 shrink-0" aria-hidden /> {item.due}
        </p>
      ) : null}

      {pending ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-sm font-semibold">
            Relevé du {longDate(pending.checked)} :{" "}
            {pending.summary.changed
              ? `${pending.summary.changed} pays changent.`
              : "aucun changement par rapport à la version en service."}
          </p>
          {pending.summary.warnings.length ? (
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {pending.summary.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
                </li>
              ))}
            </ul>
          ) : null}
          {visible.length ? (
            <ul className="mt-2 divide-y rounded-lg bg-card text-sm">
              {visible.map((line) => (
                <li key={line.label} className="flex flex-wrap gap-x-2 px-3 py-2">
                  <span className="font-semibold">{line.label}</span>
                  <span className={line.changed ? "" : "text-muted-foreground"}>{line.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {lines.some((l) => !l.changed) ? (
            <button
              type="button"
              className="mt-1 text-xs font-semibold text-primary underline-offset-2 hover:underline"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Ne montrer que ce qui change" : "Voir aussi les pays sans changement"}
            </button>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => ok.mutate()} disabled={busy}>
              {ok.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden />
              )}
              Approuver et mettre en service
            </Button>
            <Button variant="outline" onClick={() => no.mutate()} disabled={busy}>
              <X className="size-4" aria-hidden /> Écarter
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <Button
          variant={pending ? "ghost" : item.due ? "default" : "outline"}
          onClick={() => run.mutate()}
          disabled={busy}
        >
          {run.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          {run.isPending
            ? "Relevé en cours (jusqu'à une minute)…"
            : pending
              ? "Refaire le relevé"
              : "Lancer la mise à jour"}
        </Button>
      </div>
    </section>
  );
}

/** Le rappel de « Aujourd'hui » : rien quand tout est à jour. */
export function ReferenceDataReminder({ onOpen }: { onOpen: () => void }) {
  const { data } = useReferenceStatus();
  const todo = (data ?? []).filter((item) => item.pending || item.due);
  if (!todo.length) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <BellRing className="size-5 shrink-0" aria-hidden />
      <div className="min-w-[14rem] flex-1">
        <p className="font-bold">Données de référence</p>
        <ul className="mt-0.5">
          {todo.map((item) => (
            <li key={item.key}>
              {item.label} :{" "}
              {item.pending
                ? "un relevé attend votre approbation."
                : (item.due ?? "").replace(/^./, (c) => c.toLowerCase())}
            </li>
          ))}
        </ul>
      </div>
      <Button size="sm" onClick={onOpen}>
        {todo.some((item) => item.pending) ? "Revoir et approuver" : "Lancer la mise à jour"}
      </Button>
    </div>
  );
}
