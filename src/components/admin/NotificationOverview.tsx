import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, Clock3, RefreshCw, Send, Ship, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  adminNotificationQuery,
  notificationAdminAction,
  type Campaign,
} from "@/lib/notifications/admin";

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    new Date(`${month}T12:00:00Z`),
  );
export function NotificationOverview() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery(adminNotificationQuery(user?.id));
  const [selected, setSelected] = useState<Campaign | null>(null);
  const action = useMutation({
    mutationFn: ({ kind, id }: { kind: "refresh" | "send" | "dismiss"; id?: string }) =>
      notificationAdminAction<{
        created?: number;
        pushed?: number;
        pushConfigured?: boolean;
        publishedCampaigns?: number;
      }>(kind, id),
    onSuccess: async (data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "notification-overview"] });
      setSelected(null);
      if (variables.kind === "send")
        toast.success(
          data.publishedCampaigns
            ? `${data.created ?? 0} notification(s) créée(s), ${data.pushed ?? 0} push envoyé(s).${data.pushConfigured === false ? " Push à configurer ; les messages sont dans les comptes." : ""}`
            : "Aucun départ actif ne correspond encore à cette période. La campagne a été écartée.",
        );
      else toast.success(variables.kind === "dismiss" ? "Campagne écartée." : "Alertes vérifiées.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (query.isPending)
    return (
      <div className="grid gap-4" aria-busy="true">
        <div className="h-24 animate-pulse rounded-xl bg-secondary" />
        <div className="h-64 animate-pulse rounded-xl bg-secondary" />
      </div>
    );
  if (query.error)
    return (
      <div role="alert" className="bw-admin-empty">
        <Bell className="size-7 text-primary" />
        <h3>Notifications momentanément indisponibles</h3>
        <p>Vérifiez la migration des campagnes, puis réessayez.</p>
        <button type="button" onClick={() => void query.refetch()} className="bw-action-secondary">
          Réessayer
        </button>
      </div>
    );
  const data = query.data;
  const pending = data.campaigns.filter((campaign) =>
    ["pending", "approved"].includes(campaign.status),
  );
  const history = data.campaigns.filter((campaign) =>
    ["sent", "dismissed"].includes(campaign.status),
  );
  return (
    <div className="space-y-5">
      <div className="bw-admin-metrics">
        <Metric icon={Ship} label="Voyages suivis" value={data.metrics.follows} />
        <Metric icon={Users} label="Alertes de période" value={data.metrics.watches} />
        <Metric icon={Send} label="Push en attente" value={data.metrics.pending} />
        <Metric icon={Clock3} label="Livraisons à vérifier" value={data.metrics.failed} />
      </div>
      <section className="bw-admin-surface">
        <div className="bw-admin-section-heading">
          <div>
            <span className="bw-account-kicker">Votre validation est requise</span>
            <h2>
              Ouvertures à annoncer <span className="bw-admin-count">{pending.length}</span>
            </h2>
            <p>
              Les mises à jour du planning préparent les alertes. Vous gardez la main sur leur
              diffusion.
            </p>
          </div>
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate({ kind: "refresh" })}
            className="bw-action-secondary"
          >
            <RefreshCw className={`size-4 ${action.isPending ? "animate-spin" : ""}`} />
            Vérifier
          </button>
        </div>
        {!pending.length ? (
          <div className="bw-admin-empty">
            <CheckCircle2 className="size-8 text-primary" />
            <h3>Tout est à jour</h3>
            <p>
              Une alerte apparaîtra ici lorsqu’un départ publié correspondra à une période suivie.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pending.map((campaign) => (
              <article key={campaign.id} className="bw-campaign-row">
                <div className="bw-campaign-icon">
                  <Bell className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">
                    {campaign.from} → {campaign.to}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {monthLabel(campaign.period_month)} · {campaign.audience} voyageur
                    {campaign.audience > 1 ? "s" : ""} à prévenir
                  </p>
                  <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
                    {campaign.status === "approved" ? "Validée · traitement en cours" : "À valider"}
                  </span>
                  {campaign.last_error && (
                    <p className="mt-1 text-xs text-destructive">{campaign.last_error}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    aria-label={`Écarter l’annonce ${campaign.from} vers ${campaign.to}`}
                    disabled={action.isPending}
                    onClick={() => action.mutate({ kind: "dismiss", id: campaign.id })}
                    className="grid size-10 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-secondary"
                  >
                    <X className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={action.isPending || !campaign.audience}
                    onClick={() => setSelected(campaign)}
                    className="bw-action-primary"
                  >
                    <Send className="size-4" />
                    Prévisualiser
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="bw-admin-surface">
          <div className="bw-admin-section-heading">
            <div>
              <h2>Historique des campagnes</h2>
              <p>Les dernières annonces traitées par l’équipe.</p>
            </div>
          </div>
          {!history.length ? (
            <p className="p-5 text-sm text-muted-foreground">Aucune campagne traitée.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.slice(0, 12).map((campaign) => (
                <li
                  key={campaign.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {campaign.from} → {campaign.to}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {monthLabel(campaign.period_month)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${campaign.status === "sent" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
                  >
                    {campaign.status === "sent" ? "Diffusée" : "Écartée"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="bw-admin-surface">
          <div className="bw-admin-section-heading">
            <div>
              <h2>Dernières notifications créées</h2>
              <p>Rappels automatiques et informations de voyage.</p>
            </div>
          </div>
          <ul className="divide-y divide-border">
            {data.recent.map((notice) => (
              <li key={notice.id} className="flex justify-between gap-3 px-5 py-3 text-xs">
                <span>{notice.title}</span>
                <time className="shrink-0 text-muted-foreground">
                  {new Date(notice.created_at).toLocaleDateString("fr-FR")}
                </time>
              </li>
            ))}
            {!data.recent.length && (
              <li className="p-5 text-sm text-muted-foreground">
                Aucune notification pour le moment.
              </li>
            )}
          </ul>
        </section>
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!action.isPending && !open) setSelected(null);
        }}
      >
        <DialogContent className="bw-travel-dialog">
          <div className="bw-travel-dialog-body">
            <DialogTitle className="text-xl font-semibold">Vérifier avant d’envoyer</DialogTitle>
            <DialogDescription className="mt-2">
              Cette annonce sera ajoutée aux comptes concernés et envoyée aux appareils autorisés.
            </DialogDescription>
            {selected && (
              <>
                <div className="my-5 rounded-xl border border-border bg-secondary/30 p-4">
                  <span className="bw-account-kicker">BledWay · notification</span>
                  <h3 className="mt-2 font-semibold">
                    {selected.from} → {selected.to} : les traversées sont publiées
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Des départs sont disponibles en {monthLabel(selected.period_month)}. Retrouvez
                    votre parcours et comparez les traversées.
                  </p>
                </div>
                <p className="mb-4 text-sm">
                  <strong>{selected.audience}</strong> voyageur{selected.audience > 1 ? "s" : ""}{" "}
                  concerné{selected.audience > 1 ? "s" : ""}. Les désabonnements et les préférences
                  sont respectés.
                </p>
                <button
                  type="button"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ kind: "send", id: selected.id })}
                  className="bw-action-primary w-full"
                >
                  <Send className="size-4" />
                  {action.isPending ? "Envoi en cours…" : "Valider et envoyer les notifications"}
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Metric({ icon: Icon, label, value }: { icon: typeof Bell; label: string; value: number }) {
  return (
    <div className="bw-admin-metric">
      <Icon className="size-4 text-primary" aria-hidden />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
