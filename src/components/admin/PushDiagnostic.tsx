import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Send, Smartphone, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { notificationAdminAction } from "@/lib/notifications/admin";
import { registerPush } from "@/lib/notifications/push";
import { Button } from "@/components/ui/button";

type Diagnosis = {
  serverKeys: boolean;
  siteKey: boolean;
  keysMatch: boolean | null;
  cronSecret: boolean;
  /** Envoi automatique toutes les 10 min et envoi immédiat (script du 03/11). */
  scheduler?: boolean;
  /** Colonnes du rattrapage des messages (script 20261104130000). */
  catchUp?: boolean;
  subscriptions: number | null;
  mySubscriptions: number | null;
  pending: number | null;
  sent24h: number | null;
  errors: string[];
};
type DispatchResult = { created: number; pushed: number; pending: number; pushConfigured: boolean };

const errorText = (code: string) =>
  code === "403"
    ? "403 : clés VAPID différentes entre le site et le serveur"
    : code === "401"
      ? "401 : clé privée VAPID invalide"
      : code === "413"
        ? "413 : message trop long"
        : `${code} : refusé par le service de notification`;

/**
 * Pourquoi un push n'arrive pas ? Liste de contrôle en clair, et deux boutons :
 * envoyer tout de suite ce qui attend, et s'envoyer une notification de test.
 */
export function PushDiagnostic() {
  const { user } = useAuth();
  const client = useQueryClient();
  const diagnosis = useQuery({
    queryKey: ["admin", "push-diagnosis", user?.id],
    enabled: Boolean(user),
    queryFn: () => notificationAdminAction<Diagnosis>("diagnose"),
    staleTime: 10_000,
  });
  const run = useMutation({
    mutationFn: (kind: "dispatch" | "test") => notificationAdminAction<DispatchResult>(kind),
    onSuccess: (result, kind) => {
      void client.invalidateQueries({ queryKey: ["admin", "push-diagnosis"] });
      void client.invalidateQueries({ queryKey: ["admin", "notification-overview"] });
      if (!result.pushConfigured)
        toast.error("Aucun push envoyé : les clés VAPID manquent côté serveur (Vercel).");
      else
        toast.success(
          kind === "test"
            ? result.pushed
              ? "Test envoyé : regardez votre téléphone."
              : "Test créé, mais aucun téléphone abonné sur votre compte."
            : `${result.created} notification(s) créée(s), ${result.pushed} push envoyé(s).`,
        );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const subscribe = useMutation({
    mutationFn: () => registerPush(user!.id),
    onSuccess: (status) => {
      void client.invalidateQueries({ queryKey: ["admin", "push-diagnosis"] });
      toast[status === "enabled" ? "success" : "error"](
        status === "enabled"
          ? "Cet appareil est abonné."
          : status === "denied"
            ? "Notifications refusées dans ce navigateur : autorisez-les dans ses réglages."
            : "Ce navigateur ne permet pas les notifications (sur iPhone : depuis l’écran d’accueil).",
      );
    },
    onError: () => toast.error("L’abonnement de cet appareil a échoué."),
  });
  const data = diagnosis.data;
  const checks: { ok: boolean | null; label: string; help: string }[] = data
    ? [
        {
          ok: data.siteKey,
          label: "Clé publique côté site (VITE_VAPID_PUBLIC_KEY)",
          help: "Sans elle, les téléphones ne peuvent pas s’abonner. À ajouter sur Vercel, puis redéployer.",
        },
        {
          ok: data.serverKeys,
          label: "Clés d’envoi côté serveur (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)",
          help: "Sans elles, les messages restent dans la cloche et ne partent pas sur les téléphones.",
        },
        {
          ok: data.keysMatch,
          label: "Les deux clés publiques sont identiques",
          help: "Si elles diffèrent, les envois sont refusés (erreur 403).",
        },
        {
          ok: data.cronSecret,
          label: "Secret d’envoi automatique (CRON_SECRET)",
          help: "Nécessaire pour l’envoi automatique et l’envoi immédiat déclenché par la base.",
        },
        {
          ok: data.scheduler ?? null,
          label: "Envoi immédiat et passage toutes les 10 minutes (Supabase)",
          help: "Sans lui, les notifications ne partent qu’au passage du matin ou avec « Envoyer maintenant ». Voir le LISEZMOI du 03/11 (pg_net, pg_cron, 2 secrets du coffre).",
        },
        {
          ok: data.catchUp ?? null,
          label: "Rattrapage des messages pour les nouveaux abonnés",
          help: "Exécutez le script 20261104130000_rattrapage_notifications.sql dans Supabase.",
        },
        {
          ok: (data.mySubscriptions ?? 0) > 0,
          label: `Vos appareils abonnés : ${data.mySubscriptions ?? "?"}`,
          help: "Ouvrez BledWay sur votre téléphone, connecté à ce compte, et activez les notifications.",
        },
      ]
    : [];
  return (
    <section className="bw-admin-surface mb-4 p-4" aria-label="Diagnostic de l’envoi">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Smartphone className="size-4" aria-hidden /> Envoi sur les téléphones
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={subscribe.isPending}
            onClick={() => subscribe.mutate()}
          >
            Abonner cet appareil
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={run.isPending}
            onClick={() => run.mutate("test")}
          >
            <Send className="size-4" aria-hidden /> M’envoyer un test
          </Button>
          <Button size="sm" disabled={run.isPending} onClick={() => run.mutate("dispatch")}>
            <Zap className="size-4" aria-hidden /> Envoyer maintenant
          </Button>
        </div>
      </div>
      {diagnosis.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Vérification…</p>
      ) : diagnosis.isError ? (
        <p className="mt-3 text-sm text-destructive">{(diagnosis.error as Error).message}</p>
      ) : data ? (
        <>
          <ul className="mt-3 grid gap-2">
            {checks.map((check) => (
              <li key={check.label} className="flex items-start gap-2 text-sm">
                {check.ok ? (
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-emerald-600"
                    aria-label="OK"
                  />
                ) : (
                  <CircleAlert
                    className="mt-0.5 size-4 shrink-0 text-amber-600"
                    aria-label="À corriger"
                  />
                )}
                <span>
                  {check.label}
                  {!check.ok ? (
                    <small className="block text-xs text-muted-foreground">{check.help}</small>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {data.subscriptions ?? "?"} appareil(s) abonné(s) au total · {data.pending ?? "?"}{" "}
            envoi(s) en attente · {data.sent24h ?? "?"} envoyé(s) en 24 h
          </p>
          {data.errors.length ? (
            <p className="mt-1 text-xs text-destructive">
              Dernières erreurs : {data.errors.map(errorText).join(" · ")}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
