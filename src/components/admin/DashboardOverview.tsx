import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  FileSpreadsheet,
  MessageSquare,
  Ship,
  CheckCircle2,
  Database,
  Bell,
} from "lucide-react";
import { useAdminCounts } from "@/hooks/useAdminCounts";

export function DashboardOverview({
  onNavigate,
  can,
}: {
  onNavigate: (id: string) => void;
  can: (id: string) => boolean;
}) {
  const { data, error, isPending, refetch } = useAdminCounts();
  const cards = [
    { id: "departures", label: "Départs aujourd'hui", value: data?.today, icon: CalendarClock },
    {
      id: "departures",
      label: "Départs à venir sans navire",
      value: data?.unlinked,
      icon: Ship,
      warn: true,
    },
    {
      id: "reports",
      label: "Signalements à traiter",
      value: data?.reports,
      icon: AlertTriangle,
      warn: true,
    },
    {
      id: "reviews",
      label: "Avis ports en attente",
      value: data?.reviews,
      icon: MessageSquare,
      warn: true,
    },
  ].filter((c) => can(c.id));

  const priorities = cards.filter((card) => card.warn && (card.value ?? 0) > 0);
  return (
    <div className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          Les indicateurs sont indisponibles.
          <button type="button" className="ml-2 underline" onClick={() => void refetch()}>
            Réessayer
          </button>
        </p>
      )}
      <div className="bw-admin-metrics" aria-busy={isPending}>
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onNavigate(c.id)}
            className="bw-admin-metric text-left transition hover:border-primary/40"
          >
            <c.icon
              className={`h-5 w-5 ${c.warn && (c.value ?? 0) > 0 ? "text-destructive" : "text-primary"}`}
            />
            <strong>{c.value ?? "–"}</strong>
            <span>{c.label}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <section className="bw-admin-surface">
          <div className="bw-admin-section-heading">
            <div>
              <span className="bw-account-kicker">Les priorités du jour</span>
              <h2>À traiter en premier</h2>
              <p>Les points qui améliorent directement l’expérience des voyageurs.</p>
            </div>
          </div>
          {!priorities.length && !isPending && !error ? (
            <div className="bw-admin-empty">
              <CheckCircle2 className="size-8 text-primary" />
              <h3>Aucune tâche urgente</h3>
              <p>Passez aux prochains départs ou vérifiez les notifications à valider.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {priorities.map(({ id, label, value, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onNavigate(id)}
                  className="flex min-h-20 w-full items-center gap-3 px-5 py-4 text-left hover:bg-secondary/30"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-800">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{label}</span>
                  <strong className="text-lg tabular-nums">{value}</strong>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="bw-admin-surface">
          <div className="bw-admin-section-heading">
            <div>
              <span className="bw-account-kicker">Les bons outils</span>
              <h2>Passer à l’action</h2>
            </div>
          </div>
          <div className="grid gap-2 p-4">
            {[
              {
                id: "import",
                title: "Importer un planning",
                detail: "Vérifier un fichier et publier les départs",
                icon: FileSpreadsheet,
              },
              {
                id: "departures",
                title: "Mettre à jour un départ",
                detail: "Horaires, statut et navire affecté",
                icon: CalendarClock,
              },
              {
                id: "notifications",
                title: "Prévenir les voyageurs",
                detail: "Valider les annonces prêtes à envoyer",
                icon: Bell,
              },
              {
                id: "data",
                title: "Contrôler les données",
                detail: "Cohérence, doublons et informations manquantes",
                icon: Database,
              },
            ].map(({ id, title, detail, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className="flex items-center gap-3 rounded-xl p-3 text-left hover:bg-secondary/50"
              >
                <Icon className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-semibold">{title}</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
