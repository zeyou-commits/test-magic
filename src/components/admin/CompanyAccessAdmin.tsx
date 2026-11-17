import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Link2, ShieldOff, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import {
  type AccessOverview,
  type CompanyLevel,
  companyAccessKeys,
  companyAccessRequest,
  LEVEL_CATALOG,
  LOG_LABELS,
} from "@/lib/company/access";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Paris",
});
const when = (value: string | null) => (value ? dateFmt.format(new Date(value)) : "—");
const STATUS_LABEL = { active: "Actif", suspended: "Suspendu", revoked: "Retiré" } as const;
const INVITE_LABEL = {
  pending: "En attente",
  accepted: "Acceptée",
  revoked: "Annulée",
  expired: "Expirée",
} as const;

type Pending =
  | { kind: "suspend" | "revoke"; memberId: string; who: string }
  | { kind: "space" }
  | { kind: "invite"; inviteId: string; who: string };

/**
 * Rubrique « Accès professionnels » de la fiche compagnie (administrateurs seulement) :
 * inviter un collaborateur, changer son niveau, suspendre, réactiver, retirer, suspendre l'espace.
 */
export function CompanyAccessAdmin({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = companyAccessKeys.overview(user?.id ?? "", companyId);
  const overview = useQuery({
    queryKey: key,
    queryFn: () => companyAccessRequest<AccessOverview>({ action: "admin_overview", companyId }),
    enabled: Boolean(user),
    staleTime: 0,
    retry: false,
  });
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<CompanyLevel>("read");
  const [verification, setVerification] = useState("");
  const [link, setLink] = useState<{ url: string; email: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");

  const refresh = () => void client.invalidateQueries({ queryKey: ["company-access"] });
  const act = useMutation({
    mutationFn: (input: Record<string, unknown>) => companyAccessRequest<unknown>(input),
    onSuccess: () => {
      setPending(null);
      setReason("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const invite = useMutation({
    mutationFn: () =>
      companyAccessRequest<{ link: string; expiresAt: string }>({
        action: "admin_invite",
        companyId,
        email,
        level,
        verification,
      }),
    onSuccess: (data) => {
      setLink({ url: data.link, email: email.trim().toLowerCase(), expiresAt: data.expiresAt });
      setCopied(false);
      setEmail("");
      setVerification("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      toast.error("Copie impossible : sélectionnez le lien et copiez-le à la main.");
    }
  };
  const confirmPending = () => {
    if (!pending) return;
    if (pending.kind === "space")
      act.mutate({ action: "admin_space", companyId, status: "suspended", reason });
    else if (pending.kind === "invite")
      act.mutate({ action: "admin_invite_revoke", inviteId: pending.inviteId, reason });
    else if (
      pending.kind === "suspend" ||
      window.confirm(
        `Retirer l'accès de ${pending.who} à ${companyName} ?\n\nC'est définitif : pour le rouvrir, il faudra une nouvelle invitation.`,
      )
    )
      act.mutate({
        action: "admin_member",
        memberId: pending.memberId,
        change: pending.kind,
        reason,
      });
  };
  const reasonNeeded = pending?.kind !== "invite";

  const data = overview.data;
  const live = data?.members.filter((m) => m.status !== "revoked") ?? [];
  const gone = data?.members.filter((m) => m.status === "revoked") ?? [];
  const openInvites = data?.invites.filter((i) => i.state === "pending") ?? [];
  const closedInvites = data?.invites.filter((i) => i.state !== "pending") ?? [];

  return (
    <section
      className="grid gap-3 rounded-xl border border-border p-3"
      aria-labelledby="company-access-title"
    >
      <h3 id="company-access-title" className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="size-4" aria-hidden /> Accès professionnels
      </h3>
      <p className="text-xs text-muted-foreground">
        Les collaborateurs de la compagnie se connectent à l'espace compagnie avec leur propre
        compte. Seuls les administrateurs BledWay attribuent, modifient et retirent ces accès.
      </p>

      {overview.isPending ? (
        <p className="text-sm text-muted-foreground">Chargement des accès…</p>
      ) : overview.isError ? (
        <div className="grid gap-2 rounded-lg bg-destructive/10 p-3 text-sm">
          <p>{(overview.error as Error).message}</p>
          <Button
            size="sm"
            variant="outline"
            className="justify-self-start"
            onClick={() => void overview.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : data ? (
        <>
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3 text-sm"
            data-testid="company-space-state"
          >
            <span>
              <strong>Espace de la compagnie : </strong>
              {data.space.status === "active"
                ? "ouvert"
                : `suspendu depuis le ${when(data.space.changedAt)}`}
              {data.space.status === "suspended" && data.space.reason ? (
                <span className="block text-xs text-muted-foreground">
                  Motif : {data.space.reason}
                </span>
              ) : null}
            </span>
            {data.space.status === "active" ? (
              <Button size="sm" variant="outline" onClick={() => setPending({ kind: "space" })}>
                <ShieldOff className="size-4" aria-hidden /> Suspendre l'espace
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: "admin_space", companyId, status: "active" })}
              >
                Rouvrir l'espace
              </Button>
            )}
          </div>

          <div className="grid gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Collaborateurs ({live.length})
            </h4>
            {live.length ? (
              <ul className="grid gap-2">
                {live.map((m) => {
                  const who = m.name ?? m.email ?? "ce compte";
                  return (
                    <li
                      key={m.id}
                      className="grid gap-2 rounded-lg border border-border p-2.5 text-sm"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="min-w-0">
                          <strong className="block truncate">{m.name ?? m.email}</strong>
                          {m.name ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {m.email}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.status === "active" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}
                        >
                          {STATUS_LABEL[m.status]}
                          {m.accountActive ? "" : " · compte bloqué"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Depuis le {when(m.grantedAt)}
                        {m.grantedBy ? `, invité par ${m.grantedBy}` : ""} · dernière connexion{" "}
                        {when(m.lastSignInAt)}
                        {m.status === "suspended" && m.reason ? ` · motif : ${m.reason}` : ""}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs">
                          Niveau
                          <select
                            value={m.level}
                            disabled={act.isPending}
                            onChange={(e) =>
                              act.mutate({
                                action: "admin_member",
                                memberId: m.id,
                                change: "level",
                                level: e.target.value,
                              })
                            }
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            {(Object.keys(LEVEL_CATALOG) as CompanyLevel[]).map((value) => (
                              <option key={value} value={value}>
                                {LEVEL_CATALOG[value].label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {m.status === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPending({ kind: "suspend", memberId: m.id, who })}
                          >
                            Suspendre
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={act.isPending}
                            onClick={() =>
                              act.mutate({
                                action: "admin_member",
                                memberId: m.id,
                                change: "resume",
                              })
                            }
                          >
                            Réactiver
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          onClick={() => setPending({ kind: "revoke", memberId: m.id, who })}
                        >
                          Retirer
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun collaborateur pour l'instant.</p>
            )}
          </div>

          {pending ? (
            <div
              className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
              role="group"
            >
              <strong>
                {pending.kind === "space"
                  ? `Suspendre l'espace de ${companyName} ? Tous ses collaborateurs perdent l'accès dès leur prochaine action.`
                  : pending.kind === "invite"
                    ? `Annuler l'invitation de ${pending.who} ? Le lien ne fonctionnera plus.`
                    : pending.kind === "suspend"
                      ? `Suspendre l'accès de ${pending.who} ? Il pourra être réactivé.`
                      : `Retirer l'accès de ${pending.who} ? C'est définitif.`}
              </strong>
              <label className="grid gap-1 text-xs font-medium">
                {reasonNeeded
                  ? "Motif (obligatoire, visible dans l'historique)"
                  : "Motif (facultatif)"}
                <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={act.isPending || (reasonNeeded && reason.trim().length < 3)}
                  onClick={confirmPending}
                >
                  Confirmer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPending(null);
                    setReason("");
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          ) : null}

          <form
            className="grid gap-2 rounded-lg bg-muted/50 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <UserPlus className="size-4" aria-hidden /> Inviter un collaborateur
            </h4>
            <label className="grid gap-1 text-xs font-medium">
              Adresse e-mail de la personne
              <Input
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@compagnie.com"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Niveau
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as CompanyLevel)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {(Object.keys(LEVEL_CATALOG) as CompanyLevel[]).map((value) => (
                  <option key={value} value={value}>
                    {LEVEL_CATALOG[value].label}
                  </option>
                ))}
              </select>
              <span className="font-normal text-muted-foreground">
                {LEVEL_CATALOG[level].summary}
              </span>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Comment avez-vous vérifié que cette personne représente la compagnie ?
              <Input
                required
                minLength={3}
                maxLength={500}
                value={verification}
                onChange={(e) => setVerification(e.target.value)}
                placeholder="Ex. : appel au standard le 17/11, adresse au domaine de la compagnie"
              />
            </label>
            <Button
              type="submit"
              size="sm"
              className="justify-self-start"
              disabled={invite.isPending}
            >
              {invite.isPending ? "Création…" : "Créer l'invitation"}
            </Button>
          </form>

          {link ? (
            <div
              className="grid gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm"
              role="status"
            >
              <strong className="flex items-center gap-2">
                <Link2 className="size-4" aria-hidden /> Lien d'invitation pour {link.email}
              </strong>
              <p className="text-xs text-muted-foreground">
                Envoyez-le vous-même à cette personne. Il n'est affiché qu'une fois, fonctionne une
                seule fois, jusqu'au {when(link.expiresAt)}, et seulement avec un compte à cette
                adresse.
              </p>
              <Input
                readOnly
                value={link.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Lien d'invitation"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void copy()}>
                  {copied ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                  {copied ? "Lien copié" : "Copier le lien"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setLink(null)}>
                  Fermer
                </Button>
              </div>
            </div>
          ) : null}

          {openInvites.length ? (
            <div className="grid gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Invitations en attente ({openInvites.length})
              </h4>
              <ul className="grid gap-2">
                {openInvites.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm"
                  >
                    <span className="min-w-0">
                      <strong className="block truncate">{i.email}</strong>
                      <span className="block text-xs text-muted-foreground">
                        {LEVEL_CATALOG[i.level].label} · valable jusqu'au {when(i.expiresAt)} ·
                        vérification : {i.verification}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPending({ kind: "invite", inviteId: i.id, who: i.email })}
                    >
                      Annuler
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Lien perdu ? Créez une nouvelle invitation pour la même adresse : l'ancienne est
                annulée.
              </p>
            </div>
          ) : null}

          {closedInvites.length || gone.length || data.log.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                Historique ({data.log.length} action{data.log.length > 1 ? "s" : ""})
              </summary>
              <ul className="mt-2 grid gap-1.5">
                {data.log.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="text-xs">
                    <strong>{LOG_LABELS[entry.action] ?? entry.action}</strong> · {when(entry.at)}
                    {entry.target ? ` · ${entry.target}` : ""}
                    {entry.level
                      ? ` · ${LEVEL_CATALOG[entry.level as CompanyLevel]?.label ?? entry.level}`
                      : ""}
                    {entry.actor ? ` · par ${entry.actor}` : ""}
                    {entry.reason ? ` · motif : ${entry.reason}` : ""}
                  </li>
                ))}
                {closedInvites.map((i) => (
                  <li key={i.id} className="text-xs text-muted-foreground">
                    Invitation {i.email} : {INVITE_LABEL[i.state].toLowerCase()} (
                    {when(i.acceptedAt ?? i.revokedAt ?? i.expiresAt)})
                  </li>
                ))}
                {gone.map((m) => (
                  <li key={m.id} className="text-xs text-muted-foreground">
                    Accès retiré : {m.name ?? m.email} ({when(m.statusChangedAt)})
                    {m.reason ? `, ${m.reason}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
