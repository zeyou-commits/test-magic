import { AdminRequestError } from "@/lib/admin/request";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Search,
  UserPlus,
  ShieldCheck,
  Ban,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Download,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  activityLabels,
  isStaffColumn,
  userAdminAction,
  type AuditEntry,
  type ManagedUser,
  type UserDetail,
  type UsersPage,
  type UsersStats,
} from "@/lib/admin/users";
import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const roleLabels = { admin: "Administrateur", editor: "Éditeur", moderator: "Modérateur" };
type Role = keyof typeof roleLabels;

/** Ce que chaque rôle permet, en clair (même règle que lib/admin/permissions.ts). */
const roleHelp: { role: Role; can: string; cannot: string }[] = [
  {
    role: "admin",
    can: "Tout : planning, flotte, voyageurs, notifications, comptes et rôles.",
    cannot: "Ne peut pas se retirer ses propres droits ; le dernier administrateur est protégé.",
  },
  {
    role: "editor",
    can: "Traversées, imports, affectation, flotte, ports, liaisons, Flash info, lieux, catalogue des signalements.",
    cannot: "Ni les comptes, ni la modération des avis, ni l'envoi de notifications.",
  },
  {
    role: "moderator",
    can: "Avis des voyageurs, modération de la communauté, erreurs signalées.",
    cannot: "Ni le planning, ni la flotte, ni les comptes.",
  },
];

const auditText = (entry: AuditEntry) => {
  const target = entry.target ?? "un compte";
  const role = roleLabels[(entry.details["role"] as Role) ?? "editor"] ?? "un rôle";
  switch (entry.action) {
    case "role_changed":
      return entry.details["enabled"]
        ? `${entry.actor} a donné le rôle ${role} à ${target}`
        : `${entry.actor} a retiré le rôle ${role} à ${target}`;
    case "invitation_sent":
      return `${entry.actor} a invité ${target}`;
    case "ban_completed":
      return `${entry.actor} a suspendu ${target}`;
    case "unban_completed":
      return `${entry.actor} a réactivé ${target}`;
    case "delete_completed":
      return `${entry.actor} a supprimé le compte ${target}`;
    case "export_completed":
      return `${entry.actor} a exporté les données de ${target}`;
    default:
      return null;
  }
};
const when = (value: string) =>
  new Date(value).toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

type Change = {
  action: "ban" | "unban" | "delete" | "role";
  member: ManagedUser;
  role?: string;
  enabled?: boolean;
};
type Tab = "team" | "travellers" | "history";

export function UsersAdmin() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("team");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [onlyBanned, setOnlyBanned] = useState(false);
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [change, setChange] = useState<Change | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("168h");
  const [openId, setOpenId] = useState<string | null>(null);
  const filter = tab === "team" ? "team" : onlyBanned ? "banned" : "travellers";
  const result = useQuery({
    queryKey: ["admin", "users", user?.id, query, filter, page],
    queryFn: () => userAdminAction<UsersPage>({ action: "list", search: query, filter, page }),
    enabled: Boolean(user) && tab !== "history",
    retry: false,
    refetchOnWindowFocus: (query) => !query.state.error,
    refetchOnReconnect: (query) => !query.state.error,
  });
  const stats = useQuery({
    queryKey: ["admin", "users", "stats", user?.id],
    queryFn: () => userAdminAction<UsersStats>({ action: "stats" }),
    enabled: Boolean(user),
    retry: false,
  });
  const audit = useQuery({
    queryKey: ["admin", "users", "audit", user?.id],
    queryFn: () => userAdminAction<AuditEntry[]>({ action: "audit" }),
    enabled: Boolean(user) && tab === "history",
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => userAdminAction(input),
    onSuccess: () => {
      toast.success("Opération enregistrée.");
      setInviteOpen(false);
      setChange(null);
      setEmail("");
      void client.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const openChange = (next: Change) => {
    setChange(next);
    setConfirmation("");
    setReason("");
    mutation.reset();
  };
  const banned = (member: ManagedUser) =>
    Boolean(member.banned_until && Date.parse(member.banned_until) > Date.now());
  const actionTitle =
    change?.action === "delete"
      ? "Supprimer le compte"
      : change?.action === "ban"
        ? "Suspendre le compte"
        : change?.action === "unban"
          ? "Réactiver le compte"
          : "Modifier les permissions";
  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(1);
    setSearch("");
    setQuery("");
    setOnlyBanned(false);
  };

  return (
    <div className="space-y-5">
      {stats.data && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Chiffres clés">
          {(
            [
              ["Comptes", stats.data.total, `${stats.data.new7} nouveau(x) cette semaine`],
              ["Actifs sur 7 jours", stats.data.active7, "connectés au moins une fois"],
              [
                "Notifications",
                stats.data.push_users,
                `${stats.data.push_devices} téléphone(s) abonné(s)`,
              ],
              ["Équipe", stats.data.team, "comptes avec un rôle"],
              ["Suspendus", stats.data.banned, "en ce moment"],
            ] as const
          ).map(([label, value, hint]) => (
            <div key={label} className="rounded-xl border border-border bg-white p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold tabular-nums">{value}</p>
              <p className="text-[11px] text-muted-foreground">{hint}</p>
            </div>
          ))}
        </section>
      )}
      {stats.error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {stats.error.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-border" role="tablist">
          {(
            [
              ["team", "Équipe"],
              ["travellers", "Voyageurs"],
              ["history", "Historique"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => switchTab(id)}
              className={`min-h-10 border-l border-border px-4 text-sm font-semibold first:border-l-0 ${
                tab === id ? "bg-foreground text-background" : "bg-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "team" && (
          <Button
            className="ml-auto"
            onClick={() => {
              setInviteOpen(true);
              mutation.reset();
            }}
          >
            <UserPlus size={16} /> Inviter un membre
          </Button>
        )}
      </div>

      {tab === "team" && (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Qui peut faire quoi</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {roleHelp.map((help) => (
              <div key={help.role} className="rounded-xl border border-border p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <ShieldCheck size={14} className="text-primary" /> {roleLabels[help.role]}
                </p>
                <p className="mt-1 text-xs leading-relaxed">{help.can}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{help.cannot}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "history" ? (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Ce que l'équipe a fait sur les comptes</h2>
          {audit.isPending ? (
            <p className="mt-2 text-sm text-muted-foreground">Chargement…</p>
          ) : audit.error ? (
            <p className="mt-2 text-sm text-amber-900">{audit.error.message}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {(audit.data ?? [])
                .map((entry) => ({ entry, text: auditText(entry) }))
                .filter((item) => item.text)
                .map(({ entry, text }, index) => (
                  <li key={`${entry.created_at}-${index}`} className="py-2 text-sm">
                    {text}
                    {typeof entry.details["reason"] === "string"
                      ? ` (motif : ${entry.details["reason"]})`
                      : ""}
                    <span className="block text-xs text-muted-foreground">
                      {when(entry.created_at)}
                    </span>
                  </li>
                ))}
              {!audit.data?.length && (
                <li className="py-2 text-sm text-muted-foreground">Aucune opération.</li>
              )}
            </ul>
          )}
        </section>
      ) : (
        <>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search.trim());
              setPage(1);
            }}
          >
            <label className="relative min-w-60 flex-1">
              <span className="sr-only">Rechercher par nom ou e-mail</span>
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom ou e-mail"
                maxLength={150}
                className="pl-9"
              />
            </label>
            <Button type="submit" variant="outline">
              Rechercher
            </Button>
            {tab === "travellers" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={onlyBanned}
                  onChange={(e) => {
                    setOnlyBanned(e.target.checked);
                    setPage(1);
                  }}
                />
                Seulement les comptes suspendus
              </label>
            )}
          </form>
          <p className="text-xs text-muted-foreground">
            {result.data ? `${result.data.total} compte(s) · page ${page}` : ""}
          </p>
          {result.isPending ? (
            <p role="status">Chargement des comptes…</p>
          ) : result.error ? (
            <div
              role="alert"
              className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm"
            >
              {result.error.message}
              {result.error instanceof AdminRequestError && result.error.status === 401 && (
                <a
                  href="/auth?next=%2Fadmin&reauth=1"
                  className="mt-2 block font-semibold text-primary underline"
                >
                  Se reconnecter
                </a>
              )}
              <Button
                variant="outline"
                className="mt-2 block"
                onClick={() => void result.refetch()}
              >
                Réessayer
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                {result.data?.members.map((member) => {
                  const self = member.id === user?.id;
                  return (
                    <article
                      key={member.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3"
                    >
                      <span
                        aria-hidden
                        className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 font-bold text-primary"
                      >
                        {(member.display_name || member.email || "?").slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-48 flex-1">
                        <p className="break-words text-sm font-semibold">
                          {member.display_name || "Voyageur"}
                          {self ? " · vous" : ""}
                        </p>
                        <p className="break-all text-xs text-muted-foreground">
                          {member.email || member.id}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {banned(member)
                            ? "Suspendu"
                            : member.email_confirmed_at
                              ? "Actif"
                              : "E-mail à confirmer"}{" "}
                          · inscrit le {new Date(member.created_at).toLocaleDateString("fr-FR")}
                          {member.last_sign_in_at
                            ? ` · vu le ${new Date(member.last_sign_in_at).toLocaleDateString("fr-FR")}`
                            : ""}
                        </p>
                      </div>
                      {tab === "team" && (
                        <div className="flex flex-wrap gap-1.5">
                          {(Object.keys(roleLabels) as Role[]).map((role) => (
                            <button
                              key={role}
                              type="button"
                              disabled={self || mutation.isPending || banned(member)}
                              aria-pressed={member.roles.includes(role)}
                              onClick={() =>
                                openChange({
                                  action: "role",
                                  member,
                                  role,
                                  enabled: !member.roles.includes(role),
                                })
                              }
                              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-50 ${
                                member.roles.includes(role)
                                  ? "border-primary/30 bg-primary/10 text-primary"
                                  : "bg-background text-muted-foreground"
                              }`}
                            >
                              <ShieldCheck size={13} />
                              {roleLabels[role]}
                            </button>
                          ))}
                        </div>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setOpenId(member.id)}>
                        Voir la fiche
                      </Button>
                    </article>
                  );
                })}
              </div>
              {!result.data?.members.length && (
                <p className="rounded-xl border p-5 text-sm">
                  Aucun compte ne correspond à cette recherche.
                </p>
              )}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  disabled={page === 1 || result.isFetching}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={16} />
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  disabled={page * 30 >= (result.data?.total ?? 0) || result.isFetching}
                  onClick={() => setPage(page + 1)}
                >
                  Suivant
                  <ChevronRight size={16} />
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {openId && (
        <UserSheet
          userId={openId}
          self={openId === user?.id}
          onClose={() => setOpenId(null)}
          onChange={(next) => openChange(next)}
          busy={mutation.isPending}
        />
      )}

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          if (!mutation.isPending) setInviteOpen(open);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inviter un membre</DialogTitle>
            <DialogDescription>
              Un e-mail lui permet de créer son compte. Par sécurité, l'invitation ne donne aucun
              droit : une fois son compte créé, il apparaît dans l'onglet Voyageurs, et vous lui
              donnez son rôle depuis sa fiche.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({ action: "invite", email });
            }}
            className="space-y-4"
          >
            <label className="block text-sm">
              Adresse e-mail
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                autoComplete="off"
              />
            </label>
            {mutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Envoi…" : "Envoyer l’invitation"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(change)}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setChange(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{actionTitle}</DialogTitle>
            <DialogDescription>{change?.member.email ?? change?.member.id}</DialogDescription>
          </DialogHeader>
          {change && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({
                  action: change.action,
                  userId: change.member.id,
                  confirmation,
                  reason,
                  ...(change.action === "ban" ? { duration } : {}),
                  ...(change.action === "role"
                    ? { role: change.role, enabled: change.enabled }
                    : {}),
                });
              }}
            >
              <p className="text-sm">
                {change.action === "delete"
                  ? "Action définitive : suppression du compte, de ses suivis et de ses avatars. Pensez à exporter ses données d'abord s'il les a demandées."
                  : change.action === "ban"
                    ? "Le compte ne pourra plus se connecter ni utiliser ses droits sur les données. Ses abonnements push et suivis seront désactivés."
                    : change.action === "unban"
                      ? "Le voyageur pourra se reconnecter. Il devra réactiver ses suivis et ses notifications."
                      : `${change.enabled ? "Accorder" : "Retirer"} le rôle ${roleLabels[change.role as Role]}.`}
              </p>
              {change.action === "ban" && (
                <label className="block text-sm">
                  Durée
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="mt-1 block min-h-10 w-full rounded-lg border bg-background px-3"
                  >
                    <option value="24h">24 heures</option>
                    <option value="168h">7 jours</option>
                    <option value="876000h">Durée indéterminée</option>
                  </select>
                </label>
              )}
              <label className="block text-sm">
                Motif
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={3}
                  maxLength={500}
                  className="mt-1 block min-h-20 w-full rounded-lg border bg-background p-2"
                />
              </label>
              <label className="block text-sm">
                Recopiez {change.member.email ? "l’adresse e-mail" : "l’identifiant"} du compte pour
                confirmer
                <Input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  required
                  autoComplete="off"
                />
              </label>
              {mutation.error && (
                <p role="alert" className="text-sm text-destructive">
                  {mutation.error.message}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => setChange(null)}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  variant={change.action === "delete" ? "destructive" : "default"}
                  disabled={
                    mutation.isPending ||
                    confirmation.trim().toLowerCase() !==
                      (change.member.email ?? change.member.id).toLowerCase() ||
                    reason.trim().length < 3
                  }
                >
                  {mutation.isPending ? "Traitement…" : "Confirmer"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Fiche d'un compte : profil voyageur, activité, téléphones, historique et actions. */
function UserSheet({
  userId,
  self,
  busy,
  onClose,
  onChange,
}: {
  userId: string;
  self: boolean;
  busy: boolean;
  onClose: () => void;
  onChange: (change: Change) => void;
}) {
  const detail = useQuery({
    queryKey: ["admin", "users", "detail", userId],
    queryFn: () => userAdminAction<UserDetail>({ action: "detail", userId }),
    retry: false,
  });
  const exportData = useMutation({
    mutationFn: () => userAdminAction<unknown>({ action: "export", userId }),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `donnees-compte-${userId.slice(0, 8)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export téléchargé (inscrit à l'historique).");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const account = detail.data?.account;
  const isBanned = Boolean(account?.banned_until && Date.parse(account.banned_until) > Date.now());
  const activity = Object.entries(detail.data?.activity ?? {});
  const travellerActivity = activity.filter(([key]) => !isStaffColumn(key));
  const staffActions = activity
    .filter(([key]) => isStaffColumn(key))
    .reduce((sum, [, n]) => sum + n, 0);

  return (
    <AdminDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={detail.data?.traveller?.pseudo ?? account?.display_name ?? account?.email ?? "Compte"}
      {...(account?.email ? { description: account.email } : {})}
    >
      {detail.isPending ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : detail.error ? (
        <p className="text-sm text-amber-900">{detail.error.message}</p>
      ) : account ? (
        <div className="grid gap-5">
          <section className="flex items-center gap-3">
            {detail.data?.traveller?.avatar ? (
              <img
                src={`/cabas/persos/${detail.data.traveller.avatar}.webp`}
                alt=""
                className="size-14 rounded-full bg-muted object-contain"
              />
            ) : null}
            <div className="text-sm">
              <p className="font-semibold">
                {isBanned
                  ? `Suspendu jusqu'au ${new Date(account.banned_until!).toLocaleDateString("fr-FR")}`
                  : account.email_confirmed_at
                    ? "Compte actif"
                    : "E-mail à confirmer"}
              </p>
              <p className="text-xs text-muted-foreground">
                Inscrit le {new Date(account.created_at).toLocaleDateString("fr-FR")}
                {account.last_sign_in_at
                  ? ` · dernière connexion ${when(account.last_sign_in_at)}`
                  : " · jamais connecté"}
                {account.roles.length
                  ? ` · ${account.roles.map((r) => roleLabels[r as Role] ?? r).join(", ")}`
                  : ""}
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Activité</h3>
            {travellerActivity.length || staffActions ? (
              <ul className="mt-2 grid gap-1 text-sm">
                {travellerActivity.map(([key, count]) => (
                  <li key={key} className="flex justify-between gap-3">
                    <span>{activityLabels[key] ?? key.replace(/^public\./, "")}</span>
                    <strong className="tabular-nums">{count}</strong>
                  </li>
                ))}
                {staffActions > 0 && (
                  <li className="flex justify-between gap-3 text-muted-foreground">
                    <span>Actions dans l'espace équipe</span>
                    <strong className="tabular-nums">{staffActions}</strong>
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Aucune activité enregistrée.</p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold">Téléphones abonnés aux notifications</h3>
            {detail.data?.devices.length ? (
              <ul className="mt-2 grid gap-1 text-sm">
                {detail.data.devices.map((device, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Smartphone className="size-4 text-muted-foreground" aria-hidden />
                    {device.host.includes("apple")
                      ? "iPhone / Safari"
                      : device.host.includes("google")
                        ? "Android / Chrome"
                        : device.host.includes("mozilla")
                          ? "Firefox"
                          : device.host}
                    <span className="text-xs text-muted-foreground">
                      · depuis le {new Date(device.created_at).toLocaleDateString("fr-FR")}
                      {device.last_success_at
                        ? ` · dernier envoi réussi ${when(device.last_success_at)}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Aucun téléphone abonné.</p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold">Historique du compte</h3>
            {detail.data?.history.filter((h) => auditText({ ...h, target: "ce compte" })).length ? (
              <ul className="mt-2 grid gap-1 text-sm">
                {detail.data.history
                  .map((h) => ({ h, text: auditText({ ...h, target: "ce compte" }) }))
                  .filter((item) => item.text)
                  .map(({ h, text }, index) => (
                    <li key={index}>
                      {text}
                      <span className="block text-xs text-muted-foreground">
                        {when(h.created_at)}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Aucune opération de l'équipe.</p>
            )}
          </section>

          {!self && (
            <section>
              <h3 className="text-sm font-semibold">Rôle dans l'équipe</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(Object.keys(roleLabels) as Role[]).map((role) => (
                  <button
                    key={role}
                    type="button"
                    disabled={busy || isBanned}
                    aria-pressed={account.roles.includes(role)}
                    onClick={() =>
                      onChange({
                        action: "role",
                        member: account,
                        role,
                        enabled: !account.roles.includes(role),
                      })
                    }
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-50 ${
                      account.roles.includes(role)
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "bg-background text-muted-foreground"
                    }`}
                  >
                    <ShieldCheck size={13} />
                    {roleLabels[role]}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              size="sm"
              variant="outline"
              disabled={exportData.isPending}
              onClick={() => exportData.mutate()}
            >
              <Download size={14} /> Exporter ses données (RGPD)
            </Button>
            {!self && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || account.roles.includes("admin")}
                  onClick={() => onChange({ action: isBanned ? "unban" : "ban", member: account })}
                >
                  <Ban size={14} /> {isBanned ? "Réactiver" : "Suspendre"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={busy || account.roles.includes("admin")}
                  onClick={() => onChange({ action: "delete", member: account })}
                >
                  <Trash2 size={14} /> Supprimer
                </Button>
              </>
            )}
            {account.roles.includes("admin") && !self && (
              <p className="w-full text-xs text-muted-foreground">
                Compte administrateur protégé : retirez d'abord son rôle depuis l'onglet Équipe.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </AdminDrawer>
  );
}
